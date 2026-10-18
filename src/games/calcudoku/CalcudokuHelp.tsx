import { Keyboard, Lightbulb, MousePointerClick, Pencil } from 'lucide-react'

export function CalcudokuHelp() {
  return (
    <>
      <p className="help-lead">
        Fill the grid with the digits 1 to N, where N is the grid's size.
      </p>
      <ol className="help-rules">
        <li>Each row and each column holds every digit exactly once.</li>
        <li>
          Heavy lines mark out <strong>cages</strong>. A cage's digits make the number in its corner with its sign:{' '}
          <strong>+</strong> added up, <strong>×</strong> multiplied, <strong>−</strong> the difference of the two, and{' '}
          <strong>÷</strong> one divided by the other.
        </li>
        <li>A digit may repeat within a cage, just not in the same row or column. A cage of one cell holds its number.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a cell, then a digit on the keypad.
          </span>
        </li>
        <li>
          <Pencil aria-hidden="true" />
          <span>
            <strong>Notes</strong> pencil in the digits a cell could still hold. Placing a digit clears it from the notes in
            its row and column.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>1</kbd>–<kbd>6</kbd> place a digit (<kbd>Shift</kbd> for a note), <kbd>N</kbd> notes,{' '}
            <kbd>⌫</kbd> erase, <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> shows the next digit you can be sure of, and why.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Every puzzle has exactly one solution, and logic alone finds it. A wrong digit shows in red and counts as a{' '}
        <strong>mistake</strong>: solve one without any for three stars. Easy puzzles are 4 × 4 with + and −, Medium adds ×
        on 5 × 5, and Hard adds ÷ on 6 × 6.
      </p>
      <p>
        Where to start: cages of one cell, then cages with few ways to make their number. In a 4 × 4 grid, 7+ in two cells
        can only be a 3 and a 4. And when a cage must hold certain digits within one row or column, the rest of that row or
        column can't hold them.
      </p>
      <p className="help-legend">
        Calcudoku also goes by Mathdoku and KenKen, a trademarked name. The Japanese maths teacher Tetsuya Miyamoto invented
        it in 2004.
      </p>
    </>
  )
}
