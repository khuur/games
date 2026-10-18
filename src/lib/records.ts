import { isInteger } from './storage'

/** Best result on one level of a game with random puzzles, where the best time is what compares. */
export interface SolveRecord {
  timeMs: number
  solved: number
}

/** Records per level, keyed by the level's id (a size, a colour count, a board name…). */
export type SolveRecords = Partial<Record<string, SolveRecord>>

export function isSolveRecords(value: unknown): value is SolveRecords {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      typeof (record as SolveRecord).timeMs === 'number' &&
      isInteger((record as SolveRecord).solved),
  )
}

/** Adds a solve to the records, and says whether it was the first or the fastest. */
export function addSolve(records: SolveRecords, level: string | number, timeMs: number) {
  const previous = records[level]
  return {
    records: {
      ...records,
      [level]: { timeMs: Math.min(timeMs, previous?.timeMs ?? timeMs), solved: (previous?.solved ?? 0) + 1 },
    },
    firstSolve: !previous,
    newBestTime: previous !== undefined && timeMs < previous.timeMs,
  }
}
