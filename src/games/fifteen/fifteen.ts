/**
 * 15 Puzzle rules. Tiles are numbered 1 to n²−1 and stored in reading order, with 0 for the gap.
 * A tile next to the gap can slide into it; the goal is every tile in order with the gap last.
 */

export type Tiles = readonly number[]
export type Direction = 'up' | 'down' | 'left' | 'right'

export const GAP = 0
export const MIN_SIZE = 3
export const MAX_SIZE = 5
export const DEFAULT_SIZE = 4

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SIZE
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)))
}

export function solvedTiles(size: number): number[] {
  return Array.from({ length: size * size }, (_, cell) => (cell === size * size - 1 ? GAP : cell + 1))
}

/** The cell a tile belongs in. */
export function homeOf(tile: number, size: number): number {
  return tile === GAP ? size * size - 1 : tile - 1
}

export function isSolved(tiles: Tiles): boolean {
  return tiles.every((tile, cell) => tile === (cell === tiles.length - 1 ? GAP : cell + 1))
}

export function countInPlace(tiles: Tiles): number {
  return tiles.reduce((count, tile, cell) => count + (tile !== GAP && tile === cell + 1 ? 1 : 0), 0)
}

export function neighbours(cell: number, size: number): number[] {
  const row = Math.floor(cell / size)
  const column = cell % size
  const cells: number[] = []
  if (row > 0) cells.push(cell - size)
  if (row < size - 1) cells.push(cell + size)
  if (column > 0) cells.push(cell - 1)
  if (column < size - 1) cells.push(cell + 1)
  return cells
}

export function canSlide(tiles: Tiles, tile: number, size: number): boolean {
  return tile !== GAP && neighbours(tiles.indexOf(tile), size).includes(tiles.indexOf(GAP))
}

/** Slides a tile into the gap. The tile must be next to the gap. */
export function slide(tiles: Tiles, tile: number): number[] {
  const next = tiles.slice()
  const cell = next.indexOf(tile)
  next[next.indexOf(GAP)] = tile
  next[cell] = GAP
  return next
}

/**
 * The tiles that slide when a cell is tapped: every tile between it and the gap, nearest the gap
 * first, as long as the cell shares a row or column with the gap.
 */
export function tilesToward(tiles: Tiles, cell: number, size: number): number[] {
  const gap = tiles.indexOf(GAP)
  if (cell === gap) return []
  let step: number
  if (Math.floor(cell / size) === Math.floor(gap / size)) step = cell < gap ? -1 : 1
  else if (cell % size === gap % size) step = cell < gap ? -size : size
  else return []
  const moved: number[] = []
  for (let position = gap + step; ; position += step) {
    moved.push(tiles[position])
    if (position === cell) return moved
  }
}

/** The tile that would slide in `direction` (into the gap), if any. */
export function tileMoving(tiles: Tiles, direction: Direction, size: number): number | null {
  const gap = tiles.indexOf(GAP)
  const row = Math.floor(gap / size)
  const column = gap % size
  switch (direction) {
    case 'left':
      return column < size - 1 ? tiles[gap + 1] : null
    case 'right':
      return column > 0 ? tiles[gap - 1] : null
    case 'up':
      return row < size - 1 ? tiles[gap + size] : null
    case 'down':
      return row > 0 ? tiles[gap - size] : null
  }
}

/** Which way a tile next to the gap moves when it slides. */
export function slideDirection(tiles: Tiles, tile: number): Direction {
  const delta = tiles.indexOf(GAP) - tiles.indexOf(tile)
  if (delta === 1) return 'right'
  if (delta === -1) return 'left'
  return delta > 0 ? 'down' : 'up'
}

/**
 * Half of all arrangements can never be solved. Every slide changes the order of the tiles in a
 * way that keeps one quantity's parity: the inversions, plus (on even widths) the gap's row.
 */
export function isSolvable(tiles: Tiles, size: number): boolean {
  const numbers = tiles.filter((tile) => tile !== GAP)
  let inversions = 0
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) if (numbers[i] > numbers[j]) inversions++
  }
  if (size % 2 === 1) return inversions % 2 === 0
  const gapRowFromBottom = size - Math.floor(tiles.indexOf(GAP) / size)
  return (inversions + gapRowFromBottom) % 2 === 1
}

// --- Exact distances for 3×3 -------------------------------------------------------------------

/** Lehmer rank of a permutation of 0..8, from 0 to 9! − 1. */
function rank9(perm: ArrayLike<number>): number {
  let rank = 0
  for (let i = 0; i < 9; i++) {
    let smaller = 0
    for (let j = i + 1; j < 9; j++) if (perm[j] < perm[i]) smaller++
    rank = rank * (9 - i) + smaller
  }
  return rank
}

let table3: Int8Array | null = null

/**
 * Distance to the goal for every 3×3 position, by breadth-first search outwards from the goal.
 * Only 181,440 positions are solvable, so this takes a fraction of a second and is built on first use.
 */
function distances3(): Int8Array {
  if (table3) return table3
  const table = new Int8Array(362_880).fill(-1)
  const queue = new Uint8Array(181_440 * 9)
  const goal = solvedTiles(3)
  queue.set(goal)
  table[rank9(goal)] = 0
  const state = new Uint8Array(9)
  for (let head = 0, tail = 1; head < tail; head++) {
    state.set(queue.subarray(head * 9, head * 9 + 9))
    const distance = table[rank9(state)]
    const gap = state.indexOf(GAP)
    for (const next of neighbours(gap, 3)) {
      state[gap] = state[next]
      state[next] = GAP
      const rank = rank9(state)
      if (table[rank] === -1) {
        table[rank] = distance + 1
        queue.set(state, tail * 9)
        tail++
      }
      state[next] = state[gap]
      state[gap] = GAP
    }
  }
  table3 = table
  return table
}

/** Fewest moves to solve a 3×3 position. */
export function distance3(tiles: Tiles): number {
  return distances3()[rank9(tiles)]
}

// --- Solving ---------------------------------------------------------------------------------

/**
 * Places the tiles that belong in `targets` with the fewest moves, without disturbing locked
 * cells, by breadth-first search over where those tiles and the gap are (other tiles are
 * interchangeable). Applies the moves to `board` and appends the slid tiles to `moves`.
 */
function placeTiles(board: number[], size: number, locked: boolean[], targets: number[], moves: number[]) {
  const n = size * size
  const tiles = targets.map((cell) => cell + 1)
  const k = tiles.length
  const start = [...tiles.map((tile) => board.indexOf(tile)), board.indexOf(GAP)]
  const encode = (state: number[]) => state.reduce((code, position) => code * n + position, 0)
  const decode = (code: number) => {
    const state = new Array<number>(k + 1)
    for (let i = k; i >= 0; i--) {
      state[i] = code % n
      code = Math.floor(code / n)
    }
    return state
  }
  const isGoal = (state: number[]) => state.every((position, i) => i === k || position === targets[i])

  const parent = new Int32Array(n ** (k + 1)).fill(-1)
  const startCode = encode(start)
  parent[startCode] = startCode
  const queue = [startCode]
  let goalCode = isGoal(start) ? startCode : -1
  for (let head = 0; head < queue.length && goalCode === -1; head++) {
    const code = queue[head]
    const state = decode(code)
    const gap = state[k]
    for (const next of neighbours(gap, size)) {
      if (locked[next]) continue
      const moved = state.slice()
      const tile = moved.indexOf(next)
      if (tile !== -1 && tile < k) moved[tile] = gap
      moved[k] = next
      const nextCode = encode(moved)
      if (parent[nextCode] !== -1) continue
      parent[nextCode] = code
      if (isGoal(moved)) {
        goalCode = nextCode
        break
      }
      queue.push(nextCode)
    }
  }
  if (goalCode === -1) throw new Error('Tiles cannot be placed')

  // Walk back to the start, then replay the gap's path on the real board.
  const gaps: number[] = []
  for (let code = goalCode; code !== startCode; code = parent[code]) gaps.push(code % n)
  for (const gap of gaps.reverse()) {
    const tile = board[gap]
    moves.push(tile)
    board[board.indexOf(GAP)] = tile
    board[gap] = GAP
  }
  for (const cell of targets) locked[cell] = true
}

/** Finishes the bottom-right 3×3 corner of a board with the exact distance table. */
function finishCorner(board: number[], size: number, moves: number[]) {
  const origin = size - 3
  const cells = Array.from({ length: 9 }, (_, i) => (origin + Math.floor(i / 3)) * size + origin + (i % 3))
  // Relabel the corner as a 3×3 puzzle: each tile becomes the position of its home in the corner.
  const local = (tile: number) => (tile === GAP ? GAP : cells.indexOf(homeOf(tile, size)) + 1)
  const corner = cells.map((cell) => local(board[cell]))
  const table = distances3()
  const start = table[rank9(corner)]
  if (start < 0) throw new Error('Corner cannot be solved')
  for (let distance = start; distance > 0; distance--) {
    const gap = corner.indexOf(GAP)
    const next = neighbours(gap, 3).find((cell) => {
      corner[gap] = corner[cell]
      corner[cell] = GAP
      const closer = table[rank9(corner)] === distance - 1
      corner[cell] = corner[gap]
      corner[gap] = GAP
      return closer
    })
    if (next === undefined) throw new Error('Corner cannot be solved')
    const tile = board[cells[next]]
    moves.push(tile)
    corner[gap] = corner[next]
    corner[next] = GAP
    board[cells[gap]] = tile
    board[cells[next]] = GAP
  }
}

/** Splits a row or column into groups placed together: pairs, with the last two always paired. */
function groups(cells: number[]): number[][] {
  const result: number[][] = []
  for (let i = 0; i < cells.length - 2; i += 2) result.push(cells.slice(i, Math.min(i + 2, cells.length - 2)))
  result.push(cells.slice(-2))
  return result
}

/**
 * Tiles to slide, in order, to solve the puzzle. On 3×3 this is a shortest solution. Bigger boards
 * use the classic method: finish the top row and the left column, then repeat on the smaller
 * board that is left, and solve the last 3×3 corner exactly. Each step is as short as possible,
 * though the whole is usually longer than the true minimum, which is too slow to find here.
 */
export function solve(tiles: Tiles, size: number): number[] {
  const board = tiles.slice()
  const moves: number[] = []
  const locked = new Array<boolean>(size * size).fill(false)
  for (let edge = 0; size - edge > 3; edge++) {
    const row = Array.from({ length: size - edge }, (_, i) => edge * size + edge + i)
    const column = Array.from({ length: size - edge - 1 }, (_, i) => (edge + 1 + i) * size + edge)
    for (const group of [...groups(row), ...groups(column)]) placeTiles(board, size, locked, group, moves)
  }
  finishCorner(board, size, moves)

  // Where one step ends with a tile the next step moves straight back, the two cancel out.
  const simplified: number[] = []
  for (const tile of moves) {
    if (simplified[simplified.length - 1] === tile) simplified.pop()
    else simplified.push(tile)
  }
  return simplified
}

/** The number to beat: the exact minimum on 3×3, the method's solution ("par") on bigger boards. */
export function puzzleTarget(tiles: Tiles, size: number): number {
  return size === 3 ? distance3(tiles) : solve(tiles, size).length
}

/** A random solvable puzzle that is properly mixed up. */
export function generatePuzzle(size: number, random: () => number = Math.random): number[] {
  for (;;) {
    const tiles = solvedTiles(size)
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
    }
    if (!isSolvable(tiles, size)) {
      // Swapping two tiles flips the parity, turning an impossible arrangement into a possible one.
      const [a, b] = tiles.flatMap((tile, cell) => (tile === GAP ? [] : [cell])).slice(0, 2)
      ;[tiles[a], tiles[b]] = [tiles[b], tiles[a]]
    }
    if (countInPlace(tiles) > size - 2) continue
    if (size === 3 && distance3(tiles) < 14) continue
    return tiles
  }
}
