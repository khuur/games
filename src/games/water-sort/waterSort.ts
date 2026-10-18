/**
 * Water Sort rules. Each tube holds up to four layers of coloured water, listed bottom to top.
 * Pouring moves the top colour onto a tube that is empty or has the same colour on top, as much as
 * fits. The goal is every colour gathered in a tube of its own.
 */

export type Tube = readonly number[]
export type Tubes = readonly Tube[]

export interface Pour {
  from: number
  to: number
}

export const CAPACITY = 4
export const SPARE_TUBES = 2
export const MIN_COLORS = 3
export const MAX_COLORS = 9
export const DEFAULT_COLORS = 5

export function clampColors(colors: number): number {
  if (!Number.isFinite(colors)) return DEFAULT_COLORS
  return Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.round(colors)))
}

export function topColor(tube: Tube): number | undefined {
  return tube[tube.length - 1]
}

/** How many layers of the top colour sit together at the top of a tube. */
export function topRun(tube: Tube): number {
  let run = 0
  for (let i = tube.length - 1; i >= 0 && tube[i] === tube[tube.length - 1]; i--) run++
  return run
}

/** Layers that a pour would move: the top colour, as much as the other tube has room for. */
export function pourAmount(tubes: Tubes, { from, to }: Pour): number {
  const source = tubes[from]
  const target = tubes[to]
  if (from === to || !source || !target || source.length === 0 || target.length >= CAPACITY) return 0
  if (target.length > 0 && topColor(target) !== topColor(source)) return 0
  return Math.min(topRun(source), CAPACITY - target.length)
}

export function canPour(tubes: Tubes, move: Pour): boolean {
  return pourAmount(tubes, move) > 0
}

export function pour(tubes: Tubes, move: Pour): Tube[] {
  const amount = pourAmount(tubes, move)
  if (amount === 0) return tubes.slice()
  const color = topColor(tubes[move.from])!
  return tubes.map((tube, index) => {
    if (index === move.from) return tube.slice(0, tube.length - amount)
    if (index === move.to) return [...tube, ...new Array<number>(amount).fill(color)]
    return tube
  })
}

/** A full tube of one colour. */
export function isComplete(tube: Tube): boolean {
  return tube.length === CAPACITY && tube.every((color) => color === tube[0])
}

export function isSolved(tubes: Tubes): boolean {
  return tubes.every((tube) => tube.length === 0 || isComplete(tube))
}

export function legalPours(tubes: Tubes): Pour[] {
  const pours: Pour[] = []
  tubes.forEach((_, from) =>
    tubes.forEach((__, to) => {
      if (canPour(tubes, { from, to })) pours.push({ from, to })
    }),
  )
  return pours
}

export function countComplete(tubes: Tubes): number {
  return tubes.filter(isComplete).length
}

/** Blocks of one colour, counting each tube from the bottom; a solved puzzle has one per colour. */
function countBlocks(tubes: Tubes): number {
  let blocks = 0
  for (const tube of tubes) {
    for (let i = 0; i < tube.length; i++) if (i === 0 || tube[i] !== tube[i - 1]) blocks++
  }
  return blocks
}

const encodeTube = (tube: Tube) => String.fromCharCode(...tube.map((color) => 97 + color))

/** Tubes can be shuffled around without changing anything, so their order is ignored. */
function positionKey(tubes: Tubes): string {
  return tubes.map(encodeTube).sort().join('|')
}

/** Pours worth trying: no emptying a finished tube, and no moving a one-colour tube into an empty one. */
function usefulPours(tubes: Tubes): Pour[] {
  const pours: Pour[] = []
  let triedEmpty = false
  tubes.forEach((source, from) => {
    if (source.length === 0 || isComplete(source)) return
    const uniform = topRun(source) === source.length
    triedEmpty = false
    tubes.forEach((target, to) => {
      if (target.length === 0) {
        // Every empty tube is the same, and pouring a one-colour tube into one changes nothing.
        if (uniform || triedEmpty) return
        triedEmpty = true
      }
      if (canPour(tubes, { from, to })) pours.push({ from, to })
    })
  })
  return pours
}

interface Node {
  tubes: Tubes
  key: string
  cost: number
  estimate: number
  parent: Node | null
  move: Pour | null
}

/** A binary heap ordered by cost plus estimate, breaking ties towards nodes further along. */
class Queue {
  private items: Node[] = []
  get size() {
    return this.items.length
  }
  private before(a: Node, b: Node) {
    const fa = a.cost + a.estimate
    const fb = b.cost + b.estimate
    return fa < fb || (fa === fb && a.cost > b.cost)
  }
  push(node: Node) {
    const items = this.items
    items.push(node)
    for (let i = items.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1
      if (!this.before(items[i], items[parent])) break
      ;[items[i], items[parent]] = [items[parent], items[i]]
      i = parent
    }
  }
  pop(): Node {
    const items = this.items
    const top = items[0]
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      for (let i = 0; ; ) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < items.length && this.before(items[left], items[smallest])) smallest = left
        if (right < items.length && this.before(items[right], items[smallest])) smallest = right
        if (smallest === i) break
        ;[items[i], items[smallest]] = [items[smallest], items[i]]
        i = smallest
      }
    }
    return top
  }
}

/**
 * The fewest pours that solve the puzzle, or null if there is no solution (or the search grows
 * past `maxPositions`). An A* search: a pour can merge at most one pair of colour blocks, so the
 * blocks beyond one per colour never overestimate the pours still needed, which keeps the first
 * solution found a shortest one.
 */
export function solve(tubes: Tubes, maxPositions = 400_000): Pour[] | null {
  const colors = new Set(tubes.flat()).size
  const startKey = positionKey(tubes)
  // The fewest pours found so far to each position; older, costlier queue entries are skipped.
  const best = new Map<string, number>([[startKey, 0]])
  const queue = new Queue()
  queue.push({ tubes, key: startKey, cost: 0, estimate: countBlocks(tubes) - colors, parent: null, move: null })
  while (queue.size > 0) {
    const node = queue.pop()
    if (node.cost > best.get(node.key)!) continue
    if (isSolved(node.tubes)) {
      const moves: Pour[] = []
      for (let at: Node | null = node; at?.move; at = at.parent) moves.push(at.move)
      return moves.reverse()
    }
    const cost = node.cost + 1
    for (const move of usefulPours(node.tubes)) {
      const next = pour(node.tubes, move)
      const key = positionKey(next)
      if (cost >= (best.get(key) ?? Infinity)) continue
      if (best.size >= maxPositions) return null
      best.set(key, cost)
      queue.push({ tubes: next, key, cost, estimate: countBlocks(next) - colors, parent: node, move })
    }
  }
  return null
}

/** The fewest pours a new puzzle may take, so none are over in a moment. */
export function minimumDifficulty(colors: number): number {
  return colors + 2
}

/** A random puzzle that can be solved, with no tube finished from the start, and its minimum. */
export function generatePuzzle(colors: number, random: () => number = Math.random): { tubes: number[][]; minimum: number } {
  for (;;) {
    const layers = Array.from({ length: colors * CAPACITY }, (_, i) => Math.floor(i / CAPACITY))
    for (let i = layers.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
    }
    const tubes = Array.from({ length: colors }, (_, i) => layers.slice(i * CAPACITY, (i + 1) * CAPACITY))
    if (tubes.some(isComplete)) continue
    const puzzle = [...tubes, ...Array.from({ length: SPARE_TUBES }, () => [])]
    const solution = solve(puzzle)
    if (solution && solution.length >= minimumDifficulty(colors)) return { tubes: puzzle, minimum: solution.length }
  }
}
