import { describe, expect, it } from 'vitest'
import {
  breaksRules,
  EMPTY,
  findHint,
  findSolutions,
  generatePuzzle,
  LEVELS,
  MOON,
  nextStep,
  problemCells,
  solveLogically,
  SUN,
  TECHNIQUES,
  type Cell,
  type Sign,
} from './takuzu'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const grid = (text: string) => [...text.replace(/\s/g, '')].map((char) => (char === 'S' ? SUN : char === 'M' ? MOON : EMPTY)) as Cell[]

/** Every full grid of a small size that follows the rules, the signs and the givens, by brute force. */
function bruteForce(size: number, givens: Cell[], signs: Sign[]): string[] {
  const rows: Cell[][] = []
  for (let mask = 0; mask < 1 << size; mask++) {
    const row = Array.from({ length: size }, (_, i) => ((mask >> i) & 1 ? SUN : MOON)) as Cell[]
    if (!breaksRules(size, [...row, ...new Array<Cell>(size * (size - 1)).fill(EMPTY)], [])) rows.push(row)
  }
  const found: string[] = []
  const build = (chosen: Cell[][]) => {
    if (chosen.length === size) {
      const cells = chosen.flat()
      if (!breaksRules(size, cells, signs) && cells.every((value, cell) => !givens[cell] || givens[cell] === value)) {
        found.push(cells.join(''))
      }
      return
    }
    for (const row of rows) build([...chosen, row])
  }
  build([])
  return found
}

describe('rules', () => {
  it('spots three in a row, unbalanced lines and broken signs', () => {
    expect(breaksRules(4, grid('SSMM MMSS SSMM MMSS'), [])).toBe(false)
    expect(problemCells(4, grid('SSS. .... .... ....'), []).sort((a, b) => a - b)).toEqual([0, 1, 2])
    expect(breaksRules(4, grid('S... S... S... ....'), [])).toBe(true)
    expect(breaksRules(6, grid('SS.S.S ...... ...... ...... ...... ......'), [])).toBe(true)
    expect(breaksRules(4, grid('SM.. .... .... ....'), [{ a: 0, b: 1, same: true }])).toBe(true)
  })
})

describe('reasoning', () => {
  it('uses pairs, sandwiches, signs and counts', () => {
    const pair = nextStep(6, grid('.SS... ...... ...... ...... ...... ......'), [])!
    expect(pair).toMatchObject({ reason: 'pair', cells: [0], values: [MOON] })
    const sandwich = nextStep(6, grid('S.S... ...... ...... ...... ...... ......'), [])!
    expect(sandwich).toMatchObject({ reason: 'sandwich', cells: [1], values: [MOON] })
    const sign = nextStep(6, grid('S..... ...... ...... ...... ...... ......'), [{ a: 0, b: 6, same: false }])!
    expect(sign).toMatchObject({ reason: 'sign', cells: [6], values: [MOON] })
    const count = nextStep(6, grid('SMSMS. ...... ...... ...... ...... ......'), [])!
    expect(count).toMatchObject({ reason: 'count', cells: [5], values: [MOON] })
  })

  it('reasons about a whole line when the basics run out', () => {
    // S . = . . : the = pair can't be suns (three in a row), so it is two moons, and the last
    // cell a sun. No single basic rule sees that.
    const cells = grid('S... .... .... ....')
    const signs = [{ a: 1, b: 2, same: true }]
    expect(nextStep(4, cells, signs, 'basics')).toBeNull()
    expect(nextStep(4, cells, signs, 'line')).toMatchObject({ reason: 'line', cells: [1, 2, 3], values: [MOON, MOON, SUN] })
  })

  it('counts solutions exactly, matching brute force on small grids', () => {
    const random = seededRandom(1)
    for (let trial = 0; trial < 30; trial++) {
      const size = 4
      const givens = Array.from({ length: 16 }, () => (random() < 0.2 ? (random() < 0.5 ? SUN : MOON) : EMPTY)) as Cell[]
      const signs: Sign[] = []
      for (let cell = 0; cell < 16; cell++) {
        if (cell % 4 < 3 && random() < 0.15) signs.push({ a: cell, b: cell + 1, same: random() < 0.5 })
        if (cell < 12 && random() < 0.15) signs.push({ a: cell, b: cell + 4, same: random() < 0.5 })
      }
      const expected = bruteForce(size, givens, signs)
      const found = findSolutions(size, givens, signs, 1000).map((cells) => cells.join(''))
      expect(found.sort()).toEqual(expected.sort())
    }
  })
})

describe('generatePuzzle', () => {
  it('makes puzzles with one solution that logic reaches, graded by level', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 3; i++) {
        const { givens, signs, solution } = generatePuzzle(level, random)
        expect(breaksRules(level.size, solution, signs)).toBe(false)
        expect(solution.includes(EMPTY)).toBe(false)
        expect(givens.every((value, cell) => !value || value === solution[cell])).toBe(true)
        expect(findSolutions(level.size, givens, signs, 2)).toHaveLength(1)
        const { solved, needed } = solveLogically(level.size, givens, signs, level.hardest)
        expect(solved).toBe(true)
        if (level.needs) expect(TECHNIQUES.indexOf(needed)).toBeGreaterThanOrEqual(TECHNIQUES.indexOf(level.needs))
      }
    }
  })

  it('only ever deduces the right symbols', () => {
    const random = seededRandom(3)
    for (const level of Object.values(LEVELS)) {
      const { givens, signs, solution } = generatePuzzle(level, random)
      const cells = givens.slice()
      for (let guard = 0; guard < 200 && cells.includes(EMPTY); guard++) {
        const hint = findHint(level.size, cells, signs, solution)!
        expect(hint.kind).toBe('step')
        if (hint.kind !== 'step') break
        hint.step.cells.forEach((cell, i) => {
          expect(hint.step.values[i]).toBe(solution[cell])
          cells[cell] = hint.step.values[i]
        })
      }
      expect(cells).toEqual(solution)
    }
  })
})

describe('findHint', () => {
  it('points out wrong cells first', () => {
    const { givens, signs, solution } = generatePuzzle(LEVELS.easy, seededRandom(4))
    const cells = givens.slice()
    const blank = cells.indexOf(EMPTY)
    cells[blank] = solution[blank] === SUN ? MOON : SUN
    expect(findHint(6, cells, signs, solution)).toEqual({ kind: 'wrong', cells: [blank] })
  })
})
