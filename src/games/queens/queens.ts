/**
 * Queens rules, a solution counter (every puzzle has exactly one solution) and a solver that
 * reasons like a person, which grades puzzles and explains hints.
 *
 * An n×n grid is split into n coloured regions. One queen goes in every row, every column and
 * every region, and no two queens may touch, not even at a corner.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

export interface LevelDefinition {
  id: LevelId
  name: string
  size: number
  /** The hardest technique a puzzle may need. */
  hardest: Technique
  /** Puzzles must need at least this technique somewhere (so Hard is never easy). */
  needs: Technique | null
}

/** Techniques from easiest to hardest. */
export type Technique = 'only-spot' | 'confined' | 'pair' | 'blocking' | 'group'
export const TECHNIQUES: readonly Technique[] = ['only-spot', 'confined', 'pair', 'blocking', 'group']

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', size: 6, hardest: 'confined', needs: null },
  medium: { id: 'medium', name: 'Medium', size: 8, hardest: 'blocking', needs: null },
  hard: { id: 'hard', name: 'Hard', size: 10, hardest: 'group', needs: 'pair' },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export const rowOf = (cell: number, size: number) => Math.floor(cell / size)
export const columnOf = (cell: number, size: number) => cell % size

/** Whether two cells touch, sides or corners. */
export function touching(a: number, b: number, size: number): boolean {
  return a !== b && Math.abs(rowOf(a, size) - rowOf(b, size)) <= 1 && Math.abs(columnOf(a, size) - columnOf(b, size)) <= 1
}

/** The cells a queen on `cell` rules out: its row, column, region and every cell touching it. */
export function attackedBy(cell: number, size: number, regions: readonly number[]): number[] {
  const attacked: number[] = []
  for (let other = 0; other < size * size; other++) {
    if (other === cell) continue
    if (
      rowOf(other, size) === rowOf(cell, size) ||
      columnOf(other, size) === columnOf(cell, size) ||
      regions[other] === regions[cell] ||
      touching(other, cell, size)
    ) {
      attacked.push(other)
    }
  }
  return attacked
}

/** Every unit that needs exactly one queen: rows, then columns, then regions. */
export function unitsOf(size: number, regions: readonly number[]): number[][] {
  const units: number[][] = Array.from({ length: size * 3 }, () => [])
  for (let cell = 0; cell < size * size; cell++) {
    units[rowOf(cell, size)].push(cell)
    units[size + columnOf(cell, size)].push(cell)
    units[2 * size + regions[cell]].push(cell)
  }
  return units
}

export type UnitKind = 'row' | 'column' | 'region'
export const unitKind = (unit: number, size: number): UnitKind => (unit < size ? 'row' : unit < 2 * size ? 'column' : 'region')

// ———————————————————————————————————————— Counting solutions

/** Up to `limit` solutions, found row by row; each solution lists its queens' cells in row order. */
export function findSolutions(size: number, regions: readonly number[], limit = 2): number[][] {
  const columns = new Uint8Array(size)
  const used = new Uint8Array(size)
  const placed: number[] = []
  const found: number[][] = []
  const visit = (row: number): boolean => {
    if (row === size) {
      found.push(placed.map((column, r) => r * size + column))
      return found.length >= limit
    }
    for (let column = 0; column < size; column++) {
      const region = regions[row * size + column]
      if (columns[column] || used[region]) continue
      if (row > 0 && Math.abs(placed[row - 1] - column) <= 1) continue
      columns[column] = 1
      used[region] = 1
      placed.push(column)
      if (visit(row + 1)) return true
      placed.pop()
      columns[column] = 0
      used[region] = 0
    }
    return false
  }
  visit(0)
  return found
}

export const countSolutions = (size: number, regions: readonly number[], limit = 2) => findSolutions(size, regions, limit).length

// ———————————————————————————————————————— Solving like a person

/** One step a person could take: placing a queen, or ruling cells out, and why. */
export interface Step {
  technique: Technique
  /** A queen to place. */
  queen?: number
  /** Cells ruled out. */
  eliminate?: number[]
  /** The units the reasoning is about (rows, columns or regions), as unit indexes. */
  units: number[]
  /** For blocking: the cell whose queen would leave a unit empty. */
  blocked?: number
}

interface Board {
  size: number
  regions: readonly number[]
  units: number[][]
  queens: boolean[]
  /** Cells that may still hold a queen. */
  open: boolean[]
}

function boardOf(size: number, regions: readonly number[], queens: readonly number[], crossed: readonly number[]): Board {
  const board: Board = {
    size,
    regions,
    units: unitsOf(size, regions),
    queens: new Array<boolean>(size * size).fill(false),
    open: new Array<boolean>(size * size).fill(true),
  }
  for (const cell of crossed) board.open[cell] = false
  for (const cell of queens) placeQueen(board, cell)
  return board
}

function placeQueen(board: Board, cell: number) {
  board.queens[cell] = true
  board.open[cell] = false
  for (const other of attackedBy(cell, board.size, board.regions)) board.open[other] = false
}

const hasQueen = (board: Board, unit: number) => board.units[unit].some((cell) => board.queens[cell])
const openIn = (board: Board, unit: number) => board.units[unit].filter((cell) => board.open[cell])

function findOnlySpot(board: Board): Step | null {
  // Regions first: a region down to one cell is what people tend to spot first.
  const order = [...board.units.keys()].sort((a, b) => Number(b >= 2 * board.size) - Number(a >= 2 * board.size))
  for (const unit of order) {
    if (hasQueen(board, unit)) continue
    const open = openIn(board, unit)
    if (open.length === 1) return { technique: 'only-spot', queen: open[0], units: [unit] }
  }
  return null
}

/**
 * Units confined to other units: `count` regions whose open cells all lie in `count` rows (or
 * columns) own those rows, so nothing else in them can hold a queen; and the same the other way
 * round, rows confined to regions.
 */
function findConfinement(board: Board, count: number, technique: Technique): Step | null {
  const { size } = board
  const families: [number, number][] = [
    [2 * size, 0], // regions inside rows
    [2 * size, size], // regions inside columns
    [0, 2 * size], // rows inside regions
    [size, 2 * size], // columns inside regions
  ]
  for (const [inner, outer] of families) {
    const candidates = Array.from({ length: size }, (_, i) => inner + i).filter(
      (unit) => !hasQueen(board, unit) && openIn(board, unit).length > 0,
    )
    for (const group of combinations(candidates, count)) {
      const cells = group.flatMap((unit) => openIn(board, unit))
      const outerUnits = [...new Set(cells.map((cell) => outerUnitOf(cell, outer, board)))]
      if (outerUnits.length !== count) continue
      const inside = new Set(cells)
      const eliminate = outerUnits.flatMap((unit) => openIn(board, unit)).filter((cell) => !inside.has(cell))
      if (eliminate.length) return { technique, eliminate, units: [...group, ...outerUnits] }
    }
  }
  return null
}

function outerUnitOf(cell: number, family: number, board: Board): number {
  const { size, regions } = board
  if (family === 0) return rowOf(cell, size)
  if (family === size) return size + columnOf(cell, size)
  return 2 * size + regions[cell]
}

function* combinations<T>(items: readonly T[], count: number, from = 0, chosen: T[] = []): Generator<T[]> {
  if (chosen.length === count) {
    yield chosen.slice()
    return
  }
  for (let i = from; i <= items.length - (count - chosen.length); i++) {
    chosen.push(items[i])
    yield* combinations(items, count, i + 1, chosen)
    chosen.pop()
  }
}

/** A cell whose queen would leave some row, column or region without any open cell. */
function findBlocking(board: Board): Step | null {
  const { size, regions, units } = board
  for (let cell = 0; cell < size * size; cell++) {
    if (!board.open[cell]) continue
    const ruledOut = new Set([cell, ...attackedBy(cell, size, regions)])
    for (let unit = 0; unit < units.length; unit++) {
      if (hasQueen(board, unit) || units[unit].includes(cell)) continue
      if (units[unit].every((other) => !board.open[other] || ruledOut.has(other))) {
        return { technique: 'blocking', eliminate: [cell], units: [unit], blocked: cell }
      }
    }
  }
  return null
}

/** The simplest next step, from easiest technique to hardest, up to `hardest`. */
function nextStep(board: Board, hardest: Technique): Step | null {
  const allowed = (technique: Technique) => TECHNIQUES.indexOf(technique) <= TECHNIQUES.indexOf(hardest)
  return (
    findOnlySpot(board) ??
    (allowed('confined') ? findConfinement(board, 1, 'confined') : null) ??
    (allowed('pair') ? findConfinement(board, 2, 'pair') : null) ??
    (allowed('blocking') ? findBlocking(board) : null) ??
    (allowed('group') ? (findConfinement(board, 3, 'group') ?? findConfinement(board, 4, 'group')) : null)
  )
}

function applyStep(board: Board, step: Step) {
  if (step.queen !== undefined) placeQueen(board, step.queen)
  for (const cell of step.eliminate ?? []) board.open[cell] = false
}

/**
 * Solves with techniques up to `hardest`. Says whether it got all the way, and the hardest
 * technique it needed.
 */
export function solveLogically(size: number, regions: readonly number[], hardest: Technique = 'group') {
  const board = boardOf(size, regions, [], [])
  let needed: Technique = 'only-spot'
  for (;;) {
    if (board.queens.filter(Boolean).length === size) return { solved: true, needed }
    if (board.units.some((unit, index) => !hasQueen(board, index) && unit.every((cell) => !board.open[cell]))) {
      return { solved: false, needed }
    }
    const step = nextStep(board, hardest)
    if (!step) return { solved: false, needed }
    if (TECHNIQUES.indexOf(step.technique) > TECHNIQUES.indexOf(needed)) needed = step.technique
    applyStep(board, step)
  }
}

/**
 * The next step from a position: queens already placed and cells crossed out (both assumed
 * right). Null if logic can't find one.
 */
export function nextLogicalStep(
  size: number,
  regions: readonly number[],
  queens: readonly number[],
  crossed: readonly number[],
): Step | null {
  return nextStep(boardOf(size, regions, queens, crossed), 'group')
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  /** The region of each cell, 0 to size − 1. */
  regions: number[]
  /** The queens' cells, one per row, in row order. */
  solution: number[]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/** Queens for every row, none sharing a column or touching, in random columns. */
function randomQueens(size: number, random: () => number): number[] {
  const columns: number[] = []
  const visit = (row: number): boolean => {
    if (row === size) return true
    const options = Array.from({ length: size }, (_, column) => column).filter(
      (column) => !columns.includes(column) && (row === 0 || Math.abs(columns[row - 1] - column) > 1),
    )
    for (const column of shuffle(options, random)) {
      columns.push(column)
      if (visit(row + 1)) return true
      columns.pop()
    }
    return false
  }
  visit(0)
  return columns.map((column, row) => row * size + column)
}

/** The cells sharing a side with a cell. */
function sideNeighbours(cell: number, size: number): number[] {
  const row = rowOf(cell, size)
  const column = columnOf(cell, size)
  return [
    row > 0 ? cell - size : -1,
    row < size - 1 ? cell + size : -1,
    column > 0 ? cell - 1 : -1,
    column < size - 1 ? cell + 1 : -1,
  ].filter((next) => next >= 0)
}

/** Grows one region around each queen, a cell at a time, until the grid is covered. */
function growRegions(size: number, queens: readonly number[], random: () => number): number[] {
  const regions = new Array<number>(size * size).fill(-1)
  queens.forEach((cell, region) => {
    regions[cell] = region
  })
  const neighbours = (cell: number) => sideNeighbours(cell, size)
  let left = size * size - size
  while (left > 0) {
    // A random empty cell next to some region joins one of the regions it touches.
    const edge: number[] = []
    for (let cell = 0; cell < size * size; cell++) {
      if (regions[cell] === -1 && neighbours(cell).some((next) => regions[next] !== -1)) edge.push(cell)
    }
    const cell = edge[Math.floor(random() * edge.length)]
    const touching = neighbours(cell).filter((next) => regions[next] !== -1)
    regions[cell] = regions[touching[Math.floor(random() * touching.length)]]
    left--
  }
  return regions
}

/** Whether a region stays in one piece without `without`. */
function staysConnected(size: number, regions: readonly number[], region: number, without: number): boolean {
  const cells = regions.flatMap((r, cell) => (r === region && cell !== without ? [cell] : []))
  if (!cells.length) return false
  const reached = new Set([cells[0]])
  const queue = [cells[0]]
  while (queue.length) {
    for (const next of sideNeighbours(queue.pop()!, size)) {
      if (regions[next] === region && next !== without && !reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  return reached.size === cells.length
}

/**
 * Reshapes the regions until the planted queens are the only solution. Each other solution is
 * broken by handing one of its queens' cells to a neighbouring region: that region then holds two
 * of its queens, and the region the cell left holds none. Null if it gets stuck.
 */
function makeUnique(size: number, regions: number[], solution: readonly number[], random: () => number): number[] | null {
  const planted = new Set(solution)
  for (let round = 0; round < 60; round++) {
    const other = findSolutions(size, regions, 2).find((found) => found.some((cell) => !planted.has(cell)))
    if (!other) return regions
    const movable = shuffle(other.filter((cell) => !planted.has(cell)), random)
    let moved = false
    for (const cell of movable) {
      const from = regions[cell]
      const targets = [...new Set(sideNeighbours(cell, size).map((next) => regions[next]))].filter((region) => region !== from)
      if (!targets.length || !staysConnected(size, regions, from, cell)) continue
      regions[cell] = targets[Math.floor(random() * targets.length)]
      moved = true
      break
    }
    if (!moved) return null
  }
  return null
}

/**
 * A new puzzle with exactly one solution that the level's techniques can reach, and (on Hard)
 * that needs at least one of the harder ones.
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { size } = level
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const solution = randomQueens(size, random)
    const regions = makeUnique(size, growRegions(size, solution, random), solution, random)
    if (!regions) continue
    const { solved, needed } = solveLogically(size, regions, level.hardest)
    if (!solved) continue
    fallback ??= { regions, solution }
    if (level.needs && TECHNIQUES.indexOf(needed) < TECHNIQUES.indexOf(level.needs)) continue
    return { regions, solution }
  }
  return fallback!
}

// ———————————————————————————————————————— Marks and hints

/** What a player has put in a cell. */
export const BLANK = 0
export const CROSS = 1
export const QUEEN = 2
export type Mark = typeof BLANK | typeof CROSS | typeof QUEEN

export type Hint =
  /** Crosses on cells where a queen belongs. */
  | { kind: 'wrong-cross'; cells: number[] }
  /** The next thing logic finds: a queen to place, or cells to cross out. */
  | { kind: 'step'; step: Step }

/**
 * What to do next: take back crosses on queens' cells if there are any, otherwise the next
 * logical step. Queens on the board are always right (wrong ones turn into red crosses), so the
 * reasoning can build on them.
 */
export function findHint(size: number, regions: readonly number[], solution: readonly number[], marks: readonly Mark[]): Hint | null {
  const queensCells = new Set(solution)
  const wrongCrosses = marks.flatMap((mark, cell) => (mark === CROSS && queensCells.has(cell) ? [cell] : []))
  if (wrongCrosses.length) return { kind: 'wrong-cross', cells: wrongCrosses }
  const queens = marks.flatMap((mark, cell) => (mark === QUEEN ? [cell] : []))
  const crossed = marks.flatMap((mark, cell) => (mark === CROSS ? [cell] : []))
  const step = nextLogicalStep(size, regions, queens, crossed)
  if (step) return { kind: 'step', step }
  // Logic never runs dry on generated puzzles; if it somehow does, the solution names a queen.
  const missing = solution.find((cell) => marks[cell] !== QUEEN)
  return missing === undefined ? null : { kind: 'step', step: { technique: 'only-spot', queen: missing, units: [] } }
}
