import { Keyboard, Lightbulb, MousePointerClick, Spline } from 'lucide-react'

export function SlitherlinkHelp() {
  return (
    <>
      <p className="help-lead">
        Draw a single <strong>loop</strong> along the lines between the dots.
      </p>
      <ol className="help-rules">
        <li>A number tells how many of its cell's four sides the loop runs along. Cells without a number can have any.</li>
        <li>The loop is one closed path: it never branches, crosses itself or touches itself.</li>
        <li>Every puzzle has exactly one solution, and logic alone finds it.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> an edge to draw it, again to cross it out (no loop there), and again to clear it.
            Right-click crosses an edge directly.
          </span>
        </li>
        <li>
          <Spline aria-hidden="true" />
          <span>
            <strong>Drag</strong> from dot to dot to draw a stretch of loop at once. Starting on a line rubs lines out
            instead.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move between cells; <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> draw the top, left, bottom
            or right side, with <kbd>Shift</kbd> to cross it. <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint,{' '}
            <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> marks the next edges you can be sure of, and says why.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        A move that breaks a rule turns red and counts as a <strong>mistake</strong>: a number with too many lines (or too
        few sides left), a dot where lines branch or stop, or a loop closed too soon. Close the loop without one for three
        stars.
      </p>
      <p>
        Where to start: a 0 has no loop around it, so cross all four sides. A 3 in a corner of the grid takes both outer
        sides. And at every dot the loop either passes straight through or turns, so two lines there close it to the rest.
      </p>
      <p className="help-legend">Slitherlink comes from the Japanese puzzle publisher Nikoli, which first printed it in 1989.</p>
    </>
  )
}
