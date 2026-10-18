import { Flag, Hand, Keyboard, MousePointerClick } from 'lucide-react'

export function HanoiHelp() {
  return (
    <>
      <p className="help-lead">
        Move the whole tower from the first peg to the <Flag className="inline-icon" aria-hidden="true" />{' '}
        <strong>goal</strong> peg on the right.
      </p>
      <ol className="help-rules">
        <li>Move one disk at a time.</li>
        <li>Only the top disk of a tower can move.</li>
        <li>A disk can never sit on a smaller disk.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap or click</strong> a tower to pick up its top disk, then tap the tower it should go to.
          </span>
        </li>
        <li>
          <Hand aria-hidden="true" />
          <span>
            <strong>Drag and drop</strong> disks with your mouse or finger.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick up and place, <kbd>Esc</kbd> put back, <kbd>Z</kbd> undo,{' '}
            <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
      </ul>

      <h3>Good to know</h3>
      <p>
        The shortest solution for <em>n</em> disks takes 2<sup>n</sup> − 1 moves: 7 for three disks, 1,023 for ten.
        Stuck? <strong>Hint</strong> shows the best next move from any position and <strong>Solve</strong> finishes the
        puzzle for you, but only solves without help count as best scores.
      </p>
      <p className="help-legend">
        Legend has it that monks in a temple are moving a tower of 64 golden disks. At one move per second they would
        need about 585 billion years.
      </p>
    </>
  )
}
