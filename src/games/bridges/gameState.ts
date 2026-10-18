import type { GameStatus } from '../../hooks/useGameSession'
import { isLevelId, isSolution, layoutFor, LEVELS, type Hint, type Island, type LevelId, type Puzzle } from './bridges'

/** One link's bridges changed. */
export interface Move {
  link: number
  before: number
  after: number
}

export interface BridgesState {
  /** Changes whenever a new puzzle (or a restart) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  islands: Island[]
  /** Bridges on each link in the solution. */
  solution: number[]
  /** Bridges on each link now. */
  counts: number[]
  history: Move[]
  future: Move[]
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
  /** The latest change, for the board to animate. */
  lastMove: { link: number; id: number } | null
}

export type BridgesAction =
  | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }
  | { type: 'restart' }
  /** One more bridge on a link, going 0 → 1 → 2 → 0 (or 0 → 1 → 0 where only one fits). */
  | { type: 'cycle'; link: number }
  | { type: 'set'; link: number; count: number; bySolver?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }

/** The parts of a game worth saving. */
export interface BridgesSnapshot {
  levelId: LevelId
  islands: Island[]
  solution: number[]
  counts: number[]
  history: Move[]
  future: Move[]
  hintsUsed: number
  solverUsed: boolean
}

export function createGame(levelId: LevelId, { islands, solution }: Puzzle, gameId = 0): BridgesState {
  return {
    gameId,
    levelId,
    islands,
    solution,
    counts: solution.map(() => 0),
    history: [],
    future: [],
    hint: null,
    hintsUsed: 0,
    solverUsed: false,
    status: 'ready',
    lastMove: null,
  }
}

export const layoutOfState = (state: Pick<BridgesState, 'levelId' | 'islands'>) => layoutFor(LEVELS[state.levelId], state.islands)

/** The most bridges a link can carry: two, or fewer if either island needs fewer. */
export function capacityOf(state: BridgesState, link: number): number {
  const layout = layoutOfState(state)
  const { a, b } = layout.links[link]
  return Math.min(2, layout.islands[a].count, layout.islands[b].count)
}

/** Links with bridges that a bridge on `link` would cross. */
export function blockersOf(state: BridgesState, link: number): number[] {
  return layoutOfState(state).crossings[link].filter((other) => state.counts[other] > 0)
}

/** What a tap on a link leads to. */
export const cycled = (state: BridgesState, link: number) => (state.counts[link] + 1) % (capacityOf(state, link) + 1)

const isLink = (state: BridgesState, link: number) => Number.isInteger(link) && link >= 0 && link < state.counts.length

function setCount(state: BridgesState, link: number, count: number, bySolver: boolean, record: 'new' | 'redo' = 'new'): BridgesState {
  if (state.status === 'won' || !isLink(state, link) || count === state.counts[link]) return state
  if (count < 0 || count > capacityOf(state, link)) return state
  if (count > 0 && blockersOf(state, link).length) return state
  const counts = state.counts.slice()
  const move = { link, before: counts[link], after: count }
  counts[link] = count
  const won = isSolution(layoutOfState(state), counts)
  return {
    ...state,
    counts,
    history: [...state.history, move],
    future: record === 'redo' ? state.future.slice(0, -1) : [],
    hint: null,
    solverUsed: state.solverUsed || bySolver,
    status: won ? 'won' : 'playing',
    lastMove: { link, id: (state.lastMove?.id ?? 0) + 1 },
  }
}

export function bridgesReducer(state: BridgesState, action: BridgesAction): BridgesState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.puzzle, state.gameId + 1)

    case 'restart':
      return createGame(state.levelId, state, state.gameId + 1)

    case 'cycle':
      return isLink(state, action.link) ? setCount(state, action.link, cycled(state, action.link), false) : state

    case 'set':
      return setCount(state, action.link, action.count, Boolean(action.bySolver))

    case 'undo': {
      const last = state.history.at(-1)
      if (state.status === 'won' || !last) return state
      const counts = state.counts.slice()
      counts[last.link] = last.before
      return {
        ...state,
        counts,
        history: state.history.slice(0, -1),
        future: [...state.future, last],
        hint: null,
        status: 'playing',
        lastMove: { link: last.link, id: (state.lastMove?.id ?? 0) + 1 },
      }
    }

    case 'redo': {
      const next = state.future.at(-1)
      if (state.status === 'won' || !next) return state
      return setCount(state, next.link, next.after, false, 'redo')
    }

    case 'hint': {
      if (state.status === 'won') return state
      const { hint } = state
      const same = hint?.kind === action.hint.kind && hint.link === action.hint.link
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return state.status === 'won' ? state : { ...state, solverUsed: true, hint: null }
  }
}

export function toSnapshot(state: BridgesState): BridgesSnapshot {
  const { levelId, islands, solution, counts, history, future, hintsUsed, solverUsed } = state
  return { levelId, islands, solution, counts, history, future, hintsUsed, solverUsed }
}

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: BridgesSnapshot, gameId = 0): BridgesState | null {
  const { levelId, islands, solution, counts, history, future } = snapshot
  if (!isLevelId(levelId)) return null
  const level = LEVELS[levelId]
  const cells = level.columns * level.rows
  if (!islands.length || !islands.every(({ cell, count }) => Number.isInteger(cell) && cell >= 0 && cell < cells && Number.isInteger(count) && count >= 1 && count <= 8)) {
    return null
  }
  if (new Set(islands.map(({ cell }) => cell)).size !== islands.length) return null
  const layout = layoutFor(level, islands)
  if (solution.length !== layout.links.length || counts.length !== layout.links.length || !isSolution(layout, solution)) return null
  const fresh = createGame(levelId, { islands, solution }, gameId)
  if (!counts.every((count, link) => Number.isInteger(count) && count >= 0 && count <= capacityOf(fresh, link))) return null
  if (layout.crossings.some((crossed, link) => counts[link] && crossed.some((other) => counts[other]))) return null
  const moves = [...history, ...future]
  if (!moves.every(({ link, before, after }) => isLink(fresh, link) && Number.isInteger(before) && Number.isInteger(after))) return null
  if (isSolution(layout, counts)) return null
  return {
    ...fresh,
    counts,
    history,
    future,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: history.length ? 'playing' : 'ready',
  }
}
