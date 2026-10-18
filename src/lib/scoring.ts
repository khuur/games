export type StarRating = 1 | 2 | 3

/** What helped finish a game, if anything. Assisted solves don't count as best scores. */
export type Assistance = 'solver' | 'hints' | null

/** Three stars for a perfect solve, two for staying within half again the minimum. */
export function starRating(moves: number, minimum: number): StarRating {
  if (moves <= minimum) return 3
  if (moves <= Math.ceil(minimum * 1.5)) return 2
  return 1
}

/** A finished game, as the results dialog shows it. */
export interface WinResult {
  moves: number
  timeMs: number
  stars: StarRating
  /** Reached the best possible result, such as the minimum number of moves. */
  perfect: boolean
  assistedBy: Assistance
  hintsUsed: number
  /** Achievements worth a badge, such as "New best time". */
  badges: string[]
  /** The figure shown between moves and time, such as { label: 'Minimum', value: '15' }. */
  target: { label: string; value: string }
  /** Encouragement when the result could be better. */
  improveNote: string
}

export function assistance(solverUsed: boolean, hintsUsed: number): Assistance {
  if (solverUsed) return 'solver'
  return hintsUsed > 0 ? 'hints' : null
}
