import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type Change, type SlitherlinkState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, NO_CLUE, type EdgeState, type LevelId } from './slitherlink'

const GAME_KEY = 'slitherlink:game'
const LEVEL_KEY = 'slitherlink:level'
export const RECORDS_KEY = 'slitherlink:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** One character per cell: its clue, or "." for none. */
  clues: string
  /** One character per edge: "1" on the loop, "0" off it. */
  solution: string
  /** One character per edge: "0" open, "1" line, "2" cross. */
  edges: string
  /** Moves as lists of changes, each packed as edge × 9 + before × 3 + after. */
  history: number[][]
  future: number[][]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isMoveList = (value: unknown): value is number[][] =>
  Array.isArray(value) && value.every((move) => Array.isArray(move) && move.every((packed) => isInteger(packed) && packed >= 0))

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    typeof game.clues === 'string' &&
    /^[0-3.]+$/.test(game.clues) &&
    typeof game.solution === 'string' &&
    /^[01]+$/.test(game.solution) &&
    typeof game.edges === 'string' &&
    /^[012]+$/.test(game.edges) &&
    isMoveList(game.history) &&
    isMoveList(game.future) &&
    isInteger(game.mistakes) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const pack = (move: Change[]) => move.map(({ edge, before, after }) => edge * 9 + before * 3 + after)
const unpack = (move: number[]): Change[] =>
  move.map((packed) => ({
    edge: Math.floor(packed / 9),
    before: (Math.floor(packed / 3) % 3) as EdgeState,
    after: (packed % 3) as EdgeState,
  }))

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: SlitherlinkState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    levelId: snapshot.levelId,
    clues: snapshot.clues.map((clue) => (clue === NO_CLUE ? '.' : String(clue))).join(''),
    solution: snapshot.solution.join(''),
    edges: snapshot.edges.join(''),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: SlitherlinkState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      levelId: stored.levelId,
      clues: [...stored.clues].map((char) => (char === '.' ? NO_CLUE : Number(char))),
      solution: [...stored.solution].map(Number),
      edges: [...stored.edges].map(Number) as EdgeState[],
      history: stored.history.map(unpack),
      future: stored.future.map(unpack),
      mistakes: stored.mistakes,
      hintsUsed: stored.hintsUsed,
      solverUsed: stored.solverUsed,
    })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const levelId = readStored(LEVEL_KEY, DEFAULT_LEVEL, isLevelId)
  return { state: createGame(levelId, generatePuzzle(LEVELS[levelId])), elapsedMs: 0 }
}

export function savePreferredLevel(levelId: LevelId): void {
  writeStored(LEVEL_KEY, levelId)
}
