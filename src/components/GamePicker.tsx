import { useId, type MouseEvent } from 'react'
import type { GameInfo } from '../games'
import { Dialog, DialogCloseButton } from './Dialog'

interface GamePickerProps {
  games: readonly GameInfo[]
  currentId: string
  onSelect: (game: GameInfo) => void
  onClose: () => void
}

const GROUPS: { id: GameInfo['group']; title: string }[] = [
  { id: 'moves', title: 'Move puzzles' },
  { id: 'logic', title: 'Logic puzzles' },
]

/** Every game at a glance, grouped, with a line about each. */
export function GamePicker({ games, currentId, onSelect, onClose }: GamePickerProps) {
  const titleId = useId()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, game: GameInfo) => {
    // Leave ctrl/cmd/middle clicks to the browser, so they still open a new tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onSelect(game)
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="picker-dialog">
      <DialogCloseButton onClick={onClose} />
      <h2 id={titleId}>All games</h2>
      {GROUPS.map((group) => (
        <section key={group.id} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul className="picker-grid">
            {games
              .filter((game) => game.group === group.id)
              .map((game) => (
                <li key={game.id}>
                  <a
                    href={game.path}
                    className="picker-card"
                    aria-current={game.id === currentId ? 'page' : undefined}
                    data-autofocus={game.id === currentId || undefined}
                    onClick={(event) => handleClick(event, game)}
                  >
                    <game.Icon />
                    <span className="picker-text">
                      <span className="picker-name">{game.title}</span>
                      <span className="picker-blurb">{game.blurb}</span>
                    </span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Dialog>
  )
}
