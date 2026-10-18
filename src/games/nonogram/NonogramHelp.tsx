import { Keyboard, Lightbulb, MousePointerClick, X } from 'lucide-react'

export function NonogramHelp() {
  return (
    <>
      <p className="help-lead">
        Fill in cells to reveal a <strong>hidden picture</strong>.
      </p>
      <ol className="help-rules">
        <li>The numbers beside each row and above each column are the runs of filled cells in that line, in order.</li>
        <li>
          Runs have at least one empty cell between them: <strong>3 1</strong> means three filled cells, a gap, then one
          more.
        </li>
        <li>Every picture has exactly one solution, and you can always work it out one line at a time.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap or click</strong> to fill a cell, or <strong>drag</strong> to fill a stretch. Tap a marked cell
            to clear it.
          </span>
        </li>
        <li>
          <X aria-hidden="true" />
          <span>
            <strong>Long-press</strong> or <strong>right-click</strong> to cross out a cell you know is empty, or use
            the switch in the top corner to make taps cross.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>F</kbd> fills, <kbd>X</kbd> crosses, <kbd>C</kbd> switches what taps do, <kbd>Z</kbd>{' '}
            undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> marks a line and the cells its numbers prove, whichever way they fit.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        Filling a cell that belongs to the background counts as a <strong>mistake</strong> and leaves a red cross there.
        Reveal a picture without any for three stars. A clue turns grey once its line is complete.
      </p>
      <p>
        A good place to start is a big number: in a line of 10, a run of 7 always covers the middle four cells, wherever it
        sits.
      </p>
      <p className="help-legend">
        Nonograms appeared in Japan in the late 1980s. The name joins that of Non Ishida, one of their inventors, with
        &ldquo;diagram&rdquo;.
      </p>
    </>
  )
}
