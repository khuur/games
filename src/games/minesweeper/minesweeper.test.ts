import { describe, expect, it } from 'vitest'
import {
  boardValue,
  cellCount,
  cellsToOpen,
  countMines,
  deductions,
  findHint,
  generateMines,
  LEVELS,
  neighbours,
  solvesWithoutGuessing,
  type LevelDefinition,
} from './minesweeper'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A board from a picture: "*" is a mine, anything else is safe. */
function board(...rows: string[]) {
  const level: LevelDefinition = {
    id: 'easy',
    name: 'Test',
    columns: rows[0].length,
    rows: rows.length,
    mines: rows.join('').split('*').length - 1,
  }
  const mines = [...rows.join('')].map((cell) => cell === '*')
  return { level, mines, counts: countMines(level, mines) }
}

function randomMines(level: LevelDefinition, random: () => number): boolean[] {
  const mines = new Array<boolean>(cellCount(level)).fill(false)
  let placed = 0
  while (placed < level.mines) {
    const cell = Math.floor(random() * mines.length)
    if (!mines[cell]) {
      mines[cell] = true
      placed++
    }
  }
  return mines
}

/** Every layout of the right number of mines that matches the revealed numbers, by brute force. */
function consistentLayouts(level: LevelDefinition, counts: number[], revealed: boolean[]): boolean[][] {
  const around = neighbours(level)
  const hidden = revealed.flatMap((open, cell) => (open ? [] : [cell]))
  const layouts: boolean[][] = []
  const mines = new Array<boolean>(revealed.length).fill(false)
  const place = (from: number, left: number) => {
    if (left === 0) {
      const fits = revealed.every((open, cell) => !open || around[cell].filter((next) => mines[next]).length === counts[cell])
      if (fits) layouts.push(mines.slice())
      return
    }
    for (let i = from; i <= hidden.length - left; i++) {
      mines[hidden[i]] = true
      place(i + 1, left - 1)
      mines[hidden[i]] = false
    }
  }
  place(0, level.mines)
  return layouts
}

describe('board basics', () => {
  it('knows every cell’s neighbours', () => {
    const around = neighbours(LEVELS.easy)
    expect(around[0].sort((a, b) => a - b)).toEqual([1, 9, 10])
    expect(around[4]).toHaveLength(5)
    expect(around[40]).toHaveLength(8)
  })

  it('counts the mines around each cell', () => {
    const { counts } = board('*..', '...', '..*')
    expect(counts).toEqual([0, 1, 0, 1, 2, 1, 0, 1, 0])
  })

  it('opens empty areas all at once, stopping at numbers and flags', () => {
    const { level, counts } = board('....', '....', '...*', '....')
    const none = new Array<boolean>(16).fill(false)
    const opened = cellsToOpen(level, counts, none, none, 0).sort((a, b) => a - b)
    expect(opened).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14])
    expect(cellsToOpen(level, counts, none, none, 15)).toEqual([15])
    const flags = none.slice()
    flags[5] = true
    expect(cellsToOpen(level, counts, none, flags, 0)).not.toContain(5)
    expect(cellsToOpen(level, counts, none, flags, 5)).toEqual([])
  })

  it('works out the clicks a board takes (3BV)', () => {
    // One empty area that opens everything except the three numbers it can't reach.
    const one = board('....', '....', '...*', '....')
    expect(boardValue(one.level, one.mines, one.counts)).toBe(2)
    const none = board('*.*', '.*.', '*.*')
    expect(boardValue(none.level, none.mines, none.counts)).toBe(4)
  })
})

describe('deductions', () => {
  it('finds what a single number proves', () => {
    const { level, counts } = board('...', '...', '..*')
    const revealed = [true, true, true, true, true, false, true, false, false]
    const [first] = deductions(level, counts, revealed)
    expect(first.rule).toBe('single')
    expect(first.kind).toBe('safe')
  })

  it('uses two numbers together when one is not enough', () => {
    // A 1-2-2-1 along an edge: neither number settles anything alone.
    const { level, mines, counts } = board('.**.', '....')
    const revealed = [false, false, false, false, true, true, true, true]
    const steps = [...deductions(level, counts, revealed)]
    expect(steps[0].rule).toBe('pair')
    for (const step of steps) for (const cell of step.cells) expect(mines[cell]).toBe(step.kind === 'mine')
    expect(new Set(steps.flatMap((step) => step.cells)).size).toBe(4)
  })

  it('is always right, and finds everything that can be proved', () => {
    const random = seededRandom(1)
    const level: LevelDefinition = { id: 'easy', name: 'Small', columns: 5, rows: 4, mines: 4 }
    let checked = 0
    while (checked < 60) {
      const mines = randomMines(level, random)
      const counts = countMines(level, mines)
      // Reveal a few random safe cells, as a player might have.
      const revealed = mines.map((mine) => !mine && random() < 0.35)
      if (!revealed.some(Boolean)) continue
      checked++
      const known = new Map<number, boolean>()
      for (const step of deductions(level, counts, revealed)) {
        for (const cell of step.cells) {
          expect(mines[cell]).toBe(step.kind === 'mine')
          known.set(cell, step.kind === 'mine')
        }
      }
      // Brute force: a hidden cell is forced if it is the same in every possible layout.
      const layouts = consistentLayouts(level, counts, revealed)
      revealed.forEach((open, cell) => {
        if (open) return
        const forced = layouts.every((layout) => layout[cell] === layouts[0][cell])
        expect(known.has(cell)).toBe(forced)
      })
    }
  })
})

describe('findHint', () => {
  it('points at safe cells, unflagged mines and wrong flags', () => {
    const { level, counts } = board('...', '...', '..*')
    const revealed = [true, true, true, true, true, false, true, false, false]
    const none = new Array<boolean>(9).fill(false)
    const hint = findHint(level, counts, revealed, none)!
    expect(hint.kind).toBe('safe')
    const flags = none.slice()
    for (const cell of hint.cells) flags[cell] = true
    expect(findHint(level, counts, revealed, flags)!.kind).toBe('wrong-flag')
  })

  it('suggests flagging a mine once the safe cells are open', () => {
    const { level, counts } = board('...', '...', '..*')
    const revealed = [true, true, true, true, true, true, true, true, false]
    const hint = findHint(level, counts, revealed, new Array<boolean>(9).fill(false))!
    expect(hint).toMatchObject({ kind: 'mine', cells: [8] })
  })
})

describe('generateMines', () => {
  it('lays boards that open up and never need a guess', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 25; i++) {
        const start = Math.floor(random() * cellCount(level))
        const mines = generateMines(level, start, random)
        expect(mines.filter(Boolean)).toHaveLength(level.mines)
        expect([start, ...neighbours(level)[start]].some((cell) => mines[cell])).toBe(false)
        expect(solvesWithoutGuessing(level, mines, start, level.id !== 'easy')).toBe(true)
      }
    }
  })

  it('can be solved by following hints, without ever opening a mine', () => {
    const random = seededRandom(3)
    const level = LEVELS.hard
    for (let game = 0; game < 10; game++) {
      const start = Math.floor(random() * cellCount(level))
      const mines = generateMines(level, start, random)
      const counts = countMines(level, mines)
      const revealed = new Array<boolean>(mines.length).fill(false)
      const flags = revealed.slice()
      const open = (cell: number) => {
        for (const opened of cellsToOpen(level, counts, revealed, flags, cell)) {
          expect(mines[opened]).toBe(false)
          revealed[opened] = true
        }
      }
      open(start)
      while (revealed.some((shown, cell) => !shown && !mines[cell])) {
        const hint = findHint(level, counts, revealed, flags)
        expect(hint).not.toBeNull()
        for (const cell of hint!.cells) {
          if (hint!.kind === 'safe') open(cell)
          else flags[cell] = hint!.kind === 'mine'
        }
      }
    }
  })
})
