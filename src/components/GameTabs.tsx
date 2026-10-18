import type { CSSProperties, MouseEvent } from 'react'
import type { GameInfo } from '../games'

interface GameTabsProps {
  games: readonly GameInfo[]
  currentId: string
  onSelect: (game: GameInfo) => void
}

/** Switches between games. Real links, so each game has its own address. */
export function GameTabs({ games, currentId, onSelect }: GameTabsProps) {
  const activeIndex = games.findIndex((game) => game.id === currentId)

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, game: GameInfo) => {
    // Leave ctrl/cmd/middle clicks to the browser, so they still open a new tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onSelect(game)
  }

  return (
    <nav
      className="game-tabs"
      aria-label="Games"
      style={{ '--tab-count': games.length, '--active-tab': activeIndex } as CSSProperties}
    >
      <span className="game-tabs-indicator" aria-hidden="true" />
      {games.map((game) => (
        <a
          key={game.id}
          href={game.path}
          className="game-tab"
          aria-current={game.id === currentId ? 'page' : undefined}
          onClick={(event) => handleClick(event, game)}
        >
          <game.Icon />
          <span className="game-tab-label">{game.title}</span>
          <span className="game-tab-label short">{game.shortTitle}</span>
        </a>
      ))}
    </nav>
  )
}
