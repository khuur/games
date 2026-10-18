import { describe, expect, it } from 'vitest'
import {
  applyMove,
  clampDiskCount,
  createTowers,
  GOAL_TOWER,
  isSolved,
  MAX_DISKS,
  minimumMoves,
  MIN_DISKS,
  movesToSolve,
  nextOptimalMove,
  solve,
  validateMove,
  type Towers,
} from './hanoi'

/** Every legal position with `n` disks, encoded as the tower of each disk (base 3). */
function allPositions(n: number): Towers[] {
  const positions: Towers[] = []
  for (let code = 0; code < 3 ** n; code++) {
    const towers: Towers = [[], [], []]
    // Push the largest disk first so each tower is ordered bottom to top.
    for (let disk = n; disk >= 1; disk--) {
      towers[Math.floor(code / 3 ** (disk - 1)) % 3].push(disk)
    }
    positions.push(towers)
  }
  return positions
}

const key = (towers: Towers) => towers.map((tower) => tower.join(',')).join('|')

/** Distance from every position to the solved one, by breadth-first search. */
function distancesToGoal(n: number): Map<string, number> {
  const goal: Towers = [[], [], []]
  goal[GOAL_TOWER] = createTowers(n)[0]
  const distances = new Map([[key(goal), 0]])
  let frontier = [goal]
  while (frontier.length > 0) {
    const next: Towers[] = []
    for (const towers of frontier) {
      for (let from = 0; from < 3; from++) {
        for (let to = 0; to < 3; to++) {
          if (validateMove(towers, { from, to })) continue
          const neighbour = applyMove(towers, { from, to })
          if (distances.has(key(neighbour))) continue
          distances.set(key(neighbour), distances.get(key(towers))! + 1)
          next.push(neighbour)
        }
      }
    }
    frontier = next
  }
  return distances
}

describe('rules', () => {
  it('starts with every disk on the first tower, largest at the bottom', () => {
    expect(createTowers(4)).toEqual([[4, 3, 2, 1], [], []])
  })

  it('knows the minimum number of moves', () => {
    expect([1, 2, 3, 4, 10].map(minimumMoves)).toEqual([1, 3, 7, 15, 1023])
  })

  it('clamps the disk count to the supported range', () => {
    expect(clampDiskCount(1)).toBe(MIN_DISKS)
    expect(clampDiskCount(99)).toBe(MAX_DISKS)
    expect(clampDiskCount(5.4)).toBe(5)
    expect(clampDiskCount(Number.NaN)).toBeGreaterThanOrEqual(MIN_DISKS)
  })

  it('rejects illegal moves', () => {
    const towers: Towers = [[3, 1], [2], []]
    expect(validateMove(towers, { from: 0, to: 0 })).toBe('same-tower')
    expect(validateMove(towers, { from: 2, to: 0 })).toBe('empty-tower')
    expect(validateMove(towers, { from: 1, to: 0 })).toBe('larger-on-smaller')
    expect(validateMove(towers, { from: 0, to: 1 })).toBeNull()
    expect(validateMove(towers, { from: 1, to: 2 })).toBeNull()
  })

  it('applies moves without mutating the input', () => {
    const towers: Towers = [[3, 2, 1], [], []]
    const next = applyMove(towers, { from: 0, to: 2 })
    expect(next).toEqual([[3, 2], [], [1]])
    expect(towers).toEqual([[3, 2, 1], [], []])
  })

  it('detects a solved puzzle only on the goal tower', () => {
    expect(isSolved([[], [], [2, 1]], 2)).toBe(true)
    expect(isSolved([[], [2, 1], []], 2)).toBe(false)
    expect(isSolved([[1], [], [2]], 2)).toBe(false)
  })
})

describe('solver', () => {
  it('solves the starting position in the minimum number of moves', () => {
    for (let n = 1; n <= MAX_DISKS; n++) {
      let towers = createTowers(n)
      const moves = solve(towers)
      expect(moves).toHaveLength(minimumMoves(n))
      for (const move of moves) {
        expect(validateMove(towers, move)).toBeNull()
        towers = applyMove(towers, move)
      }
      expect(isSolved(towers, n)).toBe(true)
    }
  })

  it('is optimal from every legal position', () => {
    for (let n = 1; n <= 6; n++) {
      const distances = distancesToGoal(n)
      for (const start of allPositions(n)) {
        const optimal = distances.get(key(start))!
        const moves = solve(start)
        expect(moves).toHaveLength(optimal)
        expect(movesToSolve(start)).toBe(optimal)
        expect(nextOptimalMove(start)).toEqual(moves[0] ?? null)

        let towers = start
        for (const move of moves) {
          expect(validateMove(towers, move)).toBeNull()
          towers = applyMove(towers, move)
        }
        expect(isSolved(towers, n)).toBe(true)
      }
    }
  })

  it('can target any tower', () => {
    const towers = createTowers(3)
    expect(solve(towers, 1)).toHaveLength(7)
    expect(solve(towers, 0)).toHaveLength(0)
    expect(nextOptimalMove(towers, 0)).toBeNull()
  })
})
