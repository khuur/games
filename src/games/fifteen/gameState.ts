import type { GameStatus } from '../../hooks/useGameSession'
import { canSlide, clampSize, isSolvable, isSolved, puzzleTarget, slide } from './fifteen'

export interface FifteenState {
  /** Changes whenever a fresh puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  size: number
  /** The puzzle as dealt, for restarting. */
  start: number[]
  tiles: number[]
  /** The number of moves to beat: the minimum on 3×3, par on bigger boards. */
  target: number
  /** Tiles slid so far, one entry per tile. */
  history: number[]
  /** Undone slides that can be redone, most recent last. */
  future: number[]
  hint: number | null
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type FifteenAction =
  | { type: 'new-puzzle'; size: number; start: number[]; target: number }
  | { type: 'restart' }
  /** One tap can slide a whole line of tiles, nearest the gap first. */
  | { type: 'slide'; tiles: number[]; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; tile: number }
  | { type: 'solver-started' }

/** The parts of a game worth saving; everything else can be rebuilt from them. */
export interface FifteenSnapshot {
  size: number
  start: number[]
  history: number[]
  future: number[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
}

export function createPuzzle(size: number, start: number[], target: number, gameId = 0): FifteenState {
  return {
    gameId,
    size,
    start,
    tiles: start,
    target,
    history: [],
    future: [],
    hint: null,
    hintsUsed: 0,
    undosUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

const statusOf = (tiles: number[]) => (isSolved(tiles) ? ('won' as const) : ('playing' as const))

export function fifteenReducer(state: FifteenState, action: FifteenAction): FifteenState {
  switch (action.type) {
    case 'new-puzzle':
      return createPuzzle(action.size, action.start, action.target, state.gameId + 1)

    case 'restart':
      return createPuzzle(state.size, state.start, state.target, state.gameId + 1)

    case 'slide': {
      if (state.status === 'won') return state
      let tiles = state.tiles
      const slid: number[] = []
      for (const tile of action.tiles) {
        if (!canSlide(tiles, tile, state.size)) break
        tiles = slide(tiles, tile)
        slid.push(tile)
        if (isSolved(tiles)) break
      }
      if (slid.length === 0) return state
      return {
        ...state,
        tiles,
        history: [...state.history, ...slid],
        future: [],
        hint: null,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status: statusOf(tiles),
      }
    }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || last === undefined) return state
      // The tile that just slid sits next to the gap, so sliding it again puts it back.
      const tiles = slide(state.tiles, last)
      return {
        ...state,
        tiles,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        hint: null,
        undosUsed: state.undosUsed + 1,
        status: 'playing',
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || next === undefined || !canSlide(state.tiles, next, state.size)) return state
      const tiles = slide(state.tiles, next)
      return {
        ...state,
        tiles,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        hint: null,
        status: statusOf(tiles),
      }
    }

    case 'hint':
      if (state.status === 'won' || !canSlide(state.tiles, action.tile, state.size)) return state
      // Asking again while a hint is showing reveals nothing new, so it is not counted.
      return { ...state, hint: action.tile, hintsUsed: state.hint === null ? state.hintsUsed + 1 : state.hintsUsed }

    case 'solver-started':
      return { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: FifteenState): FifteenSnapshot {
  const { size, start, history, future, hintsUsed, undosUsed, solverUsed } = state
  return { size, start, history, future, hintsUsed, undosUsed, solverUsed }
}

/** Rebuilds an unfinished puzzle by replaying its slides. Returns null if the snapshot is unusable. */
export function restorePuzzle(snapshot: FifteenSnapshot, gameId = 0): FifteenState | null {
  const { size, start, history, future } = snapshot
  if (clampSize(size) !== size || start.length !== size * size) return null
  const sorted = [...start].sort((a, b) => a - b)
  if (!sorted.every((tile, index) => tile === index) || !isSolvable(start, size) || isSolved(start)) return null

  let state = createPuzzle(size, start, puzzleTarget(start, size), gameId)
  for (const tile of history) {
    const next = fifteenReducer(state, { type: 'slide', tiles: [tile] })
    if (next === state || next.status === 'won') return null
    state = next
  }
  // Redo replays the future from the end, one legal slide at a time.
  let probe = state.tiles
  const futureIsValid = [...future].reverse().every((tile) => {
    if (!canSlide(probe, tile, size)) return false
    probe = slide(probe, tile)
    return true
  })

  return {
    ...state,
    future: futureIsValid ? future : [],
    hintsUsed: snapshot.hintsUsed,
    undosUsed: snapshot.undosUsed,
    solverUsed: snapshot.solverUsed,
  }
}
