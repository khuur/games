/**
 * Lights Out rules. The board is a square grid of lights stored in reading order. Pressing a
 * light flips it and its neighbours above, below, left and right; the goal is a dark board.
 */

export type Lights = readonly boolean[]

export const MIN_SIZE = 3
export const MAX_SIZE = 7
export const DEFAULT_SIZE = 5

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SIZE
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)))
}

export function isCell(value: unknown, size: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < size * size
}

/** The lights a press flips: the light itself and its orthogonal neighbours. */
export function affectedCells(cell: number, size: number): number[] {
  const row = Math.floor(cell / size)
  const column = cell % size
  const cells = [cell]
  if (row > 0) cells.push(cell - size)
  if (row < size - 1) cells.push(cell + size)
  if (column > 0) cells.push(cell - 1)
  if (column < size - 1) cells.push(cell + 1)
  return cells
}

export function press(lights: Lights, cell: number, size: number): boolean[] {
  const next = lights.slice()
  for (const target of affectedCells(cell, size)) next[target] = !next[target]
  return next
}

export function isDark(lights: Lights): boolean {
  return lights.every((on) => !on)
}

export function countLit(lights: Lights): number {
  return lights.reduce((count, on) => count + (on ? 1 : 0), 0)
}

/**
 * The fewest presses that switch every light off, as cells in reading order, or null if the
 * position can't be solved.
 *
 * Presses can happen in any order and pressing a light twice cancels out, so a solution is just a
 * set of cells. Each light gives one equation (the presses on it and its neighbours must flip it
 * an odd number of times exactly when it is on), and Gaussian elimination over 0s and 1s solves
 * them together. On some grid sizes certain sets of presses change nothing at all; trying each of
 * them on top of one solution finds the shortest.
 */
export function solve(lights: Lights, size: number): number[] | null {
  const n = size * size
  // One row per light: which presses flip it, then whether it is on. (A press on a flips b
  // exactly when a press on b flips a, so the light's own neighbourhood gives the row.)
  const rows = lights.map((on, cell) => {
    const row = new Array<number>(n + 1).fill(0)
    for (const presser of affectedCells(cell, size)) row[presser] = 1
    row[n] = on ? 1 : 0
    return row
  })

  // Reduced row echelon form: each pivot column ends up with a single 1, in its pivot row.
  const pivotRow = new Array<number>(n).fill(-1)
  let rank = 0
  for (let column = 0; column < n; column++) {
    const pivot = rows.findIndex((row, index) => index >= rank && row[column] === 1)
    if (pivot === -1) continue
    ;[rows[rank], rows[pivot]] = [rows[pivot], rows[rank]]
    for (let index = 0; index < n; index++) {
      if (index === rank || rows[index][column] === 0) continue
      for (let k = 0; k <= n; k++) rows[index][k] ^= rows[rank][k]
    }
    pivotRow[column] = rank
    rank++
  }
  // A leftover row reading 0 = 1 means no set of presses works.
  for (let index = rank; index < n; index++) {
    if (rows[index][n] === 1) return null
  }

  // Columns without a pivot can be pressed or not freely; every choice gives a valid solution.
  const free = pivotRow.flatMap((row, column) => (row === -1 ? [column] : []))
  let best: number[] | null = null
  for (let choice = 0; choice < 2 ** free.length; choice++) {
    const presses = new Array<number>(n).fill(0)
    free.forEach((column, bit) => {
      presses[column] = (choice >> bit) & 1
    })
    for (let column = 0; column < n; column++) {
      const row = pivotRow[column]
      if (row === -1) continue
      let value = rows[row][n]
      for (const freeColumn of free) value ^= rows[row][freeColumn] & presses[freeColumn]
      presses[column] = value
    }
    const cells = presses.flatMap((pressed, cell) => (pressed ? [cell] : []))
    if (!best || cells.length < best.length) best = cells
  }
  return best
}

/** The fewest presses a new puzzle may take, so that none are over in a couple of taps. */
export function minimumDifficulty(size: number): number {
  return Math.max(3, Math.round(size * size * 0.28))
}

/**
 * A random puzzle. Pressing random lights on a dark board always leaves a position that can be
 * solved, which is not true of random patterns: on 5×5 only one in four can be.
 */
export function generatePuzzle(size: number, random: () => number = Math.random): boolean[] {
  for (;;) {
    let lights = new Array<boolean>(size * size).fill(false)
    for (let cell = 0; cell < size * size; cell++) {
      if (random() < 0.5) lights = press(lights, cell, size)
    }
    const solution = solve(lights, size)
    if (solution && solution.length >= minimumDifficulty(size)) return lights
  }
}
