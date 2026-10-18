import { describe, expect, it } from 'vitest'
import {
  canSlide,
  countInPlace,
  distance3,
  GAP,
  generatePuzzle,
  isSolvable,
  isSolved,
  puzzleTarget,
  slide,
  slideDirection,
  solve,
  solvedTiles,
  tileMoving,
  tilesToward,
  type Tiles,
} from './fifteen'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Applies a solution, checking that every slide is legal. */
function play(tiles: Tiles, moves: number[], size: number): Tiles {
  return moves.reduce<Tiles>((board, tile) => {
    expect(canSlide(board, tile, size)).toBe(true)
    return slide(board, tile)
  }, tiles)
}

describe('rules', () => {
  it('starts solved with the gap last', () => {
    expect(solvedTiles(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, GAP])
    expect(isSolved(solvedTiles(4))).toBe(true)
    expect(countInPlace(solvedTiles(4))).toBe(15)
  })

  it('slides tiles next to the gap only', () => {
    const tiles = solvedTiles(3)
    expect(canSlide(tiles, 8, 3)).toBe(true)
    expect(canSlide(tiles, 6, 3)).toBe(true)
    expect(canSlide(tiles, 5, 3)).toBe(false)
    expect(slide(tiles, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, GAP, 8])
    expect(slideDirection(tiles, 8)).toBe('right')
    expect(slideDirection(tiles, 6)).toBe('down')
  })

  it('slides a whole line of tiles towards the gap', () => {
    const tiles = solvedTiles(4)
    expect(tilesToward(tiles, 12, 4)).toEqual([15, 14, 13])
    expect(tilesToward(tiles, 3, 4)).toEqual([12, 8, 4])
    expect(tilesToward(tiles, 5, 4)).toEqual([])
  })

  it('finds the tile that moves in a direction', () => {
    const tiles = solvedTiles(3)
    expect(tileMoving(tiles, 'right', 3)).toBe(8)
    expect(tileMoving(tiles, 'down', 3)).toBe(6)
    expect(tileMoving(tiles, 'left', 3)).toBeNull()
    expect(tileMoving(tiles, 'up', 3)).toBeNull()
  })

  it('knows that swapping two tiles makes a puzzle impossible', () => {
    for (const size of [3, 4, 5]) {
      const tiles = solvedTiles(size)
      expect(isSolvable(tiles, size)).toBe(true)
      ;[tiles[0], tiles[1]] = [tiles[1], tiles[0]]
      expect(isSolvable(tiles, size)).toBe(false)
    }
  })

  it('keeps solvability through slides', () => {
    const random = seededRandom(3)
    let tiles: Tiles = solvedTiles(4)
    for (let i = 0; i < 200; i++) {
      const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter((tile) => canSlide(tiles, tile, 4))
      tiles = slide(tiles, options[Math.floor(random() * options.length)])
      expect(isSolvable(tiles, 4)).toBe(true)
    }
  })
})

describe('3×3 distances', () => {
  it('measures the hardest positions at 31 moves', () => {
    expect(distance3(solvedTiles(3))).toBe(0)
    expect(distance3([8, 6, 7, 2, 5, 4, 3, GAP, 1])).toBe(31)
    expect(distance3([6, 4, 7, 8, 5, GAP, 3, 2, 1])).toBe(31)
  })

  it('solves 3×3 in the minimum number of moves', () => {
    const random = seededRandom(7)
    for (let round = 0; round < 50; round++) {
      const tiles = generatePuzzle(3, random)
      const moves = solve(tiles, 3)
      expect(moves).toHaveLength(distance3(tiles))
      expect(isSolved(play(tiles, moves, 3))).toBe(true)
    }
  })
})

describe('solver for bigger boards', () => {
  it.each([4, 5])('solves random %i×%i puzzles with legal moves', (size) => {
    const random = seededRandom(size)
    for (let round = 0; round < 25; round++) {
      const tiles = generatePuzzle(size, random)
      const moves = solve(tiles, size)
      expect(isSolved(play(tiles, moves, size))).toBe(true)
      expect(moves.length).toBe(puzzleTarget(tiles, size))
      expect(moves.length).toBeLessThan(size === 4 ? 160 : 320)
    }
  })

  it('needs nothing for a solved board and finishes nearly solved ones quickly', () => {
    expect(solve(solvedTiles(4), 4)).toEqual([])
    expect(solve(slide(solvedTiles(4), 15), 4)).toEqual([15])
  })
})

describe('generatePuzzle', () => {
  it('deals solvable, well mixed puzzles', () => {
    const random = seededRandom(11)
    for (const size of [3, 4, 5]) {
      for (let round = 0; round < 30; round++) {
        const tiles = generatePuzzle(size, random)
        expect([...tiles].sort((a, b) => a - b)).toEqual(solvedTiles(size).sort((a, b) => a - b))
        expect(isSolvable(tiles, size)).toBe(true)
        expect(isSolved(tiles)).toBe(false)
        expect(countInPlace(tiles)).toBeLessThanOrEqual(size - 2)
      }
    }
  })
})
