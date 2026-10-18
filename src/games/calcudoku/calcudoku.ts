/**
 * Calcudoku rules, a solution counter (every puzzle has exactly one solution) and a solver that
 * reasons like a person, which grades puzzles and explains hints.
 *
 * Every row and column holds 1 to N once. Heavy lines split the grid into cages, and the digits
 * in a cage make its target with its operation: added up, multiplied, or (in a cage of two) the
 * difference or quotient of the pair. A digit may repeat in a cage, just not within a row or column.
 */
import { bitCount, digitBit, digitsIn, fullMask, linesOf, peersOf, randomLatinSquare, shuffle } from '../latin/latin'

export type LevelId = 'easy' | 'medium' | 'hard'

/** Add, subtract, multiply, divide, or (a cage of one) just the number. */
export type Op = '+' | '-' | '*' | '/' | '='
export const OPS: readonly Op[] = ['+', '-', '*', '/', '=']
export const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' }

export interface Cage {
  /** In reading order. */
  cells: number[]
  op: Op
  target: number
}

/** Techniques from easiest to hardest. */
export type Technique = 'singles' | 'cage' | 'subsets'
export const TECHNIQUES: readonly Technique[] = ['singles', 'cage', 'subsets']

export interface LevelDefinition {
  id: LevelId
  name: string
  size: number
  /** Operations for cages of two or more cells. */
  ops: readonly Op[]
  maxCage: number
  /** How many cages of a single cell (a free digit) there may be. */
  maxSingles: number
  hardest: Technique
  needs: Technique | null
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', size: 4, ops: ['+', '-'], maxCage: 3, maxSingles: 2, hardest: 'cage', needs: null },
  medium: { id: 'medium', name: 'Medium', size: 5, ops: ['+', '-', '*'], maxCage: 4, maxSingles: 2, hardest: 'subsets', needs: null },
  hard: { id: 'hard', name: 'Hard', size: 6, ops: ['+', '-', '*', '/'], maxCage: 4, maxSingles: 1, hardest: 'subsets', needs: 'subsets' },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

/** What a cage's digits make with its operation; null if they make nothing (an uneven division). */
export function cageValue(op: Op, digits: readonly number[]): number | null {
  switch (op) {
    case '=':
      return digits.length === 1 ? digits[0] : null
    case '+':
      return digits.reduce((sum, digit) => sum + digit, 0)
    case '*':
      return digits.reduce((product, digit) => product * digit, 1)
    case '-':
      return digits.length === 2 ? Math.abs(digits[0] - digits[1]) : null
    case '/': {
      if (digits.length !== 2) return null
      const [high, low] = digits[0] > digits[1] ? digits : [digits[1], digits[0]]
      return high % low === 0 ? high / low : null
    }
  }
}

/** A cage's label, such as "12×", "3−" or just "4" for a cage of one. */
export const cageLabel = (cage: Cage) => `${cage.target}${OP_SYMBOL[cage.op]}`

/** For each cell, the index of its cage. */
export function cageIndex(size: number, cages: readonly Cage[]): number[] {
  const index = new Array<number>(size * size).fill(-1)
  cages.forEach((cage, i) => cage.cells.forEach((cell) => (index[cell] = i)))
  return index
}

const neighboursOf = (size: number, cell: number) => {
  const row = Math.floor(cell / size)
  const column = cell % size
  const list: number[] = []
  if (row > 0) list.push(cell - size)
  if (row < size - 1) list.push(cell + size)
  if (column > 0) list.push(cell - 1)
  if (column < size - 1) list.push(cell + 1)
  return list
}

/** Whether a set of cells is all in one piece. */
export function isConnected(size: number, cells: readonly number[]): boolean {
  const inside = new Set(cells)
  const seen = new Set([cells[0]])
  const queue = [cells[0]]
  while (queue.length) {
    for (const next of neighboursOf(size, queue.pop()!)) {
      if (inside.has(next) && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen.size === cells.length
}

// ———————————————————————————————————————— Reasoning on candidates

interface Board {
  size: number
  cages: readonly Cage[]
  values: number[]
  /** Possible digits of each cell, as bit masks (a placed cell has just its own). */
  candidates: number[]
}

/** A board whose candidates rule out what each cell's row and column hold, and that knows its cages of one. */
function boardOf(size: number, cages: readonly Cage[], grid: readonly number[]): Board {
  const values = grid.slice()
  const peers = peersOf(size)
  const candidates = values.map((value, cell) => {
    if (value) return digitBit(value)
    let mask = fullMask(size)
    for (const peer of peers[cell]) if (values[peer]) mask &= ~digitBit(values[peer])
    return mask
  })
  for (const cage of cages) if (cage.op === '=' && !values[cage.cells[0]]) candidates[cage.cells[0]] &= digitBit(cage.target)
  return { size, cages, values, candidates }
}

const copyBoard = (board: Board): Board => ({ ...board, values: board.values.slice(), candidates: board.candidates.slice() })

function place(board: Board, cell: number, digit: number) {
  board.values[cell] = digit
  board.candidates[cell] = digitBit(digit)
  for (const peer of peersOf(board.size)[cell]) board.candidates[peer] &= ~digitBit(digit)
}

/**
 * The ways to fill a cage that fit its cells' candidates and its target: how many there are, the
 * digits each cell takes in them, and the digits every way puts in each row or column it crosses.
 */
function cageOptions(board: Board, cage: Cage) {
  const { size, candidates } = board
  const { cells, op, target } = cage
  const rows = cells.map((cell) => Math.floor(cell / size))
  const columns = cells.map((cell) => cell % size)
  const lines = [...new Set([...rows, ...columns.map((column) => size + column)])]
  const possible = new Array<number>(cells.length).fill(0)
  const required = new Map(lines.map((line) => [line, fullMask(size)]))
  const chosen: number[] = []
  let count = 0
  const remaining = cells.length

  const visit = (i: number, total: number) => {
    if (i === remaining) {
      if (cageValue(op, chosen) !== target) return
      count++
      const present = new Map<number, number>()
      chosen.forEach((digit, k) => {
        possible[k] |= digitBit(digit)
        present.set(rows[k], (present.get(rows[k]) ?? 0) | digitBit(digit))
        present.set(size + columns[k], (present.get(size + columns[k]) ?? 0) | digitBit(digit))
      })
      for (const line of lines) required.set(line, required.get(line)! & (present.get(line) ?? 0))
      return
    }
    const left = remaining - i - 1
    for (const digit of digitsIn(candidates[cells[i]])) {
      let clash = false
      for (let k = 0; k < i; k++) {
        if (chosen[k] === digit && (rows[k] === rows[i] || columns[k] === columns[i])) {
          clash = true
          break
        }
      }
      if (clash) continue
      if (op === '+' && (total + digit + left > target || total + digit + left * size < target)) continue
      if (op === '*' && target % (total * digit) !== 0) continue
      chosen[i] = digit
      visit(i + 1, op === '*' ? total * digit : total + digit)
    }
    chosen.length = i
  }
  visit(0, op === '*' ? 1 : 0)
  return { possible, required, count }
}

/** A digit that has to go in a cell. */
interface Single {
  kind: 'single'
  reason: 'naked-single' | 'hidden-single'
  cell: number
  digit: number
  /** For a hidden single, the row or column it hides in. */
  line?: number
}

/** Digits ruled out of cells, by a cage's arithmetic or by digits a row or column must keep elsewhere. */
interface Elimination {
  kind: 'elimination'
  technique: 'cage' | 'subsets'
  eliminations: { cell: number; digit: number }[]
  /** The cage the reasoning is about. */
  cage?: number
  /** The row or column the reasoning is about. */
  line?: number
}

type Step = Single | Elimination
const techniqueOf = (step: Step): Technique => (step.kind === 'single' ? 'singles' : step.technique)

function findSingle(board: Board): Single | null {
  const { size, values, candidates } = board
  for (const [line, cells] of linesOf(size).entries()) {
    for (let digit = 1; digit <= size; digit++) {
      if (cells.some((cell) => values[cell] === digit)) continue
      const spots = cells.filter((cell) => candidates[cell] & digitBit(digit))
      if (spots.length === 1) return { kind: 'single', reason: 'hidden-single', cell: spots[0], digit, line }
    }
  }
  for (let cell = 0; cell < size * size; cell++) {
    if (!values[cell] && bitCount(candidates[cell]) === 1) {
      return { kind: 'single', reason: 'naked-single', cell, digit: digitsIn(candidates[cell])[0] }
    }
  }
  return null
}

function eliminate(board: Board, step: Omit<Elimination, 'kind' | 'eliminations'>, targets: { cell: number; digit: number }[]): Elimination | null {
  const eliminations = targets.filter(({ cell, digit }) => !board.values[cell] && board.candidates[cell] & digitBit(digit))
  return eliminations.length ? { kind: 'elimination', ...step, eliminations } : null
}

/** Rules out digits that no way of making a cage's target puts in that cell. */
function findCage(board: Board): Elimination | null | 'contradiction' {
  for (const [index, cage] of board.cages.entries()) {
    const { possible, count } = cageOptions(board, cage)
    if (!count) return 'contradiction'
    const targets = cage.cells.flatMap((cell, k) => digitsIn(board.candidates[cell] & ~possible[k]).map((digit) => ({ cell, digit })))
    const step = eliminate(board, { technique: 'cage', cage: index }, targets)
    if (step) return step
  }
  return null
}

/**
 * Digits a row or column has to keep somewhere: those every way of filling a cage puts in that
 * row or column, and those that a few cells between them must hold (a naked pair or triple).
 * Either way, the rest of the row or column can't have them.
 */
function findSubset(board: Board): Elimination | null {
  const { size, candidates, values } = board
  const lines = linesOf(size)
  for (const [index, cage] of board.cages.entries()) {
    if (cage.cells.length < 2) continue
    const { required } = cageOptions(board, cage)
    for (const [line, mask] of required) {
      if (!mask) continue
      const targets = lines[line]
        .filter((cell) => !cage.cells.includes(cell))
        .flatMap((cell) => digitsIn(mask).map((digit) => ({ cell, digit })))
      const step = eliminate(board, { technique: 'subsets', cage: index, line }, targets)
      if (step) return step
    }
  }
  for (const [line, cells] of lines.entries()) {
    const open = cells.filter((cell) => !values[cell])
    for (const group of [2, 3]) {
      if (open.length <= group) continue
      const choose = (start: number, picked: number[]): Elimination | null => {
        if (picked.length === group) {
          const mask = picked.reduce((union, cell) => union | candidates[cell], 0)
          if (bitCount(mask) !== group) return null
          const targets = open.filter((cell) => !picked.includes(cell)).flatMap((cell) => digitsIn(mask).map((digit) => ({ cell, digit })))
          return eliminate(board, { technique: 'subsets', line }, targets)
        }
        for (let i = start; i < open.length; i++) {
          if (bitCount(candidates[open[i]]) > group) continue
          const step = choose(i + 1, [...picked, open[i]])
          if (step) return step
        }
        return null
      }
      const step = choose(0, [])
      if (step) return step
    }
  }
  return null
}

function findElimination(board: Board, hardest: Technique): Elimination | null | 'contradiction' {
  if (hardest === 'singles') return null
  const cage = findCage(board)
  if (cage || hardest === 'cage') return cage
  return findSubset(board)
}

function applyStep(board: Board, step: Step) {
  if (step.kind === 'single') place(board, step.cell, step.digit)
  else for (const { cell, digit } of step.eliminations) board.candidates[cell] &= ~digitBit(digit)
}

const broken = (board: Board) => board.candidates.some((mask, cell) => !mask || (board.values[cell] && mask !== digitBit(board.values[cell])))

/** Whether a full grid makes every cage's target. */
export function meetsCages(cages: readonly Cage[], grid: readonly number[]): boolean {
  return cages.every((cage) => cageValue(cage.op, cage.cells.map((cell) => grid[cell])) === cage.target)
}

/** Solves with techniques up to `hardest`; says whether it got there and what it needed. */
export function solveLogically(size: number, cages: readonly Cage[], givens: readonly number[], hardest: Technique = 'subsets') {
  const board = boardOf(size, cages, givens)
  let needed: Technique = 'singles'
  for (;;) {
    if (broken(board)) return { solved: false, needed }
    if (!board.values.includes(0)) return { solved: meetsCages(cages, board.values), needed }
    const step = findSingle(board) ?? findElimination(board, hardest)
    if (!step || step === 'contradiction') return { solved: false, needed }
    if (TECHNIQUES.indexOf(techniqueOf(step)) > TECHNIQUES.indexOf(needed)) needed = techniqueOf(step)
    applyStep(board, step)
  }
}

/** Up to `limit` solutions, by search with the cages' arithmetic applied at every step. */
export function findSolutions(size: number, cages: readonly Cage[], givens: readonly number[], limit = 2): number[][] {
  const found: number[][] = []
  const visit = (board: Board): boolean => {
    for (;;) {
      if (broken(board)) return false
      const step = findSingle(board) ?? findCage(board)
      if (step === 'contradiction') return false
      if (!step) break
      applyStep(board, step)
    }
    let pick = -1
    for (let cell = 0; cell < board.values.length; cell++) {
      if (!board.values[cell] && (pick < 0 || bitCount(board.candidates[cell]) < bitCount(board.candidates[pick]))) pick = cell
    }
    if (pick < 0) {
      if (!meetsCages(cages, board.values)) return false
      found.push(board.values.slice())
      return found.length >= limit
    }
    for (const digit of digitsIn(board.candidates[pick])) {
      const next = copyBoard(board)
      place(next, pick, digit)
      if (visit(next)) return true
    }
    return false
  }
  visit(boardOf(size, cages, givens))
  return found
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  cages: Cage[]
  solution: number[]
}

/** How often each cage size comes up, before the level's limit. */
const CAGE_SIZE_WEIGHTS = [0, 0.06, 0.5, 0.3, 0.14]

function pick<T>(options: readonly (readonly [T, number])[], random: () => number): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [option, weight] of options) {
    roll -= weight
    if (roll < 0) return option
  }
  return options[options.length - 1][0]
}

/** Random cages covering the grid, each grown from a cell into its neighbours. */
function randomCages(level: LevelDefinition, random: () => number): number[][] {
  const { size, maxCage, maxSingles } = level
  const cageOf = new Array<number>(size * size).fill(-1)
  const cages: number[][] = []
  const sizes = CAGE_SIZE_WEIGHTS.slice(0, maxCage + 1).map((weight, cells) => [cells, weight] as const)
  for (const start of shuffle(Array.from({ length: size * size }, (_, cell) => cell), random)) {
    if (cageOf[start] >= 0) continue
    const wanted = pick(sizes, random)
    const cage = [start]
    cageOf[start] = cages.length
    while (cage.length < wanted) {
      const frontier = [...new Set(cage.flatMap((cell) => neighboursOf(size, cell)))].filter((cell) => cageOf[cell] < 0)
      if (!frontier.length) break
      const next = frontier[Math.floor(random() * frontier.length)]
      cage.push(next)
      cageOf[next] = cages.length
    }
    cages.push(cage)
  }
  // Too many cages of one: fold the extras into a small neighbouring cage.
  let singles = cages.filter((cage) => cage.length === 1).length
  for (const [index, cage] of shuffle([...cages.entries()], random)) {
    if (singles <= maxSingles) break
    if (cage.length !== 1) continue
    const hosts = neighboursOf(size, cage[0])
      .map((cell) => cageOf[cell])
      .filter((host) => host !== index && cages[host].length > 0 && cages[host].length < maxCage)
    if (!hosts.length) continue
    const host = hosts.reduce((best, other) => (cages[other].length < cages[best].length ? other : best))
    cages[host].push(cage[0])
    cageOf[cage[0]] = host
    cage.length = 0
    singles -= cages[host].length === 2 ? 2 : 1
  }
  return cages.filter((cage) => cage.length > 0).map((cage) => cage.sort((a, b) => a - b))
}

/** An operation for a cage, given the digits it holds, favouring the ones that say the most. */
function chooseOp(level: LevelDefinition, digits: number[], random: () => number): Op {
  if (digits.length === 1) return '='
  const options: [Op, number][] = []
  if (digits.length === 2) {
    if (level.ops.includes('/') && cageValue('/', digits) !== null) options.push(['/', 3])
    if (level.ops.includes('-')) options.push(['-', 2])
  }
  if (level.ops.includes('*')) options.push(['*', digits.length === 2 ? 1 : 1.6])
  options.push(['+', 1.4])
  return pick(options, random)
}

/**
 * A new puzzle: a random grid, cut into random cages with operations that its digits make, kept
 * when it has exactly one solution that the level's techniques reach.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { size, hardest } = level
  const blank = new Array<number>(size * size).fill(0)
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const solution = randomLatinSquare(size, random)
    const cells = randomCages(level, random)
    if (cells.filter((cage) => cage.length === 1).length > level.maxSingles) continue
    const cages = cells.map((cells): Cage => {
      const digits = cells.map((cell) => solution[cell])
      const op = chooseOp(level, digits, random)
      return { cells, op, target: cageValue(op, digits)! }
    })
    if (findSolutions(size, cages, blank, 2).length !== 1) continue
    const { solved, needed } = solveLogically(size, cages, blank, hardest)
    if (!solved) continue
    const puzzle = { cages, solution }
    if (!level.needs || TECHNIQUES.indexOf(needed) >= TECHNIQUES.indexOf(level.needs)) return puzzle
    fallback ??= puzzle
  }
  if (fallback) return fallback
  // Practically unreachable: every cell its own cage still makes a fair (if dull) puzzle.
  const solution = randomLatinSquare(size, random)
  return { cages: solution.map((digit, cell) => ({ cells: [cell], op: '=', target: digit })), solution }
}

// ———————————————————————————————————————— Hints

export type HintReason =
  /** A cage of one cell holds its number. */
  | 'given'
  /** Its row and column hold every other digit. */
  | 'naked-single'
  /** The digit fits in only one cell of a row or column. */
  | 'hidden-single'
  /** Every way of making the cage's target that fits puts this digit here. */
  | 'cage'
  /** A single once each cage rules out the digits that can't make its target. */
  | 'cage-single'
  /** It takes narrowing down several cages, rows or columns first. */
  | 'deeper'

export type Hint =
  | { kind: 'wrong'; cell: number; digit: number }
  | {
      kind: 'place'
      cell: number
      digit: number
      reason: HintReason
      /** The cage the reasoning is about (by its index). */
      cage?: number
      /** The row or column (rows first, then columns) the reasoning is about. */
      line?: number
      /** For 'deeper': the cages to work out first. */
      cages?: number[]
    }

/** A cell that one cage's ways settle, from the cage with the fewest ways to think through. */
function findCagePlacement(board: Board) {
  let best: { cell: number; digit: number; cage: number; count: number } | null = null
  for (const [index, cage] of board.cages.entries()) {
    if (cage.cells.length < 2 || cage.cells.every((cell) => board.values[cell])) continue
    const { possible, count } = cageOptions(board, cage)
    if (best && count >= best.count) continue
    const spot = cage.cells.findIndex((cell, k) => !board.values[cell] && bitCount(possible[k]) === 1)
    if (spot >= 0) best = { cell: cage.cells[spot], digit: digitsIn(possible[spot])[0], cage: index, count }
  }
  return best
}

/**
 * What to do next: fix a wrong digit if there is one, otherwise the next digit to place, with the
 * simplest reasoning that finds one. When logic runs dry (which generated puzzles never allow),
 * the solution supplies one.
 */
export function findHint(size: number, cages: readonly Cage[], values: readonly number[], solution: readonly number[]): Hint | null {
  const wrong = values.findIndex((value, cell) => value !== 0 && value !== solution[cell])
  if (wrong >= 0) return { kind: 'wrong', cell: wrong, digit: values[wrong] }
  if (!values.includes(0)) return null

  const given = cages.findIndex((cage) => cage.op === '=' && !values[cage.cells[0]])
  if (given >= 0) return { kind: 'place', cell: cages[given].cells[0], digit: cages[given].target, reason: 'given', cage: given }

  const board = boardOf(size, cages, values)
  const single = findSingle(board)
  if (single) return { kind: 'place', cell: single.cell, digit: single.digit, reason: single.reason, line: single.line }

  const settled = findCagePlacement(board)
  if (settled) return { kind: 'place', cell: settled.cell, digit: settled.digit, reason: 'cage', cage: settled.cage }

  // Every cage at once: what's left in each cell, then a single.
  const caged = copyBoard(board)
  for (const cage of cages) {
    const { possible } = cageOptions(board, cage)
    cage.cells.forEach((cell, k) => (caged.candidates[cell] &= possible[k]))
  }
  const cageSingle = findSingle(caged)
  if (cageSingle) return { kind: 'place', cell: cageSingle.cell, digit: cageSingle.digit, reason: 'cage-single', line: cageSingle.line }

  // Otherwise as many steps as it takes.
  const deep = copyBoard(board)
  const involved: number[] = []
  for (let guard = 0; guard < 400; guard++) {
    const next = findSingle(deep)
    if (next) return { kind: 'place', cell: next.cell, digit: next.digit, reason: 'deeper', line: next.line, cages: involved }
    const step = findElimination(deep, 'subsets')
    if (!step || step === 'contradiction') break
    applyStep(deep, step)
    if (step.cage !== undefined && !involved.includes(step.cage)) involved.push(step.cage)
  }
  const empty = values.indexOf(0)
  return { kind: 'place', cell: empty, digit: solution[empty], reason: 'deeper', cages: [] }
}
