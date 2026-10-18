/**
 * Nonogram rules and a solver that works one row or column at a time, the way people do: it
 * finds the cells that every arrangement of a line's runs agrees on. Puzzles are generated so
 * that this alone solves them, which also makes their solutions unique.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

export interface LevelDefinition {
  id: LevelId
  name: string
  columns: number
  rows: number
  /** How the random pictures are drawn: share of cells filled, smoothing passes, chance of mirroring. */
  density: number
  smoothing: number
  mirror: number
}

/**
 * Easy pictures are smoothed into blobs, which makes long, friendly runs; the others are mirrored
 * noise, full of short runs that take real deduction. Hard is taller than wide, which suits phones;
 * wide screens show it turned on its side.
 */
export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', columns: 8, rows: 8, density: 0.56, smoothing: 1, mirror: 1 },
  medium: { id: 'medium', name: 'Medium', columns: 10, rows: 10, density: 0.6, smoothing: 0, mirror: 1 },
  hard: { id: 'hard', name: 'Hard', columns: 10, rows: 14, density: 0.6, smoothing: 0, mirror: 0.5 },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

/** What is known about a cell. */
export const UNKNOWN = 0
export const FILLED = 1
export const EMPTY = 2
export type CellState = typeof UNKNOWN | typeof FILLED | typeof EMPTY

/** A line is a row (index 0 to rows − 1) or a column (rows onwards). */
export function lineCells(level: LevelDefinition, line: number): number[] {
  const { columns, rows } = level
  if (line < rows) return Array.from({ length: columns }, (_, column) => line * columns + column)
  const column = line - rows
  return Array.from({ length: rows }, (_, row) => row * columns + column)
}

export const lineCount = (level: LevelDefinition) => level.rows + level.columns

/** The lengths of the runs of filled cells, in order. */
export function runsOf(filled: readonly boolean[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const on of filled) {
    if (on) run++
    else if (run) {
      runs.push(run)
      run = 0
    }
  }
  if (run) runs.push(run)
  return runs
}

/** The clue of every line, rows first, then columns. */
export function cluesOf(level: LevelDefinition, solution: readonly boolean[]): number[][] {
  return Array.from({ length: lineCount(level) }, (_, line) => runsOf(lineCells(level, line).map((cell) => solution[cell])))
}

/**
 * Everything one line's clue proves about its cells, given what is already known: a cell is
 * filled if every arrangement of the runs fills it, and empty if none does. Null if no
 * arrangement fits at all.
 */
export function solveLine(clue: readonly number[], cells: readonly CellState[]): CellState[] | null {
  const n = cells.length
  const k = clue.length
  // Prefix counts, so "no empty cell in a stretch" and "no filled cell in a stretch" are quick to check.
  const empties = new Int32Array(n + 1)
  const fills = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    empties[i + 1] = empties[i] + (cells[i] === EMPTY ? 1 : 0)
    fills[i + 1] = fills[i] + (cells[i] === FILLED ? 1 : 0)
  }
  const canFillStretch = (from: number, to: number) => empties[to] - empties[from] === 0
  const canClearStretch = (from: number, to: number) => fills[to] - fills[from] === 0

  // before[j][i]: the first j runs fit in cells [0, i). after[j][i]: runs j onwards fit in cells [i, n).
  const before = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1))
  const after = Array.from({ length: k + 1 }, () => new Uint8Array(n + 2))
  for (let i = 0; i <= n; i++) before[0][i] = canClearStretch(0, i) ? 1 : 0
  for (let j = 1; j <= k; j++) {
    const length = clue[j - 1]
    for (let i = 1; i <= n; i++) {
      let fits = cells[i - 1] !== FILLED && before[j][i - 1] === 1
      const start = i - length
      if (!fits && start >= 0 && canFillStretch(start, i)) {
        fits = j === 1 ? before[0][start] === 1 : start >= 1 && cells[start - 1] !== FILLED && before[j - 1][start - 1] === 1
      }
      before[j][i] = fits ? 1 : 0
    }
  }
  for (let i = 0; i <= n; i++) after[k][i] = canClearStretch(i, n) ? 1 : 0
  for (let j = k - 1; j >= 0; j--) {
    const length = clue[j]
    for (let i = n - 1; i >= 0; i--) {
      let fits = cells[i] !== FILLED && after[j][i + 1] === 1
      const end = i + length
      if (!fits && end <= n && canFillStretch(i, end)) {
        fits = j === k - 1 ? after[k][end] === 1 : end < n && cells[end] !== FILLED && after[j + 1][end + 1] === 1
      }
      after[j][i] = fits ? 1 : 0
    }
  }
  if (!before[k][n]) return null

  const canBeEmpty = new Uint8Array(n)
  for (let c = 0; c < n; c++) {
    if (cells[c] === FILLED) continue
    for (let j = 0; j <= k; j++) {
      if (before[j][c] && after[j][c + 1]) {
        canBeEmpty[c] = 1
        break
      }
    }
  }
  // Every place each run can sit, marked with a difference array.
  const covered = new Int32Array(n + 1)
  for (let j = 0; j < k; j++) {
    const length = clue[j]
    for (let start = 0; start + length <= n; start++) {
      const end = start + length
      if (!canFillStretch(start, end)) continue
      const left = j === 0 ? before[0][start] === 1 : start >= 1 && cells[start - 1] !== FILLED && before[j][start - 1] === 1
      if (!left) continue
      const right = j === k - 1 ? after[k][end] === 1 : end < n && cells[end] !== FILLED && after[j + 1][end + 1] === 1
      if (!right) continue
      covered[start]++
      covered[end]--
    }
  }
  const result = cells.slice() as CellState[]
  let running = 0
  for (let c = 0; c < n; c++) {
    running += covered[c]
    const canBeFilled = running > 0
    if (!canBeFilled && !canBeEmpty[c]) return null
    if (!canBeEmpty[c]) result[c] = FILLED
    else if (!canBeFilled) result[c] = EMPTY
  }
  return result
}

/** One line's worth of progress: the cells a line's clue proves, and what they are. */
export interface LineStep {
  line: number
  cells: number[]
  states: CellState[]
}

/**
 * The next line that proves something new, preferring the one that settles the most cells.
 * Null if no line can add anything; 'contradiction' if what is known breaks a clue.
 */
export function nextLineStep(level: LevelDefinition, clues: readonly number[][], grid: readonly CellState[]): LineStep | null | 'contradiction' {
  let best: LineStep | null = null
  for (let line = 0; line < lineCount(level); line++) {
    const cells = lineCells(level, line)
    const known = cells.map((cell) => grid[cell])
    const solved = solveLine(clues[line], known)
    if (!solved) return 'contradiction'
    const changed = cells.filter((_, i) => solved[i] !== known[i])
    if (changed.length && (!best || changed.length > best.cells.length)) {
      best = { line, cells: changed, states: changed.map((cell) => solved[cells.indexOf(cell)]) }
    }
  }
  return best
}

/**
 * Solves as far as line-by-line logic goes, revisiting a line whenever a crossing line changed
 * one of its cells. Returns the grid reached and how many sweeps it took.
 */
export function solveByLines(
  level: LevelDefinition,
  clues: readonly number[][],
  start: readonly CellState[] = new Array<CellState>(level.columns * level.rows).fill(UNKNOWN),
): { grid: CellState[]; solved: boolean; sweeps: number } {
  const grid = start.slice() as CellState[]
  const lines = lineCount(level)
  let dirty = new Set(Array.from({ length: lines }, (_, line) => line))
  let sweeps = 0
  while (dirty.size) {
    sweeps++
    const next = new Set<number>()
    for (const line of dirty) {
      const cells = lineCells(level, line)
      const solved = solveLine(
        clues[line],
        cells.map((cell) => grid[cell]),
      )
      if (!solved) return { grid, solved: false, sweeps }
      cells.forEach((cell, i) => {
        if (solved[i] === grid[cell]) return
        grid[cell] = solved[i]
        const row = Math.floor(cell / level.columns)
        const column = cell % level.columns
        next.add(line < level.rows ? level.rows + column : row)
      })
    }
    dirty = next
  }
  return { grid, solved: !grid.includes(UNKNOWN), sweeps }
}

/** A random picture in the level's style: noise, perhaps smoothed into blobs, often mirrored like an emblem. */
function randomPicture(level: LevelDefinition, random: () => number): boolean[] {
  const { columns, rows } = level
  const mirror = random() < level.mirror
  let cells = Array.from({ length: columns * rows }, () => random() < level.density)
  for (let pass = 0; pass < level.smoothing; pass++) {
    cells = cells.map((on, cell) => {
      const row = Math.floor(cell / columns)
      const column = cell % columns
      let around = 0
      let total = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr
          const c = column + dc
          if (r < 0 || r >= rows || c < 0 || c >= columns) continue
          total++
          if (cells[r * columns + c]) around++
        }
      }
      // Majority vote, with ties keeping the cell as it was.
      return around * 2 === total ? on : around * 2 > total
    })
  }
  if (mirror) {
    cells = cells.map((on, cell) => {
      const row = Math.floor(cell / columns)
      const column = cell % columns
      return column < columns / 2 ? on : cells[row * columns + (columns - 1 - column)]
    })
  }
  return cells
}

/** Whether a solution makes a good puzzle: a fair amount filled, no blank lines, and solvable line by line. */
export function isGoodPuzzle(level: LevelDefinition, solution: readonly boolean[]): boolean {
  const filled = solution.filter(Boolean).length / solution.length
  if (filled < 0.4 || filled > 0.72) return false
  const clues = cluesOf(level, solution)
  if (clues.some((clue) => clue.length === 0)) return false
  return solveByLines(level, clues).solved
}

/** A new puzzle's solution: a picture that logic alone, one line at a time, can find. */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): boolean[] {
  let picture = randomPicture(level, random)
  for (let attempt = 0; attempt < 3000 && !isGoodPuzzle(level, picture); attempt++) picture = randomPicture(level, random)
  return picture
}

// ———————————————————————————————————————— Hints

export type Hint =
  /** Crosses on cells that belong to the picture. */
  | { kind: 'wrong-cross'; cells: number[] }
  /** What one line's clue proves. */
  | { kind: 'line'; line: number; cells: number[]; states: CellState[] }

/**
 * What to do next: take back crosses on picture cells if there are any, otherwise the line that
 * proves the most new cells. Wrong fills never stay on the board, so every fill can be trusted.
 */
export function findHint(
  level: LevelDefinition,
  clues: readonly number[][],
  solution: readonly boolean[],
  cells: readonly CellState[],
): Hint | null {
  const wrongCrosses = cells.flatMap((mark, cell) => (mark === EMPTY && solution[cell] ? [cell] : []))
  if (wrongCrosses.length) return { kind: 'wrong-cross', cells: wrongCrosses }
  const step = nextLineStep(level, clues, cells)
  if (step && step !== 'contradiction') return { kind: 'line', ...step }
  // Line logic never runs dry on generated puzzles; if it somehow does, the picture names a cell.
  const cell = cells.indexOf(UNKNOWN)
  if (cell < 0) return null
  return { kind: 'line', line: Math.floor(cell / level.columns), cells: [cell], states: [solution[cell] ? FILLED : EMPTY] }
}
