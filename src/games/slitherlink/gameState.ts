import type { GameStatus } from '../../hooks/useGameSession'
import {
  CROSS,
  geometryOf,
  isLevelId,
  isLoopDrawn,
  LEVELS,
  LINE,
  NO_CLUE,
  problemsOf,
  UNKNOWN,
  type EdgeState,
  type Hint,
  type LevelId,
  type Puzzle,
} from './slitherlink'

/** One edge changed by a move. */
export interface Change {
  edge: number
  before: EdgeState
  after: EdgeState
}

export interface SlitherlinkState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  clues: number[]
  solution: number[]
  edges: EdgeState[]
  history: Change[][]
  future: Change[][]
  /** Moves that broke a rule: a clue over its count, a branch or dead end, a loop closed too soon. */
  mistakes: number
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  /** The latest move's edges, for the board to animate. */
  lastMove: { edges: number[]; id: number } | null
  /** The drag that made the latest move, so the rest of that drag joins the same move. */
  stroke: number | null
  /** Whether that drag has already counted a mistake (one per drag at most). */
  strokeMistake: boolean
}

export type SlitherlinkAction =
  | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }
  | { type: 'restart' }
  /** A tap or part of a drag; one drag shares a `stroke`. */
  | { type: 'set'; changes: { edge: number; to: EdgeState }[]; stroke?: number }
  /** Several edges set at once, as the solver does. */
  | { type: 'apply'; changes: { edge: number; to: EdgeState }[]; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving. */
export interface SlitherlinkSnapshot {
  levelId: LevelId
  clues: number[]
  solution: number[]
  edges: EdgeState[]
  history: Change[][]
  future: Change[][]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
}

export function createGame(levelId: LevelId, { clues, solution }: Puzzle, gameId = 0): SlitherlinkState {
  return {
    gameId,
    levelId,
    clues,
    solution,
    edges: new Array<EdgeState>(solution.length).fill(UNKNOWN),
    history: [],
    future: [],
    mistakes: 0,
    hint: null,
    hintsUsed: 0,
    solverUsed: false,
    status: 'ready',
    lastMove: null,
    stroke: null,
    strokeMistake: false,
  }
}

export const sizeOf = (state: { levelId: LevelId }) => LEVELS[state.levelId]

/** Each problem in a position, named so that new ones can be told from old, with the edges it involves. */
function problemMap(state: SlitherlinkState, edges: readonly EdgeState[]): Map<string, number[]> {
  const { rows, cols } = sizeOf(state)
  const geometry = geometryOf(rows, cols)
  const { cells, dots, loop } = problemsOf(rows, cols, state.clues, edges)
  const map = new Map<string, number[]>()
  for (const cell of cells) map.set(`c${cell}`, geometry.cellEdges[cell])
  for (const dot of dots) map.set(`d${dot}`, geometry.dotEdges[dot])
  if (loop.length) map.set('loop', loop)
  return map
}

/** Sets edges. A move counts as a mistake when it breaks a rule that wasn't broken before. */
function change(state: SlitherlinkState, targets: { edge: number; to: EdgeState }[], bySolver: boolean, stroke: number | null): SlitherlinkState {
  if (state.status === 'won') return state
  const edges = state.edges.slice()
  const changes: Change[] = []
  for (const { edge, to } of targets) {
    if (!Number.isInteger(edge) || edge < 0 || edge >= edges.length || edges[edge] === to) continue
    if (to !== UNKNOWN && to !== LINE && to !== CROSS) continue
    changes.push({ edge, before: edges[edge], after: to })
    edges[edge] = to
  }
  if (!changes.length) return state
  const sameStroke = stroke !== null && stroke === state.stroke
  const before = problemMap(state, state.edges)
  const moved = new Set(changes.map(({ edge }) => edge))
  const broke = [...problemMap(state, edges)].some(([key, involved]) => !before.has(key) && involved.some((edge) => moved.has(edge)))
  const counted = broke && !bySolver && !(sameStroke && state.strokeMistake)
  const last = state.history.at(-1)
  return {
    ...state,
    edges,
    // The rest of a drag joins the move it started.
    history: sameStroke && last ? [...state.history.slice(0, -1), [...last, ...changes]] : [...state.history, changes],
    future: [],
    mistakes: state.mistakes + (counted ? 1 : 0),
    stroke,
    strokeMistake: sameStroke ? state.strokeMistake || counted : counted,
    hint: null,
    solverUsed: state.solverUsed || bySolver,
    status: isLoopDrawn(edges, state.solution) ? 'won' : 'playing',
    lastMove: { edges: changes.map(({ edge }) => edge), id: (state.lastMove?.id ?? 0) + 1 },
  }
}

export function slitherlinkReducer(state: SlitherlinkState, action: SlitherlinkAction): SlitherlinkState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.puzzle, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state, state.gameId + 1)

    case 'set':
      return change(state, action.changes, false, action.stroke ?? null)

    case 'apply':
      return change(state, action.changes, Boolean(action.bySolver), null)

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const edges = state.edges.slice()
      for (const { edge, before } of [...last].reverse()) edges[edge] = before
      return {
        ...state,
        edges,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        stroke: null,
        strokeMistake: false,
        hint: null,
        status: 'playing',
        lastMove: { edges: last.map(({ edge }) => edge), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next) return state
      const edges = state.edges.slice()
      for (const { edge, after } of next) edges[edge] = after
      return {
        ...state,
        edges,
        history: [...state.history, next],
        future: state.future.slice(0, -1),
        stroke: null,
        strokeMistake: false,
        hint: null,
        status: isLoopDrawn(edges, state.solution) ? 'won' : 'playing',
        lastMove: { edges: next.map(({ edge }) => edge), id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'hint': {
      if (state.status === 'won') return state
      const same = state.hint !== null && JSON.stringify(state.hint) === JSON.stringify(action.hint)
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: SlitherlinkState): SlitherlinkSnapshot {
  const { levelId, clues, solution, edges, history, future, mistakes, hintsUsed, solverUsed } = state
  return { levelId, clues, solution, edges, history, future, mistakes, hintsUsed, solverUsed }
}

const isEdgeState = (value: unknown): value is EdgeState => value === UNKNOWN || value === LINE || value === CROSS

/** Whether edges form one loop (every dot with none or two, all in one piece) that meets every clue. */
function isValidLoop(rows: number, cols: number, clues: readonly number[], solution: readonly number[]): boolean {
  const geometry = geometryOf(rows, cols)
  if (geometry.dotEdges.some((around) => ![0, 2].includes(around.filter((edge) => solution[edge] === LINE).length))) return false
  const lines = solution.flatMap((state, edge) => (state === LINE ? [edge] : []))
  if (!lines.length) return false
  const seen = new Set([lines[0]])
  const stack = [lines[0]]
  while (stack.length) {
    for (const dot of geometry.edgeDots[stack.pop()!]) {
      for (const next of geometry.dotEdges[dot]) {
        if (solution[next] === LINE && !seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
  }
  if (seen.size !== lines.length) return false
  return clues.every((clue, cell) => clue === NO_CLUE || geometry.cellEdges[cell].filter((edge) => solution[edge] === LINE).length === clue)
}

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: SlitherlinkSnapshot, gameId = 0): SlitherlinkState | null {
  const { levelId, clues, solution, edges, history, future } = snapshot
  if (!isLevelId(levelId)) return null
  const { rows, cols } = LEVELS[levelId]
  const { edgeCount } = geometryOf(rows, cols)
  if (clues.length !== rows * cols || !clues.every((clue) => Number.isInteger(clue) && clue >= NO_CLUE && clue <= 3)) return null
  if (solution.length !== edgeCount || !solution.every((state) => state === UNKNOWN || state === LINE)) return null
  if (edges.length !== edgeCount || !edges.every(isEdgeState)) return null
  if (!isValidLoop(rows, cols, clues, solution)) return null
  const moves = [...history, ...future]
  if (!moves.every((move) => move.every(({ edge, before, after }) => Number.isInteger(edge) && edge >= 0 && edge < edgeCount && isEdgeState(before) && isEdgeState(after)))) {
    return null
  }
  if (isLoopDrawn(edges, solution)) return null
  return {
    ...createGame(levelId, { clues, solution }, gameId),
    edges,
    history,
    future,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length || snapshot.mistakes ? 'playing' : 'ready',
  }
}
