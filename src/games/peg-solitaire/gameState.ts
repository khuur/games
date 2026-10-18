import type { GameStatus } from '../../hooks/useGameSession'
import { applyJump, BOARDS, countPegs, isBoardId, isLegal, legalJumps, startingPegs, type BoardId, type Jump } from './pegSolitaire'

export interface PegState {
  /** Changes whenever a fresh game begins, so the board can reset itself. */
  gameId: number
  boardId: BoardId
  pegs: boolean[]
  history: Jump[]
  /** Undone jumps that can be redone, most recent last. */
  future: Jump[]
  /** The hole whose peg is picked up, waiting for somewhere to jump. */
  selected: number | null
  /** The latest jump, so the board can animate it. */
  lastJump: (Jump & { id: number }) | null
  hint: Jump | null
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type PegAction =
  | { type: 'new-game'; boardId: BoardId }
  | { type: 'select'; hole: number }
  | { type: 'deselect' }
  | { type: 'jump'; jump: Jump; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; jump: Jump }
  | { type: 'solver-started' }

/** The parts of a game worth saving; the board's starting position is always the same. */
export interface PegSnapshot {
  boardId: BoardId
  history: Jump[]
  future: Jump[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
}

export function createGame(boardId: BoardId, gameId = 0): PegState {
  return {
    gameId,
    boardId,
    pegs: startingPegs(BOARDS[boardId]),
    history: [],
    future: [],
    selected: null,
    lastJump: null,
    hint: null,
    hintsUsed: 0,
    undosUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

function statusOf(boardId: BoardId, pegs: boolean[]): GameStatus {
  if (countPegs(pegs) === 1) return 'won'
  return legalJumps(BOARDS[boardId], pegs).length === 0 ? 'stuck' : 'playing'
}

export function pegReducer(state: PegState, action: PegAction): PegState {
  const board = BOARDS[state.boardId]
  switch (action.type) {
    case 'new-game':
      return createGame(action.boardId, state.gameId + 1)

    case 'select':
      if (state.status === 'won' || !state.pegs[action.hole]) return state
      return { ...state, selected: action.hole }

    case 'deselect':
      return state.selected === null ? state : { ...state, selected: null }

    case 'jump': {
      if (state.status === 'won' || !isLegal(board, state.pegs, action.jump)) return state
      const pegs = applyJump(state.pegs, action.jump)
      return {
        ...state,
        pegs,
        history: [...state.history, action.jump],
        future: [],
        selected: null,
        lastJump: { ...action.jump, id: state.history.length + 1 },
        hint: null,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status: statusOf(state.boardId, pegs),
      }
    }

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const pegs = state.pegs.slice()
      pegs[last.from] = true
      pegs[last.over] = true
      pegs[last.to] = false
      return {
        ...state,
        pegs,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        selected: null,
        lastJump: null,
        hint: null,
        undosUsed: state.undosUsed + 1,
        status: 'playing',
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next || !isLegal(board, state.pegs, next)) return state
      const pegs = applyJump(state.pegs, next)
      return {
        ...state,
        pegs,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        selected: null,
        lastJump: { ...next, id: state.history.length + 1 },
        hint: null,
        status: statusOf(state.boardId, pegs),
      }
    }

    case 'hint':
      if (state.status === 'won' || !isLegal(board, state.pegs, action.jump)) return state
      // Asking again while a hint is showing reveals nothing new, so it is not counted.
      return {
        ...state,
        hint: action.jump,
        selected: null,
        hintsUsed: state.hint === null ? state.hintsUsed + 1 : state.hintsUsed,
      }

    case 'solver-started':
      return { ...state, solverUsed: true, selected: null, hint: null }
  }
}

export function toSnapshot(state: PegState): PegSnapshot {
  const { boardId, history, future, hintsUsed, undosUsed, solverUsed } = state
  return { boardId, history, future, hintsUsed, undosUsed, solverUsed }
}

/** Rebuilds an unfinished game by replaying its jumps. Returns null if the snapshot is unusable. */
export function restoreGame(snapshot: PegSnapshot, gameId = 0): PegState | null {
  if (!isBoardId(snapshot.boardId) || snapshot.history.length === 0) return null
  let state = createGame(snapshot.boardId, gameId)
  for (const jump of snapshot.history) {
    const next = pegReducer(state, { type: 'jump', jump })
    if (next === state || next.status === 'won') return null
    state = next
  }
  const board = BOARDS[snapshot.boardId]
  let probe = state.pegs
  const futureIsValid = [...snapshot.future].reverse().every((jump) => {
    if (!isLegal(board, probe, jump)) return false
    probe = applyJump(probe, jump)
    return true
  })
  return {
    ...state,
    future: futureIsValid ? snapshot.future : [],
    lastJump: null,
    hintsUsed: snapshot.hintsUsed,
    undosUsed: snapshot.undosUsed,
    solverUsed: snapshot.solverUsed,
  }
}
