import { describe, expect, it } from 'vitest'
import {
  BLANK,
  CROSS,
  findHint,
  findSolutions,
  generatePuzzle,
  LEVEL_IDS,
  LEVELS,
  neighboursOf,
  regionsConnected,
  ruledOutBy,
  solveLogically,
  STAR,
  STARS,
  touching,
  unitsOf,
  type Mark,
  type Technique,
} from './starBattle'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const free = (size: number) => new Array<number>(size * size).fill(-1)

/** Whether stars fill every unit with two. */
const fillsUnits = (size: number, regions: number[], stars: number[]) =>
  unitsOf(size, regions).every((unit) => unit.filter((cell) => stars.includes(cell)).length === STARS)

describe('rules', () => {
  it('knows which cells touch', () => {
    expect(touching(0, 10, 9)).toBe(true)
    expect(touching(0, 2, 9)).toBe(false)
    expect(touching(8, 9, 9)).toBe(false)
    expect(neighboursOf(0, 9).sort((a, b) => a - b)).toEqual([1, 9, 10])
    expect(neighboursOf(40, 9)).toHaveLength(8)
  })

  it('rules out the cells around stars, and units that have their two', () => {
    const regions = Array.from({ length: 81 }, (_, cell) => Math.floor((cell % 9) / 3) + 3 * Math.floor(cell / 27))
    // Two stars in row 1: the rest of the row is out, and so is everything touching them.
    const out = ruledOutBy([0, 4], 9, regions)
    expect(out.has(8)).toBe(true)
    expect(out.has(9)).toBe(true)
    expect(out.has(13)).toBe(true)
    expect(out.has(18)).toBe(false)
    expect(out.has(0)).toBe(false)
  })
})

describe('findSolutions', () => {
  it('counts every placement without regions', () => {
    // Two stars a row and column, none touching: only two ways on 8 × 8, and 664 on 9 × 9.
    expect(findSolutions(8, free(8), 100)).toHaveLength(2)
    const all = findSolutions(9, free(9), 1000)
    expect(all).toHaveLength(664)
    for (const stars of all.slice(0, 20)) {
      expect(stars.every((a, i) => stars.every((b, j) => i === j || !touching(a, b, 9)))).toBe(true)
    }
  })

  it('agrees with brute force once regions count', () => {
    const all = findSolutions(9, free(9), 1000)
    const random = seededRandom(31)
    for (let trial = 0; trial < 6; trial++) {
      const { regions } = generatePuzzle(LEVELS.easy, random)
      // Shuffle a few cells between regions so that some maps allow several solutions, or none.
      const changed = regions.slice()
      for (let i = 0; i < trial * 2; i++) changed[Math.floor(random() * 81)] = Math.floor(random() * 9)
      const matching = all.filter((stars) => fillsUnits(9, changed, stars))
      expect(findSolutions(9, changed, 1000)).toHaveLength(matching.length)
    }
  })
})

describe('generatePuzzle', () => {
  for (const id of LEVEL_IDS) {
    it(`makes ${id} puzzles with one solution that logic reaches`, () => {
      const level = LEVELS[id]
      const random = seededRandom(id.length * 17)
      for (let i = 0; i < 2; i++) {
        const { regions, solution } = generatePuzzle(level, random)
        const { size } = level
        expect(regions.every((region) => region >= 0 && region < size)).toBe(true)
        expect(regionsConnected(size, regions)).toBe(true)
        expect(fillsUnits(size, regions, solution)).toBe(true)
        expect(findSolutions(size, regions, 2)).toEqual([solution])
        expect(solveLogically(size, regions, level.hardest).solved).toBe(true)
        if (level.needs) expect(solveLogically(size, regions, 'unit').solved).toBe(false)
      }
    })
  }
})

describe('findHint', () => {
  const puzzle = generatePuzzle(LEVELS.easy, seededRandom(5))
  const blank = () => new Array<Mark>(81).fill(BLANK)

  it('takes back crosses on stars first', () => {
    const marks = blank()
    marks[puzzle.solution[0]] = CROSS
    expect(findHint(9, puzzle.regions, puzzle.solution, marks)).toEqual({ kind: 'wrong-cross', cells: [puzzle.solution[0]] })
  })

  it('leads all the way through puzzles of every level', () => {
    const techniques = new Set<Technique>()
    for (const id of LEVEL_IDS) {
      const level = LEVELS[id]
      const { regions, solution } = generatePuzzle(level, seededRandom(300 + id.length))
      const marks = new Array<Mark>(level.size * level.size).fill(BLANK)
      for (let guard = 0; guard < 500 && !solution.every((cell) => marks[cell] === STAR); guard++) {
        const hint = findHint(level.size, regions, solution, marks)
        if (hint?.kind !== 'step') throw new Error('no step')
        const { star, eliminate = [], technique } = hint.step
        techniques.add(technique)
        if (star !== undefined) {
          expect(solution).toContain(star)
          marks[star] = STAR
        }
        for (const cell of eliminate) {
          expect(solution).not.toContain(cell)
          marks[cell] = CROSS
        }
        expect(star !== undefined || eliminate.length > 0).toBe(true)
      }
      expect(solution.every((cell) => marks[cell] === STAR)).toBe(true)
    }
    expect(techniques).toContain('only-spots')
    expect(techniques).toContain('unit')
    expect(techniques).toContain('confined')
  })
})
