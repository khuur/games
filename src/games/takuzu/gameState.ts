import type { GameStatus } from '../../hooks/useGameSession'
import { EMPTY, isLevelId, LEVELS, MOON, problemCells, SUN, type Cell, type Hint, type LevelId, type Puzzle, type Sign } from './takuzu'

/** One cell changed by a move. */
export interface Move {
  cell: number
  before: Cell
  after: Cell
}

export interface TakuzuState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  givens: Cell[]
  signs: Sign[]
  solution: Cell[]
  cells: Cell[]
  history: Move[]
  future: Move[]
  /** Moves that broke a rule (undoing one doesn't take it back). */
  mistakes: number
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  lastMove: { cell: number; id: number } | null
}

export type TakuzuAction =
  | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }
  | { type: 'restart' }
  | { type: 'set'; cell: number; value: Cell }
  /** Several cells at once, as the solver does. */
  | { type: 'apply'; changes: { cell: number; value: Cell }[]; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving. */
export interface TakuzuSnapshot {
  levelId: LevelId
  givens: Cell[]
  signs: Sign[]
  solution: Cell[]
  cells: Cell[]
  history: Move[]
  future: Move[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

export const sizeOf = (state: Pick<TakuzuState, 'levelId'>) => LEVELS[state.levelId].size

export function createGame(levelId: LevelId, { givens, signs, solution }: Puzzle, gameId = 0): TakuzuState {
  return {
    gameId,
    levelId,
    givens,
    signs,
    solution,
    cells: givens.slice(),
    history: [],
    future: [],
    mistakes: 0,
    hint: null,
    hintsUsed: 0,
    solverUsed: false,
    status: 'ready',
    lastMove: null,
  }
}

/** What a tap does to a cell: blank → sun → moon → blank. */
export const cycled = (value: Cell): Cell => (value === EMPTY ? SUN : value === SUN ? MOON : EMPTY)

const isSolved = (state: TakuzuState, cells: Cell[]) =>
  !cells.includes(EMPTY) && problemCells(sizeOf(state), cells, state.signs).length === 0

/**
 * Applies changes to editable cells. A move that leaves one of its cells breaking a rule counts
 * as a mistake.
 */
function change(state: TakuzuState, targets: { cell: number; value: Cell }[], bySolver: boolean, record: 'new' | 'redo' = 'new'): TakuzuState {
  if (state.status === 'won') return state
  const cells = state.cells.slice()
  const moves: Move[] = []
  for (const { cell, value } of targets) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells.length || state.givens[cell] || cells[cell] === value) continue
    if (value !== EMPTY && value !== SUN && value !== MOON) continue
    moves.push({ cell, before: cells[cell], after: value })
    cells[cell] = value
  }
  if (!moves.length) return state
  const broken = new Set(problemCells(sizeOf(state), cells, state.signs))
  const madeMistake = record === 'new' && moves.some(({ cell, after }) => after !== EMPTY && broken.has(cell))
  return {
    ...state,
    cells,
    history: [...state.history, ...moves],
    future: record === 'redo' ? state.future.slice(0, -1) : [],
    mistakes: state.mistakes + (madeMistake ? 1 : 0),
    hint: null,
    solverUsed: state.solverUsed || bySolver,
    status: isSolved(state, cells) ? 'won' : 'playing',
    lastMove: { cell: moves[0].cell, id: (state.lastMove?.id ?? 0) + 1 },
  }
}

export function takuzuReducer(state: TakuzuState, action: TakuzuAction): TakuzuState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.puzzle, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state, state.gameId + 1)

    case 'set':
      return change(state, [{ cell: action.cell, value: action.value }], false)

    case 'apply':
      return change(state, action.changes, Boolean(action.bySolver))

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const cells = state.cells.slice()
      cells[last.cell] = last.before
      return {
        ...state,
        cells,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        hint: null,
        status: 'playing',
        lastMove: { cell: last.cell, id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next) return state
      return change(state, [{ cell: next.cell, value: next.after }], false, 'redo')
    }

    case 'hint': {
      if (state.status === 'won') return state
      const { hint } = state
      const key = (h: Hint) => (h.kind === 'wrong' ? `w${h.cells.join()}` : `s${h.step.cells.join()}`)
      const same = hint !== null && key(hint) === key(action.hint)
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: TakuzuState): TakuzuSnapshot {
  const { levelId, givens, signs, solution, cells, history, future, mistakes, hintsUsed, solverUsed } = state
  return { levelId, givens, signs, solution, cells, history, future, mistakes, hintsUsed, solverUsed }
}

const isCellValue = (value: unknown): value is Cell => value === EMPTY || value === SUN || value === MOON

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: TakuzuSnapshot, gameId = 0): TakuzuState | null {
  const { levelId, givens, signs, solution, cells, history, future } = snapshot
  if (!isLevelId(levelId)) return null
  const { size } = LEVELS[levelId]
  const count = size * size
  if (givens.length !== count || solution.length !== count || cells.length !== count) return null
  if (![...givens, ...cells].every(isCellValue) || !solution.every((value) => value === SUN || value === MOON)) return null
  if (problemCells(size, solution, signs).length) return null
  if (givens.some((value, cell) => value && (value !== solution[cell] || cells[cell] !== value))) return null
  const adjacent = (a: number, b: number) => b === a + size || (b === a + 1 && a % size < size - 1)
  if (!signs.every(({ a, b, same }) => adjacent(a, b) && (solution[a] === solution[b]) === same)) return null
  const moves = [...history, ...future]
  if (!moves.every(({ cell, before, after }) => Number.isInteger(cell) && cell >= 0 && cell < count && isCellValue(before) && isCellValue(after))) {
    return null
  }
  const fresh = createGame(levelId, { givens, signs, solution }, gameId)
  if (isSolved(fresh, cells)) return null
  return {
    ...fresh,
    cells,
    history,
    future,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length ? 'playing' : 'ready',
  }
}
