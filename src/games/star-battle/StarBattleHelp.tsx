import { Keyboard, Lightbulb, MousePointerClick, Star } from 'lucide-react'

export function StarBattleHelp() {
  return (
    <>
      <p className="help-lead">
        Place <strong>two stars</strong> in every row, every column and every coloured region.
      </p>
      <ol className="help-rules">
        <li>Each row, each column and each region gets exactly two stars.</li>
        <li>No two stars may touch, not even diagonally at a corner.</li>
        <li>Every puzzle has exactly one solution, and logic alone finds it.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap</strong> a cell once to cross it out, again for a star, and again to clear it.{' '}
            <strong>Drag</strong> to cross out several cells.
          </span>
        </li>
        <li>
          <Star aria-hidden="true" />
          <span>
            <strong>Right-click</strong> places or removes a star directly. Cells the stars rule out get a soft dot.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>Enter</kbd> cycles, <kbd>S</kbd> star, <kbd>X</kbd> cross, <kbd>Z</kbd> undo,{' '}
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
        A star in the wrong place counts as a <strong>mistake</strong> and turns into a red cross. Place them all without
        one for three stars.
      </p>
      <p>
        Small regions are the place to start: try the ways their two stars could sit apart. Any cell that touches a star
        in every one of those ways is out. A region that fits in two rows supplies both of their stars, so nothing else in
        those rows can have one. And a cell is out if a star there would leave some row, column or region without room.
      </p>
      <p className="help-legend">
        Star Battle has been a favourite at world puzzle championships since the early 2000s, and two stars on a grid of
        ten by ten is its classic form. Queens, its one-star cousin, is on this site too.
      </p>
    </>
  )
}
