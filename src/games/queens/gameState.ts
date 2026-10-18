import type { GameStatus } from '../../hooks/useGameSession'
import { BLANK, CROSS, isLevelId, LEVELS, QUEEN, type Hint, type LevelId, type Mark, type Puzzle } from './queens'

/** One cell changed by a move. */
export interface Change {
  cell: number
  before: Mark
  after: Mark
}

export interface QueensState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  regions: number[]
  solution: number[]
  marks: Mark[]
  /** Queens placed by mistake. They turn into red crosses and stay that way. */
  wrong: boolean[]
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

export type QueensAction =
  | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }
  | { type: 'restart' }
  /** A tap or drag: every cell in `cells` marked `from` becomes `to`; one drag shares a `stroke`. */
  | { type: 'mark'; cells: number[]; from: Mark; to: Mark; stroke?: number }
  /** Several cells set at once, as the solver does. */
  | { type: 'apply'; changes: { cell: number; to: Mark }[]; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving. */
export interface QueensSnapshot {
  levelId: LevelId
  regions: number[]
  solution: number[]
  marks: Mark[]
  wrong: boolean[]
  history: Change[][]
  future: Change[][]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

export function createGame(levelId: LevelId, { regions, solution }: Puzzle, gameId = 0): QueensState {
  return {
    gameId,
    levelId,
    regions,
    solution,
    marks: new Array<Mark>(regions.length).fill(BLANK),
    wrong: new Array<boolean>(regions.length).fill(false),
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

export const isSolved = (solution: readonly number[], marks: readonly Mark[]) => solution.every((cell) => marks[cell] === QUEEN)

const isCell = (state: QueensState, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < state.marks.length

/**
 * Sets marks, checking queens against the solution: a wrong queen becomes a red cross and a
 * mistake. Right moves go into the history; mistakes are permanent, so they don't.
 */
function change(state: QueensState, targets: { cell: number; to: Mark }[], bySolver: boolean, stroke: number | null = null): QueensState {
  if (state.status === 'won') return state
  const marks = state.marks.slice()
  const wrong = state.wrong.slice()
  let mistakes = state.mistakes
  const changes: Change[] = []
  for (const { cell, to } of targets) {
    if (!isCell(state, cell) || wrong[cell] || marks[cell] === to) continue
    if (to === QUEEN && !state.solution.includes(cell)) {
      marks[cell] = CROSS
      wrong[cell] = true
      mistakes++
      continue
    }
    changes.push({ cell, before: marks[cell], after: to })
    marks[cell] = to
  }
  if (!changes.length && mistakes === state.mistakes) return state
  const last = state.history.at(-1)
  let history = state.history
  if (changes.length) {
    // The rest of a drag joins the move it started.
    history = stroke !== null && stroke === state.stroke && last ? [...history.slice(0, -1), [...last, ...changes]] : [...history, changes]
  }
  return {
    ...state,
    marks,
    wrong,
    mistakes,
    history,
    future: changes.length ? [] : state.future,
    stroke: changes.length ? stroke : state.stroke,
    hint: null,
    solverUsed: state.solverUsed || bySolver,
    status: isSolved(state.solution, marks) ? 'won' : 'playing',
    lastMove: { cells: targets.map(({ cell }) => cell), id: (state.lastMove?.id ?? 0) + 1 },
  }
}

export function queensReducer(state: QueensState, action: QueensAction): QueensState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.puzzle, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state, state.gameId + 1)

    case 'mark': {
      const targets = action.cells
        .filter((cell) => isCell(state, cell) && state.marks[cell] === action.from && !state.wrong[cell])
        .map((cell) => ({ cell, to: action.to }))
      return targets.length ? change(state, targets, false, action.stroke ?? null) : state
    }

    case 'apply':
      return change(state, action.changes, Boolean(action.bySolver))

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const marks = state.marks.slice()
      // A mistake made since stays a red cross.
      for (const { cell, before } of last) if (!state.wrong[cell]) marks[cell] = before
      return {
        ...state,
        marks,
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
      const marks = state.marks.slice()
      for (const { cell, after } of next) if (!state.wrong[cell]) marks[cell] = after
      return {
        ...state,
        marks,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        stroke: null,
        hint: null,
        status: isSolved(state.solution, marks) ? 'won' : 'playing',
        lastMove: { cells: next.map(({ cell }) => cell), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'hint': {
      if (state.status === 'won') return state
      const { hint } = state
      const key = (h: Hint) => (h.kind === 'wrong-cross' ? `x${h.cells.join()}` : `${h.step.queen}:${h.step.eliminate?.join()}`)
      const same = hint !== null && key(hint) === key(action.hint)
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: QueensState): QueensSnapshot {
  const { levelId, regions, solution, marks, wrong, history, future, mistakes, hintsUsed, solverUsed } = state
  return { levelId, regions, solution, marks, wrong, history, future, mistakes, hintsUsed, solverUsed }
}

const isMark = (value: unknown): value is Mark => value === BLANK || value === CROSS || value === QUEEN

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: QueensSnapshot, gameId = 0): QueensState | null {
  const { levelId, regions, solution, marks, wrong, history, future } = snapshot
  if (!isLevelId(levelId)) return null
  const { size } = LEVELS[levelId]
  const cells = size * size
  if (regions.length !== cells || marks.length !== cells || wrong.length !== cells || solution.length !== size) return null
  if (!regions.every((region) => Number.isInteger(region) && region >= 0 && region < size) || !marks.every(isMark)) return null
  if (new Set(solution.map((cell) => regions[cell])).size !== size) return null
  // Queens must be right, and wrong cells must be crosses off the solution.
  if (marks.some((mark, cell) => mark === QUEEN && !solution.includes(cell))) return null
  if (wrong.some((bad, cell) => bad && (solution.includes(cell) || marks[cell] !== CROSS))) return null
  const moves = [...history, ...future]
  if (!moves.every((move) => move.every(({ cell, before, after }) => Number.isInteger(cell) && cell >= 0 && cell < cells && isMark(before) && isMark(after)))) {
    return null
  }
  if (isSolved(solution, marks)) return null
  return {
    ...createGame(levelId, { regions, solution }, gameId),
    marks,
    wrong,
    history,
    future,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length || snapshot.mistakes ? 'playing' : 'ready',
  }
}
