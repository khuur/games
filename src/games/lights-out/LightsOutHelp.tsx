import { Keyboard, MousePointer2, MousePointerClick } from 'lucide-react'

export function LightsOutHelp() {
  return (
    <>
      <p className="help-lead">
        Switch <strong>every light off</strong>.
      </p>
      <ol className="help-rules">
        <li>Pressing a light flips it and its neighbours above, below, left and right.</li>
        <li>Lights that are on go off, lights that are off come on.</li>
        <li>Clear the whole board to win.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap or click</strong> a light to press it.
          </span>
        </li>
        <li>
          <MousePointer2 aria-hidden="true" />
          <span>
            <strong>Hover</strong> over a light to see which lights a press would flip.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>Enter</kbd> presses, <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint,{' '}
            <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        The order of presses doesn&apos;t matter and pressing a light twice cancels out, so each puzzle is really about
        <em> which</em> lights to press. <strong>Minimum</strong> shows the fewest presses that solve the current puzzle,
        and <strong>Hint</strong> points at one of them.
      </p>
      <p className="help-legend">
        Lights Out was a handheld game by Tiger Electronics in 1995. On its 5×5 board only one random pattern in four
        can be solved at all, so every puzzle here is dealt in a way that guarantees a solution.
      </p>
    </>
  )
}
