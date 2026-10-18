import type { GameStatus } from '../../hooks/useGameSession'
import { cluesOf, EMPTY, FILLED, isLevelId, LEVELS, UNKNOWN, type CellState, type Hint, type LevelId } from './nonogram'

/** One cell changed by a move. */
export interface Change {
  cell: number
  before: CellState
  after: CellState
}

export interface NonogramState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  solution: boolean[]
  /** Clues of every line, rows first, then columns. */
  clues: number[][]
  /** What the player has marked: unknown, filled, or crossed out. */
  cells: CellState[]
  /** Cells filled by mistake. They turn into red crosses and stay that way. */
  wrong: boolean[]
  /** Moves (a tap or a drag each), as the cells they changed. */
  history: Change[][]
  future: Change[][]
  mistakes: number
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  /** The latest move's cells, for the board to animate. */
  lastMove: { cells: number[]; id: number } | null
  /** The drag that made the latest move, so the rest of that drag joins the same move. */
  stroke: number | null
}

export type NonogramAction =
  | { type: 'new-game'; levelId: LevelId; solution: boolean[] }
  | { type: 'restart' }
  /**
   * A tap or drag: every cell in `cells` that is `from` becomes `to`. Marks with the same
   * `stroke` (one drag) make a single move.
   */
  | { type: 'mark'; cells: number[]; from: CellState; to: CellState; stroke?: number }
  /** Several cells set at once, as the solver does. */
  | { type: 'apply'; changes: { cell: number; to: CellState }[]; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving. */
export interface NonogramSnapshot {
  levelId: LevelId
  solution: boolean[]
  cells: CellState[]
  wrong: boolean[]
  history: Change[][]
  future: Change[][]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

export function createGame(levelId: LevelId, solution: boolean[], gameId = 0): NonogramState {
  return {
    gameId,
    levelId,
    solution,
    clues: cluesOf(LEVELS[levelId], solution),
    cells: new Array<CellState>(solution.length).fill(UNKNOWN),
    wrong: new Array<boolean>(solution.length).fill(false),
    history: [],
    future: [],
    mistakes: 0,
    hint: null,
    hintsUsed: 0,
    solverUsed: false,
    status: 'ready',
    lastMove: null,
    stroke: null,
  }
}

export const isSolved = (solution: readonly boolean[], cells: readonly CellState[]) =>
  solution.every((filled, cell) => !filled || cells[cell] === FILLED)

/** Whether a line's filled cells already match its picture, so its clue can be dimmed. */
export function isLineDone(state: NonogramState, lineCellList: readonly number[]): boolean {
  return lineCellList.every((cell) => (state.cells[cell] === FILLED) === state.solution[cell])
}

const isCell = (state: NonogramState, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < state.cells.length

/**
 * Sets cells, checking fills against the picture: a wrong fill becomes a red cross and a
 * mistake. Right moves go into the history; mistakes are permanent, so they don't.
 */
function change(
  state: NonogramState,
  targets: { cell: number; to: CellState }[],
  bySolver: boolean,
  stroke: number | null = null,
): NonogramState {
  if (state.status === 'won') return state
  const cells = state.cells.slice()
  const wrong = state.wrong.slice()
  let mistakes = state.mistakes
  const changes: Change[] = []
  for (const { cell, to } of targets) {
    if (!isCell(state, cell) || state.wrong[cell] || cells[cell] === to) continue
    if (to === FILLED && !state.solution[cell]) {
      cells[cell] = EMPTY
      wrong[cell] = true
      mistakes++
      continue
    }
    changes.push({ cell, before: cells[cell], after: to })
    cells[cell] = to
  }
  if (!changes.length && mistakes === state.mistakes) return state
  const won = isSolved(state.solution, cells)
  const last = state.history.at(-1)
  let history = state.history
  if (changes.length) {
    // The rest of a drag joins the move it started.
    history = stroke !== null && stroke === state.stroke && last ? [...history.slice(0, -1), [...last, ...changes]] : [...history, changes]
  }
  return {
    ...state,
    cells: won ? cells.map((mark, cell) => (state.solution[cell] ? FILLED : mark === UNKNOWN ? EMPTY : mark)) : cells,
    wrong,
    mistakes,
    history,
    future: changes.length ? [] : state.future,
    stroke: changes.length ? stroke : state.stroke,
    hint: null,
    solverUsed: state.solverUsed || bySolver,
    status: won ? 'won' : 'playing',
    lastMove: { cells: targets.map(({ cell }) => cell), id: (state.lastMove?.id ?? 0) + 1 },
  }
}

export function nonogramReducer(state: NonogramState, action: NonogramAction): NonogramState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.solution, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state.solution, state.gameId + 1)

    case 'mark': {
      const targets = action.cells
        .filter((cell) => isCell(state, cell) && state.cells[cell] === action.from && !state.wrong[cell])
        .map((cell) => ({ cell, to: action.to }))
      return targets.length ? change(state, targets, false, action.stroke ?? null) : state
    }

    case 'apply':
      return change(state, action.changes, Boolean(action.bySolver))

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const cells = state.cells.slice()
      // A mistake made since stays a red cross.
      for (const { cell, before } of last) if (!state.wrong[cell]) cells[cell] = before
      return {
        ...state,
        cells,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        stroke: null,
        hint: null,
        status: 'playing',
        lastMove: { cells: last.map(({ cell }) => cell), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next) return state
      const cells = state.cells.slice()
      for (const { cell, after } of next) if (!state.wrong[cell]) cells[cell] = after
      const won = isSolved(state.solution, cells)
      return {
        ...state,
        cells: won ? cells.map((mark, cell) => (state.solution[cell] ? FILLED : mark === UNKNOWN ? EMPTY : mark)) : cells,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        stroke: null,
        hint: null,
        status: won ? 'won' : 'playing',
        lastMove: { cells: next.map(({ cell }) => cell), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'hint': {
      if (state.status === 'won') return state
      const { hint } = state
      const same = hint?.kind === action.hint.kind && hint.cells.join() === action.hint.cells.join()
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: NonogramState): NonogramSnapshot {
  const { levelId, solution, cells, wrong, history, future, mistakes, hintsUsed, solverUsed } = state
  return { levelId, solution, cells, wrong, history, future, mistakes, hintsUsed, solverUsed }
}

const isMark = (value: unknown): value is CellState => value === UNKNOWN || value === FILLED || value === EMPTY

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: NonogramSnapshot, gameId = 0): NonogramState | null {
  const { levelId, solution, cells, wrong, history, future } = snapshot
  if (!isLevelId(levelId)) return null
  const level = LEVELS[levelId]
  const size = level.columns * level.rows
  if (solution.length !== size || cells.length !== size || wrong.length !== size || !cells.every(isMark)) return null
  // Fills must be right, and wrong cells must be crosses on empty cells.
  if (cells.some((mark, cell) => mark === FILLED && !solution[cell])) return null
  if (wrong.some((bad, cell) => bad && (solution[cell] || cells[cell] !== EMPTY))) return null
  const moves = [...history, ...future]
  if (!moves.every((move) => move.every(({ cell, before, after }) => Number.isInteger(cell) && cell >= 0 && cell < size && isMark(before) && isMark(after)))) {
    return null
  }
  if (isSolved(solution, cells)) return null
  return {
    ...createGame(levelId, solution, gameId),
    cells,
    wrong,
    history,
    future,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length || snapshot.mistakes ? 'playing' : 'ready',
  }
}
