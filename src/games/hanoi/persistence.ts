import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type GameState } from './gameState'
import { clampDiskCount, DEFAULT_DISKS, type Move } from './hanoi'

const GAME_KEY = 'hanoi:game'
const DISKS_KEY = 'hanoi:disks'
export const RECORDS_KEY = 'hanoi:records'

export interface BestRecord {
  moves: number
  timeMs: number
}

/** Best results per disk count. */
export type Records = Partial<Record<number, BestRecord>>

interface StoredGame {
  version: 1
  diskCount: number
  /** Moves as pairs of tower digits, e.g. "0201" for 0→2, 0→1. */
  history: string
  future: string
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const encodeMoves = (moves: Move[]) => moves.map(({ from, to }) => `${from}${to}`).join('')

function decodeMoves(text: string): Move[] {
  const moves: Move[] = []
  for (let i = 0; i + 1 < text.length; i += 2) {
    moves.push({ from: Number(text[i]), to: Number(text[i + 1]) })
  }
  return moves
}

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isInteger(game.diskCount) &&
    typeof game.history === 'string' &&
    typeof game.future === 'string' &&
    isInteger(game.hintsUsed) &&
    isInteger(game.undosUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

/** Keeps an unfinished game across reloads; finished or untouched games are not worth restoring. */
export function saveGame(state: GameState, elapsedMs: number): void {
  if (state.status !== 'playing') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    history: encodeMoves(snapshot.history),
    future: encodeMoves(snapshot.future),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: GameState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      ...stored,
      history: decodeMoves(stored.history),
      future: decodeMoves(stored.future),
    })
  if (stored && restored) return { state: restored, elapsedMs: Math.max(0, stored.elapsedMs) }
  return { state: createGame(loadPreferredDiskCount()), elapsedMs: 0 }
}

function loadPreferredDiskCount(): number {
  return clampDiskCount(readStored(DISKS_KEY, DEFAULT_DISKS, isInteger))
}

export function savePreferredDiskCount(diskCount: number): void {
  writeStored(DISKS_KEY, diskCount)
}

export function isRecords(value: unknown): value is Records {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      isInteger((record as BestRecord).moves) &&
      typeof (record as BestRecord).timeMs === 'number',
  )
}
