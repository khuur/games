import { Crown, Keyboard, Lightbulb, MousePointerClick } from 'lucide-react'

export function QueensHelp() {
  return (
    <>
      <p className="help-lead">
        Place one <strong>queen</strong> in every row, every column and every coloured region.
      </p>
      <ol className="help-rules">
        <li>Each row, each column and each region gets exactly one queen.</li>
        <li>No two queens may touch, not even diagonally at a corner.</li>
        <li>Every puzzle has exactly one solution, and logic alone finds it.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a cell once to cross it out, again for a queen, and again to clear it.{' '}
            <strong>Drag</strong> to cross out several cells.
          </span>
        </li>
        <li>
          <Crown aria-hidden="true" />
          <span>
            <strong>Right-click</strong> places or removes a queen directly. Cells a queen rules out get a soft dot.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>Enter</kbd> cycles, <kbd>Q</kbd> queen, <kbd>X</kbd> cross, <kbd>Z</kbd> undo,{' '}
            <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> shows the next step and the reason, striping the row, column or region it is about.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        A queen in the wrong place counts as a <strong>mistake</strong> and turns into a red cross. Place them all without
        one for three stars.
      </p>
      <p>
        Look for small regions first. A region that fits in a single row owns that row, so no other region can put its
        queen there; two regions squeezed into the same two rows own both. And a cell is out if a queen there would leave
        some region with no room.
      </p>
      <p className="help-legend">
        Puzzles like this come from Star Battle, where regions hold one or two stars each. The one-queen version became a
        daily favourite on LinkedIn in 2024.
      </p>
    </>
  )
}
