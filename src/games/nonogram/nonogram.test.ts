import { describe, expect, it } from 'vitest'
import {
  cluesOf,
  EMPTY,
  FILLED,
  generatePuzzle,
  isGoodPuzzle,
  lineCells,
  LEVELS,
  nextLineStep,
  runsOf,
  solveByLines,
  solveLine,
  UNKNOWN,
  type CellState,
  type LevelDefinition,
} from './nonogram'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const line = (text: string) => [...text].map((char) => (char === '#' ? FILLED : char === 'x' ? EMPTY : UNKNOWN)) as CellState[]
const show = (cells: CellState[] | null) => cells && cells.map((cell) => (cell === FILLED ? '#' : cell === EMPTY ? 'x' : '.')).join('')

/** Every way to lay out a clue in a line that agrees with what is known, by brute force. */
function arrangements(clue: number[], cells: CellState[]): boolean[][] {
  const found: boolean[][] = []
  const n = cells.length
  for (let mask = 0; mask < 1 << n; mask++) {
    const filled = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)))
    if (runsOf(filled).join() !== clue.join()) continue
    if (filled.some((on, i) => (cells[i] === FILLED && !on) || (cells[i] === EMPTY && on))) continue
    found.push(filled)
  }
  return found
}

describe('lines', () => {
  it('reads runs and clues', () => {
    expect(runsOf([true, true, false, true, false, false, true])).toEqual([2, 1, 1])
    expect(runsOf([false, false])).toEqual([])
    const level: LevelDefinition = { ...LEVELS.easy, columns: 3, rows: 2 }
    expect(lineCells(level, 1)).toEqual([3, 4, 5])
    expect(lineCells(level, 3)).toEqual([1, 4])
    expect(cluesOf(level, [true, false, true, true, true, false])).toEqual([[1, 1], [2], [2], [1], [1]])
  })

  it('finds the overlap of a long run', () => {
    expect(show(solveLine([7], line('..........')))).toBe('...####...')
    expect(show(solveLine([3, 2], line('......')))).toBe('###x##')
  })

  it('uses what is already known', () => {
    expect(show(solveLine([1], line('#....')))).toBe('#xxxx')
    expect(show(solveLine([2], line('x.#..')))).toBe('x.#.x')
    expect(show(solveLine([1, 1], line('.x.x.')))).toBe('.x.x.')
    expect(solveLine([3], line('.x.x.'))).toBeNull()
    expect(show(solveLine([], line('....')))).toBe('xxxx')
  })

  it('agrees with brute force on random lines', () => {
    const random = seededRandom(1)
    for (let trial = 0; trial < 3000; trial++) {
      const n = 1 + Math.floor(random() * 10)
      const truth = Array.from({ length: n }, () => random() < 0.55)
      const clue = runsOf(truth)
      // Reveal some cells; sometimes lie about one, to test lines that can't be solved.
      const cells = truth.map((on) => (random() < 0.3 ? (on ? FILLED : EMPTY) : UNKNOWN)) as CellState[]
      if (random() < 0.15) {
        const i = Math.floor(random() * n)
        cells[i] = cells[i] === FILLED ? EMPTY : FILLED
      }
      const all = arrangements(clue, cells)
      const solved = solveLine(clue, cells)
      if (!all.length) {
        expect(solved).toBeNull()
        continue
      }
      const expected = cells.map((cell, i) => {
        if (all.every((filled) => filled[i])) return FILLED
        if (all.every((filled) => !filled[i])) return EMPTY
        return cell
      })
      expect(solved).toEqual(expected)
    }
  })
})

describe('solving whole puzzles', () => {
  it('solves a small picture line by line', () => {
    const level: LevelDefinition = { ...LEVELS.easy, columns: 5, rows: 5 }
    // A plus sign.
    const picture = [...'..#....#..#####..#....#..'].map((char) => char === '#')
    const result = solveByLines(level, cluesOf(level, picture))
    expect(result.solved).toBe(true)
    expect(result.grid.map((cell) => cell === FILLED)).toEqual(picture)
  })

  it('stops where line logic runs out', () => {
    // A 2×2 checkerboard has two solutions, so no line can decide anything.
    const level: LevelDefinition = { ...LEVELS.easy, columns: 2, rows: 2 }
    const clues = cluesOf(level, [true, false, false, true])
    expect(solveByLines(level, clues).solved).toBe(false)
    expect(nextLineStep(level, clues, new Array<CellState>(4).fill(UNKNOWN))).toBeNull()
  })

  it('names the line that settles the most cells next', () => {
    const level: LevelDefinition = { ...LEVELS.easy, columns: 5, rows: 5 }
    const picture = [...'#####.......#..........'.padEnd(25, '.')].map((char) => char === '#')
    const step = nextLineStep(level, cluesOf(level, picture), new Array<CellState>(25).fill(UNKNOWN))
    expect(step).not.toBe('contradiction')
    if (!step || step === 'contradiction') return
    expect(step.line).toBe(0)
    expect(step.cells).toEqual([0, 1, 2, 3, 4])
    expect(step.states.every((state) => state === FILLED)).toBe(true)
  })

  it('notices a broken position', () => {
    const level: LevelDefinition = { ...LEVELS.easy, columns: 2, rows: 2 }
    const clues = cluesOf(level, [true, true, true, true])
    expect(nextLineStep(level, clues, [EMPTY, UNKNOWN, UNKNOWN, UNKNOWN])).toBe('contradiction')
  })
})

describe('generatePuzzle', () => {
  it('makes pictures that line logic solves alone', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 15; i++) {
        const picture = generatePuzzle(level, random)
        expect(picture).toHaveLength(level.columns * level.rows)
        expect(isGoodPuzzle(level, picture)).toBe(true)
        const result = solveByLines(level, cluesOf(level, picture))
        expect(result.grid.map((cell) => cell === FILLED)).toEqual(picture)
      }
    }
  })
})
