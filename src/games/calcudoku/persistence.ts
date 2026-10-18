import { latinStorage } from '../latin/latinStorage'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type Hint, type LevelId } from './calcudoku'
import { createGame, packCages, restoreGame, type CalcudokuState } from './gameState'

export const { save: saveGame, load: loadInitialGame, savePreferredLevel, recordsKey: RECORDS_KEY } = latinStorage<
  Hint,
  CalcudokuState,
  LevelId
>({
  name: 'calcudoku',
  isLevelId,
  defaultLevel: DEFAULT_LEVEL,
  puzzleOf: (state) => packCages(state.cages),
  restore: (saved) => restoreGame(saved),
  create: (levelId) => createGame(levelId, generatePuzzle(LEVELS[levelId])),
})
