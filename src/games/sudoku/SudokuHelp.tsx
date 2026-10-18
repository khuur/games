import { Keyboard, Lightbulb, MousePointerClick, Pencil } from 'lucide-react'

export function SudokuHelp() {
  return (
    <>
      <p className="help-lead">
        Fill the grid so every <strong>row, column and box</strong> holds the digits 1 to 9.
      </p>
      <ol className="help-rules">
        <li>No digit may appear twice in a row, a column or one of the nine 3×3 boxes.</li>
        <li>The starting digits stay as they are.</li>
        <li>Every puzzle has exactly one solution, and logic alone leads to it. No guessing needed.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap a cell</strong>, then a digit. The small number on each digit says how many are still to place.
          </span>
        </li>
        <li>
          <Pencil aria-hidden="true" />
          <span>
            <strong>Notes</strong> pencils in candidates instead. Placing a digit tidies it out of the notes around it.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>1</kbd>–<kbd>9</kbd> enter (with <kbd>Shift</kbd> for a note), <kbd>N</kbd> notes,{' '}
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
        A wrong digit turns red and counts as a <strong>mistake</strong>, even if you undo it. Solve a puzzle without any
        for three stars.
      </p>
      <p>
        <strong>Easy</strong> and <strong>Medium</strong> puzzles fall to singles: a cell where only one digit fits, or a
        digit with only one place left in a row, column or box. <strong>Hard</strong> ones also need patterns, such as a{' '}
        <em>pointing pair</em> (inside a box, a digit is stuck on one line, so the rest of that line can&apos;t have it) or
        a <em>naked pair</em> (two cells in a row that can only hold the same two digits, which the rest of the row then
        can&apos;t).
      </p>
      <p className="help-legend">
        Sudoku began as &ldquo;Number Place&rdquo; in an American puzzle magazine in 1979 and got its name in Japan in
        1984.
      </p>
    </>
  )
}
