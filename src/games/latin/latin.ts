/**
 * What Latin-square puzzles share (every row and column holds each digit once): the grid's
 * lines, random full grids, and a game state with pencil notes, mistakes, undo and saving.
 * Skyscrapers and Calcudoku build on it, each adding its own clues and logic.
 */
import type { GameStatus } from '../../hooks/useGameSession'
import { isInteger } from '../../lib/storage'

export const digitBit = (digit: number) => 1 << (digit - 1)
export const fullMask = (size: number) => (1 << size) - 1
export const digitsIn = (mask: number) => {
  const digits: number[] = []
  for (let digit = 1; mask >> (digit - 1); digit++) if (mask & digitBit(digit)) digits.push(digit)
  return digits
}
export const bitCount = (mask: number) => {
  let count = 0
  for (let m = mask; m; m &= m - 1) count++
  return count
}

/** Rows (0 to size − 1) then columns, each as its cells in order. */
const lineCache = new Map<number, number[][]>()
export function linesOf(size: number): number[][] {
  let lines = lineCache.get(size)
  if (!lines) {
    lines = Array.from({ length: size * 2 }, (_, line) =>
      line < size
        ? Array.from({ length: size }, (_, column) => line * size + column)
        : Array.from({ length: size }, (_, row) => row * size + (line - size)),
    )
    lineCache.set(size, lines)
  }
  return lines
}

/** The cells sharing a row or column with each cell. */
const peerCache = new Map<number, number[][]>()
export function peersOf(size: number): number[][] {
  let peers = peerCache.get(size)
  if (!peers) {
    peers = Array.from({ length: size * size }, (_, cell) => {
      const row = Math.floor(cell / size)
      const column = cell % size
      const list: number[] = []
      for (let i = 0; i < size; i++) {
        if (i !== column) list.push(row * size + i)
        if (i !== row) list.push(i * size + column)
      }
      return list
    })
    peerCache.set(size, peers)
  }
  return peers
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/** A random full grid with every digit once in each row and column. */
export function randomLatinSquare(size: number, random: () => number = Math.random): number[] {
  const cells = new Array<number>(size * size).fill(0)
  const rows = new Array<number>(size).fill(0)
  const columns = new Array<number>(size).fill(0)
  const visit = (cell: number): boolean => {
    if (cell === size * size) return true
    const row = Math.floor(cell / size)
    const column = cell % size
    for (const digit of shuffle(digitsIn(fullMask(size) & ~(rows[row] | columns[column])), random)) {
      cells[cell] = digit
      rows[row] |= digitBit(digit)
      columns[column] |= digitBit(digit)
      if (visit(cell + 1)) return true
      rows[row] &= ~digitBit(digit)
      columns[column] &= ~digitBit(digit)
    }
    cells[cell] = 0
    return false
  }
  visit(0)
  return cells
}

// ———————————————————————————————————————— Game state

/** A change to one cell: a digit, a pencil note toggled, or (digit 0) erasing. */
export interface Move {
  cell: number
  digit: number
  note: boolean
}

/** Everything a Latin-square game tracks, whatever its clues. */
export interface LatinState<H> {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  size: number
  givens: number[]
  solution: number[]
  values: number[]
  /** Pencil marks for each cell, as bit masks of digits. */
  notes: number[]
  history: Move[]
  future: Move[]
  /** Wrong digits entered; undoing one doesn't take it back. */
  mistakes: number
  hint: H | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  /** The latest change, with the cells of any rows, columns (or cages) it completed. */
  lastMove: { cell: number; completed: number[]; id: number } | null
}

export type LatinAction<H> =
  | { type: 'restart' }
  | { type: 'enter'; cell: number; digit: number; note?: boolean; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: H }
  | { type: 'solver-started' }

export function freshState<H>(size: number, givens: number[], solution: number[], gameId = 0): LatinState<H> {
  return {
    gameId,
    size,
    givens,
    solution,
    values: givens.slice(),
    notes: new Array<number>(size * size).fill(0),
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
export const isEditable = <H>(state: LatinState<H>, cell: number) =>
  state.status !== 'won' && !state.givens[cell] && state.values[cell] !== state.solution[cell]

/** Applies a move to a grid and its notes; null if the move isn't allowed. */
function applyMove<H>(state: LatinState<H>, values: number[], notes: number[], { cell, digit, note }: Move) {
  const { size } = state
  if (!Number.isInteger(cell) || cell < 0 || cell >= size * size || !Number.isInteger(digit) || digit < 0 || digit > size) return null
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
    // Tidy up: the digit can no longer be pencilled in anywhere in its row or column.
    for (const peer of peersOf(size)[cell]) nextNotes[peer] &= ~digitBit(digit)
  }
  return { values: nextValues, notes: nextNotes }
}

function replay<H>(state: LatinState<H>, history: Move[]) {
  let values = state.givens.slice()
  let notes = new Array<number>(state.size * state.size).fill(0)
  for (const move of history) {
    const next = applyMove(state, values, notes, move)
    if (!next) return null
    values = next.values
    notes = next.notes
  }
  return { values, notes }
}

const solved = <H>(state: LatinState<H>, values: number[]) => values.every((value, cell) => value === state.solution[cell])

/** Cells of the units through `cell` (rows, columns and any extra ones) now filled in correctly. */
function completed<H>(state: LatinState<H>, values: number[], cell: number, extraUnits: readonly number[][]): number[] {
  if (values[cell] !== state.solution[cell]) return []
  const units = [...linesOf(state.size), ...extraUnits].filter((unit) => unit.includes(cell))
  return [...new Set(units.filter((unit) => unit.every((other) => values[other] === state.solution[other])).flat())]
}

/**
 * The shared reducer. `extraUnits` are groups beyond rows and columns that light up when
 * completed, such as Calcudoku's cages.
 */
export function latinReducer<H, S extends LatinState<H>>(state: S, action: LatinAction<H>, extraUnits: readonly number[][] = []): S {
  switch (action.type) {
    case 'restart':
      return { ...state, ...freshState<H>(state.size, state.givens, state.solution, state.gameId + 1) }

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
        status: solved(state, next.values) ? 'won' : 'playing',
        lastMove: { cell: move.cell, completed: completed(state, next.values, move.cell, extraUnits), id: (state.lastMove?.id ?? 0) + 1 },
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
        status: solved(state, next.values) ? 'won' : 'playing',
        lastMove: { cell: move.cell, completed: completed(state, next.values, move.cell, extraUnits), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'hint': {
      if (state.status === 'won') return state
      const same = state.hint !== null && JSON.stringify(state.hint) === JSON.stringify(action.hint)
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

/** What a saved game needs on top of its puzzle. */
export interface LatinProgress {
  history: Move[]
  future: Move[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

/**
 * Rebuilds a game in progress from a fresh state and its saved moves. Returns null if the moves
 * don't replay (or redo) or the game was finished.
 */
export function restoreProgress<H, S extends LatinState<H>>(fresh: S, progress: LatinProgress): S | null {
  const { history, future } = progress
  const rebuilt = replay(fresh, history)
  if (!rebuilt || solved(fresh, rebuilt.values)) return null
  if (!replay(fresh, [...history, ...[...future].reverse()])) return null
  return {
    ...fresh,
    ...rebuilt,
    history,
    future,
    mistakes: progress.mistakes,
    hintsUsed: progress.hintsUsed,
    solverUsed: progress.solverUsed,
    status: history.length ? 'playing' : 'ready',
  }
}

/** Moves packed into numbers for saving: cell × 20 + digit × 2 + (1 for a note). */
export const packMove = ({ cell, digit, note }: Move) => cell * 20 + digit * 2 + (note ? 1 : 0)
export const unpackMove = (packed: number): Move => ({
  cell: Math.floor(packed / 20),
  digit: Math.floor((packed % 20) / 2),
  note: packed % 2 === 1,
})
export const isPackedMoves = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((move) => isInteger(move) && move >= 0)

/** Whether a grid of digits (0 for blank) has no digit twice in a row or column. */
export function isLatinConsistent(size: number, grid: readonly number[]): boolean {
  return linesOf(size).every((line) => {
    let seen = 0
    for (const cell of line) {
      const digit = grid[cell]
      if (!digit) continue
      if (digit < 1 || digit > size || seen & digitBit(digit)) return false
      seen |= digitBit(digit)
    }
    return true
  })
}
