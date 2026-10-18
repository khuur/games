/**
 * Slitherlink rules, a solver that reasons like a person (it grades puzzles, proves each one has
 * a single solution and explains hints), and a puzzle maker.
 *
 * Draw one loop along the grid lines between the dots. A number says how many of its cell's four
 * sides the loop runs along. The loop never crosses itself, branches or touches itself.
 */

export type LevelId = 'easy' | 'medium' | 'hard'

/** Techniques from easiest to hardest. */
export type Technique = 'basic' | 'local' | 'lookahead'
export const TECHNIQUES: readonly Technique[] = ['basic', 'local', 'lookahead']

export interface LevelDefinition {
  id: LevelId
  name: string
  rows: number
  cols: number
  /** The hardest technique a puzzle may need. */
  hardest: Technique
  /** Puzzles must need at least this technique somewhere (so harder levels are never easy). */
  needs: Technique | null
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', rows: 5, cols: 5, hardest: 'basic', needs: null },
  medium: { id: 'medium', name: 'Medium', rows: 7, cols: 7, hardest: 'local', needs: 'local' },
  hard: { id: 'hard', name: 'Hard', rows: 8, cols: 8, hardest: 'lookahead', needs: 'lookahead' },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'medium', 'hard']
export const DEFAULT_LEVEL: LevelId = 'easy'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

/** What an edge between two dots holds: nothing yet, a piece of the loop, or a cross (no loop). */
export const UNKNOWN = 0
export const LINE = 1
export const CROSS = 2
export type EdgeState = typeof UNKNOWN | typeof LINE | typeof CROSS

/** No clue in a cell. */
export const NO_CLUE = -1

// ———————————————————————————————————————— The grid's dots, edges and cells

/**
 * How cells, edges and dots connect. Horizontal edges come first, row by row (rows + 1 of them,
 * each `cols` long), then vertical ones (`rows` rows of cols + 1). Dots go row by row.
 */
export interface Geometry {
  rows: number
  cols: number
  edgeCount: number
  /** How many of the edges are horizontal. */
  horizontal: number
  /** Each cell's sides: top, right, bottom, left. */
  cellEdges: number[][]
  /** Each cell's corners: top left, top right, bottom right, bottom left. */
  cellCorners: number[][]
  /** The two to four edges at each dot. */
  dotEdges: number[][]
  /** Each edge's two dots. */
  edgeDots: [number, number][]
  /** The one or two cells beside each edge. */
  edgeCells: number[][]
}

const geometryCache = new Map<string, Geometry>()

export function geometryOf(rows: number, cols: number): Geometry {
  const key = `${rows}×${cols}`
  const cached = geometryCache.get(key)
  if (cached) return cached
  const horizontal = (rows + 1) * cols
  const hEdge = (r: number, c: number) => r * cols + c
  const vEdge = (r: number, c: number) => horizontal + r * (cols + 1) + c
  const dot = (r: number, c: number) => r * (cols + 1) + c
  const edgeCount = horizontal + rows * (cols + 1)
  const cellEdges: number[][] = []
  const cellCorners: number[][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cellEdges.push([hEdge(r, c), vEdge(r, c + 1), hEdge(r + 1, c), vEdge(r, c)])
      cellCorners.push([dot(r, c), dot(r, c + 1), dot(r + 1, c + 1), dot(r + 1, c)])
    }
  }
  const dotEdges: number[][] = []
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const list: number[] = []
      if (r > 0) list.push(vEdge(r - 1, c))
      if (c < cols) list.push(hEdge(r, c))
      if (r < rows) list.push(vEdge(r, c))
      if (c > 0) list.push(hEdge(r, c - 1))
      dotEdges.push(list)
    }
  }
  const edgeDots: [number, number][] = []
  const edgeCells: number[][] = []
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      edgeDots.push([dot(r, c), dot(r, c + 1)])
      edgeCells.push([...(r > 0 ? [(r - 1) * cols + c] : []), ...(r < rows ? [r * cols + c] : [])])
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      edgeDots.push([dot(r, c), dot(r + 1, c)])
      edgeCells.push([...(c > 0 ? [r * cols + c - 1] : []), ...(c < cols ? [r * cols + c] : [])])
    }
  }
  const geometry = { rows, cols, edgeCount, horizontal, cellEdges, cellCorners, dotEdges, edgeDots, edgeCells }
  geometryCache.set(key, geometry)
  return geometry
}

/** Each cell's clue for a loop: how many of its sides the loop runs along. */
export function cluesOf(geometry: Geometry, loop: readonly number[]): number[] {
  return geometry.cellEdges.map((sides) => sides.filter((edge) => loop[edge] === LINE).length)
}

// ———————————————————————————————————————— The loop as it stands

interface Board {
  geometry: Geometry
  clues: readonly number[]
  edges: Uint8Array
}

const boardOf = (geometry: Geometry, clues: readonly number[], edges: readonly number[]): Board => ({
  geometry,
  clues,
  edges: Uint8Array.from(edges),
})

const copyBoard = (board: Board): Board => ({ ...board, edges: board.edges.slice() })

/**
 * The pieces of loop drawn so far: whether one has closed into a loop, and if so whether that
 * loop is everything (all lines, every clue met), plus the open edges that would close a loop too
 * soon. Null when the lines can't be part of any solution.
 */
function loopState(board: Board): { solved: boolean; closing: number[] } | null {
  const { geometry, edges, clues } = board
  const dots = geometry.dotEdges.length
  const parent = new Int32Array(dots)
  for (let dot = 0; dot < dots; dot++) parent[dot] = dot
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const degree = new Uint8Array(dots)
  let lines = 0
  for (let edge = 0; edge < geometry.edgeCount; edge++) {
    if (edges[edge] !== LINE) continue
    lines++
    const [a, b] = geometry.edgeDots[edge]
    degree[a]++
    degree[b]++
    parent[find(a)] = find(b)
  }
  if (!lines) return { solved: false, closing: [] }
  // Count each piece's lines and loose ends: a piece without loose ends is a closed loop.
  const pieceLines = new Int32Array(dots)
  const looseEnds = new Int32Array(dots)
  for (let edge = 0; edge < geometry.edgeCount; edge++) if (edges[edge] === LINE) pieceLines[find(geometry.edgeDots[edge][0])]++
  for (let dot = 0; dot < dots; dot++) if (degree[dot] === 1) looseEnds[find(dot)]++
  const cluesMet = (extra = -1) =>
    clues.every((clue, cell) => {
      if (clue === NO_CLUE) return true
      let count = 0
      for (const edge of geometry.cellEdges[cell]) if (edges[edge] === LINE || edge === extra) count++
      return count === clue
    })
  for (let root = 0; root < dots; root++) {
    if (!pieceLines[root] || looseEnds[root]) continue
    // A closed loop: it has to be the whole answer.
    return pieceLines[root] === lines && cluesMet() ? { solved: true, closing: [] } : null
  }
  const closing: number[] = []
  for (let edge = 0; edge < geometry.edgeCount; edge++) {
    if (edges[edge] !== UNKNOWN) continue
    const [a, b] = geometry.edgeDots[edge]
    if (degree[a] !== 1 || degree[b] !== 1 || find(a) !== find(b)) continue
    // Closing this piece is fine only if it would finish the puzzle.
    if (pieceLines[find(a)] !== lines || !cluesMet(edge)) closing.push(edge)
  }
  return { solved: false, closing }
}

/**
 * Applies every basic deduction until none is left: clues that have all their lines (or need
 * every open side), dots with two lines or a loose end with one way on, and edges that would
 * close a loop too soon. False if the position turns out impossible.
 */
function propagate(board: Board): boolean {
  const { geometry, edges, clues } = board
  for (let changed = true; changed; ) {
    changed = false
    for (let cell = 0; cell < clues.length; cell++) {
      const clue = clues[cell]
      if (clue === NO_CLUE) continue
      let lines = 0
      let open = 0
      for (const edge of geometry.cellEdges[cell]) {
        if (edges[edge] === LINE) lines++
        else if (edges[edge] === UNKNOWN) open++
      }
      if (lines > clue || lines + open < clue) return false
      if (!open || (lines !== clue && lines + open !== clue)) continue
      const fill = lines === clue ? CROSS : LINE
      for (const edge of geometry.cellEdges[cell]) if (edges[edge] === UNKNOWN) edges[edge] = fill
      changed = true
    }
    for (const around of geometry.dotEdges) {
      let lines = 0
      let open = 0
      for (const edge of around) {
        if (edges[edge] === LINE) lines++
        else if (edges[edge] === UNKNOWN) open++
      }
      if (lines > 2 || (lines === 1 && open === 0)) return false
      if (!open) continue
      if (lines === 2 || (lines === 0 && open === 1)) {
        for (const edge of around) if (edges[edge] === UNKNOWN) edges[edge] = CROSS
        changed = true
      } else if (lines === 1 && open === 1) {
        for (const edge of around) if (edges[edge] === UNKNOWN) edges[edge] = LINE
        changed = true
      }
    }
    if (!changed) {
      const state = loopState(board)
      if (!state) return false
      for (const edge of state.closing) edges[edge] = CROSS
      changed = state.closing.length > 0
    }
  }
  return true
}

const isSolved = (board: Board) => loopState(board)?.solved === true

// ———————————————————————————————————————— Steps a person could take

export type Reason =
  /** A 0: no line around it. */
  | 'zero'
  /** A clue that has all its lines: its other sides are crossed. */
  | 'clue-full'
  /** A clue that needs every side still open. */
  | 'clue-fill'
  /** A dot with two lines: nothing else meets there. */
  | 'dot-full'
  /** A loose end with just one way on. */
  | 'dot-continue'
  /** A dot with one open side left can't take a line. */
  | 'dot-dead'
  /** A line here would close a loop too soon. */
  | 'loop'
  /** Every way around a clue that keeps its corners whole agrees on these edges. */
  | 'local'
  /** The opposite leads to an impossible position. */
  | 'lookahead'
  /** Logic ran dry; the answer says so. */
  | 'reveal'

export interface Step {
  technique: Technique
  reason: Reason
  /** Edges to draw. */
  lines: number[]
  /** Edges to cross out. */
  crosses: number[]
  /** The clue cell the reasoning is about. */
  cell?: number
  /** The dot the reasoning is about. */
  dot?: number
  /** For lookahead: what was tried on the edge, and failed. */
  tried?: EdgeState
}

function findClueStep(board: Board): Step | null {
  const { geometry, edges, clues } = board
  for (let cell = 0; cell < clues.length; cell++) {
    const clue = clues[cell]
    if (clue === NO_CLUE) continue
    const sides = geometry.cellEdges[cell]
    const lines = sides.filter((edge) => edges[edge] === LINE).length
    const open = sides.filter((edge) => edges[edge] === UNKNOWN)
    if (!open.length) continue
    if (lines === clue) return { technique: 'basic', reason: clue === 0 ? 'zero' : 'clue-full', lines: [], crosses: open, cell }
    if (lines + open.length === clue) return { technique: 'basic', reason: 'clue-fill', lines: open, crosses: [], cell }
  }
  return null
}

function findDotStep(board: Board): Step | null {
  const { geometry, edges } = board
  for (const [dot, around] of geometry.dotEdges.entries()) {
    const lines = around.filter((edge) => edges[edge] === LINE).length
    const open = around.filter((edge) => edges[edge] === UNKNOWN)
    if (!open.length) continue
    if (lines === 2) return { technique: 'basic', reason: 'dot-full', lines: [], crosses: open, dot }
    if (lines === 1 && open.length === 1) return { technique: 'basic', reason: 'dot-continue', lines: open, crosses: [], dot }
    if (lines === 0 && open.length === 1) return { technique: 'basic', reason: 'dot-dead', lines: [], crosses: open, dot }
  }
  return null
}

function findLoopStep(board: Board): Step | null {
  const state = loopState(board)
  return state?.closing.length ? { technique: 'basic', reason: 'loop', lines: [], crosses: state.closing.slice(0, 1) } : null
}

/**
 * Around one clue: every way to fill in its sides and the edges at its four corners that keeps
 * each corner dot at zero or two lines, and the clues beside it possible. Edges that all those
 * ways agree on are settled.
 */
const windowCache = new WeakMap<Geometry, number[][]>()

/** For each cell, its sides and every other edge at its corners. */
function windowsOf(geometry: Geometry): number[][] {
  let windows = windowCache.get(geometry)
  if (!windows) {
    windows = geometry.cellEdges.map((sides, cell) => [...new Set([...sides, ...geometry.cellCorners[cell].flatMap((dot) => geometry.dotEdges[dot])])])
    windowCache.set(geometry, windows)
  }
  return windows
}

function findLocalStep(board: Board): Step | null {
  const { geometry, edges, clues } = board
  const windows = windowsOf(geometry)
  for (let cell = 0; cell < clues.length; cell++) {
    if (clues[cell] === NO_CLUE) continue
    const open = windows[cell].filter((edge) => edges[edge] === UNKNOWN)
    if (!open.length) continue
    const corners = geometry.cellCorners[cell]
    const trial = edges.slice()
    const dotOk = (dot: number) => {
      let lines = 0
      let free = 0
      for (const edge of geometry.dotEdges[dot]) {
        if (trial[edge] === LINE) lines++
        else if (trial[edge] === UNKNOWN) free++
      }
      return lines <= 2 && !(lines === 1 && free === 0)
    }
    const cellOk = (other: number) => {
      const clue = clues[other]
      if (clue === NO_CLUE) return true
      let lines = 0
      let free = 0
      for (const edge of geometry.cellEdges[other]) {
        if (trial[edge] === LINE) lines++
        else if (trial[edge] === UNKNOWN) free++
      }
      return lines <= clue && lines + free >= clue
    }
    // Setting an edge can only upset its own corner dots and the clues beside it.
    const touched = open.map((edge) => ({
      dots: geometry.edgeDots[edge].filter((dot) => corners.includes(dot)),
      cells: geometry.edgeCells[edge],
    }))
    const seenLine = new Uint8Array(open.length)
    const seenCross = new Uint8Array(open.length)
    let ways = 0
    const visit = (i: number) => {
      if (i === open.length) {
        ways++
        for (let k = 0; k < open.length; k++) {
          if (trial[open[k]] === LINE) seenLine[k] = 1
          else seenCross[k] = 1
        }
        return
      }
      for (const state of [LINE, CROSS]) {
        trial[open[i]] = state
        if (touched[i].dots.every(dotOk) && touched[i].cells.every(cellOk)) visit(i + 1)
      }
      trial[open[i]] = UNKNOWN
    }
    visit(0)
    if (!ways) continue
    const lines = open.filter((_, k) => !seenCross[k])
    const crosses = open.filter((_, k) => !seenLine[k])
    if (lines.length || crosses.length) return { technique: 'local', reason: 'local', lines, crosses, cell }
  }
  return null
}

/** An edge whose opposite, followed through with the basic rules, leads to an impossible position. */
function findLookaheadStep(board: Board): Step | null {
  const { geometry, edges } = board
  // Edges at loose ends first: that's where trying something says the most, soonest.
  const degree = geometry.dotEdges.map((around) => around.filter((edge) => edges[edge] === LINE).length)
  const open: number[] = []
  for (let edge = 0; edge < geometry.edgeCount; edge++) if (edges[edge] === UNKNOWN) open.push(edge)
  const score = (edge: number) => geometry.edgeDots[edge].reduce((sum, dot) => sum + (degree[dot] === 1 ? 2 : degree[dot] === 0 ? 0 : 1), 0)
  open.sort((a, b) => score(b) - score(a))
  for (const edge of open) {
    for (const tried of [LINE, CROSS] as const) {
      const trial = copyBoard(board)
      trial.edges[edge] = tried
      if (!propagate(trial)) {
        return tried === LINE
          ? { technique: 'lookahead', reason: 'lookahead', lines: [], crosses: [edge], tried }
          : { technique: 'lookahead', reason: 'lookahead', lines: [edge], crosses: [], tried }
      }
    }
  }
  return null
}

function applyStep(board: Board, step: Step) {
  for (const edge of step.lines) board.edges[edge] = LINE
  for (const edge of step.crosses) board.edges[edge] = CROSS
}

/**
 * Solves with techniques up to `hardest`. Says whether it got all the way, and the hardest
 * technique it needed. Every step is sound, so getting all the way proves the solution is the
 * only one.
 */
export function solveLogically(rows: number, cols: number, clues: readonly number[], hardest: Technique = 'lookahead') {
  const geometry = geometryOf(rows, cols)
  const board = boardOf(geometry, clues, new Array<number>(geometry.edgeCount).fill(UNKNOWN))
  const allowed = (technique: Technique) => TECHNIQUES.indexOf(technique) <= TECHNIQUES.indexOf(hardest)
  let needed: Technique = 'basic'
  for (;;) {
    if (!propagate(board)) return { solved: false, needed }
    if (isSolved(board)) return { solved: true, needed }
    const step = (allowed('local') ? findLocalStep(board) : null) ?? (allowed('lookahead') ? findLookaheadStep(board) : null)
    if (!step) return { solved: false, needed }
    if (TECHNIQUES.indexOf(step.technique) > TECHNIQUES.indexOf(needed)) needed = step.technique
    applyStep(board, step)
  }
}

/** The next step from a position (its lines and crosses taken as right). Null if logic can't find one. */
export function nextLogicalStep(rows: number, cols: number, clues: readonly number[], edges: readonly number[]): Step | null {
  const board = boardOf(geometryOf(rows, cols), clues, edges)
  return findClueStep(board) ?? findDotStep(board) ?? findLoopStep(board) ?? findLocalStep(board) ?? findLookaheadStep(board)
}

/** Up to `limit` solutions (as edge states with every loop edge a LINE), by search with the basic rules. */
export function findSolutions(rows: number, cols: number, clues: readonly number[], limit = 2): number[][] {
  const geometry = geometryOf(rows, cols)
  const found: number[][] = []
  const visit = (board: Board): boolean => {
    if (!propagate(board)) return false
    if (isSolved(board)) {
      found.push(Array.from(board.edges, (state) => (state === LINE ? LINE : UNKNOWN)))
      return found.length >= limit
    }
    // Branch on an open edge at a loose end if there is one, else on any open edge.
    let pick = -1
    for (let edge = 0; edge < geometry.edgeCount && pick < 0; edge++) {
      if (board.edges[edge] !== UNKNOWN) continue
      if (geometry.edgeDots[edge].some((dot) => geometry.dotEdges[dot].filter((other) => board.edges[other] === LINE).length === 1)) pick = edge
    }
    if (pick < 0) pick = board.edges.indexOf(UNKNOWN)
    if (pick < 0) return false
    for (const state of [LINE, CROSS]) {
      const next = copyBoard(board)
      next.edges[pick] = state
      if (visit(next)) return true
    }
    return false
  }
  visit(boardOf(geometry, clues, new Array<number>(geometry.edgeCount).fill(UNKNOWN)))
  return found
}

// ———————————————————————————————————————— Making puzzles

export interface Puzzle {
  /** Each cell's clue, or NO_CLUE. */
  clues: number[]
  /** The loop: LINE on its edges, UNKNOWN elsewhere. */
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

/**
 * A random blob of cells whose outline is a single loop: in one piece, without holes, and never
 * meeting itself at just a corner. Cells with fewer neighbours inside are favoured, which makes
 * for winding shapes rather than round ones.
 */
function randomBlob(rows: number, cols: number, random: () => number): boolean[] {
  const total = rows * cols
  const at = (inside: boolean[], r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && inside[r * cols + c]
  const sides = (cell: number) => {
    const r = Math.floor(cell / cols)
    const c = cell % cols
    return [r > 0 ? cell - cols : -1, r < rows - 1 ? cell + cols : -1, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1].filter((next) => next >= 0)
  }
  /** Whether every outside cell can still reach the grid's edge. */
  const noHoles = (inside: boolean[]) => {
    const seen = new Uint8Array(total)
    const queue: number[] = []
    for (let cell = 0; cell < total; cell++) {
      const r = Math.floor(cell / cols)
      const c = cell % cols
      if (!inside[cell] && (r === 0 || c === 0 || r === rows - 1 || c === cols - 1)) {
        seen[cell] = 1
        queue.push(cell)
      }
    }
    for (let i = 0; i < queue.length; i++) {
      for (const next of sides(queue[i])) {
        if (!inside[next] && !seen[next]) {
          seen[next] = 1
          queue.push(next)
        }
      }
    }
    return inside.every((cellInside, cell) => cellInside || seen[cell])
  }
  /** Whether a 2 × 2 block around the cell has its inside cells only at opposite corners. */
  const touchesAtCorner = (inside: boolean[], cell: number) => {
    const r = Math.floor(cell / cols)
    const c = cell % cols
    for (const top of [r - 1, r]) {
      for (const left of [c - 1, c]) {
        const a = at(inside, top, left)
        const b = at(inside, top, left + 1)
        const d = at(inside, top + 1, left)
        const e = at(inside, top + 1, left + 1)
        if ((a && e && !b && !d) || (b && d && !a && !e)) return true
      }
    }
    return false
  }
  const target = Math.round(total * (0.42 + random() * 0.14))
  for (;;) {
    const inside = new Array<boolean>(total).fill(false)
    const start = Math.floor(random() * total)
    inside[start] = true
    let count = 1
    for (let tries = 0; count < target && tries < total * 6; tries++) {
      const options: [number, number][] = []
      for (let cell = 0; cell < total; cell++) {
        if (inside[cell]) continue
        const neighbours = sides(cell).filter((next) => inside[next]).length
        if (neighbours) options.push([cell, (5 - neighbours) ** 2])
      }
      let roll = random() * options.reduce((sum, [, weight]) => sum + weight, 0)
      let cell = options[0][0]
      for (const [option, weight] of options) {
        roll -= weight
        if (roll < 0) {
          cell = option
          break
        }
      }
      inside[cell] = true
      if (touchesAtCorner(inside, cell) || !noHoles(inside)) inside[cell] = false
      else count++
    }
    if (count >= target * 0.8) return inside
  }
}

/** The outline of a blob, as edge states. */
function outline(geometry: Geometry, inside: readonly boolean[]): number[] {
  return geometry.edgeCells.map((cells) => {
    const insideCount = cells.filter((cell) => inside[cell]).length
    return (cells.length === 1 ? insideCount === 1 : insideCount === 1) ? LINE : UNKNOWN
  })
}

/**
 * A new puzzle: a random loop with every clue, then clues taken away for as long as the level's
 * techniques still solve it (which also proves it has one solution).
 */
export function generatePuzzle(level: LevelDefinition, random: () => number = Math.random): Puzzle {
  const { rows, cols, hardest } = level
  const geometry = geometryOf(rows, cols)
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 30; attempt++) {
    const solution = outline(geometry, randomBlob(rows, cols, random))
    const clues = cluesOf(geometry, solution)
    if (!solveLogically(rows, cols, clues, hardest).solved) continue
    for (const cell of shuffle(Array.from({ length: rows * cols }, (_, i) => i), random)) {
      const kept = clues[cell]
      clues[cell] = NO_CLUE
      if (!solveLogically(rows, cols, clues, hardest).solved) clues[cell] = kept
    }
    const puzzle = { clues, solution }
    const { needed } = solveLogically(rows, cols, clues, hardest)
    if (!level.needs || TECHNIQUES.indexOf(needed) >= TECHNIQUES.indexOf(level.needs)) return puzzle
    fallback ??= puzzle
  }
  if (fallback) return fallback
  const solution = outline(geometry, randomBlob(rows, cols, random))
  return { clues: cluesOf(geometry, solution), solution }
}

// ———————————————————————————————————————— Hints

export type Hint =
  /** Lines off the loop, or crosses on it. */
  | { kind: 'wrong'; edges: number[] }
  /** The next thing logic finds. */
  | { kind: 'step'; step: Step }

/**
 * What to do next: take back lines and crosses that disagree with the answer if there are any,
 * otherwise the next logical step.
 */
export function findHint(rows: number, cols: number, clues: readonly number[], edges: readonly number[], solution: readonly number[]): Hint | null {
  const wrong = edges.flatMap((state, edge) => ((state === LINE) !== (solution[edge] === LINE) && state !== UNKNOWN ? [edge] : []))
  if (wrong.length) return { kind: 'wrong', edges: wrong }
  if (solution.every((state, edge) => (state === LINE) === (edges[edge] === LINE))) return null
  const step = nextLogicalStep(rows, cols, clues, edges)
  if (step) return { kind: 'step', step }
  // Logic never runs dry on generated puzzles; if it somehow does, the answer names an edge.
  const missing = solution.findIndex((state, edge) => state === LINE && edges[edge] !== LINE)
  return { kind: 'step', step: { technique: 'lookahead', reason: 'reveal', lines: [missing], crosses: [] } }
}

// ———————————————————————————————————————— Checking a position

/**
 * What's visibly wrong in a position: clues with too many lines (or too few sides left), dots
 * where lines branch or end with nowhere to go, and a loop closed while lines lie elsewhere or
 * clues are unmet.
 */
export function problemsOf(rows: number, cols: number, clues: readonly number[], edges: readonly number[]) {
  const geometry = geometryOf(rows, cols)
  const cells = clues.flatMap((clue, cell) => {
    if (clue === NO_CLUE) return []
    const sides = geometry.cellEdges[cell]
    const lines = sides.filter((edge) => edges[edge] === LINE).length
    const crosses = sides.filter((edge) => edges[edge] === CROSS).length
    return lines > clue || 4 - crosses < clue ? [cell] : []
  })
  const dots = geometry.dotEdges.flatMap((around, dot) => {
    const lines = around.filter((edge) => edges[edge] === LINE).length
    const open = around.filter((edge) => edges[edge] === UNKNOWN).length
    return lines > 2 || (lines === 1 && open === 0) ? [dot] : []
  })
  // A closed loop that isn't everything.
  const loop: number[] = []
  const board = boardOf(geometry, clues, edges)
  if (loopState(board) === null) {
    const visited = new Set<number>()
    for (let edge = 0; edge < geometry.edgeCount && !loop.length; edge++) {
      if (edges[edge] !== LINE || visited.has(edge)) continue
      // Walk this piece; if it never meets a loose end, it is a closed loop.
      const piece: number[] = []
      const stack = [edge]
      let closed = true
      visited.add(edge)
      while (stack.length) {
        const current = stack.pop()!
        piece.push(current)
        for (const dot of geometry.edgeDots[current]) {
          const around = geometry.dotEdges[dot].filter((other) => edges[other] === LINE)
          if (around.length !== 2) closed = false
          for (const other of around) {
            if (!visited.has(other)) {
              visited.add(other)
              stack.push(other)
            }
          }
        }
      }
      if (closed) loop.push(...piece)
    }
  }
  return { cells, dots, loop }
}

/** Whether the lines drawn are exactly the loop. */
export const isLoopDrawn = (edges: readonly number[], solution: readonly number[]) =>
  solution.every((state, edge) => (state === LINE) === (edges[edge] === LINE))
