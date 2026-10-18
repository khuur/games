import { describe, expect, it } from 'vitest'
import {
  bitCount,
  countSolutions,
  digitsIn,
  findHint,
  generatePuzzle,
  isConsistent,
  LEVELS,
  nextPlacement,
  PEERS,
  randomSolution,
  solve,
  solveLogically,
  UNITS,
  unitKind,
} from './sudoku'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const grid = (text: string) => [...text.replace(/\s/g, '')].map((char) => (char === '.' ? 0 : Number(char)))

/** A well-known puzzle that singles alone solve. */
const EASY = grid(`
  53..7....
  6..195...
  .98....6.
  8...6...3
  4..8.3..1
  7...2...6
  .6....28.
  ...419..5
  ....8..79`)

const EASY_SOLUTION = grid(`
  534678912
  672195348
  198342567
  859761423
  426853791
  713924856
  961537284
  287419635
  345286179`)

describe('the grid', () => {
  it('has 27 units of 9 and 20 peers per cell', () => {
    expect(UNITS).toHaveLength(27)
    expect(UNITS.every((unit) => new Set(unit).size === 9)).toBe(true)
    expect(PEERS.every((peers) => peers.length === 20)).toBe(true)
    expect(UNITS[18]).toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20])
    expect([unitKind(3), unitKind(12), unitKind(20)]).toEqual(['row', 'column', 'box'])
  })

  it('works with digit masks', () => {
    expect(digitsIn(0b101000001)).toEqual([1, 7, 9])
    expect(bitCount(0b111)).toBe(3)
  })

  it('spots broken rules', () => {
    expect(isConsistent(EASY_SOLUTION)).toBe(true)
    const broken = EASY.slice()
    broken[2] = 5
    expect(isConsistent(broken)).toBe(false)
  })
})

describe('fast solving', () => {
  it('solves a puzzle and finds it unique', () => {
    expect(solve(EASY)).toEqual(EASY_SOLUTION)
    expect(countSolutions(EASY)).toBe(1)
  })

  it('notices more than one solution, or none', () => {
    expect(countSolutions(new Array<number>(81).fill(0))).toBe(2)
    expect(countSolutions(new Array<number>(81).fill(0), 5)).toBe(5)
    const impossible = EASY.slice()
    impossible[2] = 1
    impossible[3] = 2
    impossible[5] = 3
    impossible[6] = 4
    impossible[7] = 6
    impossible[8] = 8
    impossible[11] = 9
    expect(countSolutions(impossible)).toBe(0)
  })

  it('makes valid random grids', () => {
    const random = seededRandom(1)
    for (let i = 0; i < 20; i++) {
      const full = randomSolution(random)
      expect(full.every((digit) => digit >= 1 && digit <= 9)).toBe(true)
      expect(isConsistent(full)).toBe(true)
    }
  })
})

describe('solving like a person', () => {
  it('solves an easy puzzle with singles alone', () => {
    expect(solveLogically(EASY, false)).toEqual({ solved: true, usedAdvanced: false })
  })

  it('only ever places right digits', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      const { givens, solution } = generatePuzzle(level, random)
      const values = givens.slice()
      for (let guard = 0; guard < 81 && values.includes(0); guard++) {
        const next = nextPlacement(values)!
        expect(next).not.toBeNull()
        expect(solution[next.step.cell!]).toBe(next.step.digit)
        values[next.step.cell!] = next.step.digit!
      }
      expect(values).toEqual(solution)
    }
  })
})

describe('generatePuzzle', () => {
  it('makes unique puzzles that logic can solve, graded by level', () => {
    const random = seededRandom(3)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 6; i++) {
        const { givens, solution } = generatePuzzle(level, random)
        expect(isConsistent(solution) && solution.every(Boolean)).toBe(true)
        expect(givens.every((digit, cell) => !digit || digit === solution[cell])).toBe(true)
        expect(countSolutions(givens)).toBe(1)
        expect(solveLogically(givens, true).solved).toBe(true)
        // Puzzles are symmetric under a half turn.
        expect(givens.every((digit, cell) => Boolean(digit) === Boolean(givens[80 - cell]))).toBe(true)
        if (level.id === 'easy') expect(givens.filter(Boolean).length).toBeGreaterThanOrEqual(level.minClues)
        if (level.advanced) expect(solveLogically(givens, false).solved).toBe(false)
        else expect(solveLogically(givens, false).solved).toBe(true)
      }
    }
  })
})

describe('findHint', () => {
  it('points out a wrong digit first', () => {
    const values = EASY.slice()
    values[2] = 1
    expect(findHint(values, EASY_SOLUTION)).toEqual({ kind: 'wrong', cell: 2, digit: 1 })
  })

  it('names the next digit and how to find it', () => {
    const hint = findHint(EASY, EASY_SOLUTION)!
    expect(hint.kind).toBe('place')
    if (hint.kind !== 'place') return
    expect(EASY_SOLUTION[hint.cell]).toBe(hint.digit)
    expect(['hidden-single', 'naked-single']).toContain(hint.technique)
    expect(hint.patterns).toEqual([])
  })

  it('mentions the patterns a hard puzzle needs', () => {
    const random = seededRandom(4)
    const { givens, solution } = generatePuzzle(LEVELS.hard, random)
    const values = givens.slice()
    let sawPattern = false
    for (let guard = 0; guard < 81 && values.includes(0); guard++) {
      const hint = findHint(values, solution)!
      expect(hint.kind).toBe('place')
      if (hint.kind !== 'place') return
      expect(solution[hint.cell]).toBe(hint.digit)
      if (hint.patterns.length) sawPattern = true
      values[hint.cell] = hint.digit
    }
    expect(sawPattern).toBe(true)
  })
})
