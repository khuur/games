import { Keyboard, Lightbulb, MousePointerClick, Pencil } from 'lucide-react'

export function SkyscrapersHelp() {
  return (
    <>
      <p className="help-lead">
        Every cell holds a <strong>tower</strong>, 1 to N storeys tall, where N is the grid's size.
      </p>
      <ol className="help-rules">
        <li>Each row and each column holds every height exactly once.</li>
        <li>
          A clue outside the grid says how many towers you would <strong>see</strong> looking in from there. Taller towers
          hide the shorter ones behind them.
        </li>
        <li>Every puzzle has exactly one solution, and logic alone finds it.</li>
      </ol>
      <p>
        So from the left, the row 2 4 1 3 shows two towers: the 2, then the 4, which hides the rest.
      </p>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a cell, then a height on the keypad.
          </span>
        </li>
        <li>
          <Pencil aria-hidden="true" />
          <span>
            <strong>Notes</strong> pencil in the heights a cell could still hold. Placing a height clears it from the notes in
            its row and column.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>1</kbd>–<kbd>6</kbd> place a height (<kbd>Shift</kbd> for a note), <kbd>N</kbd> notes,{' '}
            <kbd>⌫</kbd> erase, <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> shows the next height you can be sure of, and why.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        A wrong height shows in red and counts as a <strong>mistake</strong>: solve one without any for three stars. Easy
        puzzles are 4 × 4, Medium 5 × 5 and Hard 6 × 6.
      </p>
      <p>
        Where to start: a <strong>1</strong> sees only the nearest tower, so that one is the tallest. A clue as big as the
        grid sees every tower, so they climb 1, 2, 3… from that side. And towers close to a clue can't be too tall: next to
        a 3, the first tower leaves room for two more in view, so it is at most N − 2.
      </p>
      <p className="help-legend">
        Underneath, Skyscrapers is a Latin square, like a Sudoku without the boxes, with its clues moved outside the grid.
      </p>
    </>
  )
}
