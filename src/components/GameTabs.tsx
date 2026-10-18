import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { GameInfo } from '../games'

interface GameTabsProps {
  games: readonly GameInfo[]
  currentId: string
  onSelect: (game: GameInfo) => void
}

type Overflow = 'none' | 'left' | 'right' | 'both'

/** Tabs at least this wide have room for a game's full name. */
const ROOMY_TAB = 108

/**
 * Switches between games. Real links, so each game has its own address. Full names show when
 * every tab has room for one, short names otherwise. When the tabs don't all fit, the strip
 * scrolls sideways and fades at the edge that has more to show.
 */
export function GameTabs({ games, currentId, onSelect }: GameTabsProps) {
  const navRef = useRef<HTMLElement>(null)
  const [overflow, setOverflow] = useState<Overflow>('none')
  const [roomy, setRoomy] = useState(false)
  const activeIndex = games.findIndex((game) => game.id === currentId)

  const measure = () => {
    const nav = navRef.current
    if (!nav) return
    const left = nav.scrollLeft > 1
    const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
    setOverflow(left && right ? 'both' : left ? 'left' : right ? 'right' : 'none')
    setRoomy(nav.clientWidth / games.length >= ROOMY_TAB)
  }

  const remeasure = useEffectEvent(measure)

  // Measured before the first paint, so the labels never visibly switch on load.
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    remeasure()
    const observer = new ResizeObserver(() => remeasure())
    observer.observe(nav)
    return () => observer.disconnect()
  }, [])

  // Keep the current game's tab in view.
  useEffect(() => {
    const nav = navRef.current
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return
    const left = tab.offsetLeft + tab.offsetWidth / 2 - nav.clientWidth / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [currentId])

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, game: GameInfo) => {
    // Leave ctrl/cmd/middle clicks to the browser, so they still open a new tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onSelect(game)
  }

  return (
    <nav
      ref={navRef}
      className={`game-tabs${roomy ? ' is-roomy' : ''}`}
      aria-label="Games"
      data-overflow={overflow}
      onScroll={measure}
    >
      <div className="game-tabs-track" style={{ '--tab-count': games.length, '--active-tab': activeIndex } as CSSProperties}>
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
      </div>
    </nav>
  )
}
