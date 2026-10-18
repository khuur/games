# Puzzle Games

Eight classic puzzles as React games, each on its own tab:

- **Tower of Hanoi:** move the whole tower to the goal peg, one disk at a time, never putting a
  bigger disk on a smaller one.
- **Lights Out:** pressing a light flips it and its four neighbours. Switch every light off.
- **15 Puzzle:** slide the numbered tiles back into order.
- **Peg Solitaire:** jump pegs over each other until one is left, ideally in the centre.
- **Water Sort:** pour coloured water between tubes until each tube holds a single colour.
- **Code Breaker:** crack a hidden code of coloured pegs from the marks each guess earns (the game
  better known as Mastermind).
- **Minesweeper:** open every cell that isn't a mine, using the numbers. No board ever needs a
  guess.
- **Sudoku:** fill the grid so every row, column and box holds 1 to 9.

Built with React 19, TypeScript and Vite. No backend: it is a static site, ready for Netlify.

## Features

Every game has:

- A score with a target to aim for (moves against the minimum, guesses or clicks against par, or
  mistakes), a timer, star ratings and best times per level
- A **hint** that works from any position and says why, and an **auto-solver** with adjustable
  speed (solves made with help don't count as best scores)
- Undo and redo wherever they make sense (Minesweeper lets you take back a mine instead)
- Mouse, touch and full keyboard control
- Animations, synthesized sound effects, confetti, light and dark themes, reduced-motion support
  and screen-reader announcements
- Progress kept in the browser, so switching games or reloading never loses your place

| Game | Levels | Hints and the target to beat |
| --- | --- | --- |
| Tower of Hanoi | 3 to 10 disks | Exact: the fewest moves from any position |
| Lights Out | 3×3 to 7×7, random puzzles | Exact: the fewest presses |
| 15 Puzzle | 3×3 to 5×5, random puzzles | Exact on 3×3; bigger boards show a *par* from the classic row-by-row method |
| Peg Solitaire | Triangle and English boards | A jump that keeps the perfect finish (last peg in the goal hole) possible |
| Water Sort | 3 to 9 colours, random puzzles | Exact: the fewest pours |
| Code Breaker | Easy, Classic, Hard (5 pegs, 8 colours) | A strong next guess and how far it narrows the codes; *par* is the most guesses the computer's strategy needs |
| Minesweeper | Easy, Medium, Hard, every board solvable without guessing | The next thing the numbers prove, and why; *par* is the board's 3BV (clicks without flags or chords) |
| Sudoku | Easy, Medium, Hard, graded by technique | The next digit you can be sure of and the technique that finds it; the score is mistakes |

Keyboard everywhere: <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound,
<kbd>?</kbd> help. Each game's help explains its own keys (number keys pick towers, tubes, colours
and digits; arrow keys move tiles or walk around grids and boards).

Each game has its own address (`/hanoi`, `/lights-out`, `/15-puzzle`, `/peg-solitaire`,
`/water-sort`, `/code-breaker`, `/minesweeper`, `/sudoku`), and `/` opens the game played last.

## Development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` | Lint with oxlint |

## Deploying to Netlify

[`netlify.toml`](netlify.toml) already holds the build settings (build command, `dist` as the
publish folder, Node version, cache headers, and the rule that lets each game's address load
directly), so there is nothing to configure in the Netlify UI. Pick one of these:

1. **From Git (recommended):** in Netlify, choose **Add new site → Import an existing project** and
   select this repository. Every push to `main` then deploys automatically.
2. **With the Netlify CLI:**
   ```bash
   npm run build
   npx netlify-cli deploy --prod --dir=dist
   ```
   The first run asks you to log in and to create or link a site.
3. **Drag and drop:** run `npm run build` and drop the `dist` folder onto
   [app.netlify.com/drop](https://app.netlify.com/drop).

## How it is built

```
src/
  App.tsx        the site: header, game tabs, sound and theme, help
  games/
    index.ts     the list of games
    hanoi/  lights-out/  fifteen/  peg-solitaire/  water-sort/
    code-breaker/  minesweeper/  sudoku/
                 each game: rules and solver, game state, saving, board and help
  components/    shared UI: controls, dialogs, stats, status line, stepper, confetti…
  hooks/         shared behaviour: game session (state, clock, saving), auto-solver, routing…
  lib/           sound effects, storage, scoring, records and formatting
```

Each game's rules and solver live in plain TypeScript with no React, next to a `gameState.ts`
reducer, which keeps them easy to test. The solvers:

- **Tower of Hanoi:** the largest disk that is not on the goal has to move there exactly once, so
  every smaller disk first goes to the spare peg, and the same reasoning repeats one disk smaller.
- **Lights Out:** presses can happen in any order and pressing twice cancels out, so a solution is a
  set of lights. Each light gives one equation in 0s and 1s; Gaussian elimination solves them all,
  and trying the combinations of presses that change nothing finds the shortest solution.
- **15 Puzzle:** 3×3 uses a table of the exact distance of all 181,440 solvable positions. Bigger
  boards are solved the way people do it, one row and column at a time, each step by a shortest
  search; the true minimum would take far too long to find on a phone.
- **Peg Solitaire:** a depth-first search that treats mirrored and turned positions as one and
  remembers every position it has settled. On the big board it runs in small slices so the page
  stays responsive while it thinks.
- **Water Sort:** an A* search that ignores the order of the tubes. Each pour merges at most one
  pair of colour blocks, so counting the blocks beyond one per colour never overestimates the pours
  left, which keeps the first solution found a shortest one.
- **Code Breaker:** Donald Knuth's minimax rule: play the guess whose worst possible answer leaves
  the fewest codes. It never needs more than five guesses on Classic. Hard has 32,768 codes, so
  there it weighs a sample of guesses against a sample of codes to stay quick.
- **Minesweeper:** reasons only from the numbers on show: one number at a time, then two together,
  then every way the mines could sit around the numbers, given how many mines are left. Mines are
  laid at the first click, and a layout is kept only if this solver can clear it from there, so no
  board ever needs a guess.
- **Sudoku:** a bitmask search with the most constrained cell first makes sure a puzzle keeps exactly
  one solution as clues are removed. A second solver works like a person (singles, then pointing
  pairs, box-line reductions, naked and hidden pairs, naked triples); it grades each puzzle and
  explains hints.

Tests check the solvers against brute-force searches on small boards.

### Adding a game

Create a folder under `src/games/` with a component that takes `GameProps`, a help component and
an icon, then add an entry to `GAMES` in [`src/games/index.ts`](src/games/index.ts). The tab, its
address and the help dialog follow from that entry. The shared hooks (`useGameSession`,
`useAutoSolver`, `useCelebration`) and components (`GameControls`, `StatsBar`, `WinDialog`…) cover
the clock, saving, solver loop, controls, results and stats.
