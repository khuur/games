/**
 * Bridges (Hashiwokakero) rules, a solution counter (every puzzle has exactly one solution) and
 * a solver that reasons like a person, which grades puzzles and explains hints.
 *
 * Islands sit on a grid, each with a number. Bridges run straight across or down between islands,
 * one or two per pair, never crossing another bridge. Each island needs exactly its number of
 * bridges, and every island must end up connected.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

/** Techniques from easiest to hardest. */
export type Technique = 'basics' | 'isolation' | 'lookahead'
export const TECHNIQUES: readonly Technique[] = ['basics', 'isolation', 'lookahead']

export interface LevelDefinition {
  id: LevelId
  name: string
  columns: number
  rows: number
  islands: number
  /** The hardest technique a puzzle may need. */
  hardest: Technique
  /** A technique every puzzle must need somewhere, so harder levels are never easy. */
  needs: Technique | null
}

/** Boards are taller than wide, which suits phones; wide screens show them turned on their side. */
export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', columns: 7, rows: 7, islands: 10, hardest: 'basics', needs: null },
  medium: { id: 'medium', name: 'Medium', columns: 8, rows: 10, islands: 17, hardest: 'isolation', needs: 'isolation' },
  hard: { id: 'hard', name: 'Hard', columns: 9, rows: 12, islands: 25, hardest: 'lookahead', needs: 'lookahead' },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export interface Island {
  /** Grid position, row × columns + column. */
  cell: number
  /** Bridges it needs. */
  count: number
}

/** A pair of islands that can see each other across or down, so bridges could join them. */
export interface Link {
  a: number
  b: number
  horizontal: boolean
  /** The grid cells between the two islands. */
  between: number[]
}

/** Everything about a board that doesn't change while it is played. */
export interface Layout {
  columns: number
  rows: number
  islands: Island[]
  links: Link[]
  /** Links of each island. */
  linksOf: number[][]
  /** Links each link would cross. */
  crossings: number[][]
}

export function layoutOf(columns: number, rows: number, islands: Island[]): Layout {
  const at = new Map(islands.map((island, index) => [island.cell, index]))
  const links: Link[] = []
  islands.forEach(({ cell }, a) => {
    const row = Math.floor(cell / columns)
    const column = cell % columns
    // Look right and down; the island first met is the one this island can reach that way.
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      const between: number[] = []
      for (let r = row + dr, c = column + dc; r < rows && c < columns; r += dr, c += dc) {
        const other = at.get(r * columns + c)
        if (other !== undefined) {
          links.push({ a, b: other, horizontal: dr === 0, between })
          break
        }
        between.push(r * columns + c)
      }
    }
  })
  const linksOf: number[][] = islands.map(() => [])
  links.forEach(({ a, b }, index) => {
    linksOf[a].push(index)
    linksOf[b].push(index)
  })
  const crossings: number[][] = links.map(() => [])
  links.forEach((link, i) => {
    if (!link.horizontal) return
    const cells = new Set(link.between)
    links.forEach((other, j) => {
      if (other.horizontal) return
      if (other.between.some((cell) => cells.has(cell))) {
        crossings[i].push(j)
        crossings[j].push(i)
      }
    })
  })
  return { columns, rows, islands, links, linksOf, crossings }
}

/** The most bridges a link can carry: two, or fewer if either island needs fewer. */
const capacity = (layout: Layout, link: number) =>
  Math.min(2, layout.islands[layout.links[link].a].count, layout.islands[layout.links[link].b].count)

/** Whether bridges with these counts join every island into one group. */
export function isConnected(layout: Layout, counts: ArrayLike<number>): boolean {
  if (!layout.islands.length) return true
  const reached = new Set([0])
  const queue = [0]
  while (queue.length) {
    const island = queue.pop()!
    for (const link of layout.linksOf[island]) {
      if (!counts[link]) continue
      const { a, b } = layout.links[link]
      const other = a === island ? b : a
      if (!reached.has(other)) {
        reached.add(other)
        queue.push(other)
      }
    }
  }
  return reached.size === layout.islands.length
}

/** Bridges at each island with these counts. */
export const bridgesAt = (layout: Layout, counts: ArrayLike<number>, island: number) =>
  layout.linksOf[island].reduce((sum, link) => sum + counts[link], 0)

/** Whether counts solve the puzzle: every island exactly full, nothing crossing, all connected. */
export function isSolution(layout: Layout, counts: ArrayLike<number>): boolean {
  if (layout.islands.some((island, index) => bridgesAt(layout, counts, index) !== island.count)) return false
  if (layout.crossings.some((crossed, link) => counts[link] && crossed.some((other) => counts[other]))) return false
  return isConnected(layout, counts)
}

// ———————————————————————————————————————— Reasoning on bounds

/**
 * What is known about each link: it carries at least `low` and at most `high` bridges.
 * Every technique narrows these bounds.
 */
interface Bounds {
  low: Int8Array
  high: Int8Array
}

function initialBounds(layout: Layout, counts?: ArrayLike<number>): Bounds {
  const high = Int8Array.from(layout.links, (_, link) => capacity(layout, link))
  const low = Int8Array.from(layout.links, (_, link) => counts?.[link] ?? 0)
  return { low, high }
}

const copyBounds = ({ low, high }: Bounds): Bounds => ({ low: low.slice(), high: high.slice() })

/**
 * Whether bounds can still lead to a solution, judged on connections: the links that could carry
 * bridges must reach every island, and no finished group may be cut off from the rest.
 */
function canConnect(layout: Layout, { low, high }: Bounds): boolean {
  if (!isConnected(layout, high)) return false
  const { islands, linksOf, links } = layout
  const seen = new Uint8Array(islands.length)
  for (let start = 0; start < islands.length; start++) {
    if (seen[start]) continue
    // A group joined by certain bridges is closed if every island in it is already full.
    const group = [start]
    seen[start] = 1
    let closed = true
    for (let i = 0; i < group.length; i++) {
      const island = group[i]
      if (bridgesAt(layout, low, island) < islands[island].count) closed = false
      for (const link of linksOf[island]) {
        if (!low[link]) continue
        const other = links[link].a === island ? links[link].b : links[link].a
        if (!seen[other]) {
          seen[other] = 1
          group.push(other)
        }
      }
    }
    if (closed && group.length < islands.length) return false
  }
  return true
}

/**
 * The quick rules, applied until nothing changes: each island's bridges must add up to its
 * number, and a certain bridge rules out every link it crosses. False if the bounds break.
 */
function propagate(layout: Layout, bounds: Bounds): boolean {
  const { islands, linksOf, crossings } = layout
  const { low, high } = bounds
  for (let changed = true; changed; ) {
    changed = false
    for (let island = 0; island < islands.length; island++) {
      const need = islands[island].count
      let least = 0
      let most = 0
      for (const link of linksOf[island]) {
        least += low[link]
        most += high[link]
      }
      if (least > need || most < need) return false
      for (const link of linksOf[island]) {
        const newLow = Math.max(low[link], need - (most - high[link]))
        const newHigh = Math.min(high[link], need - (least - low[link]))
        if (newLow > newHigh) return false
        if (newLow !== low[link] || newHigh !== high[link]) {
          least += newLow - low[link]
          most += newHigh - high[link]
          low[link] = newLow
          high[link] = newHigh
          changed = true
        }
      }
    }
    for (let link = 0; link < low.length; link++) {
      if (!low[link]) continue
      for (const other of crossings[link]) {
        if (low[other]) return false
        if (high[other]) {
          high[other] = 0
          changed = true
        }
      }
    }
  }
  return canConnect(layout, bounds)
}

/** Up to `limit` solutions, as bridge counts per link. */
export function findSolutions(layout: Layout, limit = 2): Int8Array[] {
  const found: Int8Array[] = []
  const visit = (bounds: Bounds): boolean => {
    if (!propagate(layout, bounds)) return false
    let pick = -1
    for (let link = 0; link < bounds.low.length; link++) {
      if (bounds.low[link] < bounds.high[link]) {
        pick = link
        break
      }
    }
    if (pick === -1) {
      if (!isConnected(layout, bounds.low)) return false
      found.push(bounds.low.slice())
      return found.length >= limit
    }
    for (let value = bounds.high[pick]; value >= bounds.low[pick]; value--) {
      const next = copyBounds(bounds)
      next.low[pick] = next.high[pick] = value
      if (visit(next)) return true
    }
    return false
  }
  visit(initialBounds(layout))
  return found
}

// ———————————————————————————————————————— Solving like a person

export type Reason = 'needs-all' | 'at-least' | 'at-most' | 'full' | 'crossing' | 'isolation' | 'lookahead'

/** One deduction: a link's bounds narrowed, and why. */
export interface Step {
  reason: Reason
  technique: Technique
  link: number
  /** The island the reasoning is about, if any. */
  island?: number
  low: number
  high: number
}

/** Whether giving `link` at least `value` bridges would close a full group off from the rest. */
function closesOff(layout: Layout, bounds: Bounds, link: number, value: number): boolean {
  const low = bounds.low.slice()
  low[link] = Math.max(low[link], value)
  const { islands, links, linksOf } = layout
  const group = new Set([links[link].a])
  const queue = [links[link].a]
  while (queue.length) {
    const island = queue.pop()!
    if (bridgesAt(layout, low, island) < islands[island].count) return false
    for (const next of linksOf[island]) {
      if (!low[next]) continue
      const other = links[next].a === island ? links[next].b : links[next].a
      if (!group.has(other)) {
        group.add(other)
        queue.push(other)
      }
    }
  }
  return group.size < islands.length
}

function findStep(layout: Layout, bounds: Bounds, hardest: Technique): Step | null {
  const { islands, linksOf, crossings } = layout
  const { low, high } = bounds
  // Basics: what each island's number allows, and what crossings rule out.
  for (let island = 0; island < islands.length; island++) {
    const need = islands[island].count
    let least = 0
    let most = 0
    for (const link of linksOf[island]) {
      least += low[link]
      most += high[link]
    }
    for (const link of linksOf[island]) {
      const newLow = Math.max(low[link], need - (most - high[link]))
      if (newLow > low[link]) {
        return { reason: most === need ? 'needs-all' : 'at-least', technique: 'basics', link, island, low: newLow, high: high[link] }
      }
      const newHigh = Math.min(high[link], need - (least - low[link]))
      if (newHigh < high[link]) {
        return { reason: least === need ? 'full' : 'at-most', technique: 'basics', link, island, low: low[link], high: newHigh }
      }
    }
  }
  for (let link = 0; link < low.length; link++) {
    if (!low[link]) continue
    for (const other of crossings[link]) {
      if (high[other]) return { reason: 'crossing', technique: 'basics', link: other, low: 0, high: 0 }
    }
  }
  if (hardest === 'basics') return null

  // Isolation: bridges that would leave a finished group cut off.
  for (let link = 0; link < low.length; link++) {
    if (low[link] < high[link] && closesOff(layout, bounds, link, high[link])) {
      return { reason: 'isolation', technique: 'isolation', link, island: layout.links[link].a, low: low[link], high: high[link] - 1 }
    }
  }
  if (hardest === 'isolation') return null

  // Lookahead: a choice whose consequences break down can be ruled out.
  for (let link = 0; link < low.length; link++) {
    if (low[link] === high[link]) continue
    for (const value of [low[link], high[link]]) {
      const trial = copyBounds(bounds)
      trial.low[link] = trial.high[link] = value
      if (propagate(layout, trial)) continue
      return value === low[link]
        ? { reason: 'lookahead', technique: 'lookahead', link, low: low[link] + 1, high: high[link] }
        : { reason: 'lookahead', technique: 'lookahead', link, low: low[link], high: high[link] - 1 }
    }
  }
  return null
}

const applyStep = (bounds: Bounds, step: Step) => {
  bounds.low[step.link] = step.low
  bounds.high[step.link] = step.high
}

/** Solves with techniques up to `hardest`; says whether it got there and what it needed. */
export function solveLogically(layout: Layout, hardest: Technique = 'lookahead') {
  const bounds = initialBounds(layout)
  let needed: Technique = 'basics'
  for (;;) {
    if (bounds.low.every((value, link) => value === bounds.high[link])) {
      return { solved: isSolution(layout, bounds.low), needed }
    }
    const step = findStep(layout, bounds, hardest)
    if (!step) return { solved: false, needed }
    if (TECHNIQUES.indexOf(step.technique) > TECHNIQUES.indexOf(needed)) needed = step.technique
    applyStep(bounds, step)
  }
}

/**
 * The next bridge logic can add to a position (whose bridges are all right), with the reasoning
 * that shows it and any techniques needed first. Null if logic finds nothing.
 */
export function nextBridge(layout: Layout, counts: ArrayLike<number>): { step: Step; before: Technique[] } | null {
  const bounds = initialBounds(layout, counts)
  const before = new Set<Technique>()
  for (let guard = 0; guard < 500; guard++) {
    const step = findStep(layout, bounds, 'lookahead')
    if (!step) return null
    if (step.low > counts[step.link]) return { step, before: [...before].filter((technique) => technique !== step.technique) }
    before.add(step.technique)
    applyStep(bounds, step)
  }
  return null
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  islands: Island[]
  /** Bridges on each link of the layout, in the solution. */
  solution: number[]
}

/**
 * Grows a network of islands from one, each new island reached by a bridge from an existing one,
 * with an occasional extra bridge between islands that can see each other.
 */
function growNetwork(level: LevelDefinition, random: () => number): Island[] | null {
  const { columns, rows } = level
  const kind = new Array<'island' | 'across' | 'down' | null>(columns * rows).fill(null)
  const counts = new Map<number, number>()
  const bridges: [number, number, number][] = []
  const place = (cell: number) => {
    kind[cell] = 'island'
    counts.set(cell, 0)
  }
  const isFree = (cell: number) => {
    if (kind[cell]) return false
    // Islands never sit right next to each other.
    const row = Math.floor(cell / columns)
    const column = cell % columns
    return ![
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1],
    ].some(([r, c]) => r >= 0 && r < rows && c >= 0 && c < columns && kind[r * columns + c] === 'island')
  }
  const join = (from: number, to: number, count: number, path: number[], horizontal: boolean) => {
    for (const cell of path) kind[cell] = horizontal ? 'across' : 'down'
    bridges.push([from, to, count])
    counts.set(from, counts.get(from)! + count)
    counts.set(to, counts.get(to)! + count)
  }
  const directions = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]
  place(Math.floor(random() * rows) * columns + Math.floor(random() * columns))
  let stalls = 0
  while (counts.size < level.islands) {
    if (stalls++ > 400) return null
    const islands = [...counts.keys()]
    const from = islands[Math.floor(random() * islands.length)]
    const [dr, dc] = directions[Math.floor(random() * 4)]
    const row = Math.floor(from / columns)
    const column = from % columns
    // Walk out from the island, collecting the spots a new island could take.
    const path: number[] = []
    const spots: { cell: number; path: number[] }[] = []
    for (let r = row + dr, c = column + dc; r >= 0 && r < rows && c >= 0 && c < columns; r += dr, c += dc) {
      const cell = r * columns + c
      if (kind[cell]) {
        // An existing island straight ahead with a clear path: sometimes add a bridge to it.
        if (kind[cell] === 'island' && path.length && random() < 0.12) {
          join(from, cell, random() < 0.5 ? 1 : 2, path.slice(), dr === 0)
        }
        break
      }
      if (path.length && isFree(cell)) spots.push({ cell, path: path.slice() })
      path.push(cell)
    }
    if (!spots.length) continue
    const { cell, path: route } = spots[Math.floor(random() * spots.length)]
    place(cell)
    join(from, cell, random() < 0.55 ? 1 : 2, route, dr === 0)
    stalls = 0
  }
  return [...counts].map(([cell, count]) => ({ cell, count }))
}

/**
 * A new puzzle with exactly one solution that the level's techniques can reach, and that needs
 * the level's signature technique somewhere.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 3000; attempt++) {
    const islands = growNetwork(level, random)
    if (!islands) continue
    islands.sort((a, b) => a.cell - b.cell)
    const layout = layoutOf(level.columns, level.rows, islands)
    const solutions = findSolutions(layout, 2)
    if (solutions.length !== 1) continue
    const { solved, needed } = solveLogically(layout, level.hardest)
    if (!solved) continue
    const puzzle = { islands, solution: Array.from(solutions[0]) }
    fallback ??= puzzle
    if (!level.needs || TECHNIQUES.indexOf(needed) >= TECHNIQUES.indexOf(level.needs)) return puzzle
  }
  return fallback!
}

// ———————————————————————————————————————— Hints

export type Hint =
  /** A link carrying more bridges than the solution has. */
  | { kind: 'wrong'; link: number }
  /** A bridge logic proves, with its reasoning. */
  | { kind: 'bridge'; link: number; count: number; reason: Reason; island?: number; before: Technique[] }

/**
 * What to do next: take away a bridge that shouldn't be there, otherwise the next bridge logic
 * proves. When logic runs dry (which generated puzzles never allow), the solution supplies one.
 */
export function findHint(layout: Layout, solution: readonly number[], counts: readonly number[]): Hint | null {
  const wrong = counts.findIndex((count, link) => count > solution[link])
  if (wrong >= 0) return { kind: 'wrong', link: wrong }
  const next = nextBridge(layout, counts)
  if (next) {
    const { step, before } = next
    return { kind: 'bridge', link: step.link, count: step.low, reason: step.reason, island: step.island, before }
  }
  const missing = counts.findIndex((count, link) => count < solution[link])
  return missing < 0 ? null : { kind: 'bridge', link: missing, count: solution[missing], reason: 'lookahead', before: [] }
}

const layoutCache = new WeakMap<readonly Island[], Layout>()

/** The layout of a set of islands, worked out once per puzzle. */
export function layoutFor(level: LevelDefinition, islands: Island[]): Layout {
  let layout = layoutCache.get(islands)
  if (!layout) {
    layout = layoutOf(level.columns, level.rows, islands)
    layoutCache.set(islands, layout)
  }
  return layout
}
