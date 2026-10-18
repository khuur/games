import { latinStorage } from '../latin/latinStorage'
import { createGame, restoreGame, type SkyscrapersState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type Hint, type LevelId } from './skyscrapers'

export const { save: saveGame, load: loadInitialGame, savePreferredLevel, recordsKey: RECORDS_KEY } = latinStorage<
  Hint,
  SkyscrapersState,
  LevelId
>({
  name: 'skyscrapers',
  isLevelId,
  defaultLevel: DEFAULT_LEVEL,
  puzzleOf: (state) => state.clues,
  restore: (saved) => restoreGame(saved),
  create: (levelId) => createGame(levelId, generatePuzzle(LEVELS[levelId])),
})
