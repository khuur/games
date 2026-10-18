/**
 * Sudoku rules, a fast solver (used to make sure every puzzle has exactly one solution), and a
 * logical solver that works the way people do. The logical solver grades puzzles by the hardest
 * technique they need, and explains hints.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

export interface LevelDefinition {
  id: LevelId
  name: string
  /** Clues stop being removed once the puzzle is down to this many. */
  minClues: number
  /** Whether solving may need more than singles; on Hard it must. */
  advanced: boolean
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', minClues: 38, advanced: false },
  medium: { id: 'medium', name: 'Medium', minClues: 0, advanced: false },
  hard: { id: 'hard', name: 'Hard', minClues: 0, advanced: true },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

// ———————————————————————————————————————— The grid

export const rowOf = (cell: number) => Math.floor(cell / 9)
export const columnOf = (cell: number) => cell % 9
export const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(columnOf(cell) / 3)

/** The 27 units: rows 0–8, then columns (9–17), then boxes (18–26). */
export const UNITS: readonly (readonly number[])[] = [
  ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row * 9 + column)),
  ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, row) => row * 9 + column)),
  ...Array.from({ length: 9 }, (_, box) =>
    Array.from({ length: 9 }, (_, i) => (Math.floor(box / 3) * 3 + Math.floor(i / 3)) * 9 + (box % 3) * 3 + (i % 3)),
  ),
]

export const unitsOf = (cell: number) => [rowOf(cell), 9 + columnOf(cell), 18 + boxOf(cell)]

export type UnitKind = 'row' | 'column' | 'box'
export const unitKind = (unit: number): UnitKind => (unit < 9 ? 'row' : unit < 18 ? 'column' : 'box')

/** The 20 cells that share a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, cell) => {
  const peers = new Set(unitsOf(cell).flatMap((unit) => UNITS[unit]))
  peers.delete(cell)
  return [...peers]
})

const ALL = 0x1ff
export const digitBit = (digit: number) => 1 << (digit - 1)
const BIT_COUNT = Array.from({ length: 512 }, (_, mask) => {
  let count = 0
  for (let m = mask; m; m &= m - 1) count++
  return count
})
export const bitCount = (mask: number) => BIT_COUNT[mask]
export const digitsIn = (mask: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => mask & digitBit(digit))

/** Whether a grid of 81 digits (0 for empty) breaks no rule. */
export function isConsistent(grid: readonly number[]): boolean {
  return UNITS.every((unit) => {
    let seen = 0
    for (const cell of unit) {
      const digit = grid[cell]
      if (!digit) continue
      if (seen & digitBit(digit)) return false
      seen |= digitBit(digit)
    }
    return true
  })
}

// ———————————————————————————————————————— Fast solving

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/**
 * Counts solutions (stopping at `limit`), filling the most constrained cell first. With
 * `random`, digits are tried in random order, which turns it into a generator of full grids.
 */
function search(grid: readonly number[], limit: number, random?: () => number): { count: number; first: number[] | null } {
  const cells = grid.slice()
  const used = new Uint16Array(27)
  for (let cell = 0; cell < 81; cell++) {
    const digit = cells[cell]
    if (!digit) continue
    for (const unit of unitsOf(cell)) {
      if (used[unit] & digitBit(digit)) return { count: 0, first: null }
      used[unit] |= digitBit(digit)
    }
  }
  let count = 0
  let first: number[] | null = null

  const visit = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestCount = 10
    for (let cell = 0; cell < 81; cell++) {
      if (cells[cell]) continue
      const [r, c, b] = unitsOf(cell)
      const mask = ALL & ~(used[r] | used[c] | used[b])
      const options = BIT_COUNT[mask]
      if (options === 0) return false
      if (options < bestCount) {
        best = cell
        bestMask = mask
        bestCount = options
        if (options === 1) break
      }
    }
    if (best === -1) {
      count++
      first ??= cells.slice()
      return count >= limit
    }
    const digits = digitsIn(bestMask)
    if (random) shuffle(digits, random)
    const units = unitsOf(best)
    for (const digit of digits) {
      cells[best] = digit
      for (const unit of units) used[unit] |= digitBit(digit)
      if (visit()) return true
      for (const unit of units) used[unit] &= ~digitBit(digit)
    }
    cells[best] = 0
    return false
  }

  visit()
  return { count, first }
}

export const countSolutions = (grid: readonly number[], limit = 2) => search(grid, limit).count

export const solve = (grid: readonly number[]) => search(grid, 1).first

export function randomSolution(random: () => number = Math.random): number[] {
  return search(new Array<number>(81).fill(0), 1, random).first!
}

// ———————————————————————————————————————— Solving like a person

export type Technique =
  | 'hidden-single'
  | 'naked-single'
  | 'pointing'
  | 'claiming'
  | 'naked-pair'
  | 'hidden-pair'
  | 'naked-triple'

export interface Step {
  technique: Technique
  /** A placement: the cell and its digit. */
  cell?: number
  digit?: number
  /** The unit the step is about: where a hidden single hides, or where a pattern sits. */
  unit?: number
  /** Candidates a pattern rules out. */
  eliminations?: { cell: number; digit: number }[]
}

interface Board {
  values: number[]
  /** Possible digits of each empty cell, as bit masks. */
  candidates: number[]
}

function boardOf(grid: readonly number[]): Board {
  const values = grid.slice()
  const candidates = values.map((value, cell) => {
    if (value) return 0
    let mask = ALL
    for (const peer of PEERS[cell]) if (values[peer]) mask &= ~digitBit(values[peer])
    return mask
  })
  return { values, candidates }
}

function place(board: Board, cell: number, digit: number) {
  board.values[cell] = digit
  board.candidates[cell] = 0
  for (const peer of PEERS[cell]) board.candidates[peer] &= ~digitBit(digit)
}

/** Boxes first, as people usually scan them, then rows and columns. */
const SCAN_ORDER = [...UNITS.keys()].sort((a, b) => Number(b >= 18) - Number(a >= 18))

function findSingle({ values, candidates }: Board): Step | null {
  for (const unit of SCAN_ORDER) {
    for (let digit = 1; digit <= 9; digit++) {
      let spot = -1
      let spots = 0
      for (const cell of UNITS[unit]) {
        if (values[cell] === digit) {
          spots = -1
          break
        }
        if (candidates[cell] & digitBit(digit)) {
          spot = cell
          spots++
        }
      }
      if (spots === 1) return { technique: 'hidden-single', cell: spot, digit, unit }
    }
  }
  for (let cell = 0; cell < 81; cell++) {
    if (!values[cell] && BIT_COUNT[candidates[cell]] === 1) {
      return { technique: 'naked-single', cell, digit: digitsIn(candidates[cell])[0] }
    }
  }
  return null
}

/** Removes candidates, keeping only those that are really there. Null if nothing would change. */
function eliminate(board: Board, technique: Technique, unit: number, targets: { cell: number; digit: number }[]): Step | null {
  const eliminations = targets.filter(({ cell, digit }) => board.candidates[cell] & digitBit(digit))
  return eliminations.length ? { technique, unit, eliminations } : null
}

function findLockedCandidates(board: Board): Step | null {
  const { candidates } = board
  for (let unit = 0; unit < 27; unit++) {
    for (let digit = 1; digit <= 9; digit++) {
      const spots = UNITS[unit].filter((cell) => candidates[cell] & digitBit(digit))
      if (spots.length < 2) continue
      if (unit >= 18) {
        // Pointing: within a box, the digit is confined to one row or column, so the rest of that line loses it.
        for (const line of [rowOf(spots[0]), 9 + columnOf(spots[0])]) {
          if (!spots.every((cell) => unitsOf(cell).includes(line))) continue
          const targets = UNITS[line].filter((cell) => boxOf(cell) !== unit - 18).map((cell) => ({ cell, digit }))
          const step = eliminate(board, 'pointing', unit, targets)
          if (step) return step
        }
      } else {
        // Claiming: within a line, the digit is confined to one box, so the rest of that box loses it.
        const box = boxOf(spots[0])
        if (!spots.every((cell) => boxOf(cell) === box)) continue
        const targets = UNITS[18 + box].filter((cell) => !UNITS[unit].includes(cell)).map((cell) => ({ cell, digit }))
        const step = eliminate(board, 'claiming', unit, targets)
        if (step) return step
      }
    }
  }
  return null
}

function findSubsets(board: Board): Step | null {
  const { candidates } = board
  for (let unit = 0; unit < 27; unit++) {
    const empty = UNITS[unit].filter((cell) => candidates[cell])
    // Naked pair: two cells with the same two candidates own those digits in this unit.
    const pairs = empty.filter((cell) => BIT_COUNT[candidates[cell]] === 2)
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const mask = candidates[pairs[i]]
        if (candidates[pairs[j]] !== mask) continue
        const targets = empty
          .filter((cell) => cell !== pairs[i] && cell !== pairs[j])
          .flatMap((cell) => digitsIn(mask).map((digit) => ({ cell, digit })))
        const step = eliminate(board, 'naked-pair', unit, targets)
        if (step) return step
      }
    }
    // Hidden pair: two digits that fit only the same two cells; those cells can't hold anything else.
    const spotsOf = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => empty.filter((cell) => candidates[cell] & digitBit(digit)))
    for (let a = 1; a <= 9; a++) {
      for (let b = a + 1; b <= 9; b++) {
        const [spotsA, spotsB] = [spotsOf[a - 1], spotsOf[b - 1]]
        if (spotsA.length !== 2 || spotsB.length !== 2 || spotsA[0] !== spotsB[0] || spotsA[1] !== spotsB[1]) continue
        const keep = digitBit(a) | digitBit(b)
        const targets = spotsA.flatMap((cell) => digitsIn(candidates[cell] & ~keep).map((digit) => ({ cell, digit })))
        const step = eliminate(board, 'hidden-pair', unit, targets)
        if (step) return step
      }
    }
    // Naked triple: three cells whose candidates, together, are just three digits.
    const small = empty.filter((cell) => BIT_COUNT[candidates[cell]] <= 3)
    for (let i = 0; i < small.length; i++) {
      for (let j = i + 1; j < small.length; j++) {
        for (let k = j + 1; k < small.length; k++) {
          const mask = candidates[small[i]] | candidates[small[j]] | candidates[small[k]]
          if (BIT_COUNT[mask] !== 3) continue
          const trio = [small[i], small[j], small[k]]
          const targets = empty
            .filter((cell) => !trio.includes(cell))
            .flatMap((cell) => digitsIn(mask).map((digit) => ({ cell, digit })))
          const step = eliminate(board, 'naked-triple', unit, targets)
          if (step) return step
        }
      }
    }
  }
  return null
}

function findElimination(board: Board): Step | null {
  return findLockedCandidates(board) ?? findSubsets(board)
}

function applyStep(board: Board, step: Step) {
  if (step.cell !== undefined && step.digit !== undefined) place(board, step.cell, step.digit)
  for (const { cell, digit } of step.eliminations ?? []) board.candidates[cell] &= ~digitBit(digit)
}

/**
 * Solves by logic alone, as a person would: singles while there are any, and (if `advanced`)
 * patterns that rule out candidates when there aren't. Says whether it got all the way, and
 * whether it needed anything beyond singles.
 */
export function solveLogically(grid: readonly number[], advanced: boolean): { solved: boolean; usedAdvanced: boolean } {
  const board = boardOf(grid)
  let usedAdvanced = false
  for (;;) {
    if (!board.values.includes(0)) return { solved: true, usedAdvanced }
    if (board.values.some((value, cell) => !value && !board.candidates[cell])) return { solved: false, usedAdvanced }
    const single = findSingle(board)
    if (single) {
      applyStep(board, single)
      continue
    }
    const pattern = advanced ? findElimination(board) : null
    if (!pattern) return { solved: false, usedAdvanced }
    applyStep(board, pattern)
    usedAdvanced = true
  }
}

/** The next digit logic can place, and any patterns needed first to see it. */
export function nextPlacement(grid: readonly number[]): { step: Step; patterns: Step[] } | null {
  const board = boardOf(grid)
  const patterns: Step[] = []
  for (let guard = 0; guard < 200; guard++) {
    const single = findSingle(board)
    if (single) return { step: single, patterns }
    const pattern = findElimination(board)
    if (!pattern) return null
    applyStep(board, pattern)
    patterns.push(pattern)
  }
  return null
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  /** 81 digits, 0 for a blank. */
  givens: number[]
  solution: number[]
}

/**
 * Removes clues from a full grid, in symmetric pairs, for as long as the puzzle keeps exactly one
 * solution and logic of the level's kind can still solve it.
 */
function carve(solution: number[], level: LevelDefinition, random: () => number): number[] {
  const givens = solution.slice()
  const order = shuffle(Array.from({ length: 41 }, (_, i) => i), random)
  let clues = 81
  for (const cell of order) {
    const pair = cell === 40 ? [40] : [cell, 80 - cell]
    if (clues - pair.length < level.minClues) continue
    for (const spot of pair) givens[spot] = 0
    if (countSolutions(givens) === 1 && solveLogically(givens, level.advanced).solved) {
      clues -= pair.length
    } else {
      for (const spot of pair) givens[spot] = solution[spot]
    }
  }
  return givens
}

/**
 * A new puzzle for the level, with a unique solution that logic alone can reach. Hard puzzles
 * must also need at least one pattern beyond singles.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  let puzzle: Puzzle | null = null
  for (let attempt = 0; attempt < 30; attempt++) {
    const solution = randomSolution(random)
    const givens = carve(solution, level, random)
    puzzle = { givens, solution }
    if (!level.advanced || solveLogically(givens, false).solved === false) return puzzle
  }
  return puzzle!
}

// ———————————————————————————————————————— Hints

export type Hint =
  | { kind: 'wrong'; cell: number; digit: number }
  | {
      kind: 'place'
      cell: number
      digit: number
      technique: Technique
      /** Where a hidden single hides. */
      unit?: number
      /** Patterns that have to be spotted first to see it. */
      patterns: Technique[]
    }

/**
 * What to do next: fix a wrong digit if there is one, otherwise the next digit logic can place.
 * When logic runs dry (which generated puzzles never allow), the solution fills a cell.
 */
export function findHint(values: readonly number[], solution: readonly number[]): Hint | null {
  const wrong = values.findIndex((value, cell) => value !== 0 && value !== solution[cell])
  if (wrong >= 0) return { kind: 'wrong', cell: wrong, digit: values[wrong] }
  const next = nextPlacement(values)
  if (next && next.step.cell !== undefined && next.step.digit !== undefined) {
    return {
      kind: 'place',
      cell: next.step.cell,
      digit: next.step.digit,
      technique: next.step.technique,
      unit: next.step.unit,
      patterns: [...new Set(next.patterns.map((pattern) => pattern.technique))],
    }
  }
  const empty = values.indexOf(0)
  return empty < 0 ? null : { kind: 'place', cell: empty, digit: solution[empty], technique: 'naked-single', patterns: [] }
}
