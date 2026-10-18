import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createPuzzle, restorePuzzle, toSnapshot, type LightsOutState } from './gameState'
import { clampSize, DEFAULT_SIZE, generatePuzzle } from './lightsOut'

const GAME_KEY = 'lights-out:game'
const SIZE_KEY = 'lights-out:size'
export const RECORDS_KEY = 'lights-out:records'

export interface LightsOutRecord {
  timeMs: number
  solved: number
}

/** Best results per grid size. Puzzles are random, so the best time is what's comparable. */
export type LightsOutRecords = Partial<Record<number, LightsOutRecord>>

interface StoredGame {
  version: 1
  size: number
  /** The starting lights as "0" and "1" characters in reading order. */
  start: string
  history: number[]
  future: number[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isCellList = (value: unknown): value is number[] => Array.isArray(value) && value.every(isInteger)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isInteger(game.size) &&
    typeof game.start === 'string' &&
    /^[01]+$/.test(game.start) &&
    isCellList(game.history) &&
    isCellList(game.future) &&
    isInteger(game.hintsUsed) &&
    isInteger(game.undosUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

/**
 * Keeps the current puzzle across reloads, even before the first press, since every puzzle is
 * random. Finished puzzles are dropped so a reload deals a new one.
 */
export function saveGame(state: LightsOutState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    start: snapshot.start.map((on) => (on ? '1' : '0')).join(''),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: LightsOutState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored = stored && restorePuzzle({ ...stored, start: [...stored.start].map((digit) => digit === '1') })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const size = loadPreferredSize()
  return { state: createPuzzle(size, generatePuzzle(size)), elapsedMs: 0 }
}

function loadPreferredSize(): number {
  return clampSize(readStored(SIZE_KEY, DEFAULT_SIZE, isInteger))
}

export function savePreferredSize(size: number): void {
  writeStored(SIZE_KEY, size)
}

export function isRecords(value: unknown): value is LightsOutRecords {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      typeof (record as LightsOutRecord).timeMs === 'number' &&
      isInteger((record as LightsOutRecord).solved),
  )
}
