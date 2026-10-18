import type { GameStatus } from '../../hooks/useGameSession'
import {
  canPour,
  CAPACITY,
  clampColors,
  isSolved,
  legalPours,
  pour,
  pourAmount,
  SPARE_TUBES,
  type Pour,
  type Tube,
} from './waterSort'

export interface WaterSortState {
  /** Changes whenever a fresh puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  colors: number
  /** The puzzle as dealt, for restarting and for rebuilding positions on undo. */
  start: Tube[]
  tubes: Tube[]
  /** Fewest pours that solve the puzzle from the start. */
  minimum: number
  history: Pour[]
  /** Undone pours that can be redone, most recent last. */
  future: Pour[]
  /** The tube picked up, waiting for a tube to pour into. */
  selected: number | null
  /** The latest pour, so the board can animate it. */
  lastPour: (Pour & { amount: number; id: number }) | null
  hint: Pour | null
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type WaterSortAction =
  | { type: 'new-puzzle'; colors: number; start: Tube[]; minimum: number }
  | { type: 'restart' }
  | { type: 'select'; tube: number }
  | { type: 'deselect' }
  | { type: 'pour'; move: Pour; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; move: Pour }
  | { type: 'solver-started' }

/** The parts of a game worth saving; everything else can be rebuilt from them. */
export interface WaterSortSnapshot {
  colors: number
  start: Tube[]
  minimum: number
  history: Pour[]
  future: Pour[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
}

export function createPuzzle(colors: number, start: Tube[], minimum: number, gameId = 0): WaterSortState {
  return {
    gameId,
    colors,
    start,
    tubes: start,
    minimum,
    history: [],
    future: [],
    selected: null,
    lastPour: null,
    hint: null,
    hintsUsed: 0,
    undosUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

function statusOf(tubes: Tube[]): GameStatus {
  if (isSolved(tubes)) return 'won'
  return legalPours(tubes).length === 0 ? 'stuck' : 'playing'
}

/** Pouring back is not always a legal pour, so earlier positions are rebuilt from the start. */
function replay(start: Tube[], moves: Pour[]): Tube[] {
  return moves.reduce<Tube[]>((tubes, move) => pour(tubes, move), start)
}

export function waterSortReducer(state: WaterSortState, action: WaterSortAction): WaterSortState {
  switch (action.type) {
    case 'new-puzzle':
      return createPuzzle(action.colors, action.start, action.minimum, state.gameId + 1)

    case 'restart':
      return createPuzzle(state.colors, state.start, state.minimum, state.gameId + 1)

    case 'select':
      if (state.status === 'won' || !state.tubes[action.tube]?.length) return state
      return { ...state, selected: action.tube }

    case 'deselect':
      return state.selected === null ? state : { ...state, selected: null }

    case 'pour': {
      const amount = pourAmount(state.tubes, action.move)
      if (state.status === 'won' || amount === 0) return state
      const tubes = pour(state.tubes, action.move)
      return {
        ...state,
        tubes,
        history: [...state.history, action.move],
        future: [],
        selected: null,
        lastPour: { ...action.move, amount, id: state.history.length + 1 },
        hint: null,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status: statusOf(tubes),
      }
    }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const history = state.history.slice(0, -1)
      const tubes = replay(state.start, history)
      return {
        ...state,
        tubes,
        history,
        future: [...state.future, last],
        selected: null,
        lastPour: null,
        hint: null,
        undosUsed: state.undosUsed + 1,
        status: statusOf(tubes),
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next || !canPour(state.tubes, next)) return state
      const amount = pourAmount(state.tubes, next)
      const tubes = pour(state.tubes, next)
      return {
        ...state,
        tubes,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        selected: null,
        lastPour: { ...next, amount, id: state.history.length + 1 },
        hint: null,
        status: statusOf(tubes),
      }
    }

    case 'hint':
      if (state.status === 'won' || !canPour(state.tubes, action.move)) return state
      // Asking again while a hint is showing reveals nothing new, so it is not counted.
      return {
        ...state,
        hint: action.move,
        selected: null,
        hintsUsed: state.hint === null ? state.hintsUsed + 1 : state.hintsUsed,
      }

    case 'solver-started':
      return { ...state, solverUsed: true, selected: null, hint: null }
  }
}

export function toSnapshot(state: WaterSortState): WaterSortSnapshot {
  const { colors, start, minimum, history, future, hintsUsed, undosUsed, solverUsed } = state
  return { colors, start, minimum, history, future, hintsUsed, undosUsed, solverUsed }
}

/** A dealt puzzle: every colour exactly four times, in full tubes, plus the empty spares. */
function isValidStart(colors: number, start: Tube[]): boolean {
  if (clampColors(colors) !== colors || start.length !== colors + SPARE_TUBES) return false
  if (start.filter((tube) => tube.length === 0).length !== SPARE_TUBES) return false
  if (!start.every((tube) => tube.length === 0 || tube.length === CAPACITY)) return false
  const counts = new Array<number>(colors).fill(0)
  for (const layer of start.flat()) {
    if (!Number.isInteger(layer) || layer < 0 || layer >= colors) return false
    counts[layer]++
  }
  return counts.every((count) => count === CAPACITY)
}

/** Rebuilds an unfinished puzzle by replaying its pours. Returns null if the snapshot is unusable. */
export function restorePuzzle(snapshot: WaterSortSnapshot, gameId = 0): WaterSortState | null {
  const { colors, start, minimum, history, future } = snapshot
  if (!isValidStart(colors, start) || isSolved(start) || !Number.isInteger(minimum) || minimum < 1) return null
  const isMove = (move: Pour) =>
    Number.isInteger(move.from) && Number.isInteger(move.to) && move.from >= 0 && move.to >= 0
  if (![...history, ...future].every(isMove)) return null

  let state = createPuzzle(colors, start, minimum, gameId)
  for (const move of history) {
    const next = waterSortReducer(state, { type: 'pour', move })
    if (next === state || next.status === 'won') return null
    state = next
  }
  let probe = state.tubes
  const futureIsValid = [...future].reverse().every((move) => {
    if (!canPour(probe, move)) return false
    probe = pour(probe, move)
    return true
  })

  return {
    ...state,
    future: futureIsValid ? future : [],
    lastPour: null,
    hintsUsed: snapshot.hintsUsed,
    undosUsed: snapshot.undosUsed,
    solverUsed: snapshot.solverUsed,
  }
}
