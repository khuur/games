import type { ComponentType } from 'react'
import { HanoiGame } from './hanoi/HanoiGame'
import { HanoiHelp } from './hanoi/HanoiHelp'
import { HanoiIcon } from './hanoi/HanoiIcon'
import { LightsOutGame } from './lights-out/LightsOutGame'
import { LightsOutHelp } from './lights-out/LightsOutHelp'
import { LightsOutIcon } from './lights-out/LightsOutIcon'

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
]
