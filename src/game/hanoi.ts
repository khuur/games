/**
 * Pure Tower of Hanoi rules.
 *
 * A disk is identified by its size (1 is the smallest). Each tower lists its disks from bottom
 * to top, so the last element of a tower is the only disk that can be moved.
 */

export type Towers = number[][]

export interface Move {
  from: number
  to: number
}

export type MoveError = 'same-tower' | 'empty-tower' | 'larger-on-smaller'

export const TOWER_COUNT = 3
export const START_TOWER = 0
export const GOAL_TOWER = 2
export const MIN_DISKS = 3
export const MAX_DISKS = 10
export const DEFAULT_DISKS = 4

export function clampDiskCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_DISKS
  return Math.min(MAX_DISKS, Math.max(MIN_DISKS, Math.round(count)))
}

export function createTowers(diskCount: number): Towers {
  const start = Array.from({ length: diskCount }, (_, i) => diskCount - i)
  return [start, [], []]
}

export function topDisk(tower: readonly number[]): number | undefined {
  return tower[tower.length - 1]
}

export function minimumMoves(diskCount: number): number {
  return 2 ** diskCount - 1
}

export function isTowerIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < TOWER_COUNT
}

export function validateMove(towers: Towers, { from, to }: Move): MoveError | null {
  if (from === to) return 'same-tower'
  const disk = topDisk(towers[from])
  if (disk === undefined) return 'empty-tower'
  const target = topDisk(towers[to])
  if (target !== undefined && target < disk) return 'larger-on-smaller'
  return null
}

/** Returns new towers with the move applied. The move must be valid. */
export function applyMove(towers: Towers, { from, to }: Move): Towers {
  const next = towers.map((tower) => tower.slice())
  const disk = next[from].pop()
  if (disk === undefined) throw new Error(`Tower ${from} is empty`)
  next[to].push(disk)
  return next
}

export function isSolved(towers: Towers, diskCount: number): boolean {
  return towers[GOAL_TOWER].length === diskCount
}

/** `towerOf[size]` is the tower that disk currently sits on (index 0 is unused). */
function towerOfEachDisk(towers: Towers): number[] {
  const towerOf: number[] = []
  towers.forEach((tower, index) => {
    for (const disk of tower) towerOf[disk] = index
  })
  return towerOf
}

function spareTower(a: number, b: number): number {
  return TOWER_COUNT - a - b
}

/**
 * The shortest sequence of moves that gathers every disk on `goal`, from any legal position.
 *
 * The largest disk that is not on its target has to travel there exactly once, which first
 * requires parking every smaller disk on the spare tower: the same problem, one disk smaller.
 */
export function solve(towers: Towers, goal = GOAL_TOWER): Move[] {
  const towerOf = towerOfEachDisk(towers)
  const moves: Move[] = []

  const gather = (largest: number, target: number): void => {
    for (let disk = largest; disk >= 1; disk--) {
      if (towerOf[disk] === target) continue
      gather(disk - 1, spareTower(towerOf[disk], target))
      moves.push({ from: towerOf[disk], to: target })
      towerOf[disk] = target
      gather(disk - 1, target)
      return
    }
  }

  gather(towerOf.length - 1, goal)
  return moves
}

/** The first move of {@link solve}, found without generating the whole sequence. */
export function nextOptimalMove(towers: Towers, goal = GOAL_TOWER): Move | null {
  const towerOf = towerOfEachDisk(towers)
  let target = goal
  let move: Move | null = null
  for (let disk = towerOf.length - 1; disk >= 1; disk--) {
    if (towerOf[disk] === target) continue
    move = { from: towerOf[disk], to: target }
    target = spareTower(towerOf[disk], target)
  }
  return move
}

/**
 * The length of {@link solve}. Every disk that has to travel costs its own move plus
 * re-stacking all smaller disks on top of it: 1 + (2^(size-1) - 1) moves.
 */
export function movesToSolve(towers: Towers, goal = GOAL_TOWER): number {
  const towerOf = towerOfEachDisk(towers)
  let target = goal
  let count = 0
  for (let disk = towerOf.length - 1; disk >= 1; disk--) {
    if (towerOf[disk] === target) continue
    count += 2 ** (disk - 1)
    target = spareTower(towerOf[disk], target)
  }
  return count
}

export type StarRating = 1 | 2 | 3

export function starRating(moves: number, diskCount: number): StarRating {
  const minimum = minimumMoves(diskCount)
  if (moves <= minimum) return 3
  if (moves <= Math.ceil(minimum * 1.5)) return 2
  return 1
}
