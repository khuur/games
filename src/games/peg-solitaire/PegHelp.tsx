import { Keyboard, MousePointerClick } from 'lucide-react'

export function PegHelp() {
  return (
    <>
      <p className="help-lead">
        Clear the board until <strong>one peg is left</strong>, ideally in the centre (or the top hole of the
        triangle).
      </p>
      <ol className="help-rules">
        <li>A peg jumps over a neighbouring peg into the empty hole right behind it.</li>
        <li>The peg that was jumped over comes off the board.</li>
        <li>Jumps go in straight lines: across or up and down, plus diagonally on the triangle.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a peg to pick it up, then tap the hole to jump into. When only one peg can reach an
            empty hole, tapping the hole is enough.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>Enter</kbd> picks up and jumps, <kbd>Esc</kbd> puts down, <kbd>Z</kbd> undo,{' '}
            <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Every finished game takes the same number of jumps, so it is scored by where the last peg ends up: in the
        golden-ringed goal hole for three stars, anywhere else for two. It is easy to strand pegs that can never be
        reached again, and <strong>Hint</strong> will tell you when that has happened. On the big board it may think for
        a moment first.
      </p>
      <p className="help-legend">
        Peg solitaire was already a pastime at the court of Louis XIV: a 1697 engraving shows a French princess
        playing it.
      </p>
    </>
  )
}
