import type { ComponentType } from 'react'
import { FifteenGame } from './fifteen/FifteenGame'
import { FifteenHelp } from './fifteen/FifteenHelp'
import { FifteenIcon } from './fifteen/FifteenIcon'
import { HanoiGame } from './hanoi/HanoiGame'
import { HanoiHelp } from './hanoi/HanoiHelp'
import { HanoiIcon } from './hanoi/HanoiIcon'
import { LightsOutGame } from './lights-out/LightsOutGame'
import { LightsOutHelp } from './lights-out/LightsOutHelp'
import { LightsOutIcon } from './lights-out/LightsOutIcon'
import { PegHelp } from './peg-solitaire/PegHelp'
import { PegIcon } from './peg-solitaire/PegIcon'
import { PegSolitaireGame } from './peg-solitaire/PegSolitaireGame'
import { WaterSortGame } from './water-sort/WaterSortGame'
import { WaterSortHelp } from './water-sort/WaterSortHelp'
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
  Game: ComponentType<GameProps>
  /** Contents of the "How to play" dialog. */
  Help: ComponentType
}

/** Every game on the site, in tab order. Adding a game means adding it here. */
export const GAMES: readonly GameInfo[] = [
  {
    id: 'hanoi',
    path: '/hanoi',
    title: 'Tower of Hanoi',
    shortTitle: 'Hanoi',
    Icon: HanoiIcon,
    Game: HanoiGame,
    Help: HanoiHelp,
  },
  {
    id: 'lights-out',
    path: '/lights-out',
    title: 'Lights Out',
    shortTitle: 'Lights Out',
    Icon: LightsOutIcon,
    Game: LightsOutGame,
    Help: LightsOutHelp,
  },
  {
    id: 'fifteen',
    path: '/15-puzzle',
    title: '15 Puzzle',
    shortTitle: '15 Puzzle',
    Icon: FifteenIcon,
    Game: FifteenGame,
    Help: FifteenHelp,
  },
  {
    id: 'peg-solitaire',
    path: '/peg-solitaire',
    title: 'Peg Solitaire',
    shortTitle: 'Solitaire',
    Icon: PegIcon,
    Game: PegSolitaireGame,
    Help: PegHelp,
  },
  {
    id: 'water-sort',
    path: '/water-sort',
    title: 'Water Sort',
    shortTitle: 'Water Sort',
    Icon: WaterSortIcon,
    Game: WaterSortGame,
    Help: WaterSortHelp,
  },
]
