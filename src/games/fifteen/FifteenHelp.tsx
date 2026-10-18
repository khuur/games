import { Hand, Keyboard, MousePointerClick } from 'lucide-react'

export function FifteenHelp() {
  return (
    <>
      <p className="help-lead">
        Slide the tiles back into order: <strong>1, 2, 3…</strong> row by row, with the gap in the bottom-right corner.
      </p>
      <ol className="help-rules">
        <li>Only a tile next to the gap can move.</li>
        <li>It slides into the gap, leaving a new gap behind.</li>
        <li>Each tile counts as one move.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a tile in the same row or column as the gap to slide it, along with any tiles in
            between.
          </span>
        </li>
        <li>
          <Hand aria-hidden="true" />
          <span>
            <strong>Swipe</strong> to slide the tile next to the gap that way.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys slide, <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Tiles are coloured by the row they belong in, and a dot marks a tile that is already home. On 3×3 the{' '}
        <strong>minimum</strong> and hints are exact. Bigger boards would take far too long to solve perfectly, so they
        show a <strong>par</strong> instead: the length of the classic method of finishing the top row and left column,
        then repeating on the smaller board. Hints follow that method too.
      </p>
      <p className="help-legend">
        In 1880 the 15 Puzzle swept America and Europe. A famous prize was offered for swapping just the 14 and 15, which
        is impossible: half of all arrangements can never be solved, so every puzzle here is dealt from the other half.
      </p>
    </>
  )
}
