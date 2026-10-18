import { describe, expect, it } from 'vitest'
import { isLatinConsistent } from '../latin/latin'
import {
  cageIndex,
  cageLabel,
  cageValue,
  findHint,
  findSolutions,
  generatePuzzle,
  isConnected,
  LEVEL_IDS,
  LEVELS,
  meetsCages,
  solveLogically,
  type Cage,
  type HintReason,
} from './calcudoku'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

const blank = (size: number) => new Array<number>(size * size).fill(0)

describe('cages', () => {
  it('works out what digits make', () => {
    expect(cageValue('+', [1, 2, 4])).toBe(7)
    expect(cageValue('*', [2, 3, 2])).toBe(12)
    expect(cageValue('-', [1, 4])).toBe(3)
    expect(cageValue('-', [4, 1])).toBe(3)
    expect(cageValue('/', [2, 6])).toBe(3)
    expect(cageValue('/', [4, 6])).toBeNull()
    expect(cageValue('=', [5])).toBe(5)
  })

  it('labels cages with their signs', () => {
    expect(cageLabel({ cells: [0, 1], op: '*', target: 12 })).toBe('12×')
    expect(cageLabel({ cells: [0, 1], op: '-', target: 3 })).toBe('3−')
    expect(cageLabel({ cells: [0, 1], op: '/', target: 2 })).toBe('2÷')
    expect(cageLabel({ cells: [0], op: '=', target: 4 })).toBe('4')
  })

  it('checks that cages are in one piece', () => {
    expect(isConnected(4, [0, 1, 5])).toBe(true)
    expect(isConnected(4, [0, 5])).toBe(false)
    expect(isConnected(4, [3, 4])).toBe(false)
  })
})

describe('solving', () => {
  it('counts solutions the same way as brute force', () => {
    const squares = allSquares()
    expect(squares).toHaveLength(576)
    const random = seededRandom(21)
    for (let trial = 0; trial < 12; trial++) {
      const { cages, solution } = generatePuzzle(LEVELS.easy, random)
      // Every other time, turn differences into sums, which often lets in more solutions.
      const looser = cages.map((cage): Cage => {
        if (trial % 2 === 0 || cage.op !== '-') return cage
        return { ...cage, op: '+', target: cageValue('+', cage.cells.map((cell) => solution[cell]))! }
      })
      const matching = squares.filter((square) => meetsCages(looser, square))
      expect(matching).toContainEqual(solution)
      expect(findSolutions(4, looser, blank(4), 1000).length).toBe(matching.length)
    }
  })
})

describe('generatePuzzle', () => {
  for (const id of LEVEL_IDS) {
    it(`makes ${id} puzzles with one solution that logic reaches`, () => {
      const level = LEVELS[id]
      const random = seededRandom(id.length * 13)
      for (let i = 0; i < 3; i++) {
        const { cages, solution } = generatePuzzle(level, random)
        const { size } = level
        expect(isLatinConsistent(size, solution)).toBe(true)
        expect(cageIndex(size, cages).every((index) => index >= 0)).toBe(true)
        expect(cages.reduce((count, cage) => count + cage.cells.length, 0)).toBe(size * size)
        for (const cage of cages) {
          expect(isConnected(size, cage.cells)).toBe(true)
          expect(cage.cells.length).toBeLessThanOrEqual(level.maxCage)
          expect(cage.op === '=' || level.ops.includes(cage.op)).toBe(true)
          expect(cage.op === '=').toBe(cage.cells.length === 1)
        }
        expect(cages.filter((cage) => cage.op === '=').length).toBeLessThanOrEqual(level.maxSingles)
        expect(meetsCages(cages, solution)).toBe(true)
        expect(findSolutions(size, cages, blank(size), 2)).toEqual([solution])
        expect(solveLogically(size, cages, blank(size), level.hardest).solved).toBe(true)
        if (level.needs === 'subsets') expect(solveLogically(size, cages, blank(size), 'cage').solved).toBe(false)
      }
    })
  }
})

describe('findHint', () => {
  const puzzle = generatePuzzle(LEVELS.easy, seededRandom(4))

  it('points out a wrong digit first', () => {
    const values = blank(4)
    values[5] = (puzzle.solution[5] % 4) + 1
    expect(findHint(4, puzzle.cages, values, puzzle.solution)).toEqual({ kind: 'wrong', cell: 5, digit: values[5] })
  })

  it('starts with a cage of one cell', () => {
    const cages: Cage[] = puzzle.solution.map((digit, cell) => ({ cells: [cell], op: '=', target: digit }))
    expect(findHint(4, cages, blank(4), puzzle.solution)).toMatchObject({ kind: 'place', cell: 0, digit: puzzle.solution[0], reason: 'given' })
  })

  it('leads all the way through puzzles of every level', () => {
    const reasons = new Set<HintReason>()
    for (const id of LEVEL_IDS) {
      const level = LEVELS[id]
      const random = seededRandom(200 + id.length)
      for (let i = 0; i < 3; i++) {
        const { cages, solution } = generatePuzzle(level, random)
        const values = blank(level.size)
        while (values.includes(0)) {
          const hint = findHint(level.size, cages, values, solution)
          if (hint?.kind !== 'place') throw new Error('no hint')
          expect(hint.digit).toBe(solution[hint.cell])
          expect(values[hint.cell]).toBe(0)
          reasons.add(hint.reason)
          values[hint.cell] = hint.digit
        }
        expect(findHint(level.size, cages, values, solution)).toBeNull()
      }
    }
    expect(reasons).toContain('cage')
    expect(reasons).toContain('hidden-single')
  })
})
