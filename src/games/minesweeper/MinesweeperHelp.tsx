import { Flag, Hand, Keyboard, MousePointerClick } from 'lucide-react'

export function MinesweeperHelp() {
  return (
    <>
      <p className="help-lead">
        Open every cell that <strong>isn&apos;t a mine</strong>.
      </p>
      <ol className="help-rules">
        <li>A number tells how many mines touch that cell, diagonals included.</li>
        <li>Use the numbers to work out where the mines are, and flag them.</li>
        <li>Open every safe cell to win. Open a mine and the game is over.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap or click</strong> to open a cell. <strong>Long-press or right-click</strong> to plant or remove a
            flag.
          </span>
        </li>
        <li>
          <Flag aria-hidden="true" />
          <span>
            Turn on <strong>Flag</strong> to plant flags with a tap instead; a long press then opens.
          </span>
        </li>
        <li>
          <Hand aria-hidden="true" />
          <span>
            Tap a number whose mines are all flagged to open every other cell around it at once.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            Arrow keys move, <kbd>Enter</kbd> opens, <kbd>F</kbd> flags, <kbd>H</kbd> hint, <kbd>Z</kbd> takes back a
            mine, <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        The first cell you open is always safe and opens up an area. Every board is built so that logic alone can clear
        it: you never have to guess. <strong>Hint</strong> shows the next thing the numbers prove, and why.
      </p>
      <p>
        Hit a mine? You can <strong>take back</strong> that click and carry on, but the board won&apos;t count toward your
        best time. <strong>Par</strong> is the clicks the board takes without flags or chords. Clear it within par for
        three stars.
      </p>
      <p className="help-legend">
        Minesweeper became famous with Windows 3.1 in 1992, though games like it go back to the early 1980s. On classic
        boards you sometimes have to guess; not here.
      </p>
    </>
  )
}
