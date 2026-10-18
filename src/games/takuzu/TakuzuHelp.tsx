import { Keyboard, Lightbulb, MousePointerClick } from 'lucide-react'

export function TakuzuHelp() {
  return (
    <>
      <p className="help-lead">
        Fill the grid with <strong>suns and moons</strong>.
      </p>
      <ol className="help-rules">
        <li>No more than two of the same next to each other, across or down.</li>
        <li>Every row and every column holds as many suns as moons.</li>
        <li>
          Cells joined by <strong>=</strong> hold the same symbol; cells joined by <strong>×</strong> hold opposite ones.
        </li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a cell for a sun, again for a moon, and once more to clear it. Right-click goes straight to
            a moon.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>1</kbd> sun, <kbd>2</kbd> moon, <kbd>⌫</kbd> clear, <kbd>Enter</kbd> cycles, <kbd>Z</kbd>{' '}
            undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> shows the next cell you can be sure of, and why.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Every puzzle has exactly one solution, and logic alone finds it. A move that breaks a rule is marked in red and
        counts as a <strong>mistake</strong>: solve one without any for three stars.
      </p>
      <p>
        Handy patterns: two of a kind side by side means the cells on either side are the other kind; a gap between two of
        a kind is the other kind; and a line with its half of one kind is the other kind everywhere else.
      </p>
      <p className="help-legend">
        This puzzle goes by many names, Takuzu and Binairo among them, and first appeared in Belgium in 2009. The = and ×
        signs come from Tango, the variant LinkedIn made a daily habit in 2024.
      </p>
    </>
  )
}
