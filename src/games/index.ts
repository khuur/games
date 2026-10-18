import type { ComponentType } from 'react'
import { BridgesIcon } from './bridges/BridgesIcon'
import { CodeBreakerIcon } from './code-breaker/CodeBreakerIcon'
import { FifteenIcon } from './fifteen/FifteenIcon'
import { HanoiIcon } from './hanoi/HanoiIcon'
import { lazyComponent } from './lazy'
import { LightsOutIcon } from './lights-out/LightsOutIcon'
import { MinesweeperIcon } from './minesweeper/MinesweeperIcon'
import { NonogramIcon } from './nonogram/NonogramIcon'
import { PegIcon } from './peg-solitaire/PegIcon'
import { QueensIcon } from './queens/QueensIcon'
import { SudokuIcon } from './sudoku/SudokuIcon'
import { WaterSortIcon } from './water-sort/WaterSortIcon'

export interface GameProps {
  /** True while the site covers the game, for example with the help dialog. */
  paused: boolean
}

export interface GameInfo {
  id: string
  /** The game's address on the site. */
  path: string
  title: string
  /** Used where space is tight, such as the tabs on narrow phones. */
  shortTitle: string
  Icon: ComponentType
  /** The game itself. Its code loads the first time it is needed. */
  Game: ComponentType<GameProps>
  /** Contents of the "How to play" dialog, loaded the same way. */
  Help: ComponentType
  /** Starts loading the game's code ahead of time, so opening it later is instant. */
  preload: () => Promise<unknown>
}

/**
 * A game kept out of the first download: its component and help arrive as separate chunks when
 * first shown (or preloaded), which keeps the site quick to open however many games it has.
 */
function lazyGame<G extends string, H extends string>(
  loadGame: () => Promise<Record<G, ComponentType<GameProps>>>,
  game: G,
  loadHelp: () => Promise<Record<H, ComponentType>>,
  help: H,
): Pick<GameInfo, 'Game' | 'Help' | 'preload'> {
  const gameCode = lazyComponent(() => loadGame().then((module): ComponentType<GameProps> => module[game]))
  const helpCode = lazyComponent(() => loadHelp().then((module): ComponentType => module[help]))
  return {
    Game: gameCode.Component,
    Help: helpCode.Component,
    preload: () => Promise.all([gameCode.preload(), helpCode.preload()]),
  }
}

/** Every game on the site, in tab order. Adding a game means adding it here. */
export const GAMES: readonly GameInfo[] = [
  {
    id: 'hanoi',
    path: '/hanoi',
    title: 'Tower of Hanoi',
    shortTitle: 'Hanoi',
    Icon: HanoiIcon,
    ...lazyGame(() => import('./hanoi/HanoiGame'), 'HanoiGame', () => import('./hanoi/HanoiHelp'), 'HanoiHelp'),
  },
  {
    id: 'lights-out',
    path: '/lights-out',
    title: 'Lights Out',
    shortTitle: 'Lights Out',
    Icon: LightsOutIcon,
    ...lazyGame(() => import('./lights-out/LightsOutGame'), 'LightsOutGame', () => import('./lights-out/LightsOutHelp'), 'LightsOutHelp'),
  },
  {
    id: 'fifteen',
    path: '/15-puzzle',
    title: '15 Puzzle',
    shortTitle: '15 Puzzle',
    Icon: FifteenIcon,
    ...lazyGame(() => import('./fifteen/FifteenGame'), 'FifteenGame', () => import('./fifteen/FifteenHelp'), 'FifteenHelp'),
  },
  {
    id: 'peg-solitaire',
    path: '/peg-solitaire',
    title: 'Peg Solitaire',
    shortTitle: 'Solitaire',
    Icon: PegIcon,
    ...lazyGame(() => import('./peg-solitaire/PegSolitaireGame'), 'PegSolitaireGame', () => import('./peg-solitaire/PegHelp'), 'PegHelp'),
  },
  {
    id: 'water-sort',
    path: '/water-sort',
    title: 'Water Sort',
    shortTitle: 'Water Sort',
    Icon: WaterSortIcon,
    ...lazyGame(() => import('./water-sort/WaterSortGame'), 'WaterSortGame', () => import('./water-sort/WaterSortHelp'), 'WaterSortHelp'),
  },
  {
    id: 'code-breaker',
    path: '/code-breaker',
    title: 'Code Breaker',
    shortTitle: 'Codebreaker',
    Icon: CodeBreakerIcon,
    ...lazyGame(() => import('./code-breaker/CodeBreakerGame'), 'CodeBreakerGame', () => import('./code-breaker/CodeBreakerHelp'), 'CodeBreakerHelp'),
  },
  {
    id: 'minesweeper',
    path: '/minesweeper',
    title: 'Minesweeper',
    shortTitle: 'Mines',
    Icon: MinesweeperIcon,
    ...lazyGame(() => import('./minesweeper/MinesweeperGame'), 'MinesweeperGame', () => import('./minesweeper/MinesweeperHelp'), 'MinesweeperHelp'),
  },
  {
    id: 'sudoku',
    path: '/sudoku',
    title: 'Sudoku',
    shortTitle: 'Sudoku',
    Icon: SudokuIcon,
    ...lazyGame(() => import('./sudoku/SudokuGame'), 'SudokuGame', () => import('./sudoku/SudokuHelp'), 'SudokuHelp'),
  },
  {
    id: 'nonogram',
    path: '/nonogram',
    title: 'Nonogram',
    shortTitle: 'Nonogram',
    Icon: NonogramIcon,
    ...lazyGame(() => import('./nonogram/NonogramGame'), 'NonogramGame', () => import('./nonogram/NonogramHelp'), 'NonogramHelp'),
  },
  {
    id: 'queens',
    path: '/queens',
    title: 'Queens',
    shortTitle: 'Queens',
    Icon: QueensIcon,
    ...lazyGame(() => import('./queens/QueensGame'), 'QueensGame', () => import('./queens/QueensHelp'), 'QueensHelp'),
  },
  {
    id: 'bridges',
    path: '/bridges',
    title: 'Bridges',
    shortTitle: 'Bridges',
    Icon: BridgesIcon,
    ...lazyGame(() => import('./bridges/BridgesGame'), 'BridgesGame', () => import('./bridges/BridgesHelp'), 'BridgesHelp'),
  },
]
