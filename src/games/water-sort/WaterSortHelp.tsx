import { Keyboard, MousePointerClick } from 'lucide-react'

export function WaterSortHelp() {
  return (
    <>
      <p className="help-lead">
        Pour the water between tubes until <strong>each tube holds a single colour</strong>.
      </p>
      <ol className="help-rules">
        <li>You can pour onto the same colour, or into an empty tube.</li>
        <li>All of the top colour pours at once, as much as fits.</li>
        <li>A tube holds four layers.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a tube to pick it up, then tap the tube to pour it into. Tap it again to put it back.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            <kbd>1</kbd>–<kbd>9</kbd> (and <kbd>0</kbd> for tube 10) pick and pour, arrow keys and <kbd>Enter</kbd>{' '}
            work too, <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        It is possible to pour yourself into a corner with no way out, so plan ahead and use the spare tubes wisely.{' '}
        <strong>Minimum</strong> is the fewest pours that sort the puzzle, and <strong>Hint</strong> shows a first pour of
        such a solution, or tells you when undoing is the only way forward. Every colour has its own faint symbol, in
        case two colours look alike to you.
      </p>
    </>
  )
}
