/**
 * Skyscrapers rules, a solution counter (every puzzle has exactly one solution) and a solver that
 * reasons like a person, which grades puzzles and explains hints.
 *
 * Every row and column holds the heights 1 to N once. A clue outside the grid says how many
 * towers can be seen from there, looking along the row or column: taller towers hide the shorter
 * ones behind them.
 */
import { bitCount, digitBit, digitsIn, fullMask, linesOf, peersOf, randomLatinSquare, shuffle } from '../latin/latin'

export type LevelId = 'easy' | 'medium' | 'hard'

/** Techniques from easiest to hardest. */
export type Technique = 'singles' | 'edge' | 'line'
export const TECHNIQUES: readonly Technique[] = ['singles', 'edge', 'line']

export interface LevelDefinition {
  id: LevelId
  name: string
  size: number
  hardest: Technique
  needs: Technique | null
  /** Clues stop being removed once this many are left, which keeps easier puzzles friendlier. */
  minClues: number
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', size: 4, hardest: 'edge', needs: null, minClues: 9 },
  medium: { id: 'medium', name: 'Medium', size: 5, hardest: 'line', needs: 'line', minClues: 10 },
  hard: { id: 'hard', name: 'Hard', size: 6, hardest: 'line', needs: 'line', minClues: 0 },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

/** How many towers can be seen from the start of a line of heights. */
export function visible(heights: readonly number[]): number {
  let count = 0
  let tallest = 0
  for (const height of heights) {
    if (height > tallest) {
      tallest = height
      count++
    }
  }
  return count
}

/**
 * Clues are kept in one list of 4N: along the top (left to right), down the right side, along the
 * bottom (left to right) and down the left side.
 */
export const clueIndex = (size: number, side: Side, index: number) =>
  ({ top: 0, right: size, bottom: 2 * size, left: 3 * size })[side] + index

/** The sides a line (rows first, then columns) is seen from: its start, then its end. */
export const sidesOf = (size: number, line: number): [Side, Side] => (line < size ? ['left', 'right'] : ['top', 'bottom'])

/** The two clues looking along a line, from its start and from its end (0 for none). */
export function lineClues(size: number, line: number, clues: readonly number[]): { start: number; end: number } {
  const [first, second] = sidesOf(size, line)
  const index = line % size
  return { start: clues[clueIndex(size, first, index)], end: clues[clueIndex(size, second, index)] }
}

/** All 4N clues of a full grid. */
export function cluesOf(size: number, grid: readonly number[]): number[] {
  const clues = new Array<number>(4 * size).fill(0)
  linesOf(size).forEach((cells, line) => {
    const heights = cells.map((cell) => grid[cell])
    const [first, second] = sidesOf(size, line)
    clues[clueIndex(size, first, line % size)] = visible(heights)
    clues[clueIndex(size, second, line % size)] = visible(heights.reverse())
  })
  return clues
}

/** Every order of 1 to N, with how many towers each shows from either end. */
const permutationCache = new Map<number, { heights: number[]; front: number; back: number }[]>()
function permutations(size: number) {
  let cached = permutationCache.get(size)
  if (cached) return cached
  const list: { heights: number[]; front: number; back: number }[] = []
  const build = (prefix: number[], rest: number[]) => {
    if (!rest.length) {
      list.push({ heights: prefix, front: visible(prefix), back: visible([...prefix].reverse()) })
      return
    }
    rest.forEach((height, i) => build([...prefix, height], [...rest.slice(0, i), ...rest.slice(i + 1)]))
  }
  build([], Array.from({ length: size }, (_, i) => i + 1))
  permutationCache.set(size, list)
  return list
}

// ———————————————————————————————————————— Reasoning on candidates

interface Board {
  size: number
  clues: readonly number[]
  values: number[]
  /** Possible heights of each cell, as bit masks (a placed cell has just its own). */
  candidates: number[]
}

/** A board whose candidates rule out only what each cell's row and column already hold. */
function boardOf(size: number, clues: readonly number[], grid: readonly number[]): Board {
  const values = grid.slice()
  const peers = peersOf(size)
  const candidates = values.map((value, cell) => {
    if (value) return digitBit(value)
    let mask = fullMask(size)
    for (const peer of peers[cell]) if (values[peer]) mask &= ~digitBit(values[peer])
    return mask
  })
  return { size, clues, values, candidates }
}

const copyBoard = (board: Board): Board => ({ ...board, values: board.values.slice(), candidates: board.candidates.slice() })

function place(board: Board, cell: number, digit: number) {
  board.values[cell] = digit
  board.candidates[cell] = digitBit(digit)
  for (const peer of peersOf(board.size)[cell]) board.candidates[peer] &= ~digitBit(digit)
}

/** A height that has to go in a cell. */
interface Single {
  kind: 'single'
  reason: 'naked-single' | 'hidden-single'
  cell: number
  digit: number
  /** For a hidden single, the row or column it hides in. */
  line?: number
}

/** Heights ruled out of cells by one row or column's clues. */
interface Elimination {
  kind: 'elimination'
  technique: 'edge' | 'line'
  line: number
  eliminations: { cell: number; digit: number }[]
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

/** The candidates among `targets` that are really there, as a step; null if none are. */
function eliminate(board: Board, technique: Elimination['technique'], line: number, targets: { cell: number; digit: number }[]): Elimination | null {
  const eliminations = targets.filter(({ cell, digit }) => !board.values[cell] && board.candidates[cell] & digitBit(digit))
  return eliminations.length ? { kind: 'elimination', technique, line, eliminations } : null
}

/**
 * What a clue says about the cells nearest it: a 1 means the tallest tower is right there, an N
 * means the line climbs 1, 2, 3… from that side, and otherwise a tower close to the clue can't be
 * so tall that too few towers would be left to see.
 */
function findEdge(board: Board): Elimination | null {
  const { size, clues } = board
  for (const [line, cells] of linesOf(size).entries()) {
    const { start, end } = lineClues(size, line, clues)
    for (const [clue, ordered] of [
      [start, cells],
      [end, [...cells].reverse()],
    ] as const) {
      if (!clue) continue
      const targets: { cell: number; digit: number }[] = []
      ordered.forEach((cell, distance) => {
        for (let digit = 1; digit <= size; digit++) {
          const tooTall = digit > size - clue + 1 + distance
          const offLadder = clue === size && digit !== distance + 1
          if (tooTall || offLadder) targets.push({ cell, digit })
        }
      })
      const step = eliminate(board, 'edge', line, targets)
      if (step) return step
    }
  }
  return null
}

/** For one row or column: how many orders of heights fit its clues and candidates, and what each cell holds in them. */
function lineOptions(board: Board, line: number) {
  const { size, clues, candidates } = board
  const cells = linesOf(size)[line]
  const { start, end } = lineClues(size, line, clues)
  const possible = new Array<number>(size).fill(0)
  let count = 0
  for (const { heights, front, back } of permutations(size)) {
    if ((start && front !== start) || (end && back !== end)) continue
    if (!heights.every((height, i) => candidates[cells[i]] & digitBit(height))) continue
    count++
    heights.forEach((height, i) => (possible[i] |= digitBit(height)))
  }
  return { cells, possible, count }
}

/** Rules out heights that no order of a line matching both its clues puts in that cell. */
function findLine(board: Board): Elimination | null | 'contradiction' {
  for (let line = 0; line < 2 * board.size; line++) {
    const { cells, possible, count } = lineOptions(board, line)
    if (!count) return 'contradiction'
    const targets = cells.flatMap((cell, i) => digitsIn(board.candidates[cell] & ~possible[i]).map((digit) => ({ cell, digit })))
    const step = eliminate(board, 'line', line, targets)
    if (step) return step
  }
  return null
}

function findElimination(board: Board, hardest: Technique): Elimination | null | 'contradiction' {
  if (hardest === 'singles') return null
  const edge = findEdge(board)
  if (edge || hardest === 'edge') return edge
  return findLine(board)
}

function applyStep(board: Board, step: Step) {
  if (step.kind === 'single') place(board, step.cell, step.digit)
  else for (const { cell, digit } of step.eliminations) board.candidates[cell] &= ~digitBit(digit)
}

const broken = (board: Board) => board.candidates.some((mask, cell) => !mask || (board.values[cell] && mask !== digitBit(board.values[cell])))

const matchesClues = (size: number, clues: readonly number[], grid: readonly number[]) => {
  const full = cluesOf(size, grid)
  return clues.every((clue, i) => !clue || clue === full[i])
}

/** Solves with techniques up to `hardest`; says whether it got there and what it needed. */
export function solveLogically(size: number, clues: readonly number[], givens: readonly number[], hardest: Technique = 'line') {
  const board = boardOf(size, clues, givens)
  let needed: Technique = 'singles'
  for (;;) {
    if (broken(board)) return { solved: false, needed }
    if (!board.values.includes(0)) return { solved: matchesClues(size, clues, board.values), needed }
    const step = findSingle(board) ?? findElimination(board, hardest)
    if (!step || step === 'contradiction') return { solved: false, needed }
    if (TECHNIQUES.indexOf(techniqueOf(step)) > TECHNIQUES.indexOf(needed)) needed = techniqueOf(step)
    applyStep(board, step)
  }
}

/** Up to `limit` solutions, by search with the line rule applied at every step. */
export function findSolutions(size: number, clues: readonly number[], givens: readonly number[], limit = 2): number[][] {
  const found: number[][] = []
  const visit = (board: Board): boolean => {
    for (;;) {
      if (broken(board)) return false
      const step = findSingle(board) ?? findLine(board)
      if (step === 'contradiction') return false
      if (!step) break
      applyStep(board, step)
    }
    let pick = -1
    for (let cell = 0; cell < board.values.length; cell++) {
      if (!board.values[cell] && (pick < 0 || bitCount(board.candidates[cell]) < bitCount(board.candidates[pick]))) pick = cell
    }
    if (pick < 0) {
      if (!matchesClues(size, clues, board.values)) return false
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
  visit(boardOf(size, clues, givens))
  return found
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  clues: number[]
  givens: number[]
  solution: number[]
}

/**
 * A new puzzle: a random grid with all its clues (plus the odd given height where the clues alone
 * allow more than one grid), then clues and givens removed for as long as the puzzle keeps exactly
 * one solution that the level's techniques reach.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { size, hardest } = level
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 30; attempt++) {
    const solution = randomLatinSquare(size, random)
    const clues = cluesOf(size, solution)
    const givens = new Array<number>(size * size).fill(0)
    for (let guard = 0; guard < size * size; guard++) {
      const solutions = findSolutions(size, clues, givens, 2)
      if (solutions.length < 2) break
      const differ = solutions[0].findIndex((value, cell) => value !== solutions[1][cell])
      givens[differ] = solution[differ]
    }
    const works = () => findSolutions(size, clues, givens, 2).length === 1 && solveLogically(size, clues, givens, hardest).solved
    if (!works()) continue
    let clueCount = clues.length
    const items: ({ clue: number } | { cell: number })[] = [
      ...clues.map((_, clue) => ({ clue })),
      ...givens.flatMap((value, cell) => (value ? [{ cell }] : [])),
    ]
    for (const item of shuffle(items, random)) {
      if ('clue' in item) {
        if (clueCount <= level.minClues) continue
        const kept = clues[item.clue]
        clues[item.clue] = 0
        if (works()) clueCount--
        else clues[item.clue] = kept
      } else {
        const kept = givens[item.cell]
        givens[item.cell] = 0
        if (!works()) givens[item.cell] = kept
      }
    }
    const puzzle = { clues, givens, solution }
    fallback ??= puzzle
    const { needed } = solveLogically(size, clues, givens, hardest)
    if (!level.needs || TECHNIQUES.indexOf(needed) >= TECHNIQUES.indexOf(level.needs)) return puzzle
  }
  return fallback!
}

// ———————————————————————————————————————— Hints

export type HintReason =
  /** Its row and column hold every other height. */
  | 'naked-single'
  /** The height fits in only one cell of a row or column. */
  | 'hidden-single'
  /** A clue of 1 sees only the nearest tower, so that one is the tallest. */
  | 'clue-one'
  /** A clue of N sees every tower, so they climb 1, 2, 3… away from it. */
  | 'clue-full'
  /** A single once towers too tall to stand that close to a clue are ruled out. */
  | 'edge-single'
  /** Every order of one row or column that fits its clues puts this height here. */
  | 'line'
  /** It takes working out which heights fit in other rows or columns first. */
  | 'deeper'

export type Hint =
  | { kind: 'wrong'; cell: number; digit: number }
  | {
      kind: 'place'
      cell: number
      digit: number
      reason: HintReason
      /** The row or column (rows first, then columns) the reasoning is about. */
      line?: number
      /** For a clue of 1 or N: the side its clue is on. */
      side?: Side
      /** For 'deeper': the rows and columns to work out first. */
      lines?: number[]
    }

/** A cell that one line's orders settle, from the line with the fewest orders to think through. */
function findLinePlacement(board: Board, skip = -1) {
  let best: { cell: number; digit: number; line: number; count: number } | null = null
  for (let line = 0; line < 2 * board.size; line++) {
    const { start, end } = lineClues(board.size, line, board.clues)
    if (line === skip || (!start && !end)) continue
    const { cells, possible, count } = lineOptions(board, line)
    if (best && count >= best.count) continue
    const spot = cells.findIndex((cell, i) => !board.values[cell] && bitCount(possible[i]) === 1)
    if (spot >= 0) best = { cell: cells[spot], digit: digitsIn(possible[spot])[0], line, count }
  }
  return best
}

/**
 * What to do next: fix a wrong height if there is one, otherwise the next height to place, with
 * the simplest reasoning that finds one. When logic runs dry (which generated puzzles never allow),
 * the solution supplies one.
 */
export function findHint(size: number, clues: readonly number[], values: readonly number[], solution: readonly number[]): Hint | null {
  const wrong = values.findIndex((value, cell) => value !== 0 && value !== solution[cell])
  if (wrong >= 0) return { kind: 'wrong', cell: wrong, digit: values[wrong] }
  if (!values.includes(0)) return null
  const board = boardOf(size, clues, values)

  const single = findSingle(board)
  if (single) return { kind: 'place', cell: single.cell, digit: single.digit, reason: single.reason, line: single.line }

  // What a clue of 1 or N says outright.
  for (const [line, cells] of linesOf(size).entries()) {
    const { start, end } = lineClues(size, line, clues)
    const sides = sidesOf(size, line)
    for (const [clue, ordered, side] of [
      [start, cells, sides[0]],
      [end, [...cells].reverse(), sides[1]],
    ] as const) {
      if (clue === 1 && !values[ordered[0]]) return { kind: 'place', cell: ordered[0], digit: size, reason: 'clue-one', line, side }
      const spot = clue === size ? ordered.findIndex((cell) => !values[cell]) : -1
      if (spot >= 0) return { kind: 'place', cell: ordered[spot], digit: spot + 1, reason: 'clue-full', line, side }
    }
  }

  const edged = copyBoard(board)
  for (let step = findEdge(edged); step; step = findEdge(edged)) applyStep(edged, step)
  const edgeSingle = findSingle(edged)
  if (edgeSingle) return { kind: 'place', cell: edgeSingle.cell, digit: edgeSingle.digit, reason: 'edge-single', line: edgeSingle.line }

  const settled = findLinePlacement(board)
  if (settled) return { kind: 'place', cell: settled.cell, digit: settled.digit, reason: 'line', line: settled.line }

  // Two lines: what one rules out lets a single or another line settle a cell.
  for (let first = 0; first < 2 * size; first++) {
    const { start, end } = lineClues(size, first, clues)
    if (!start && !end) continue
    const trial = copyBoard(board)
    const { cells, possible } = lineOptions(trial, first)
    cells.forEach((cell, i) => (trial.candidates[cell] &= possible[i]))
    const next = findSingle(trial) ?? findLinePlacement(trial, first)
    if (next) return { kind: 'place', cell: next.cell, digit: next.digit, reason: 'deeper', line: next.line, lines: [first] }
  }

  // Otherwise as many lines as it takes.
  const deep = copyBoard(board)
  const lines: number[] = []
  for (let guard = 0; guard < 400; guard++) {
    const next = findSingle(deep)
    if (next) return { kind: 'place', cell: next.cell, digit: next.digit, reason: 'deeper', line: next.line, lines }
    const step = findElimination(deep, 'line')
    if (!step || step === 'contradiction') break
    applyStep(deep, step)
    if (!lines.includes(step.line)) lines.push(step.line)
  }
  const empty = values.indexOf(0)
  return { kind: 'place', cell: empty, digit: solution[empty], reason: 'deeper', lines: [] }
}
