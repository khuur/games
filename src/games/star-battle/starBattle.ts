/**
 * Star Battle rules, a solution counter (every puzzle has exactly one solution) and a solver that
 * reasons like a person, which grades puzzles and explains hints.
 *
 * An n×n grid is split into n regions. Two stars go in every row, every column and every region,
 * and no two stars may touch, not even at a corner.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

/** Stars in every row, column and region. */
export const STARS = 2

/** Techniques from easiest to hardest. */
export type Technique = 'only-spots' | 'unit' | 'confined' | 'lookahead'
export const TECHNIQUES: readonly Technique[] = ['only-spots', 'unit', 'confined', 'lookahead']

export interface LevelDefinition {
  id: LevelId
  name: string
  size: number
  /** The hardest technique a puzzle may need. */
  hardest: Technique
  /** Puzzles must need at least this technique somewhere (so Hard is never easy). */
  needs: Technique | null
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', size: 9, hardest: 'unit', needs: null },
  medium: { id: 'medium', name: 'Medium', size: 10, hardest: 'confined', needs: null },
  hard: { id: 'hard', name: 'Hard', size: 10, hardest: 'lookahead', needs: 'confined' },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export const rowOf = (cell: number, size: number) => Math.floor(cell / size)
export const columnOf = (cell: number, size: number) => cell % size

/** Whether two cells touch, sides or corners. */
export function touching(a: number, b: number, size: number): boolean {
  return a !== b && Math.abs(rowOf(a, size) - rowOf(b, size)) <= 1 && Math.abs(columnOf(a, size) - columnOf(b, size)) <= 1
}

/** The up to eight cells touching a cell. */
export function neighboursOf(cell: number, size: number): number[] {
  const row = rowOf(cell, size)
  const column = columnOf(cell, size)
  const list: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = column + dc
      if ((dr || dc) && r >= 0 && r < size && c >= 0 && c < size) list.push(r * size + c)
    }
  }
  return list
}

/** Every unit that needs two stars: rows, then columns, then regions. */
export function unitsOf(size: number, regions: readonly number[]): number[][] {
  const units: number[][] = Array.from({ length: size * 3 }, () => [])
  for (let cell = 0; cell < size * size; cell++) {
    units[rowOf(cell, size)].push(cell)
    units[size + columnOf(cell, size)].push(cell)
    units[2 * size + regions[cell]].push(cell)
  }
  return units
}

export type UnitKind = 'row' | 'column' | 'region'
export const unitKind = (unit: number, size: number): UnitKind => (unit < size ? 'row' : unit < 2 * size ? 'column' : 'region')

/** The cells stars rule out: those touching a star, and the rest of any unit that has its two. */
export function ruledOutBy(stars: readonly number[], size: number, regions: readonly number[]): Set<number> {
  const out = new Set<number>()
  const starSet = new Set(stars)
  for (const star of stars) for (const next of neighboursOf(star, size)) out.add(next)
  for (const unit of unitsOf(size, regions)) {
    if (unit.filter((cell) => starSet.has(cell)).length >= STARS) for (const cell of unit) out.add(cell)
  }
  for (const star of stars) out.delete(star)
  return out
}

// ———————————————————————————————————————— Counting solutions

/** Every pair of columns two stars could take in one row. */
const pairCache = new Map<number, [number, number][]>()
function rowPairs(size: number) {
  let pairs = pairCache.get(size)
  if (!pairs) {
    pairs = []
    for (let a = 0; a < size; a++) for (let b = a + 2; b < size; b++) pairs.push([a, b])
    pairCache.set(size, pairs)
  }
  return pairs
}

/**
 * Up to `limit` solutions, found row by row; each lists its stars' cells in order. Without
 * regions (all −1), any placement of two stars per row and column counts.
 */
export function findSolutions(size: number, regions: readonly number[], limit = 2, random?: () => number): number[][] {
  const pairs = rowPairs(size)
  const regionCount = size
  const hasRegions = regions[0] >= 0
  // For each region, how many stars rows from each row down can still hold (0, 1 or 2 per row).
  const capacity = Array.from({ length: regionCount }, () => new Array<number>(size + 1).fill(0))
  if (hasRegions) {
    for (let region = 0; region < regionCount; region++) {
      for (let row = size - 1; row >= 0; row--) {
        const columns: number[] = []
        for (let column = 0; column < size; column++) if (regions[row * size + column] === region) columns.push(column)
        const most = columns.length === 0 ? 0 : columns.at(-1)! - columns[0] >= 2 ? 2 : 1
        capacity[region][row] = capacity[region][row + 1] + most
      }
    }
  }
  const columnStars = new Array<number>(size).fill(0)
  const regionStars = new Array<number>(regionCount).fill(0)
  const placed: number[] = []
  const found: number[][] = []

  const visit = (row: number, previous: [number, number] | null): boolean => {
    if (row === size) {
      found.push(placed.slice())
      return found.length >= limit
    }
    const order = random ? shuffleCopy(pairs, random) : pairs
    for (const pair of order) {
      const [a, b] = pair
      if (columnStars[a] >= STARS || columnStars[b] >= STARS) continue
      if (previous && (Math.abs(previous[0] - a) <= 1 || Math.abs(previous[0] - b) <= 1 || Math.abs(previous[1] - a) <= 1 || Math.abs(previous[1] - b) <= 1)) {
        continue
      }
      const ra = hasRegions ? regions[row * size + a] : -1
      const rb = hasRegions ? regions[row * size + b] : -1
      if (hasRegions && (regionStars[ra] + 1 + (ra === rb ? 1 : 0) > STARS || regionStars[rb] + 1 > STARS)) continue
      columnStars[a]++
      columnStars[b]++
      if (hasRegions) {
        regionStars[ra]++
        regionStars[rb]++
      }
      const rowsLeft = size - row - 1
      let fits = columnStars.every((count) => STARS - count <= rowsLeft)
      if (fits && hasRegions) fits = regionStars.every((count, region) => STARS - count <= capacity[region][row + 1])
      if (fits) {
        placed.push(row * size + a, row * size + b)
        if (visit(row + 1, pair)) return true
        placed.length -= 2
      }
      columnStars[a]--
      columnStars[b]--
      if (hasRegions) {
        regionStars[ra]--
        regionStars[rb]--
      }
    }
    return false
  }
  visit(0, null)
  return found
}

export const countSolutions = (size: number, regions: readonly number[], limit = 2) => findSolutions(size, regions, limit).length

function shuffleCopy<T>(items: readonly T[], random: () => number): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

// ———————————————————————————————————————— Solving like a person

/** One step a person could take: placing a star, or ruling cells out, and why. */
export interface Step {
  technique: Technique
  /** A star to place. */
  star?: number
  /** Cells ruled out. */
  eliminate?: number[]
  /** The units the reasoning is about (rows, columns or regions), as unit indexes. */
  units: number[]
  /**
   * For 'unit' steps, what the ways of filling the unit show: a star every way has, cells no way
   * uses, or cells every way touches.
   */
  finding?: 'always' | 'never' | 'touched'
  /** For lookahead: the cell whose star would leave a unit without room for its stars. */
  blocked?: number
}

interface Board {
  size: number
  regions: readonly number[]
  units: number[][]
  /** For each cell, its row, column and region units. */
  unitsAt: number[][]
  stars: boolean[]
  /** Cells that may still hold a star. */
  open: boolean[]
}

function boardOf(size: number, regions: readonly number[], stars: readonly number[], crossed: readonly number[]): Board {
  const units = unitsOf(size, regions)
  const board: Board = {
    size,
    regions,
    units,
    unitsAt: Array.from({ length: size * size }, (_, cell) => [rowOf(cell, size), size + columnOf(cell, size), 2 * size + regions[cell]]),
    stars: new Array<boolean>(size * size).fill(false),
    open: new Array<boolean>(size * size).fill(true),
  }
  for (const cell of crossed) board.open[cell] = false
  for (const cell of stars) placeStar(board, cell)
  return board
}

const copyBoard = (board: Board): Board => ({ ...board, stars: board.stars.slice(), open: board.open.slice() })

function placeStar(board: Board, cell: number) {
  board.stars[cell] = true
  board.open[cell] = false
  for (const next of neighboursOf(cell, board.size)) board.open[next] = false
  for (const unit of board.unitsAt[cell]) {
    if (starsIn(board, unit) >= STARS) for (const other of board.units[unit]) board.open[other] = false
  }
}

const starsIn = (board: Board, unit: number) => board.units[unit].filter((cell) => board.stars[cell]).length
const needOf = (board: Board, unit: number) => STARS - starsIn(board, unit)
const openIn = (board: Board, unit: number) => board.units[unit].filter((cell) => board.open[cell])

/** The ways to give a unit the stars it still needs from its open cells, none touching. */
function completions(board: Board, unit: number): number[][] {
  const need = needOf(board, unit)
  const open = openIn(board, unit)
  if (need <= 0) return [[]]
  if (need === 1) return open.map((cell) => [cell])
  const ways: number[][] = []
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) if (!touching(open[i], open[j], board.size)) ways.push([open[i], open[j]])
  }
  return ways
}

/** Units in the order people tend to look at them: regions first, then rows and columns. */
const unitOrder = (board: Board) => {
  const { size } = board
  return [...board.units.keys()].sort((a, b) => Number(b >= 2 * size) - Number(a >= 2 * size))
}

/** A unit with just as many open cells as stars it still needs. */
function findOnlySpots(board: Board): Step | null {
  for (const unit of unitOrder(board)) {
    const need = needOf(board, unit)
    if (need <= 0) continue
    const open = openIn(board, unit)
    if (open.length === need) return { technique: 'only-spots', star: open[0], units: [unit] }
  }
  return null
}

/**
 * What all the ways of filling one unit agree on: a cell every way stars, open cells no way uses,
 * or cells outside the unit that a star touches every way.
 */
function findUnit(board: Board): Step | null | 'contradiction' {
  const { size } = board
  for (const unit of unitOrder(board)) {
    if (needOf(board, unit) <= 0) continue
    const ways = completions(board, unit)
    if (!ways.length) return 'contradiction'
    const always = ways[0].filter((cell) => ways.every((way) => way.includes(cell)))
    if (always.length) return { technique: 'unit', star: always[0], units: [unit], finding: 'always' }
    const used = new Set(ways.flat())
    const never = openIn(board, unit).filter((cell) => !used.has(cell))
    if (never.length) return { technique: 'unit', eliminate: never, units: [unit], finding: 'never' }
    const inside = new Set(board.units[unit])
    const touched = [...new Set(ways[0].flatMap((cell) => neighboursOf(cell, size)))].filter(
      (cell) => board.open[cell] && !inside.has(cell) && ways.every((way) => way.some((star) => touching(star, cell, size))),
    )
    if (touched.length) return { technique: 'unit', eliminate: touched, units: [unit], finding: 'touched' }
  }
  return null
}

function* combinations<T>(items: readonly T[], count: number, from = 0, chosen: T[] = []): Generator<T[]> {
  if (chosen.length === count) {
    yield chosen.slice()
    return
  }
  for (let i = from; i <= items.length - (count - chosen.length); i++) {
    chosen.push(items[i])
    yield* combinations(items, count, i + 1, chosen)
    chosen.pop()
  }
}

/**
 * Units confined to other units: when `count` units (say regions) have all their open cells in
 * `count` units of another kind (say rows) that need no more stars than they do, those rows' stars
 * all come from those regions, and nothing else in the rows can hold one.
 */
function findConfinement(board: Board, count: number): Step | null {
  const { size } = board
  const families = [0, size, 2 * size]
  for (const inner of families) {
    const candidates = Array.from({ length: size }, (_, i) => inner + i).filter((unit) => needOf(board, unit) > 0)
    for (const outer of families) {
      if (outer === inner) continue
      for (const group of combinations(candidates, count)) {
        const cells = group.flatMap((unit) => openIn(board, unit))
        const outerUnits = [...new Set(cells.map((cell) => board.unitsAt[cell][outer / size]))]
        if (outerUnits.length !== count) continue
        const innerNeed = group.reduce((sum, unit) => sum + needOf(board, unit), 0)
        const outerNeed = outerUnits.reduce((sum, unit) => sum + needOf(board, unit), 0)
        if (innerNeed < outerNeed) continue
        const inside = new Set(cells)
        const eliminate = outerUnits.flatMap((unit) => openIn(board, unit)).filter((cell) => !inside.has(cell))
        if (eliminate.length) return { technique: 'confined', eliminate, units: [...group, ...outerUnits] }
      }
    }
  }
  return null
}

/** A cell whose star would leave some row, column or region without room for its stars. */
function findLookahead(board: Board): Step | null {
  const { size, units } = board
  for (let cell = 0; cell < size * size; cell++) {
    if (!board.open[cell]) continue
    const trial = copyBoard(board)
    placeStar(trial, cell)
    for (let unit = 0; unit < units.length; unit++) {
      if (needOf(trial, unit) < 0 || completions(trial, unit).length === 0) {
        return { technique: 'lookahead', eliminate: [cell], units: [unit], blocked: cell }
      }
    }
  }
  return null
}

/** The simplest next step, from easiest technique to hardest, up to `hardest`. */
function nextStep(board: Board, hardest: Technique): Step | null | 'contradiction' {
  const allowed = (technique: Technique) => TECHNIQUES.indexOf(technique) <= TECHNIQUES.indexOf(hardest)
  const only = findOnlySpots(board)
  if (only) return only
  if (allowed('unit')) {
    const step = findUnit(board)
    if (step) return step
  }
  if (allowed('confined')) {
    const step = findConfinement(board, 1) ?? findConfinement(board, 2) ?? findConfinement(board, 3)
    if (step) return step
  }
  return allowed('lookahead') ? findLookahead(board) : null
}

function applyStep(board: Board, step: Step) {
  if (step.star !== undefined) placeStar(board, step.star)
  for (const cell of step.eliminate ?? []) board.open[cell] = false
}

const stuck = (board: Board) => board.units.some((_, unit) => needOf(board, unit) > 0 && openIn(board, unit).length === 0)
const starCount = (board: Board) => board.stars.filter(Boolean).length

/**
 * Solves with techniques up to `hardest`. Says whether it got all the way, and the hardest
 * technique it needed.
 */
export function solveLogically(size: number, regions: readonly number[], hardest: Technique = 'lookahead') {
  const board = boardOf(size, regions, [], [])
  let needed: Technique = 'only-spots'
  for (;;) {
    if (starCount(board) === STARS * size) return { solved: board.units.every((_, unit) => needOf(board, unit) === 0), needed }
    if (stuck(board)) return { solved: false, needed }
    const step = nextStep(board, hardest)
    if (!step || step === 'contradiction') return { solved: false, needed }
    if (TECHNIQUES.indexOf(step.technique) > TECHNIQUES.indexOf(needed)) needed = step.technique
    applyStep(board, step)
  }
}

/**
 * The next step from a position: stars already placed and cells crossed out (both assumed
 * right). Null if logic can't find one.
 */
export function nextLogicalStep(size: number, regions: readonly number[], stars: readonly number[], crossed: readonly number[]): Step | null {
  const step = nextStep(boardOf(size, regions, stars, crossed), 'lookahead')
  return step === 'contradiction' ? null : step
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  /** The region of each cell, 0 to size − 1. */
  regions: number[]
  /** The stars' cells, two per row, in order. */
  solution: number[]
}

/** The cells sharing a side with a cell. */
function sideNeighbours(cell: number, size: number): number[] {
  const row = rowOf(cell, size)
  const column = columnOf(cell, size)
  const list: number[] = []
  if (row > 0) list.push(cell - size)
  if (row < size - 1) list.push(cell + size)
  if (column > 0) list.push(cell - 1)
  if (column < size - 1) list.push(cell + 1)
  return list
}

/** A shortest path of free cells between two cells (both ends included), or null. */
function pathBetween(size: number, from: number, to: number, free: (cell: number) => boolean, random: () => number): number[] | null {
  const previous = new Map<number, number>([[from, -1]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]
    if (cell === to) break
    for (const next of shuffleCopy(sideNeighbours(cell, size), random)) {
      if (previous.has(next) || (next !== to && !free(next))) continue
      previous.set(next, cell)
      queue.push(next)
    }
  }
  if (!previous.has(to)) return null
  const path: number[] = []
  for (let cell = to; cell !== -1; cell = previous.get(cell)!) path.push(cell)
  return path
}

/**
 * Regions with two of the stars each: the stars are paired up with near neighbours, each pair is
 * joined by a path, and the regions then grow a cell at a time until the grid is covered.
 */
function growRegions(size: number, stars: readonly number[], random: () => number): number[] | null {
  const regions = new Array<number>(size * size).fill(-1)
  const distance = (a: number, b: number) => Math.abs(rowOf(a, size) - rowOf(b, size)) + Math.abs(columnOf(a, size) - columnOf(b, size))
  // Pair each star with the nearest one still unpaired, starting from random stars.
  const unpaired = new Set(stars)
  const pairs: [number, number][] = []
  for (const star of shuffleCopy(stars, random)) {
    if (!unpaired.has(star)) continue
    unpaired.delete(star)
    let best = -1
    for (const other of unpaired) if (best < 0 || distance(star, other) < distance(star, best)) best = other
    unpaired.delete(best)
    pairs.push([star, best])
  }
  pairs.sort((a, b) => distance(...a) - distance(...b))
  const starSet = new Set(stars)
  for (const [region, [a, b]] of pairs.entries()) {
    const path = pathBetween(size, a, b, (cell) => regions[cell] === -1 && !starSet.has(cell), random)
    if (!path) return null
    for (const cell of path) regions[cell] = region
  }
  let left = regions.filter((region) => region === -1).length
  while (left > 0) {
    const edge: number[] = []
    for (let cell = 0; cell < size * size; cell++) {
      if (regions[cell] === -1 && sideNeighbours(cell, size).some((next) => regions[next] !== -1)) edge.push(cell)
    }
    const cell = edge[Math.floor(random() * edge.length)]
    const touchingRegions = sideNeighbours(cell, size).filter((next) => regions[next] !== -1)
    regions[cell] = regions[touchingRegions[Math.floor(random() * touchingRegions.length)]]
    left--
  }
  return regions
}

/** Whether a region stays in one piece without `without`. */
function staysConnected(size: number, regions: readonly number[], region: number, without: number): boolean {
  const cells = regions.flatMap((r, cell) => (r === region && cell !== without ? [cell] : []))
  if (!cells.length) return false
  const reached = new Set([cells[0]])
  const queue = [cells[0]]
  while (queue.length) {
    for (const next of sideNeighbours(queue.pop()!, size)) {
      if (regions[next] === region && next !== without && !reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  return reached.size === cells.length
}

/** Whether every region is in one piece. */
export function regionsConnected(size: number, regions: readonly number[]): boolean {
  for (let region = 0; region < size; region++) if (!staysConnected(size, regions, region, -1)) return false
  return true
}

/**
 * Reshapes the regions until the planted stars are the only solution. Each other solution is
 * broken by handing one of its stars' cells to a neighbouring region, which then holds too many
 * of its stars. Null if it gets stuck.
 */
function makeUnique(size: number, regions: number[], solution: readonly number[], random: () => number): number[] | null {
  const planted = new Set(solution)
  for (let round = 0; round < 80; round++) {
    const other = findSolutions(size, regions, 2).find((found) => found.some((cell) => !planted.has(cell)))
    if (!other) return regions
    let moved = false
    for (const cell of shuffleCopy(other.filter((cell) => !planted.has(cell)), random)) {
      const from = regions[cell]
      const targets = [...new Set(sideNeighbours(cell, size).map((next) => regions[next]))].filter((region) => region !== from)
      if (!targets.length || !staysConnected(size, regions, from, cell)) continue
      regions[cell] = targets[Math.floor(random() * targets.length)]
      moved = true
      break
    }
    if (!moved) return null
  }
  return null
}

/**
 * A new puzzle with exactly one solution that the level's techniques can reach, and (on Hard)
 * that needs at least one of the harder ones.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { size } = level
  const free = new Array<number>(size * size).fill(-1)
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 300; attempt++) {
    const [solution] = findSolutions(size, free, 1, random)
    const grown = growRegions(size, solution, random)
    if (!grown) continue
    const regions = makeUnique(size, grown, solution, random)
    if (!regions) continue
    const { solved, needed } = solveLogically(size, regions, level.hardest)
    if (!solved) continue
    fallback ??= { regions, solution }
    if (level.needs && TECHNIQUES.indexOf(needed) < TECHNIQUES.indexOf(level.needs)) continue
    return { regions, solution }
  }
  return fallback!
}

// ———————————————————————————————————————— Marks and hints

/** What a player has put in a cell. */
export const BLANK = 0
export const CROSS = 1
export const STAR = 2
export type Mark = typeof BLANK | typeof CROSS | typeof STAR

export type Hint =
  /** Crosses on cells where stars belong. */
  | { kind: 'wrong-cross'; cells: number[] }
  /** The next thing logic finds: a star to place, or cells to cross out. */
  | { kind: 'step'; step: Step }

/**
 * What to do next: take back crosses on stars' cells if there are any, otherwise the next logical
 * step. Stars on the board are always right (wrong ones turn into red crosses), so the reasoning
 * can build on them.
 */
export function findHint(size: number, regions: readonly number[], solution: readonly number[], marks: readonly Mark[]): Hint | null {
  const starCells = new Set(solution)
  const wrongCrosses = marks.flatMap((mark, cell) => (mark === CROSS && starCells.has(cell) ? [cell] : []))
  if (wrongCrosses.length) return { kind: 'wrong-cross', cells: wrongCrosses }
  const stars = marks.flatMap((mark, cell) => (mark === STAR ? [cell] : []))
  const crossed = marks.flatMap((mark, cell) => (mark === CROSS ? [cell] : []))
  const step = nextLogicalStep(size, regions, stars, crossed)
  if (step) return { kind: 'step', step }
  // Logic never runs dry on generated puzzles; if it somehow does, the solution names a star.
  const missing = solution.find((cell) => marks[cell] !== STAR)
  return missing === undefined ? null : { kind: 'step', step: { technique: 'only-spots', star: missing, units: [] } }
}
