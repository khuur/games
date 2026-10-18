import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type LevelId } from './bridges'
import { createGame, restoreGame, toSnapshot, type BridgesState, type Move } from './gameState'

const GAME_KEY = 'bridges:game'
const LEVEL_KEY = 'bridges:level'
export const RECORDS_KEY = 'bridges:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** Islands as [cell, count] pairs. */
  islands: [number, number][]
  /** Bridges per link, one digit each. */
  solution: string
  counts: string
  /** Moves packed as link × 9 + before × 3 + after. */
  history: number[]
  future: number[]
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isDigits = (value: unknown): value is string => typeof value === 'string' && /^[012]*$/.test(value)
const isMoves = (value: unknown): value is number[] => Array.isArray(value) && value.every((move) => isInteger(move) && move >= 0)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    Array.isArray(game.islands) &&
    game.islands.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isInteger)) &&
    isDigits(game.solution) &&
    isDigits(game.counts) &&
    isMoves(game.history) &&
    isMoves(game.future) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const pack = ({ link, before, after }: Move) => link * 9 + before * 3 + after
const unpack = (packed: number): Move => ({ link: Math.floor(packed / 9), before: Math.floor(packed / 3) % 3, after: packed % 3 })

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: BridgesState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    levelId: snapshot.levelId,
    islands: snapshot.islands.map(({ cell, count }) => [cell, count]),
    solution: snapshot.solution.join(''),
    counts: snapshot.counts.join(''),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: BridgesState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      levelId: stored.levelId,
      islands: stored.islands.map(([cell, count]) => ({ cell, count })),
      solution: [...stored.solution].map(Number),
      counts: [...stored.counts].map(Number),
      history: stored.history.map(unpack),
      future: stored.future.map(unpack),
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
