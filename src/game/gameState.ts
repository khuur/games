import {
  applyMove,
  clampDiskCount,
  createTowers,
  isSolved,
  isTowerIndex,
  nextOptimalMove,
  validateMove,
  type Move,
  type Towers,
} from './hanoi'

export type GameStatus = 'ready' | 'playing' | 'won'

export interface GameState {
  /** Changes whenever a fresh game starts, so the board can reset itself. */
  gameId: number
  diskCount: number
  towers: Towers
  history: Move[]
  /** Undone moves that can be redone, most recent last. */
  future: Move[]
  /** Tower whose top disk is picked up, waiting for a destination. */
  selected: number | null
  hint: Move | null
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type GameAction =
  | { type: 'new-game'; diskCount: number }
  | { type: 'select'; tower: number }
  | { type: 'deselect' }
  | { type: 'move'; move: Move; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint' }
  | { type: 'solver-started' }

/** The parts of a game worth saving; everything else can be rebuilt from them. */
export interface GameSnapshot {
  diskCount: number
  history: Move[]
  future: Move[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
}

export function createGame(diskCount: number, gameId = 0): GameState {
  const count = clampDiskCount(diskCount)
  return {
    gameId,
    diskCount: count,
    towers: createTowers(count),
    history: [],
    future: [],
    selected: null,
    hint: null,
    hintsUsed: 0,
    undosUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

function withTowers(state: GameState, towers: Towers) {
  return {
    towers,
    status: isSolved(towers, state.diskCount) ? ('won' as const) : ('playing' as const),
    selected: null,
    hint: null,
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.diskCount, state.gameId + 1)

    case 'select':
      if (state.status === 'won' || !state.towers[action.tower]?.length) return state
      return { ...state, selected: action.tower }

    case 'deselect':
      return state.selected === null ? state : { ...state, selected: null }

    case 'move':
      if (state.status === 'won' || validateMove(state.towers, action.move)) return state
      return {
        ...state,
        ...withTowers(state, applyMove(state.towers, action.move)),
        history: [...state.history, action.move],
        future: [],
        solverUsed: state.solverUsed || Boolean(action.bySolver),
      }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      return {
        ...state,
        ...withTowers(state, applyMove(state.towers, { from: last.to, to: last.from })),
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        undosUsed: state.undosUsed + 1,
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next) return state
      return {
        ...state,
        ...withTowers(state, applyMove(state.towers, next)),
        history: [...state.history, next],
        future: state.future.slice(0, -1),
      }
    }

    case 'hint': {
      const hint = state.status === 'won' ? null : nextOptimalMove(state.towers)
      if (!hint) return state
      // Asking again while a hint is showing reveals nothing new, so it is not counted.
      return { ...state, hint, selected: null, hintsUsed: state.hint ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return { ...state, solverUsed: true, selected: null, hint: null }
  }
}

export function toSnapshot(state: GameState): GameSnapshot {
  const { diskCount, history, future, hintsUsed, undosUsed, solverUsed } = state
  return { diskCount, history, future, hintsUsed, undosUsed, solverUsed }
}

/** Rebuilds an unfinished game by replaying its moves. Returns null if the snapshot is unusable. */
export function restoreGame(snapshot: GameSnapshot, gameId = 0): GameState | null {
  const game = createGame(snapshot.diskCount, gameId)
  if (game.diskCount !== snapshot.diskCount || snapshot.history.length === 0) return null

  const replay = (start: Towers, moves: Move[]): Towers | null => {
    let towers = start
    for (const move of moves) {
      if (!isTowerIndex(move.from) || !isTowerIndex(move.to) || validateMove(towers, move)) return null
      towers = applyMove(towers, move)
    }
    return towers
  }

  const towers = replay(game.towers, snapshot.history)
  if (!towers || isSolved(towers, game.diskCount)) return null
  // Redo pops from the end, so the future replays in reverse.
  const futureIsValid = replay(towers, [...snapshot.future].reverse()) !== null

  return {
    ...game,
    towers,
    history: snapshot.history,
    future: futureIsValid ? snapshot.future : [],
    hintsUsed: snapshot.hintsUsed,
    undosUsed: snapshot.undosUsed,
    solverUsed: snapshot.solverUsed,
    status: 'playing',
  }
}
