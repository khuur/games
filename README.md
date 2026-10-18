# Puzzle Games

Classic puzzles as React games, each on its own tab:

- **Tower of Hanoi:** move the whole tower to the goal peg, one disk at a time, without ever putting
  a bigger disk on a smaller one.
- **Lights Out:** pressing a light flips it and its four neighbours. Switch every light off.

Built with React 19, TypeScript and Vite. No backend: it is a static site, ready for Netlify.

## Features

Both games have:

- A move counter with the minimum to aim for, a timer, star ratings and best scores per level
- Undo and redo, a **hint** that shows the best next move from any position, and an **auto-solver**
  with adjustable speed (solves made with help don't count as best scores)
- Mouse, touch and full keyboard control
- Animations, synthesized sound effects, confetti, light and dark themes, reduced-motion support
  and screen-reader announcements
- Progress kept in the browser, so switching games or reloading never loses your place

Per game:

| | Tower of Hanoi | Lights Out |
| --- | --- | --- |
| Levels | 3 to 10 disks | 3×3 to 7×7 grids, a new random puzzle each time |
| Play | Tap a tower then its destination, or drag and drop | Tap a light; hover to preview what it flips |
| Keyboard | <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick up / place, <kbd>Esc</kbd> put back | Arrow keys move, <kbd>Enter</kbd> presses |

Everywhere: <kbd>Z</kbd> undo, <kbd>Y</kbd> redo, <kbd>H</kbd> hint, <kbd>M</kbd> sound, <kbd>?</kbd> help.

Each game has its own address (`/hanoi`, `/lights-out`), and `/` opens the game played last.

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
    hanoi/       Tower of Hanoi: rules, solver, state, board and controls
    lights-out/  Lights Out: the same pieces
  components/    shared UI: dialogs, stats, status line, stepper, confetti…
  hooks/         shared behaviour: game session (state, clock, saving), auto-solver, routing…
  lib/           sound effects, storage, scoring and formatting
```

Each game's rules live in plain TypeScript with no React (`hanoi.ts`, `lightsOut.ts`, and the
`gameState.ts` next to each), which keeps them easy to test. Both hints and auto-solvers play
optimally from **any** position:

- **Tower of Hanoi:** the largest disk that is not on the goal has to move there exactly once, so
  every smaller disk first goes to the spare peg, and the same reasoning repeats one disk smaller.
- **Lights Out:** presses can happen in any order and pressing a light twice cancels out, so a
  solution is a set of lights. Each light gives one equation in 0s and 1s; Gaussian elimination
  solves them all at once, and on grids where some sets of presses change nothing, trying those
  on top finds the shortest solution.

Tests check both solvers against a brute-force search over every position of small boards.

### Adding a game

Create a folder under `src/games/` with a component that takes `GameProps`, a help component and
an icon, then add an entry to `GAMES` in [`src/games/index.ts`](src/games/index.ts). The tab,
its address and the help dialog follow from that entry. The shared hooks (`useGameSession`,
`useAutoSolver`, `useCelebration`) and components cover the clock, saving, solver loop, results
dialog and stats.
