# Puzzle Games

Sixteen classic puzzles as React games, each on its own tab (and all in one list behind the grid
button, or <kbd>G</kbd>):

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
- **Nonogram:** fill in cells to reveal a hidden picture, from the runs of filled cells listed for
  every row and column.
- **Queens:** place one queen in every row, column and coloured region, with no two touching.
- **Bridges:** join numbered islands with bridges so each gets exactly its number and all connect
  (Hashiwokakero).
- **Takuzu:** fill the grid with suns and moons: never three alike in a line, as many of each in
  every row and column, and the = and × signs obeyed (the Tango kind).
- **Skyscrapers:** place towers of every height once per row and column so that each clue around
  the grid counts the towers seen from there.
- **Calcudoku:** fill a Latin square whose cages make their numbers with their signs (the kind of
  puzzle KenKen made famous).
- **Star Battle:** two stars in every row, column and region, none touching.
- **Slitherlink:** draw one loop along the dots so that each number counts the loop's sides around
  it.

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
| Nonogram | Easy 8×8, Medium 10×10, Hard 10×14 | The line that proves the most cells next, and what it proves; the score is mistakes |
| Queens | Easy 6×6, Medium 8×8, Hard 10×10, graded by technique | The next step and its reason, with the row, column or region it is about marked; the score is mistakes |
| Bridges | Easy, Medium, Hard, graded by technique | A bridge you can be sure of, and why; the target is the number of bridges in the solution |
| Takuzu | Easy 6×6, Medium 8×8, Hard 10×10, graded by technique | The next cell you can be sure of and the pattern that shows it; the score is moves that break a rule |
| Skyscrapers | Easy 4×4, Medium 5×5, Hard 6×6, graded by technique | The next height and why, with the clues it comes from lit up; the score is mistakes |
| Calcudoku | Easy 4×4 (+ −), Medium 5×5 (adds ×), Hard 6×6 (adds ÷) | The next digit and the cage, row or column that settles it; the score is mistakes |
| Star Battle | Easy 9×9, Medium 10×10, Hard 10×10, graded by technique | The next step and its reason, with the rows, columns or regions it is about marked; the score is mistakes |
| Slitherlink | Easy 5×5, Medium 7×7, Hard 8×8, graded by technique | The next edges you can be sure of and why; the score is moves that break a rule |

Keyboard everywhere: <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound,
<kbd>?</kbd> help, <kbd>G</kbd> all games. Each game's help explains its own keys (number keys
pick towers, tubes, colours and digits; arrow keys move tiles or walk around grids and boards).

Each game has its own address (`/hanoi`, `/lights-out`, `/15-puzzle`, `/peg-solitaire`,
`/water-sort`, `/code-breaker`, `/minesweeper`, `/sudoku`, `/nonogram`, `/queens`, `/bridges`,
`/takuzu`, `/skyscrapers`, `/calcudoku`, `/star-battle`, `/slitherlink`), and `/` opens the game
played last.

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
    code-breaker/  minesweeper/  sudoku/  nonogram/  queens/  bridges/
    takuzu/  skyscrapers/  calcudoku/  star-battle/  slitherlink/
                 each game: rules and solver, game state, saving, board, help, icon and colours
    latin/       what Skyscrapers and Calcudoku share: the grid, keypad, notes, state and screen
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
- **Nonogram:** a line solver finds the cells that every arrangement of a row's (or column's) runs
  agrees on, by working out where each run can start. Repeating it across the lines until nothing
  changes solves every puzzle, which also proves its solution is the only one. Pictures are
  mirrored noise, kept only when this logic solves them.
- **Queens:** regions grow around a random queen layout, then get reshaped until no other solution
  is left: each rival solution is broken by handing one of its queens' cells to a neighbouring
  region. A solver that reasons like a person (a region down to one cell, regions squeezed into
  rows or columns, alone or in pairs and groups, cells whose queen would leave a region no room)
  grades puzzles and explains hints.
- **Bridges:** islands grow out from one, each new island reached by a bridge. A search that narrows
  each link's possible bridges, checking crossings and connections, counts the solutions; a solver
  that reasons like a person (what each number allows, crossings, bridges that would cut a group
  off, and a step of looking ahead) grades puzzles and explains hints.
- **Takuzu:** every line that can still fit is kept as a bit mask, so a line's forced cells come
  from what all its fitting patterns agree on. A solver that works like a person (pairs, gaps,
  signs, counts, then whole lines and a step of looking ahead) grades puzzles; givens and signs are
  taken away together while it still reaches the one solution.
- **Skyscrapers:** each line's clues are checked against every order of its heights, keeping only
  the heights that some fitting order puts in each cell. The solver starts from what single clues
  say (a 1 or a full count, towers too tall to stand near a clue) before whole lines; clues are
  removed while it still solves the puzzle and a search finds no second grid.
- **Calcudoku:** a cage's digits come from listing every way to make its number that fits the rows
  and columns. Random cages with random signs are kept when a search finds one solution and the
  person-like solver (singles, cages, then digits a cage must keep in a line and naked pairs) gets
  there too.
- **Star Battle:** the stars are planted first, paired up, and each pair grows a region; the
  regions are then reshaped until no rival solution is left. The person-like solver tries the ways
  a unit's stars can sit apart (cells every way uses, none uses, or every way touches), regions
  squeezed into rows and columns, and a step of looking ahead.
- **Slitherlink:** loops are the outlines of random blobs of cells without holes. The solver uses
  the basic rules (clues, dots with two lines or a dead end, loops closed too soon), then what all
  the ways round a clue's corners agree on, then a step of looking ahead. Every step is sound, so
  when it closes the loop the solution is the only one; clues are removed while it still can.

Tests check the solvers against brute-force searches on small boards.

Each game's code loads when it is first opened, and the rest load quietly in the background, so
the first download stays small however many games the site has.

### Adding a game

Create a folder under `src/games/` with a component that takes `GameProps`, a help component and
an icon (which imports the game's `theme.css`, so the icon's colours are there before the game
loads), then add an entry to `GAMES` in [`src/games/index.ts`](src/games/index.ts) with
`lazyGame(…)`. The tab, its address and the help dialog follow from that entry. The shared hooks (`useGameSession`,
`useAutoSolver`, `useCelebration`) and components (`GameControls`, `StatsBar`, `WinDialog`…) cover
the clock, saving, solver loop, controls, results and stats.
