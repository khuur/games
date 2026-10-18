import { describe, expect, it } from 'vitest'
import { isLatinConsistent } from '../latin/latin'
import {
  cluesOf,
  findHint,
  findSolutions,
  generatePuzzle,
  LEVEL_IDS,
  LEVELS,
  lineClues,
  solveLogically,
  visible,
  type HintReason,
} from './skyscrapers'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// prettier-ignore
const SOLUTION = [
  1, 2, 3, 4,
  3, 4, 1, 2,
  2, 1, 4, 3,
  4, 3, 2, 1,
]
const EMPTY = new Array<number>(16).fill(0)
const onlyClue = (index: number) => cluesOf(4, SOLUTION).map((clue, i) => (i === index ? clue : 0))

/** Every 4 × 4 Latin square: there are 576. */
function allSquares(): number[][] {
  const found: number[][] = []
  const cells = new Array<number>(16).fill(0)
  const visit = (cell: number) => {
    if (cell === 16) {
      found.push(cells.slice())
      return
    }
    for (let digit = 1; digit <= 4; digit++) {
      cells[cell] = digit
      if (isLatinConsistent(4, cells.map((value, i) => (i <= cell ? value : 0)))) visit(cell + 1)
    }
    cells[cell] = 0
  }
  visit(0)
  return found
}

describe('clues', () => {
  it('counts the towers in view', () => {
    expect(visible([1, 2, 3, 4])).toBe(4)
    expect(visible([4, 3, 2, 1])).toBe(1)
    expect(visible([2, 4, 1, 3])).toBe(2)
    expect(visible([3, 1, 2, 5, 4])).toBe(2)
  })

  it('reads the clues all around a grid', () => {
    // Top (left to right), right (top to bottom), bottom (left to right), left (top to bottom).
    expect(cluesOf(4, SOLUTION)).toEqual([3, 2, 2, 1, 1, 2, 2, 4, 1, 2, 2, 3, 4, 2, 2, 1])
    const clues = cluesOf(4, SOLUTION)
    expect(lineClues(4, 0, clues)).toEqual({ start: 4, end: 1 })
    expect(lineClues(4, 4, clues)).toEqual({ start: 3, end: 1 })
    expect(lineClues(4, 7, clues)).toEqual({ start: 1, end: 3 })
  })
})

describe('solving', () => {
  it('counts solutions the same way as brute force', () => {
    const squares = allSquares()
    expect(squares).toHaveLength(576)
    const random = seededRandom(11)
    for (let trial = 0; trial < 12; trial++) {
      const puzzle = generatePuzzle(LEVELS.easy, random)
      // Take away a few more clues so that some puzzles have several solutions.
      const clues = puzzle.clues.map((clue, i) => (trial % 2 && i % 3 === 0 ? 0 : clue))
      const matching = squares.filter(
        (square) =>
          puzzle.givens.every((digit, cell) => !digit || digit === square[cell]) &&
          cluesOf(4, square).every((clue, i) => !clues[i] || clue === clues[i]),
      )
      const found = findSolutions(4, clues, puzzle.givens, 1000)
      expect(found.length).toBe(matching.length)
    }
  })

  it('finds the one grid the clues allow', () => {
    const found = findSolutions(4, cluesOf(4, SOLUTION), EMPTY, 3)
    expect(found).toContainEqual(SOLUTION)
    for (const grid of found) expect(cluesOf(4, grid)).toEqual(cluesOf(4, SOLUTION))
  })
})

describe('generatePuzzle', () => {
  for (const id of LEVEL_IDS) {
    it(`makes ${id} puzzles with one solution that logic reaches`, () => {
      const level = LEVELS[id]
      const random = seededRandom(id.length * 7)
      for (let i = 0; i < 3; i++) {
        const { clues, givens, solution } = generatePuzzle(level, random)
        expect(isLatinConsistent(level.size, solution)).toBe(true)
        const full = cluesOf(level.size, solution)
        expect(clues.every((clue, index) => !clue || clue === full[index])).toBe(true)
        expect(givens.every((digit, cell) => !digit || digit === solution[cell])).toBe(true)
        expect(clues.filter(Boolean).length).toBeGreaterThanOrEqual(Math.min(level.minClues, 4 * level.size))
        expect(findSolutions(level.size, clues, givens, 2)).toEqual([solution])
        expect(solveLogically(level.size, clues, givens, level.hardest).solved).toBe(true)
        if (level.needs === 'line') expect(solveLogically(level.size, clues, givens, 'edge').solved).toBe(false)
      }
    })
  }
})

describe('findHint', () => {
  it('points out a wrong height first', () => {
    const values = EMPTY.slice()
    values[5] = 2
    expect(findHint(4, cluesOf(4, SOLUTION), values, SOLUTION)).toEqual({ kind: 'wrong', cell: 5, digit: 2 })
  })

  it('reads a 1 and a full count straight from the clue', () => {
    // The right-hand clue of row 1 is a 1: the tallest tower stands next to it.
    expect(findHint(4, onlyClue(4), EMPTY, SOLUTION)).toMatchObject({ kind: 'place', cell: 3, digit: 4, reason: 'clue-one', side: 'right' })
    // The left-hand clue of row 1 is a 4: the row climbs 1, 2, 3, 4.
    expect(findHint(4, onlyClue(12), EMPTY, SOLUTION)).toMatchObject({ kind: 'place', cell: 0, digit: 1, reason: 'clue-full', side: 'left' })
    const started = EMPTY.slice()
    started[0] = 1
    expect(findHint(4, onlyClue(12), started, SOLUTION)).toMatchObject({ cell: 1, digit: 2, reason: 'clue-full' })
  })

  it('finds a single', () => {
    const values = SOLUTION.slice()
    values[0] = 0
    expect(findHint(4, EMPTY.concat(EMPTY), values, SOLUTION)).toMatchObject({ kind: 'place', cell: 0, digit: 1 })
  })

  it('leads all the way through puzzles of every level', () => {
    const reasons = new Set<HintReason>()
    for (const id of LEVEL_IDS) {
      const level = LEVELS[id]
      const random = seededRandom(100 + id.length)
      for (let i = 0; i < 3; i++) {
        const { clues, givens, solution } = generatePuzzle(level, random)
        const values = givens.slice()
        while (values.includes(0)) {
          const hint = findHint(level.size, clues, values, solution)
          if (hint?.kind !== 'place') throw new Error('no hint')
          expect(hint.digit).toBe(solution[hint.cell])
          expect(values[hint.cell]).toBe(0)
          reasons.add(hint.reason)
          values[hint.cell] = hint.digit
        }
        expect(findHint(level.size, clues, values, solution)).toBeNull()
      }
    }
    expect(reasons).toContain('line')
    expect(reasons).toContain('hidden-single')
  })
})
