import { Keyboard, Lightbulb, MousePointerClick } from 'lucide-react'

export function CodeBreakerHelp() {
  return (
    <>
      <p className="help-lead">
        Work out the <strong>hidden code</strong> of coloured pegs.
      </p>
      <ol className="help-rules">
        <li>Fill a row with colours and check it.</li>
        <li>
          Each <strong>filled mark</strong> means one peg is the right colour in the right place. Each{' '}
          <strong>ring</strong> means one more is a right colour, but in the wrong place.
        </li>
        <li>The marks don&apos;t say which pegs they belong to. Crack the code before you run out of rows.</li>
      </ol>

      <h3>Controls</h3>
      <ul className="help-controls">
        <li>
          <MousePointerClick aria-hidden="true" />
          <span>
            <strong>Tap a colour</strong> to put it in the selected slot. Tap an empty slot to select it, or a filled one
            to take its peg out. The tick at the end of the row checks it.
          </span>
        </li>
        <li>
          <Keyboard aria-hidden="true" />
          <span>
            <kbd>1</kbd>–<kbd>8</kbd> pick colours, <kbd>←</kbd> <kbd>→</kbd> choose a slot, <kbd>⌫</kbd> erases,{' '}
            <kbd>Enter</kbd> checks, <kbd>H</kbd> hint, <kbd>M</kbd> sound.
          </span>
        </li>
        <li>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Hint</strong> fills the row with a strong guess and says how much it narrows things down.
          </span>
        </li>
      </ul>

      <h3>Levels</h3>
      <p>
        <strong>Easy</strong> uses 6 colours, each at most once. <strong>Classic</strong> lets colours repeat.{' '}
        <strong>Hard</strong> hides 5 pegs in 8 colours, with 12 rows to find them. Every colour also has its own shape,
        so the pegs can be told apart without colour.
      </p>
      <p>
        <strong>Possible</strong>, under the guess count, is how many codes still fit every answer so far.{' '}
        <strong>Par</strong> is the most guesses the computer&apos;s own strategy needs on the level. Match it for three
        stars.
      </p>
      <p className="help-legend">
        The game is best known as Mastermind (1970). In 1977 Donald Knuth showed that any classic code can be cracked in
        five guesses; Solve plays his way.
      </p>
    </>
  )
}
