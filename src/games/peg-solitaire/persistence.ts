import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type PegState } from './gameState'
import { DEFAULT_BOARD, isBoardId, type BoardId, type Jump } from './pegSolitaire'

const GAME_KEY = 'pegs:game'
const BOARD_KEY = 'pegs:board'
export const RECORDS_KEY = 'pegs:records'

interface StoredGame {
  version: 1
  boardId: BoardId
  /** Jumps as [from, over, to] triples. */
  history: [number, number, number][]
  future: [number, number, number][]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isTripleList = (value: unknown): value is [number, number, number][] =>
  Array.isArray(value) && value.every((triple) => Array.isArray(triple) && triple.length === 3 && triple.every(isInteger))

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isBoardId(game.boardId) &&
    isTripleList(game.history) &&
    isTripleList(game.future) &&
    isInteger(game.hintsUsed) &&
    isInteger(game.undosUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const toTriples = (jumps: Jump[]) => jumps.map(({ from, over, to }): [number, number, number] => [from, over, to])
const fromTriples = (triples: [number, number, number][]) => triples.map(([from, over, to]) => ({ from, over, to }))

/** Keeps an unfinished game across reloads; an untouched or finished board is not worth saving. */
export function saveGame(state: PegState, elapsedMs: number): void {
  if (state.status === 'ready' || state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    history: toTriples(snapshot.history),
    future: toTriples(snapshot.future),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: PegState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored && restoreGame({ ...stored, history: fromTriples(stored.history), future: fromTriples(stored.future) })
  if (stored && restored) return { state: restored, elapsedMs: Math.max(0, stored.elapsedMs) }
  return { state: createGame(readStored(BOARD_KEY, DEFAULT_BOARD, isBoardId)), elapsedMs: 0 }
}

export function savePreferredBoard(boardId: BoardId): void {
  writeStored(BOARD_KEY, boardId)
}
