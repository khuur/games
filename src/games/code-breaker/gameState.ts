import type { GameStatus } from '../../hooks/useGameSession'
import { isLevelId, isSolved, isValidCode, LEVELS, score, type Guess, type LevelId } from './codeBreaker'

export interface CodeBreakerState {
  /** Changes whenever a new code is set, so the board can reset itself. */
  gameId: number
  levelId: LevelId
  secret: number[]
  guesses: Guess[]
  /** The guess being put together; null marks an empty slot. */
  row: (number | null)[]
  /** The slot the next colour goes into. */
  cursor: number
  /** True while the row holds exactly the guess a hint suggested. */
  hinted: boolean
  hintsUsed: number
  solverUsed: boolean
  status: GameStatus
}

export type CodeBreakerAction =
  | { type: 'new-game'; levelId: LevelId; secret: number[] }
  /** Sets a colour into the cursor's slot, or into `slot`. */
  | { type: 'place'; color: number; slot?: number; bySolver?: boolean }
  | { type: 'select'; slot: number }
  | { type: 'clear'; slot: number }
  /** Backspace: clears the cursor's slot, or the nearest filled slot before it. */
  | { type: 'erase' }
  | { type: 'submit'; bySolver?: boolean }
  | { type: 'hint'; code: number[] }
  | { type: 'solver-started' }
  | { type: 'give-up' }

/** The parts of a game worth saving; the marks can be worked out again from the code. */
export interface CodeBreakerSnapshot {
  levelId: LevelId
  secret: number[]
  guesses: number[][]
  row: (number | null)[]
  hintsUsed: number
  solverUsed: boolean
}

const emptyRow = (levelId: LevelId): (number | null)[] => new Array<null>(LEVELS[levelId].pegs).fill(null)

export function createGame(levelId: LevelId, secret: number[], gameId = 0): CodeBreakerState {
  return {
    gameId,
    levelId,
    secret,
    guesses: [],
    row: emptyRow(levelId),
    cursor: 0,
    hinted: false,
    hintsUsed: 0,
    solverUsed: false,
    status: 'ready',
  }
}

export const isOver = (state: CodeBreakerState) => state.status === 'won' || state.status === 'lost'

/** Whether a colour may go into a slot: on levels without repeats, it must not be in another slot already. */
export function canPlace(state: CodeBreakerState, color: number, slot = state.cursor): boolean {
  const level = LEVELS[state.levelId]
  if (isOver(state) || !Number.isInteger(color) || color < 0 || color >= level.colors) return false
  return level.repeats || state.row.every((peg, i) => i === slot || peg !== color)
}

/** The first empty slot after `from`, wrapping around; `from` itself when the row is full. */
function nextSlot(row: (number | null)[], from: number): number {
  for (let step = 1; step < row.length; step++) {
    const slot = (from + step) % row.length
    if (row[slot] === null) return slot
  }
  return from
}

const isSlot = (state: CodeBreakerState, slot: number) => Number.isInteger(slot) && slot >= 0 && slot < state.row.length

export function codeBreakerReducer(state: CodeBreakerState, action: CodeBreakerAction): CodeBreakerState {
  switch (action.type) {
    case 'new-game':
      return createGame(action.levelId, action.secret, state.gameId + 1)

    case 'place': {
      const slot = action.slot ?? state.cursor
      if (!isSlot(state, slot) || !canPlace(state, action.color, slot)) return state
      const row = state.row.slice()
      row[slot] = action.color
      return {
        ...state,
        row,
        cursor: nextSlot(row, slot),
        hinted: false,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status: 'playing',
      }
    }

    case 'select':
      if (isOver(state) || !isSlot(state, action.slot) || state.cursor === action.slot) return state
      return { ...state, cursor: action.slot }

    case 'clear': {
      if (isOver(state) || !isSlot(state, action.slot) || state.row[action.slot] === null) return state
      const row = state.row.slice()
      row[action.slot] = null
      return { ...state, row, cursor: action.slot, hinted: false }
    }

    case 'erase': {
      if (isOver(state)) return state
      let slot = state.cursor
      while (slot >= 0 && state.row[slot] === null) slot--
      if (slot < 0) return state
      return codeBreakerReducer(state, { type: 'clear', slot })
    }

    case 'submit': {
      const level = LEVELS[state.levelId]
      const code = state.row
      if (isOver(state) || !isValidCode(level, code)) return state
      const feedback = score(state.secret, code)
      const guesses = [...state.guesses, { code, feedback }]
      let status: GameStatus = 'playing'
      if (isSolved(feedback, level)) status = 'won'
      else if (guesses.length >= level.guesses) status = 'lost'
      return {
        ...state,
        guesses,
        row: emptyRow(state.levelId),
        cursor: 0,
        hinted: false,
        solverUsed: state.solverUsed || Boolean(action.bySolver),
        status,
      }
    }

    case 'hint': {
      if (isOver(state) || !isValidCode(LEVELS[state.levelId], action.code)) return state
      const same = state.hinted && action.code.every((color, i) => state.row[i] === color)
      // Asking again while the suggestion is still in the row reveals nothing new, so it is not counted.
      return {
        ...state,
        row: action.code.slice(),
        cursor: action.code.length - 1,
        hinted: true,
        hintsUsed: same ? state.hintsUsed : state.hintsUsed + 1,
        status: 'playing',
      }
    }

    case 'solver-started':
      if (isOver(state)) return state
      return { ...state, row: emptyRow(state.levelId), cursor: 0, hinted: false, solverUsed: true, status: 'playing' }

    case 'give-up':
      return isOver(state) ? state : { ...state, status: 'lost' }
  }
}

export function toSnapshot(state: CodeBreakerState): CodeBreakerSnapshot {
  const { levelId, secret, guesses, row, hintsUsed, solverUsed } = state
  return { levelId, secret, guesses: guesses.map((guess) => guess.code), row, hintsUsed, solverUsed }
}

/** Rebuilds an unfinished game. Returns null if the snapshot is unusable or the game was over. */
export function restoreGame(snapshot: CodeBreakerSnapshot, gameId = 0): CodeBreakerState | null {
  const { levelId, secret, guesses, row } = snapshot
  if (!isLevelId(levelId)) return null
  const level = LEVELS[levelId]
  if (!isValidCode(level, secret) || guesses.length >= level.guesses) return null
  if (!guesses.every((code) => isValidCode(level, code))) return null
  if (row.length !== level.pegs) return null

  let state = createGame(levelId, secret, gameId)
  for (const code of guesses) {
    state = codeBreakerReducer({ ...state, row: code }, { type: 'submit' })
    if (state.status !== 'playing') return null
  }
  for (const [slot, color] of row.entries()) {
    if (color === null) continue
    const next = codeBreakerReducer(state, { type: 'place', color, slot })
    if (next === state) return null
    state = next
  }
  const started = guesses.length > 0 || row.some((color) => color !== null)
  return {
    ...state,
    cursor: Math.max(0, row.indexOf(null)),
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    status: started ? 'playing' : 'ready',
  }
}
