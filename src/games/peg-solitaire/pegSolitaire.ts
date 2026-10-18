/**
 * Peg Solitaire rules. A peg jumps over a neighbouring peg into an empty hole straight behind it,
 * and the jumped peg comes off the board. The goal is a single peg, ideally in the target hole.
 */

export type BoardId = 'english' | 'triangle'
export type Pegs = readonly boolean[]

export interface Jump {
  from: number
  over: number
  to: number
}

export interface BoardDefinition {
  id: BoardId
  name: string
  /** How sentences refer to the board, such as "the English board". */
  phrase: string
  /** Row and column of each hole, for drawing (the triangle staggers its rows). */
  holes: { row: number; column: number }[]
  rows: number
  /** Jumps that start from each hole, as [over, to] pairs. */
  jumps: [number, number][][]
  /** The hole left empty at the start. */
  startHole: number
  /** Where the last peg ends up in a perfect game. */
  goalHole: number
  /** Ways of turning or mirroring the board onto itself, as hole permutations. */
  symmetries: number[][]
  /**
   * Whether hints also steer towards a single peg outside the goal hole once the goal is out of
   * reach. Cheap on small boards; on the 33-hole board hints aim for the classic centre finish only.
   */
  aimsForAnyFinish: boolean
}

export const BOARD_IDS: readonly BoardId[] = ['triangle', 'english']
export const DEFAULT_BOARD: BoardId = 'english'

function build(
  id: BoardId,
  name: string,
  phrase: string,
  cells: [number, number][],
  directions: [number, number][],
  start: [number, number],
  transforms: ((row: number, column: number) => [number, number])[],
  aimsForAnyFinish: boolean,
): BoardDefinition {
  const index = new Map(cells.map(([row, column], i) => [`${row},${column}`, i]))
  const at = (row: number, column: number) => index.get(`${row},${column}`)
  const jumps = cells.map(([row, column]) =>
    directions.flatMap(([dr, dc]): [number, number][] => {
      const over = at(row + dr, column + dc)
      const to = at(row + 2 * dr, column + 2 * dc)
      return over !== undefined && to !== undefined ? [[over, to]] : []
    }),
  )
  const symmetries = transforms.map((transform) => cells.map(([row, column]) => at(...transform(row, column))!))
  const startHole = at(...start)!
  return {
    id,
    name,
    phrase,
    holes: cells.map(([row, column]) => ({ row, column })),
    rows: Math.max(...cells.map(([row]) => row)) + 1,
    jumps,
    startHole,
    goalHole: startHole,
    symmetries,
    aimsForAnyFinish,
  }
}

/** The classic 33-hole cross, started and finished in the centre. */
const ENGLISH = build(
  'english',
  'English',
  'the English board',
  Array.from({ length: 49 }, (_, i): [number, number] => [Math.floor(i / 7), i % 7]).filter(
    ([row, column]) => (row >= 2 && row <= 4) || (column >= 2 && column <= 4),
  ),
  [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ],
  [3, 3],
  [
    (r, c) => [r, c],
    (r, c) => [c, 6 - r],
    (r, c) => [6 - r, 6 - c],
    (r, c) => [6 - c, r],
    (r, c) => [r, 6 - c],
    (r, c) => [6 - r, c],
    (r, c) => [c, r],
    (r, c) => [6 - c, 6 - r],
  ],
  false,
)

/**
 * The 15-hole triangle, started and finished in the top hole. Hole (row, k) has k from 0 to row;
 * besides its own row, it neighbours (row−1, k−1), (row−1, k), (row+1, k) and (row+1, k+1).
 */
const TRIANGLE = build(
  'triangle',
  'Triangle',
  'the triangle board',
  Array.from({ length: 5 }, (_, row) => Array.from({ length: row + 1 }, (__, k): [number, number] => [row, k])).flat(),
  [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, -1],
  ],
  [0, 0],
  // Turning and mirroring the triangle permutes the distances (row − k, k, 4 − row) to its sides.
  [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
    [1, 0, 2],
    [0, 2, 1],
    [2, 1, 0],
  ].map((order) => (row: number, k: number): [number, number] => {
    const sides = [row - k, k, 4 - row]
    return [4 - sides[order[2]], sides[order[1]]]
  }),
  true,
)

export const BOARDS: Record<BoardId, BoardDefinition> = { english: ENGLISH, triangle: TRIANGLE }

export function isBoardId(value: unknown): value is BoardId {
  return value === 'english' || value === 'triangle'
}

export function startingPegs(board: BoardDefinition): boolean[] {
  return board.holes.map((_, hole) => hole !== board.startHole)
}

export function countPegs(pegs: Pegs): number {
  return pegs.reduce((count, peg) => count + (peg ? 1 : 0), 0)
}

export function legalJumps(board: BoardDefinition, pegs: Pegs, from?: number): Jump[] {
  const holes = from === undefined ? board.holes.map((_, hole) => hole) : [from]
  return holes.flatMap((hole) =>
    pegs[hole]
      ? board.jumps[hole].flatMap(([over, to]) => (pegs[over] && !pegs[to] ? [{ from: hole, over, to }] : []))
      : [],
  )
}

export function isLegal(board: BoardDefinition, pegs: Pegs, jump: Jump): boolean {
  return legalJumps(board, pegs, jump.from).some((legal) => legal.to === jump.to && legal.over === jump.over)
}

export function applyJump(pegs: Pegs, { from, over, to }: Jump): boolean[] {
  const next = pegs.slice()
  next[from] = false
  next[over] = false
  next[to] = true
  return next
}

// --- Solving -----------------------------------------------------------------------------------

/**
 * The best finish a position still allows: no single peg, one peg outside the target hole, or
 * one peg in the target hole.
 */
export const Outcome = { Hopeless: 0, OnePeg: 1, Perfect: 2 } as const
export type Outcome = (typeof Outcome)[keyof typeof Outcome]

/** Outcomes already worked out, per board, kept between searches. */
const known = new Map<BoardId, Map<number, Outcome>>()
const MAX_REMEMBERED = 1_500_000
class SearchLimit extends Error {}

/** Forgets every remembered outcome, so the next search starts from scratch. */
export function forgetSearches(): void {
  known.clear()
}

/**
 * The best outcome reachable from a position, by depth-first search. Turned or mirrored copies of
 * a position are the same problem (keys for all of them are updated jump by jump), and every
 * position's outcome is remembered between searches. Returns null after `maxPositions` new
 * positions without an answer, rather than keep the player waiting.
 */
function evaluate(board: BoardDefinition, start: Pegs, maxPositions: number): Outcome | null {
  let memo = known.get(board.id)
  if (!memo || memo.size > MAX_REMEMBERED) {
    memo = new Map()
    known.set(board.id, memo)
  }
  const outcomes = memo
  // Only symmetries that keep the target hole in place give the same answer.
  const maps = board.symmetries.filter((map) => map[board.goalHole] === board.goalHole)
  const weights = maps.map((map) => map.map((image) => 2 ** image))
  const keys = weights.map((weight) => start.reduce((key, peg, hole) => (peg ? key + weight[hole] : key), 0))
  const pegs = start.slice()
  let remaining = countPegs(pegs)
  let visited = 0

  const shift = (hole: number, sign: number) => {
    for (let s = 0; s < keys.length; s++) keys[s] += sign * weights[s][hole]
  }

  const explore = (): Outcome => {
    if (remaining === 1) {
      if (pegs[board.goalHole]) return Outcome.Perfect
      return board.aimsForAnyFinish ? Outcome.OnePeg : Outcome.Hopeless
    }
    let key = keys[0]
    for (let s = 1; s < keys.length; s++) if (keys[s] < key) key = keys[s]
    const remembered = outcomes.get(key)
    if (remembered !== undefined) return remembered
    if (++visited > maxPositions) throw new SearchLimit()

    let best: Outcome = Outcome.Hopeless
    search: for (let from = 0; from < pegs.length; from++) {
      if (!pegs[from]) continue
      for (const [over, to] of board.jumps[from]) {
        if (!pegs[over] || pegs[to]) continue
        pegs[from] = pegs[over] = false
        pegs[to] = true
        shift(from, -1)
        shift(over, -1)
        shift(to, 1)
        remaining--
        const outcome = explore()
        remaining++
        shift(to, -1)
        shift(over, 1)
        shift(from, 1)
        pegs[from] = pegs[over] = true
        pegs[to] = false
        if (outcome > best) best = outcome
        if (best === Outcome.Perfect) break search
      }
    }
    outcomes.set(key, best)
    return best
  }

  try {
    return explore()
  } catch (error) {
    if (error instanceof SearchLimit) return null
    throw error
  }
}

export interface Advice {
  /** The next jump towards the best finish still possible, if there is one. */
  jump: Jump | null
  outcome: Outcome
}

/**
 * The best finish still possible and a jump towards it. Null means the search reached
 * `maxPositions` before finding out, which can happen on the big board.
 */
export function advise(board: BoardDefinition, pegs: Pegs, maxPositions = 600_000): Advice | null {
  const outcome = evaluate(board, pegs, maxPositions)
  if (outcome === null) return null
  if (outcome === Outcome.Hopeless || countPegs(pegs) === 1) return { jump: null, outcome }
  // Children of a solved position are already remembered, so this takes no further searching.
  for (const jump of legalJumps(board, pegs)) {
    if (evaluate(board, applyJump(pegs, jump), maxPositions) === outcome) return { jump, outcome }
  }
  return null
}

/**
 * {@link advise}, done a slice at a time with pauses that let the browser stay responsive. Each
 * slice carries on from what earlier ones proved. Resolves to 'cancelled' as soon as `cancelled()`
 * says the answer is no longer wanted, and to null if `total` positions were not enough.
 */
export async function adviseGradually(
  board: BoardDefinition,
  pegs: Pegs,
  cancelled: () => boolean,
  { slice = 12_000, total = 2_500_000 } = {},
): Promise<Advice | null | 'cancelled'> {
  for (let used = 0; used < total; used += slice) {
    if (cancelled()) return 'cancelled'
    const advice = advise(board, pegs, slice)
    if (advice) return advice
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return cancelled() ? 'cancelled' : null
}

/** Every jump to the best finish still possible, for the auto-solver. */
export function solve(board: BoardDefinition, start: Pegs, maxPositions = 600_000): Jump[] | null {
  const jumps: Jump[] = []
  let pegs = start
  for (;;) {
    const advice = advise(board, pegs, maxPositions)
    if (!advice) return null
    if (!advice.jump) return advice.outcome === Outcome.Hopeless && jumps.length === 0 ? null : jumps
    jumps.push(advice.jump)
    pegs = applyJump(pegs, advice.jump)
  }
}
