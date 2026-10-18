import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { isPackedMoves, packMove, unpackMove, type LatinProgress, type LatinState } from './latin'

interface StoredGame {
  version: 1
  levelId: string
  /** Digits, "0" for a blank. */
  givens: string
  solution: string
  /** The game's own part of the puzzle, such as clues or cages. */
  puzzle: unknown
  /** Moves packed as cell × 20 + digit × 2 + (1 for a note). */
  history: number[]
  future: number[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isDigits = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    typeof game.levelId === 'string' &&
    isDigits(game.givens) &&
    isDigits(game.solution) &&
    isPackedMoves(game.history) &&
    isPackedMoves(game.future) &&
    isInteger(game.mistakes) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

/** A saved game's parts, for the game to check and rebuild. */
export interface SavedLatinGame<L> extends LatinProgress {
  levelId: L
  givens: number[]
  solution: number[]
  /** Exactly as saved, so not to be trusted. */
  puzzle: unknown
}

export interface LatinStorageConfig<S, L extends string> {
  /** Storage keys start with this, such as "skyscrapers". */
  name: string
  isLevelId: (value: unknown) => value is L
  defaultLevel: L
  /** The game's own part of the puzzle to keep, as plain data. */
  puzzleOf: (state: S) => unknown
  /** Rebuilds a saved game, or null if the parts don't make a valid one. */
  restore: (saved: SavedLatinGame<L>) => S | null
  /** A fresh game at a level. */
  create: (levelId: L) => S
}

/** Saving and loading for a Latin-square game: the puzzle in progress, the preferred level and records. */
export function latinStorage<H, S extends LatinState<H> & { levelId: L }, L extends string>(config: LatinStorageConfig<S, L>) {
  const gameKey = `${config.name}:game`
  const levelKey = `${config.name}:level`

  /** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
  const save = (state: S, elapsedMs: number) => {
    if (state.status === 'won') {
      removeStored(gameKey)
      return
    }
    const stored: StoredGame = {
      version: 1,
      levelId: state.levelId,
      givens: state.givens.join(''),
      solution: state.solution.join(''),
      puzzle: config.puzzleOf(state),
      history: state.history.map(packMove),
      future: state.future.map(packMove),
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
      solverUsed: state.solverUsed,
      elapsedMs: Math.round(elapsedMs),
    }
    writeStored(gameKey, stored)
  }

  const load = (): { state: S; elapsedMs: number } => {
    const stored = readStored<StoredGame | null>(gameKey, null, (value) => isStoredGame(value))
    const restored =
      stored &&
      config.isLevelId(stored.levelId) &&
      config.restore({
        levelId: stored.levelId,
        givens: [...stored.givens].map(Number),
        solution: [...stored.solution].map(Number),
        puzzle: stored.puzzle,
        history: stored.history.map(unpackMove),
        future: stored.future.map(unpackMove),
        mistakes: stored.mistakes,
        hintsUsed: stored.hintsUsed,
        solverUsed: stored.solverUsed,
      })
    if (stored && restored) {
      return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
    }
    return { state: config.create(readStored(levelKey, config.defaultLevel, config.isLevelId)), elapsedMs: 0 }
  }

  const savePreferredLevel = (levelId: L) => writeStored(levelKey, levelId)

  return { save, load, savePreferredLevel, recordsKey: `${config.name}:records` }
}
