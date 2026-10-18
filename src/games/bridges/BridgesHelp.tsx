import { Keyboard, Lightbulb, MousePointerClick } from 'lucide-react'

export function BridgesHelp() {
  return (
    <>
      <p className="help-lead">
        Join every island with <strong>bridges</strong>.
      </p>
      <ol className="help-rules">
        <li>Each island needs exactly as many bridges as its number.</li>
        <li>
          Bridges run straight across or down. Two islands can share one or two bridges, and bridges never cross each
          other.
        </li>
        <li>In the end, every island must be connected to every other, in one group.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap the gap</strong> between two islands to build a bridge, again for a second, and once more to
            take them away. You can also <strong>drag</strong> from an island toward another, or tap one island and then
            the other.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move between islands, <kbd>Shift</kbd> and an arrow builds that way, <kbd>Z</kbd> undo,{' '}
            <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> shows a bridge you can be sure of, and the reason.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Islands turn green once they have their bridges, and red if they have too many. <strong>Minimum</strong> is the
        number of bridges the solution needs: build them without wrong ones for three stars.
      </p>
      <p>
        Good places to start: an island whose number needs every bridge its neighbours allow (a 4 in a corner, an 8 in
        the open), and two 1s, which can never join each other unless they are the only islands.
      </p>
      <p className="help-legend">
        The puzzle is known in Japan as Hashiwokakero, &ldquo;build bridges!&rdquo;, and was first published by Nikoli in
        1990.
      </p>
    </>
  )
}
