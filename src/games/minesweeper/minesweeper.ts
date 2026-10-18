/**
 * Minesweeper rules, and a solver that reasons only from the numbers a player can see. Boards are
 * generated so that this solver can clear them from the first click, which means no board ever
 * forces a guess.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

export interface LevelDefinition {
  id: LevelId
  name: string
  columns: number
  rows: number
  mines: number
}

/** Boards are taller than wide, which suits phones; wide screens show them turned sideways. */
export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', columns: 9, rows: 9, mines: 10 },
  medium: { id: 'medium', name: 'Medium', columns: 10, rows: 13, mines: 22 },
  hard: { id: 'hard', name: 'Hard', columns: 10, rows: 16, mines: 35 },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

export const cellCount = (level: LevelDefinition) => level.columns * level.rows

const neighbourCache = new Map<string, number[][]>()

/** The up to eight cells around each cell. */
export function neighbours(level: LevelDefinition): number[][] {
  const key = `${level.columns}x${level.rows}`
  const cached = neighbourCache.get(key)
  if (cached) return cached
  const { columns, rows } = level
  const lists: number[][] = []
  for (let cell = 0; cell < columns * rows; cell++) {
    const row = Math.floor(cell / columns)
    const column = cell % columns
    const list: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr
        const c = column + dc
        if ((dr || dc) && r >= 0 && r < rows && c >= 0 && c < columns) list.push(r * columns + c)
      }
    }
    lists.push(list)
  }
  neighbourCache.set(key, lists)
  return lists
}

/** How many mines touch each cell. */
export function countMines(level: LevelDefinition, mines: readonly boolean[]): number[] {
  return neighbours(level).map((around) => around.reduce((sum, cell) => sum + (mines[cell] ? 1 : 0), 0))
}

/**
 * The cells a click on `cell` opens: the cell itself and, where it touches no mines, everything
 * around it, spreading out through every connected empty area. Flagged cells stay shut.
 */
export function cellsToOpen(
  level: LevelDefinition,
  counts: readonly number[],
  revealed: readonly boolean[],
  flags: readonly boolean[],
  cell: number,
): number[] {
  if (revealed[cell] || flags[cell]) return []
  const around = neighbours(level)
  const opened = new Set([cell])
  const queue = [cell]
  while (queue.length) {
    const current = queue.pop()!
    if (counts[current] !== 0) continue
    for (const next of around[current]) {
      if (!opened.has(next) && !revealed[next] && !flags[next]) {
        opened.add(next)
        queue.push(next)
      }
    }
  }
  return [...opened]
}

/**
 * Bechtel's Board Benchmark Value (3BV): the fewest clicks that clear the board without flags or
 * chords. Each empty area counts once, and so does every number outside them.
 */
export function boardValue(level: LevelDefinition, mines: readonly boolean[], counts: readonly number[]): number {
  const size = cellCount(level)
  const none = new Array<boolean>(size).fill(false)
  const opened = new Array<boolean>(size).fill(false)
  let value = 0
  for (let cell = 0; cell < size; cell++) {
    if (mines[cell] || opened[cell] || counts[cell] !== 0) continue
    value++
    for (const open of cellsToOpen(level, counts, opened, none, cell)) opened[open] = true
  }
  for (let cell = 0; cell < size; cell++) if (!mines[cell] && !opened[cell]) value++
  return value
}

// ———————————————————————————————————————— Reasoning

export type Rule = 'single' | 'pair' | 'count'

/** Something the visible numbers prove about hidden cells. */
export interface Deduction {
  kind: 'safe' | 'mine'
  cells: number[]
  /** The revealed numbers that prove it. */
  clues: number[]
  /** One number on its own, two numbers together, or counting the mines left. */
  rule: Rule
}

/** What is known about each cell: revealed (its number shows), or deduced safe or mine. */
const UNKNOWN = -1
const SAFE = 0
const MINE = 1

interface Knowledge {
  level: LevelDefinition
  counts: readonly number[]
  revealed: Uint8Array
  known: Int8Array
}

interface Constraint {
  clue: number
  cells: number[]
  /** Mines still to be found among `cells`. */
  mines: number
}

/** One constraint per revealed number that still touches unknown cells. */
function constraints({ level, counts, revealed, known }: Knowledge): Constraint[] {
  const around = neighbours(level)
  const list: Constraint[] = []
  for (let clue = 0; clue < revealed.length; clue++) {
    if (!revealed[clue]) continue
    const cells: number[] = []
    let mines = counts[clue]
    for (const cell of around[clue]) {
      if (known[cell] === MINE) mines--
      else if (known[cell] === UNKNOWN) cells.push(cell)
    }
    if (cells.length) list.push({ clue, cells, mines })
  }
  return list
}

function singleRule(list: Constraint[]): Deduction | null {
  let mine: Deduction | null = null
  for (const { clue, cells, mines } of list) {
    if (mines === 0) return { kind: 'safe', cells, clues: [clue], rule: 'single' }
    if (mines === cells.length && !mine) mine = { kind: 'mine', cells, clues: [clue], rule: 'single' }
  }
  return mine
}

/**
 * Two numbers that share some unknown cells: the mines in the shared part are limited by both,
 * which can settle the cells only one of them touches (or the shared ones).
 */
function pairRule(list: Constraint[]): Deduction | null {
  const byCell = new Map<number, Constraint[]>()
  for (const constraint of list) {
    for (const cell of constraint.cells) {
      const sharing = byCell.get(cell)
      if (sharing) sharing.push(constraint)
      else byCell.set(cell, [constraint])
    }
  }
  let mine: Deduction | null = null
  const seen = new Set<string>()
  for (const a of list) {
    for (const cell of a.cells) {
      for (const b of byCell.get(cell)!) {
        if (b === a) continue
        const key = a.clue < b.clue ? `${a.clue},${b.clue}` : `${b.clue},${a.clue}`
        if (seen.has(key)) continue
        seen.add(key)
        const shared = a.cells.filter((x) => b.cells.includes(x))
        const onlyA = a.cells.filter((x) => !b.cells.includes(x))
        const onlyB = b.cells.filter((x) => !a.cells.includes(x))
        // Mines in the shared cells: at least what each number can't fit elsewhere, at most what both allow.
        const least = Math.max(0, a.mines - onlyA.length, b.mines - onlyB.length)
        const most = Math.min(shared.length, a.mines, b.mines)
        const clues = [a.clue, b.clue]
        const options: [number[], number, number][] = [
          [onlyA, a.mines - most, a.mines - least],
          [onlyB, b.mines - most, b.mines - least],
          [shared, least, most],
        ]
        for (const [cells, fewest, largest] of options) {
          if (!cells.length) continue
          if (largest === 0) return { kind: 'safe', cells, clues, rule: 'pair' }
          if (fewest === cells.length && !mine) mine = { kind: 'mine', cells, clues, rule: 'pair' }
        }
      }
    }
  }
  return mine
}

/** Mine counts a group of cells can hold, as flags indexed by count. */
type Counts = boolean[]

function addCounts(a: Counts, b: Counts): Counts {
  const sum: Counts = new Array<boolean>(a.length + b.length - 1).fill(false)
  for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) if (b[j]) sum[i + j] = true
  return sum
}

/** Gives up on a position whose possibilities take longer than this to list. */
const COUNT_BUDGET = 60_000

/**
 * The thorough rule: lists every way the mines could sit around the numbers, together with the
 * total number of mines, and keeps what holds in all of them. Says when there are too many ways
 * to list.
 */
function countRule(knowledge: Knowledge, list: Constraint[]): Deduction | null | 'too-hard' {
  const { level, revealed, known } = knowledge
  const size = cellCount(level)
  let minesLeft = level.mines
  for (let cell = 0; cell < size; cell++) if (known[cell] === MINE) minesLeft--

  // Group the unknown cells next to numbers into independent areas.
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(x, root)
    return root
  }
  for (const { cells } of list) {
    for (const cell of cells) if (!parent.has(cell)) parent.set(cell, cell)
    for (const cell of cells.slice(1)) parent.set(find(cell), find(cells[0]))
  }
  const areas = new Map<number, { cells: number[]; constraints: Constraint[] }>()
  for (const cell of parent.keys()) {
    const root = find(cell)
    if (!areas.has(root)) areas.set(root, { cells: [], constraints: [] })
    areas.get(root)!.cells.push(cell)
  }
  for (const constraint of list) areas.get(find(constraint.cells[0]))!.constraints.push(constraint)
  const floating: number[] = []
  for (let cell = 0; cell < size; cell++) if (!revealed[cell] && known[cell] === UNKNOWN && !parent.has(cell)) floating.push(cell)

  // List every arrangement of each area, noting for each cell which mine totals allow it to be a mine or safe.
  let budget = COUNT_BUDGET
  const results: { cells: number[]; clues: number[]; totals: Counts; asMine: Counts[]; asSafe: Counts[] }[] = []
  for (const { cells, constraints: rules } of areas.values()) {
    const index = new Map(cells.map((cell, i) => [cell, i]))
    const rulesOf = cells.map(() => [] as number[])
    rules.forEach((rule, r) => rule.cells.forEach((cell) => rulesOf[index.get(cell)!].push(r)))
    const placed = rules.map(() => 0)
    const open = rules.map((rule) => rule.cells.length)
    const value = new Array<number>(cells.length).fill(0)
    const totals: Counts = new Array<boolean>(cells.length + 1).fill(false)
    const asMine = cells.map(() => new Array<boolean>(cells.length + 1).fill(false))
    const asSafe = cells.map(() => new Array<boolean>(cells.length + 1).fill(false))
    let tooHard = false

    const visit = (i: number, mines: number) => {
      if (--budget < 0) {
        tooHard = true
        return
      }
      if (i === cells.length) {
        totals[mines] = true
        for (let j = 0; j < cells.length; j++) (value[j] ? asMine : asSafe)[j][mines] = true
        return
      }
      for (const choice of [0, 1]) {
        let fits = true
        for (const r of rulesOf[i]) {
          const nowPlaced = placed[r] + choice
          if (nowPlaced > rules[r].mines || nowPlaced + open[r] - 1 < rules[r].mines) fits = false
        }
        if (!fits) continue
        for (const r of rulesOf[i]) {
          placed[r] += choice
          open[r]--
        }
        value[i] = choice
        visit(i + 1, mines + choice)
        for (const r of rulesOf[i]) {
          placed[r] -= choice
          open[r]++
        }
        if (tooHard) return
      }
    }
    visit(0, 0)
    if (tooHard) return 'too-hard'
    results.push({ cells, clues: rules.map((rule) => rule.clue), totals, asMine, asSafe })
  }

  // Combine the areas with the cells away from every number, under the total mine count.
  const fits = (frontierMines: number) => frontierMines <= minesLeft && minesLeft - frontierMines <= floating.length
  const allTotals = results.reduce<Counts>((sum, area) => addCounts(sum, area.totals), [true])
  const safe: number[] = []
  const mine: number[] = []
  const clues = new Set<number>()
  for (const [a, area] of results.entries()) {
    const others = results.reduce<Counts>((sum, other, b) => (b === a ? sum : addCounts(sum, other.totals)), [true])
    const possible = (counts: Counts) =>
      counts.some((ok, mines) => ok && others.some((otherOk, more) => otherOk && fits(mines + more)))
    for (const [i, cell] of area.cells.entries()) {
      const canMine = possible(area.asMine[i])
      const canSafe = possible(area.asSafe[i])
      if (canMine === canSafe) continue
      if (canMine) mine.push(cell)
      else safe.push(cell)
      for (const clue of area.clues) clues.add(clue)
    }
  }
  if (floating.length) {
    const spare = allTotals.flatMap((ok, mines) => (ok && fits(mines) ? [minesLeft - mines] : []))
    if (spare.length && spare.every((count) => count === 0)) safe.push(...floating)
    else if (spare.length && spare.every((count) => count === floating.length)) mine.push(...floating)
  }
  if (safe.length) return { kind: 'safe', cells: safe, clues: [...clues], rule: 'count' }
  if (mine.length) return { kind: 'mine', cells: mine, clues: [...clues], rule: 'count' }
  return null
}

function knowledgeOf(
  level: LevelDefinition,
  counts: readonly number[],
  revealed: readonly boolean[],
): Knowledge {
  const known = new Int8Array(cellCount(level)).fill(UNKNOWN)
  const shown = new Uint8Array(cellCount(level))
  revealed.forEach((open, cell) => {
    if (open) {
      shown[cell] = 1
      known[cell] = SAFE
    }
  })
  return { level, counts, revealed: shown, known }
}

/** The simplest next deduction, trying one number at a time, then pairs, then the full count. */
function nextDeduction(knowledge: Knowledge): Deduction | null | 'too-hard' {
  const list = constraints(knowledge)
  return singleRule(list) ?? pairRule(list) ?? countRule(knowledge, list)
}

/**
 * Deductions a player could make from what is revealed, in order. Hidden cells it proves safe
 * stay hidden (their numbers are unknown), but what it proves feeds into later deductions.
 * Player flags are ignored: they might be wrong.
 */
export function* deductions(
  level: LevelDefinition,
  counts: readonly number[],
  revealed: readonly boolean[],
): Generator<Deduction, 'stuck' | 'too-hard'> {
  const knowledge = knowledgeOf(level, counts, revealed)
  for (;;) {
    const step = nextDeduction(knowledge)
    if (step === null) return 'stuck'
    if (step === 'too-hard') return 'too-hard'
    for (const cell of step.cells) knowledge.known[cell] = step.kind === 'safe' ? SAFE : MINE
    yield step
  }
}

/**
 * Whether the solver clears the whole board from a first click on `start`, opening every cell
 * it proves safe as it goes, as a player would. Without `counting`, it may only reason from one
 * or two numbers at a time.
 */
export function solvesWithoutGuessing(
  level: LevelDefinition,
  mines: readonly boolean[],
  start: number,
  counting = true,
): boolean {
  const counts = countMines(level, mines)
  const size = cellCount(level)
  const flags = new Array<boolean>(size).fill(false)
  const revealed = new Array<boolean>(size).fill(false)
  const knowledge = knowledgeOf(level, counts, revealed)
  let hidden = size
  const open = (cell: number) => {
    for (const opened of cellsToOpen(level, counts, revealed, flags, cell)) {
      revealed[opened] = true
      knowledge.revealed[opened] = 1
      knowledge.known[opened] = SAFE
      hidden--
    }
  }
  if (mines[start]) return false
  open(start)
  while (hidden > level.mines) {
    const list = constraints(knowledge)
    // Settle everything single numbers prove before trying anything harder.
    let progressed = false
    for (const { cells, mines: left } of list) {
      if (left !== 0 && left !== cells.length) continue
      for (const cell of cells) {
        if (knowledge.known[cell] !== UNKNOWN) continue
        if (left === 0) open(cell)
        else knowledge.known[cell] = MINE
        progressed = true
      }
    }
    if (progressed) continue
    const step = pairRule(list) ?? (counting ? countRule(knowledge, list) : null)
    if (step === null || step === 'too-hard') return false
    for (const cell of step.cells) {
      if (step.kind === 'safe') open(cell)
      else knowledge.known[cell] = MINE
    }
  }
  return true
}

/**
 * Lays mines for a board that opens up around `start` and can be cleared from there by logic
 * alone (on Easy, simple logic). Tries random layouts until one works: a few on Easy, a few dozen
 * on Hard, each taking a fraction of a millisecond.
 */
export function generateMines(level: LevelDefinition, start: number, random: () => number = Math.random): boolean[] {
  const size = cellCount(level)
  const keepClear = new Set([start, ...neighbours(level)[start]])
  const spots = Array.from({ length: size }, (_, cell) => cell).filter((cell) => !keepClear.has(cell))
  let mines: boolean[] = []
  for (let attempt = 0; attempt < 2000; attempt++) {
    for (let i = 0; i < level.mines; i++) {
      const j = i + Math.floor(random() * (spots.length - i))
      const swap = spots[i]
      spots[i] = spots[j]
      spots[j] = swap
    }
    mines = new Array<boolean>(size).fill(false)
    for (const cell of spots.slice(0, level.mines)) mines[cell] = true
    if (solvesWithoutGuessing(level, mines, start, level.id !== 'easy')) return mines
  }
  return mines
}

/** A hint: cells to open, cells that must be mines, or flags that are wrong; and the numbers that show it. */
export interface Hint {
  kind: 'safe' | 'mine' | 'wrong-flag'
  cells: number[]
  clues: number[]
  rule: Rule
}

/**
 * The first thing the revealed numbers prove that the board doesn't show yet: a hidden cell
 * that is safe, a mine without a flag, or a flag on a safe cell. Null if nothing can be proved.
 */
export function findHint(
  level: LevelDefinition,
  counts: readonly number[],
  revealed: readonly boolean[],
  flags: readonly boolean[],
): Hint | null {
  for (const { kind, cells, clues, rule } of deductions(level, counts, revealed)) {
    if (kind === 'safe') {
      const wrong = cells.filter((cell) => flags[cell])
      return wrong.length ? { kind: 'wrong-flag', cells: wrong, clues, rule } : { kind, cells, clues, rule }
    }
    const unflagged = cells.filter((cell) => !flags[cell])
    if (unflagged.length) return { kind, cells: unflagged, clues, rule }
  }
  return null
}
