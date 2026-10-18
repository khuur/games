import type { GameStatus } from '../../hooks/useGameSession'
import { digitBit, isConsistent, isLevelId, PEERS, UNITS, unitsOf, type Hint, type LevelId, type Puzzle } from './sudoku'

/** A change to one cell: a digit, a pencil note toggled on or off, or (digit 0) erasing. */
export interface Move {
  cell: number
  digit: number
  note: boolean
}

export interface SudokuState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  givens: number[]
  solution: number[]
  values: number[]
  /** Pencil marks for each cell, as bit masks of digits. */
  notes: number[]
  history: Move[]
  /** Undone moves that can be redone, most recent last. */
  future: Move[]
  /** Wrong digits entered; undoing one doesn't take it back. */
  mistakes: number
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  /** The latest change, with the rows, columns and boxes it completed, for the board to celebrate. */
  lastMove: { cell: number; completed: number[]; id: number } | null
}

export type SudokuAction =
  | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }
  | { type: 'restart' }
  | { type: 'enter'; cell: number; digit: number; note?: boolean; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving; the grid can be rebuilt by replaying the moves. */
export interface SudokuSnapshot {
  levelId: LevelId
  givens: number[]
  solution: number[]
  history: Move[]
  future: Move[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

export function createGame(levelId: LevelId, { givens, solution }: Puzzle, gameId = 0): SudokuState {
  return {
    gameId,
    levelId,
    givens,
    solution,
    values: givens.slice(),
    notes: new Array<number>(81).fill(0),
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

/** A cell can change unless it is a given or already holds its right digit. */
export const isEditable = (state: SudokuState, cell: number) =>
  state.status !== 'won' && !state.givens[cell] && state.values[cell] !== state.solution[cell]

/** Applies a move to a grid and its notes; null if the move isn't allowed. */
function applyMove(state: SudokuState, values: number[], notes: number[], { cell, digit, note }: Move) {
  if (!Number.isInteger(cell) || cell < 0 || cell > 80 || !Number.isInteger(digit) || digit < 0 || digit > 9) return null
  if (state.givens[cell]) return null
  const current = values[cell]
  if (current && current === state.solution[cell]) return null
  const nextValues = values.slice()
  const nextNotes = notes.slice()
  if (note) {
    if (current || !digit) return null
    nextNotes[cell] ^= digitBit(digit)
  } else if (!digit || digit === current) {
    if (!current && !notes[cell]) return null
    if (current) nextValues[cell] = 0
    else nextNotes[cell] = 0
  } else {
    nextValues[cell] = digit
    nextNotes[cell] = 0
    // Tidy up: the digit can no longer be pencilled in anywhere that sees this cell.
    for (const peer of PEERS[cell]) nextNotes[peer] &= ~digitBit(digit)
  }
  return { values: nextValues, notes: nextNotes }
}

/** Rows, columns and boxes through `cell` that are now filled in correctly. */
function completedUnits(state: SudokuState, values: number[], cell: number): number[] {
  if (values[cell] !== state.solution[cell]) return []
  return unitsOf(cell).filter((unit) => UNITS[unit].every((other) => values[other] === state.solution[other]))
}

function replay(state: SudokuState, history: Move[]) {
  let values = state.givens.slice()
  let notes = new Array<number>(81).fill(0)
  for (const move of history) {
    const next = applyMove(state, values, notes, move)
    if (!next) return null
    values = next.values
    notes = next.notes
  }
  return { values, notes }
}

const isSolved = (state: SudokuState, values: number[]) => values.every((value, cell) => value === state.solution[cell])

export function sudokuReducer(state: SudokuState, action: SudokuAction): SudokuState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.puzzle, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state, state.gameId + 1)

    case 'enter': {
      if (state.status === 'won') return state
      const move = { cell: action.cell, digit: action.digit, note: Boolean(action.note) }
      const next = applyMove(state, state.values, state.notes, move)
      if (!next) return state
      const placed = !move.note && move.digit !== 0 && move.digit !== state.values[move.cell]
      const wrong = placed && move.digit !== state.solution[move.cell]
      return {
        ...state,
        ...next,
        history: [...state.history, move],
        future: [],
        mistakes: state.mistakes + (wrong ? 1 : 0),
        hint: null,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status: isSolved(state, next.values) ? 'won' : 'playing',
        lastMove: { cell: move.cell, completed: completedUnits(state, next.values, move.cell), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const history = state.history.slice(0, -1)
      const rebuilt = replay(state, history)
      if (!rebuilt) return state
      return {
        ...state,
        ...rebuilt,
        history,
        future: [...state.future, last],
        hint: null,
        status: 'playing',
        lastMove: { cell: last.cell, completed: [], id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'redo': {
      const move = state.future.at(-1)
      if (state.status === 'won' || !move) return state
      const next = applyMove(state, state.values, state.notes, move)
      if (!next) return state
      return {
        ...state,
        ...next,
        history: [...state.history, move],
        future: state.future.slice(0, -1),
        hint: null,
        status: isSolved(state, next.values) ? 'won' : 'playing',
        lastMove: { cell: move.cell, completed: completedUnits(state, next.values, move.cell), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'hint': {
      if (state.status === 'won') return state
      const { hint } = state
      const same = hint?.kind === action.hint.kind && hint.cell === action.hint.cell && hint.digit === action.hint.digit
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: SudokuState): SudokuSnapshot {
  const { levelId, givens, solution, history, future, mistakes, hintsUsed, solverUsed } = state
  return { levelId, givens, solution, history, future, mistakes, hintsUsed, solverUsed }
}

const isGrid = (grid: unknown[], min: number) =>
  grid.length === 81 && grid.every((digit) => Number.isInteger(digit) && (digit as number) >= min && (digit as number) <= 9)

/** Rebuilds an unfinished game by replaying its moves. Returns null if the snapshot is unusable. */
export function restoreGame(snapshot: SudokuSnapshot, gameId = 0): SudokuState | null {
  const { levelId, givens, solution, history, future } = snapshot
  if (!isLevelId(levelId) || !isGrid(givens, 0) || !isGrid(solution, 1) || !isConsistent(solution)) return null
  if (givens.some((digit, cell) => digit && digit !== solution[cell])) return null

  const fresh = createGame(levelId, { givens, solution }, gameId)
  const rebuilt = replay(fresh, history)
  if (!rebuilt || isSolved(fresh, rebuilt.values)) return null
  // Redoing everything must work too.
  if (!replay(fresh, [...history, ...[...future].reverse()])) return null
  return {
    ...fresh,
    ...rebuilt,
    history,
    future,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length ? 'playing' : 'ready',
  }
}
