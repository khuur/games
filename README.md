# Tower of Hanoi

The classic disk-stacking puzzle as a React game. Move the whole tower to the goal peg, one disk
at a time, without ever putting a bigger disk on a smaller one.

Built with React 19, TypeScript and Vite. No backend: it is a static site, ready for Netlify.

## Features

- **3 to 10 disks**, with a move counter, the minimum to aim for, a timer and best scores per disk count
- **Play your way:** tap or click a tower and then its destination, drag and drop with mouse or
  finger, or use the keyboard
- **Undo and redo**, a **hint** button that shows the best next move from any position, and an
  **auto-solver** with adjustable speed (solves made with help don't count as best scores)
- Smooth animations, synthesized sound effects (every disk plays its own note), confetti and star ratings
- Light and dark themes, reduced-motion support and screen-reader announcements
- Progress is kept in the browser, so a reload never loses your game

### Keyboard

| Key | Action |
| --- | --- |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | Pick up from / place on that tower |
| <kbd>←</kbd> <kbd>→</kbd>, <kbd>Enter</kbd> | Move between towers and activate the focused one |
| <kbd>Esc</kbd> | Put the picked-up disk back |
| <kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo |
| <kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo |
| <kbd>H</kbd> | Hint |
| <kbd>M</kbd> | Sound on/off |

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
publish folder, Node version and cache headers), so there is nothing to configure in the
Netlify UI. Pick one of these:

1. **From Git (recommended):** push this repository to GitHub, GitLab or Bitbucket. In Netlify,
   choose **Add new site → Import an existing project** and select the repository. Every push to
   `main` then deploys automatically.
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
  game/        rules, solver, game state and persistence
  components/  board, disks, dialogs and controls
  hooks/       small reusable hooks (stopwatch, theme, element size…)
  lib/         sound effects, storage and formatting helpers
```

The rules live in plain TypeScript with no React (`src/game/hanoi.ts` and `src/game/gameState.ts`),
which keeps them easy to test. The hint and the auto-solver use the optimal strategy from **any**
position, not just from the start: the largest disk that is not yet on the goal has to move there
exactly once, so every smaller disk first goes to the spare peg, and the same reasoning repeats
one disk smaller. A test checks this against a brute-force search over every legal position.

Disks are absolutely positioned and animated with the Web Animations API. A move flies the disk
straight up, across above the pegs and down again, and an interrupted flight (for example when
you undo mid-move) carries on from wherever the disk is on screen.
