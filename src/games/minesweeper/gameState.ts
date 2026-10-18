import type { GameStatus } from '../../hooks/useGameSession'
import {
  boardValue,
  cellCount,
  cellsToOpen,
  countMines,
  isLevelId,
  LEVELS,
  neighbours,
  type Hint,
  type LevelId,
} from './minesweeper'

export interface MinesState {
  /** Changes whenever a new board (or a replay) begins, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  /** Where the mines are; laid at the first click, so null before it. */
  mines: boolean[] | null
  /** How many mines touch each cell, worked out along with the mines. */
  counts: number[] | null
  /** The first click, which the board was built to open from. */
  start: number | null
  revealed: boolean[]
  flags: boolean[]
  status: GameStatus
  /** The mine that went off. */
  exploded: number | null
  /** Clicks that opened something; flags are free. */
  clicks: number
  /** The board's 3BV: the clicks it takes without flags or chords. */
  par: number
  hint: Hint | null
  hintsUsed: number
  solverUsed: boolean
  /** Mines that went off and were taken back. */
  takeBacks: number
  /** What was open before the click that lost, so it can be taken back. */
  beforeLoss: { revealed: boolean[]; clicks: number } | null
  /** Where the latest opening started, for the board to ripple out from. */
  lastOpen: { cell: number; id: number } | null
}

export type MinesAction =
  | { type: 'new-game'; levelId: LevelId }
  /** The first click: lays the mines (worked out outside, as it takes randomness) and opens up. */
  | { type: 'start'; cell: number; mines: boolean[]; bySolver?: boolean }
  /** Opens a hidden cell, or chords a number whose mines are all flagged. */
  | { type: 'open'; cell: number }
  | { type: 'open-many'; cells: number[]; bySolver?: boolean }
  | { type: 'flag'; cell: number }
  | { type: 'set-flags'; cells: number[]; flagged: boolean; bySolver?: boolean }
  | { type: 'hint'; hint: Hint }
  | { type: 'solver-started' }
  | { type: 'take-back' }
  /** Plays the same board again from its opening. */
  | { type: 'restart' }

/** The parts of a game worth saving. */
export interface MinesSnapshot {
  levelId: LevelId
  mines: boolean[] | null
  start: number | null
  revealed: boolean[]
  flags: boolean[]
  clicks: number
  hintsUsed: number
  solverUsed: boolean
  takeBacks: number
}

export function createGame(levelId: LevelId, gameId = 0): MinesState {
  const size = cellCount(LEVELS[levelId])
  return {
    gameId,
    levelId,
    mines: null,
    counts: null,
    start: null,
    revealed: new Array<boolean>(size).fill(false),
    flags: new Array<boolean>(size).fill(false),
    status: 'ready',
    exploded: null,
    clicks: 0,
    par: 0,
    hint: null,
    hintsUsed: 0,
    solverUsed: false,
    takeBacks: 0,
    beforeLoss: null,
    lastOpen: null,
  }
}

export const isOver = (state: MinesState) => state.status === 'won' || state.status === 'lost'

export const countFlags = (state: MinesState) => state.flags.filter(Boolean).length

const isCell = (state: MinesState, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < state.revealed.length

/** Hidden cells around a number, if it can be chorded: exactly as many flags around it as its count. */
export function chordCells(state: MinesState, cell: number): number[] | null {
  const { counts, revealed, flags } = state
  if (!counts || !revealed[cell] || counts[cell] === 0) return null
  const around = neighbours(LEVELS[state.levelId])[cell]
  const flagged = around.filter((next) => flags[next]).length
  if (flagged !== counts[cell]) return null
  const hidden = around.filter((next) => !revealed[next] && !flags[next])
  return hidden.length ? hidden : null
}

/**
 * Opens cells (each spreading through empty areas). A mine among them ends the game; clearing
 * every safe cell wins it, and the remaining mines get their flags.
 */
function openCells(state: MinesState, cells: number[], counted: boolean, bySolver = false): MinesState {
  const { mines, counts } = state
  if (!mines || !counts || isOver(state)) return state
  const level = LEVELS[state.levelId]
  const targets = cells.filter((cell) => isCell(state, cell) && !state.revealed[cell] && !state.flags[cell])
  if (!targets.length) return state

  const solverUsed = state.solverUsed || bySolver
  const lastOpen = { cell: targets[0], id: (state.lastOpen?.id ?? 0) + 1 }
  const hit = targets.find((cell) => mines[cell])
  if (hit !== undefined) {
    const revealed = state.revealed.slice()
    revealed[hit] = true
    return {
      ...state,
      revealed,
      status: 'lost',
      exploded: hit,
      hint: null,
      solverUsed,
      beforeLoss: { revealed: state.revealed, clicks: state.clicks },
      lastOpen,
    }
  }

  const revealed = state.revealed.slice()
  for (const target of targets) {
    for (const cell of cellsToOpen(level, counts, revealed, state.flags, target)) revealed[cell] = true
  }
  const won = revealed.every((open, cell) => open || mines[cell])
  return {
    ...state,
    revealed,
    flags: won ? mines.slice() : state.flags,
    status: won ? 'won' : 'playing',
    clicks: state.clicks + (counted ? 1 : 0),
    hint: null,
    solverUsed,
    lastOpen,
  }
}

export function minesReducer(state: MinesState, action: MinesAction): MinesState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, state.gameId + 1)

    case 'start': {
      const level = LEVELS[state.levelId]
      if (state.mines || !isCell(state, action.cell) || action.mines.length !== cellCount(level) || action.mines[action.cell]) {
        return state
      }
      const counts = countMines(level, action.mines)
      const laid = {
        ...state,
        mines: action.mines,
        counts,
        start: action.cell,
        par: boardValue(level, action.mines, counts),
        flags: state.flags.map(() => false),
      }
      return openCells(laid, [action.cell], true, action.bySolver)
    }

    case 'open': {
      if (!isCell(state, action.cell)) return state
      if (state.revealed[action.cell]) {
        const hidden = chordCells(state, action.cell)
        return hidden ? openCells(state, hidden, true) : state
      }
      return openCells(state, [action.cell], true)
    }

    case 'open-many':
      return openCells(state, action.cells, !action.bySolver, action.bySolver)

    case 'flag': {
      if (!state.mines || isOver(state) || !isCell(state, action.cell) || state.revealed[action.cell]) return state
      const flags = state.flags.slice()
      flags[action.cell] = !flags[action.cell]
      return { ...state, flags, hint: null, status: 'playing' }
    }

    case 'set-flags': {
      if (!state.mines || isOver(state)) return state
      const cells = action.cells.filter((cell) => isCell(state, cell) && !state.revealed[cell])
      if (!cells.length) return state
      const flags = state.flags.slice()
      for (const cell of cells) flags[cell] = action.flagged
      return { ...state, flags, hint: null, solverUsed: state.solverUsed || Boolean(action.bySolver) }
    }

    case 'hint': {
      if (!state.mines || isOver(state)) return state
      const same =
        state.hint?.kind === action.hint.kind && state.hint.cells.join() === action.hint.cells.join()
      // Asking again while the same hint shows reveals nothing new, so it is not counted.
      return { ...state, hint: action.hint, hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1 }
    }

    case 'solver-started':
      return isOver(state) ? state : { ...state, solverUsed: true, hint: null }

    case 'take-back':
      if (state.status !== 'lost' || !state.beforeLoss) return state
      return {
        ...state,
        revealed: state.beforeLoss.revealed,
        clicks: state.beforeLoss.clicks,
        status: 'playing',
        exploded: null,
        takeBacks: state.takeBacks + 1,
        beforeLoss: null,
        lastOpen: null,
      }

    case 'restart': {
      if (!state.mines || state.start === null) return state
      const fresh = createGame(state.levelId, state.gameId + 1)
      const started = minesReducer(fresh, { type: 'start', cell: state.start, mines: state.mines })
      // The opening is shown again, but the clock waits for the next move.
      return { ...started, status: 'ready', clicks: 1 }
    }
  }
}

export function toSnapshot(state: MinesState): MinesSnapshot {
  const { levelId, mines, start, revealed, flags, clicks, hintsUsed, solverUsed, takeBacks } = state
  return { levelId, mines, start, revealed, flags, clicks, hintsUsed, solverUsed, takeBacks }
}

/** Rebuilds a game in progress. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: MinesSnapshot, gameId = 0): MinesState | null {
  const { levelId, mines, start, revealed, flags } = snapshot
  if (!isLevelId(levelId)) return null
  const level = LEVELS[levelId]
  const size = cellCount(level)
  if (revealed.length !== size || flags.length !== size) return null
  const fresh = createGame(levelId, gameId)
  if (!mines || start === null) return fresh

  if (mines.length !== size || mines.filter(Boolean).length !== level.mines) return null
  const state = minesReducer(fresh, { type: 'start', cell: start, mines })
  if (state.mines !== mines) return null
  // Every open cell must be safe, and the game must still be on.
  if (revealed.some((open, cell) => open && mines[cell])) return null
  if (!revealed.some(Boolean) || revealed.every((open, cell) => open || mines[cell])) return null
  if (flags.some((flag, cell) => flag && revealed[cell])) return null

  return {
    ...state,
    revealed,
    flags,
    status: 'playing',
    clicks: Math.max(1, snapshot.clicks),
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    takeBacks: snapshot.takeBacks,
    lastOpen: null,
  }
}
