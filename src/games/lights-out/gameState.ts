import type { GameStatus } from '../../hooks/useGameSession'
import { clampSize, isCell, isDark, press, solve } from './lightsOut'

export interface LightsOutState {
  /** Changes whenever a fresh puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  size: number
  /** The puzzle as dealt, for restarting. */
  start: boolean[]
  lights: boolean[]
  /** Fewest presses that solve the puzzle from the start. */
  minimum: number
  history: number[]
  /** Undone presses that can be redone, most recent last. */
  future: number[]
  /** Where the latest press (or undo) happened, so the board can ripple out from there. */
  lastCell: number | null
  hint: number | null
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type LightsOutAction =
  | { type: 'new-puzzle'; size: number; start: boolean[] }
  | { type: 'restart' }
  | { type: 'press'; cell: number; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint' }
  | { type: 'solver-started' }

/** The parts of a game worth saving; everything else can be rebuilt from them. */
export interface LightsOutSnapshot {
  size: number
  start: boolean[]
  history: number[]
  future: number[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
}

export function createPuzzle(size: number, start: boolean[], gameId = 0): LightsOutState {
  return {
    gameId,
    size,
    start,
    lights: start,
    minimum: solve(start, size)?.length ?? 0,
    history: [],
    future: [],
    lastCell: null,
    hint: null,
    hintsUsed: 0,
    undosUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

function pressed(state: LightsOutState, cell: number) {
  const lights = press(state.lights, cell, state.size)
  return {
    lights,
    lastCell: cell,
    hint: null,
    status: isDark(lights) ? ('won' as const) : ('playing' as const),
  }
}

export function lightsOutReducer(state: LightsOutState, action: LightsOutAction): LightsOutState {
  switch (action.type) {
    case 'new-puzzle':
      return createPuzzle(action.size, action.start, state.gameId + 1)

    case 'restart':
      return createPuzzle(state.size, state.start, state.gameId + 1)

    case 'press':
      if (state.status === 'won' || !isCell(action.cell, state.size)) return state
      return {
        ...state,
        ...pressed(state, action.cell),
        history: [...state.history, action.cell],
        future: [],
        solverUsed: state.solverUsed || Boolean(action.bySolver),
      }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || last === undefined) return state
      // A press is its own opposite, so undoing means pressing the same light again.
      return {
        ...state,
        ...pressed(state, last),
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        undosUsed: state.undosUsed + 1,
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || next === undefined) return state
      return {
        ...state,
        ...pressed(state, next),
        history: [...state.history, next],
        future: state.future.slice(0, -1),
      }
    }

    case 'hint': {
      const hint = state.status === 'won' ? undefined : solve(state.lights, state.size)?.[0]
      if (hint === undefined) return state
      // Asking again while a hint is showing reveals nothing new, so it is not counted.
      return { ...state, hint, hintsUsed: state.hint === null ? state.hintsUsed + 1 : state.hintsUsed }
    }

    case 'solver-started':
      return { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: LightsOutState): LightsOutSnapshot {
  const { size, start, history, future, hintsUsed, undosUsed, solverUsed } = state
  return { size, start, history, future, hintsUsed, undosUsed, solverUsed }
}

/** Rebuilds an unfinished puzzle by replaying its presses. Returns null if the snapshot is unusable. */
export function restorePuzzle(snapshot: LightsOutSnapshot, gameId = 0): LightsOutState | null {
  const { size, start, history, future } = snapshot
  if (clampSize(size) !== size || start.length !== size * size) return null
  if (![...history, ...future].every((cell) => isCell(cell, size))) return null
  if (isDark(start) || solve(start, size) === null) return null

  let state = createPuzzle(size, start, gameId)
  for (const cell of history) state = lightsOutReducer(state, { type: 'press', cell })
  if (state.status === 'won') return null

  return {
    ...state,
    future,
    lastCell: null,
    hintsUsed: snapshot.hintsUsed,
    undosUsed: snapshot.undosUsed,
    solverUsed: snapshot.solverUsed,
  }
}
