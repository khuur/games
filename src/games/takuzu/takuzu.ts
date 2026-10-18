/**
 * Takuzu rules (with the = and × signs of the Tango variant), a solution counter, and a solver
 * that reasons like a person, which grades puzzles and explains hints.
 *
 * Every cell holds a sun or a moon. No row or column may have three of the same in a row, every
 * row and column holds as many suns as moons, and cells joined by = match while × means opposite.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

/** Techniques from easiest to hardest. */
export type Technique = 'basics' | 'line' | 'lookahead'
export const TECHNIQUES: readonly Technique[] = ['basics', 'line', 'lookahead']

export interface LevelDefinition {
  id: LevelId
  name: string
  size: number
  /** The hardest technique a puzzle may need. */
  hardest: Technique
  /** A technique every puzzle must need somewhere, so harder levels are never easy. */
  needs: Technique | null
  /** Share of neighbouring pairs offered as signs before clues are thinned out. */
  signs: number
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', size: 6, hardest: 'basics', needs: null, signs: 0.4 },
  medium: { id: 'medium', name: 'Medium', size: 8, hardest: 'line', needs: 'line', signs: 0.3 },
  hard: { id: 'hard', name: 'Hard', size: 10, hardest: 'line', needs: 'line', signs: 0.25 },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export const EMPTY = 0
export const SUN = 1
export const MOON = 2
export type Cell = typeof EMPTY | typeof SUN | typeof MOON
export const opposite = (value: Cell): Cell => (value === SUN ? MOON : value === MOON ? SUN : EMPTY)

/** Two neighbouring cells (a < b) that must match (=) or differ (×). */
export interface Sign {
  a: number
  b: number
  same: boolean
}

/** The cells of each line: rows 0 to size − 1, then columns. */
export function linesOf(size: number): number[][] {
  return Array.from({ length: size * 2 }, (_, line) =>
    line < size
      ? Array.from({ length: size }, (_, column) => line * size + column)
      : Array.from({ length: size }, (_, row) => row * size + (line - size)),
  )
}

const lineCache = new Map<number, number[][]>()
const lines = (size: number) => {
  let cached = lineCache.get(size)
  if (!cached) {
    cached = linesOf(size)
    lineCache.set(size, cached)
  }
  return cached
}

/** Every full line allowed on its own (balanced, no three in a row), as bit masks of its suns. */
const patternCache = new Map<number, number[]>()
function patterns(size: number): number[] {
  const cached = patternCache.get(size)
  if (cached) return cached
  const found: number[] = []
  const build = (at: number, mask: number, suns: number, moons: number) => {
    if (at === size) {
      found.push(mask)
      return
    }
    for (const sun of [true, false]) {
      if (sun ? suns === size / 2 : moons === size / 2) continue
      // No three in a row: the two before this one can't both be the same kind as it.
      if (at >= 2) {
        const before = (mask >> (at - 1)) & 1
        const twoBefore = (mask >> (at - 2)) & 1
        if (before === twoBefore && before === (sun ? 1 : 0)) continue
      }
      build(at + 1, sun ? mask | (1 << at) : mask, suns + (sun ? 1 : 0), moons + (sun ? 0 : 1))
    }
  }
  build(0, 0, 0, 0)
  patternCache.set(size, found)
  return found
}

const patternCells = (mask: number, size: number): Cell[] =>
  Array.from({ length: size }, (_, i) => ((mask >> i) & 1 ? SUN : MOON))

/** Signs whose two cells both lie in the line, as positions within it. */
function signsInLine(line: number[], signs: readonly Sign[]): { i: number; j: number; same: boolean }[] {
  const position = new Map(line.map((cell, index) => [cell, index]))
  return signs.flatMap(({ a, b, same }) => {
    const i = position.get(a)
    const j = position.get(b)
    return i === undefined || j === undefined ? [] : [{ i, j, same }]
  })
}

/** Whether a grid breaks a rule: three in a row, a line with too many of one kind, or a broken sign. */
export function breaksRules(size: number, cells: readonly Cell[], signs: readonly Sign[]): boolean {
  return problemCells(size, cells, signs).length > 0
}

/** The cells involved in broken rules, for the board to mark. */
export function problemCells(size: number, cells: readonly Cell[], signs: readonly Sign[]): number[] {
  const bad = new Set<number>()
  for (const line of lines(size)) {
    for (let i = 0; i + 2 < size; i++) {
      const v = cells[line[i]]
      if (v && cells[line[i + 1]] === v && cells[line[i + 2]] === v) [line[i], line[i + 1], line[i + 2]].forEach((c) => bad.add(c))
    }
    for (const value of [SUN, MOON]) {
      const same = line.filter((cell) => cells[cell] === value)
      if (same.length > size / 2) same.forEach((cell) => bad.add(cell))
    }
  }
  for (const { a, b, same } of signs) {
    if (cells[a] && cells[b] && (cells[a] === cells[b]) !== same) {
      bad.add(a)
      bad.add(b)
    }
  }
  return [...bad]
}

// ———————————————————————————————————————— Reasoning

export type Reason = 'pair' | 'sandwich' | 'sign' | 'count' | 'line' | 'lookahead'

/** One deduction: cells and the symbols they must hold, and why. */
export interface Step {
  reason: Reason
  technique: Technique
  cells: number[]
  values: Cell[]
  /** Cells that show it: the pair, the sandwich ends, the signed cell, or the line. */
  clues: number[]
  /** The line the reasoning is about, if any. */
  line?: number
}

/** The simplest basic deduction: pairs, sandwiches, signs, then counting. */
function findBasic(size: number, cells: readonly Cell[], signs: readonly Sign[]): Step | null {
  const all = lines(size)
  for (const [index, line] of all.entries()) {
    for (let i = 0; i + 1 < size; i++) {
      const v = cells[line[i]]
      if (!v || cells[line[i + 1]] !== v) continue
      for (const end of [i - 1, i + 2]) {
        if (end >= 0 && end < size && !cells[line[end]]) {
          return { reason: 'pair', technique: 'basics', cells: [line[end]], values: [opposite(v)], clues: [line[i], line[i + 1]], line: index }
        }
      }
    }
  }
  for (const [index, line] of all.entries()) {
    for (let i = 0; i + 2 < size; i++) {
      const v = cells[line[i]]
      if (v && cells[line[i + 2]] === v && !cells[line[i + 1]]) {
        return { reason: 'sandwich', technique: 'basics', cells: [line[i + 1]], values: [opposite(v)], clues: [line[i], line[i + 2]], line: index }
      }
    }
  }
  for (const { a, b, same } of signs) {
    const [known, other] = cells[a] && !cells[b] ? [a, b] : cells[b] && !cells[a] ? [b, a] : [-1, -1]
    if (known < 0) continue
    return { reason: 'sign', technique: 'basics', cells: [other], values: [same ? cells[known] : opposite(cells[known])], clues: [known] }
  }
  for (const [index, line] of all.entries()) {
    const empty = line.filter((cell) => !cells[cell])
    if (!empty.length) continue
    for (const value of [SUN, MOON] as Cell[]) {
      if (line.filter((cell) => cells[cell] === value).length === size / 2) {
        return { reason: 'count', technique: 'basics', cells: empty, values: empty.map(() => opposite(value)), clues: line, line: index }
      }
    }
  }
  return null
}

/** Cells of a line that every allowed way of filling it agrees on; null if no way fits. */
function solveLine(size: number, line: number[], cells: readonly Cell[], signs: readonly Sign[]): Map<number, Cell> | null {
  const inLine = signsInLine(line, signs)
  let suns = 0
  let moons = 0
  line.forEach((cell, i) => {
    if (cells[cell] === SUN) suns |= 1 << i
    else if (cells[cell] === MOON) moons |= 1 << i
  })
  const full = (1 << size) - 1
  let alwaysSun = full
  let alwaysMoon = full
  let any = false
  for (const pattern of patterns(size)) {
    if ((pattern & suns) !== suns || (pattern & moons) !== 0) continue
    if (!inLine.every(({ i, j, same }) => (((pattern >> i) & 1) === ((pattern >> j) & 1)) === same)) continue
    any = true
    alwaysSun &= pattern
    alwaysMoon &= ~pattern & full
  }
  if (!any) return null
  const forced = new Map<number, Cell>()
  line.forEach((cell, i) => {
    if (cells[cell]) return
    if ((alwaysSun >> i) & 1) forced.set(cell, SUN)
    else if ((alwaysMoon >> i) & 1) forced.set(cell, MOON)
  })
  return forced
}

function findLine(size: number, cells: readonly Cell[], signs: readonly Sign[]): Step | null | 'contradiction' {
  for (const [index, line] of lines(size).entries()) {
    const forced = solveLine(size, line, cells, signs)
    if (!forced) return 'contradiction'
    if (forced.size) {
      return { reason: 'line', technique: 'line', cells: [...forced.keys()], values: [...forced.values()], clues: line, line: index }
    }
  }
  return null
}

/** Applies basic and line deductions until none is left. False if a rule breaks. */
function propagate(size: number, cells: Cell[], signs: readonly Sign[], useLines: boolean): boolean {
  for (;;) {
    if (breaksRules(size, cells, signs)) return false
    const basic = findBasic(size, cells, signs)
    if (basic) {
      basic.cells.forEach((cell, i) => (cells[cell] = basic.values[i]))
      continue
    }
    if (!useLines) return true
    const line = findLine(size, cells, signs)
    if (line === 'contradiction') return false
    if (!line) return true
    line.cells.forEach((cell, i) => (cells[cell] = line.values[i]))
  }
}

function findLookahead(size: number, cells: readonly Cell[], signs: readonly Sign[]): Step | null {
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell]) continue
    for (const value of [SUN, MOON] as Cell[]) {
      const trial = cells.slice() as Cell[]
      trial[cell] = value
      if (!propagate(size, trial, signs, true)) {
        return { reason: 'lookahead', technique: 'lookahead', cells: [cell], values: [opposite(value)], clues: [cell] }
      }
    }
  }
  return null
}

/** The simplest next deduction, using techniques up to `hardest`. */
export function nextStep(size: number, cells: readonly Cell[], signs: readonly Sign[], hardest: Technique = 'lookahead'): Step | null {
  const basic = findBasic(size, cells, signs)
  if (basic || hardest === 'basics') return basic
  const line = findLine(size, cells, signs)
  if (line === 'contradiction') return null
  if (line || hardest === 'line') return line
  return findLookahead(size, cells, signs)
}

/** Solves with techniques up to `hardest`; says whether it got there and what it needed. */
export function solveLogically(size: number, givens: readonly Cell[], signs: readonly Sign[], hardest: Technique = 'lookahead') {
  const cells = givens.slice() as Cell[]
  let needed: Technique = 'basics'
  for (;;) {
    if (breaksRules(size, cells, signs)) return { solved: false, needed }
    if (!cells.includes(EMPTY)) return { solved: true, needed }
    const step = nextStep(size, cells, signs, hardest)
    if (!step) return { solved: false, needed }
    if (TECHNIQUES.indexOf(step.technique) > TECHNIQUES.indexOf(needed)) needed = step.technique
    step.cells.forEach((cell, i) => (cells[cell] = step.values[i]))
  }
}

/** Up to `limit` solutions, by search with the quick deductions applied at every step. */
export function findSolutions(size: number, givens: readonly Cell[], signs: readonly Sign[], limit = 2): Cell[][] {
  const found: Cell[][] = []
  const visit = (cells: Cell[]): boolean => {
    if (!propagate(size, cells, signs, true)) return false
    const cell = cells.indexOf(EMPTY)
    if (cell < 0) {
      found.push(cells)
      return found.length >= limit
    }
    for (const value of [SUN, MOON] as Cell[]) {
      const next = cells.slice() as Cell[]
      next[cell] = value
      if (visit(next)) return true
    }
    return false
  }
  visit(givens.slice() as Cell[])
  return found
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  givens: Cell[]
  signs: Sign[]
  solution: Cell[]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/** A random full grid that follows every rule, built a row at a time from random allowed lines. */
function randomSolution(size: number, random: () => number): Cell[] {
  const rows: Cell[][] = []
  const all = patterns(size).map((mask) => patternCells(mask, size))
  const visit = (): boolean => {
    if (rows.length === size) return true
    for (const pattern of shuffle(all.slice(), random)) {
      rows.push(pattern)
      // Columns so far must stay possible: no three in a row, and no more than half of either kind.
      const ok = Array.from({ length: size }, (_, column) => {
        const values = rows.map((row) => row[column])
        const n = values.length
        if (n >= 3 && values[n - 1] === values[n - 2] && values[n - 2] === values[n - 3]) return false
        return values.filter((v) => v === SUN).length <= size / 2 && values.filter((v) => v === MOON).length <= size / 2
      }).every(Boolean)
      if (ok && visit()) return true
      rows.pop()
    }
    return false
  }
  visit()
  return rows.flat()
}

/** Every pair of side-by-side cells, as signs that match the solution. */
function allSigns(size: number, solution: readonly Cell[]): Sign[] {
  const signs: Sign[] = []
  for (let cell = 0; cell < size * size; cell++) {
    if (cell % size < size - 1) signs.push({ a: cell, b: cell + 1, same: solution[cell] === solution[cell + 1] })
    if (cell + size < size * size) signs.push({ a: cell, b: cell + size, same: solution[cell] === solution[cell + size] })
  }
  return signs
}

/**
 * A new puzzle: a random solution, a sprinkling of signs, then givens and signs removed one at a
 * time for as long as the puzzle keeps exactly one solution that the level's techniques reach.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { size, hardest } = level
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const solution = randomSolution(size, random)
    const signs = shuffle(allSigns(size, solution), random).slice(0, Math.round(level.signs * size * (size - 1) * 2))
    const givens = solution.slice() as Cell[]
    const works = (cells: Cell[], marks: Sign[]) =>
      solveLogically(size, cells, marks, hardest).solved && findSolutions(size, cells, marks, 2).length === 1
    // Givens and signs come off in one shuffled mix, so the finished puzzle keeps some of each.
    const clues: ({ cell: number } | { sign: Sign })[] = [
      ...Array.from({ length: size * size }, (_, cell) => ({ cell })),
      ...signs.map((sign) => ({ sign })),
    ]
    let kept = signs
    for (const clue of shuffle(clues, random)) {
      if ('cell' in clue) {
        givens[clue.cell] = EMPTY
        if (!works(givens, kept)) givens[clue.cell] = solution[clue.cell]
      } else {
        const fewer = kept.filter((other) => other !== clue.sign)
        if (works(givens, fewer)) kept = fewer
      }
    }
    const puzzle = { givens, signs: kept.sort((x, y) => x.a - y.a || x.b - y.b), solution }
    fallback ??= puzzle
    const needed = solveLogically(size, givens, kept, hardest).needed
    if (!level.needs || TECHNIQUES.indexOf(needed) >= TECHNIQUES.indexOf(level.needs)) return puzzle
  }
  return fallback!
}

// ———————————————————————————————————————— Hints

export type Hint =
  /** Cells holding the wrong symbol (they may not break a rule yet, but the solution differs). */
  | { kind: 'wrong'; cells: number[] }
  | { kind: 'step'; step: Step }

/**
 * What to do next: fix wrong cells if there are any, otherwise the next deduction. When logic
 * runs dry (which generated puzzles never allow), the solution supplies a cell.
 */
export function findHint(size: number, cells: readonly Cell[], signs: readonly Sign[], solution: readonly Cell[]): Hint | null {
  const wrong = cells.flatMap((value, cell) => (value && value !== solution[cell] ? [cell] : []))
  if (wrong.length) return { kind: 'wrong', cells: wrong }
  const step = nextStep(size, cells, signs)
  if (step) return { kind: 'step', step }
  const cell = cells.indexOf(EMPTY)
  return cell < 0 ? null : { kind: 'step', step: { reason: 'lookahead', technique: 'lookahead', cells: [cell], values: [solution[cell]], clues: [cell] } }
}
