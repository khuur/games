import { describe, expect, it } from 'vitest'
import {
  chordCells,
  countFlags,
  createGame,
  minesReducer,
  restoreGame,
  toSnapshot,
  type MinesAction,
  type MinesState,
} from './gameState'
import { cellCount, LEVELS } from './minesweeper'

const run = (state: MinesState, ...actions: MinesAction[]) => actions.reduce(minesReducer, state)
const level = LEVELS.easy
const size = cellCount(level)
const cellAt = (row: number, column: number) => row * level.columns + column

/**
 * A 9×9 board where a click in the top-left corner opens most of it, but not a pocket in the
 * bottom-left walled off by mines at (6,0)–(6,2) and (7,3)–(8,3). The 2 at (6,3) touches the
 * mines at (6,2) and (7,3), and the safe pocket cell (7,2).
 */
const MINES = (() => {
  const mines = new Array<boolean>(size).fill(false)
  for (const [row, column] of [
    [6, 0],
    [6, 1],
    [6, 2],
    [7, 3],
    [8, 3],
    [0, 8],
    [1, 8],
    [2, 8],
    [1, 7],
    [4, 8],
  ]) {
    mines[cellAt(row, column)] = true
  }
  return mines
})()
const NUMBER = cellAt(6, 3)
const POCKET = cellAt(7, 2)

const started = () => run(createGame('easy'), { type: 'start', cell: 0, mines: MINES })

describe('minesReducer', () => {
  it('lays the mines on the first click and opens up', () => {
    const state = started()
    expect(state.status).toBe('playing')
    expect(state.clicks).toBe(1)
    expect(state.revealed[0]).toBe(true)
    expect(state.revealed.filter(Boolean).length).toBeGreaterThan(40)
    expect(state.revealed[NUMBER]).toBe(true)
    expect(state.revealed[POCKET]).toBe(false)
    expect(state.par).toBeGreaterThan(0)
    expect(state.counts![NUMBER]).toBe(2)
  })

  it('ignores a first click on a mine or a second start', () => {
    const fresh = createGame('easy')
    expect(run(fresh, { type: 'start', cell: cellAt(6, 0), mines: MINES })).toBe(fresh)
    const state = started()
    expect(run(state, { type: 'start', cell: 5, mines: MINES })).toBe(state)
  })

  it('only flags hidden cells, once the game has begun', () => {
    expect(run(createGame('easy'), { type: 'flag', cell: 3 }).flags[3]).toBe(false)
    const state = started()
    expect(run(state, { type: 'flag', cell: 0 })).toBe(state)
    const flagged = run(state, { type: 'flag', cell: POCKET })
    expect(flagged.flags[POCKET]).toBe(true)
    expect(countFlags(flagged)).toBe(1)
    expect(run(flagged, { type: 'flag', cell: POCKET }).flags[POCKET]).toBe(false)
    expect(run(flagged, { type: 'open', cell: POCKET })).toBe(flagged)
  })

  it('chords a number whose mines are all flagged', () => {
    let state = started()
    expect(chordCells(state, NUMBER)).toBeNull()
    state = run(state, { type: 'flag', cell: cellAt(6, 2) }, { type: 'flag', cell: cellAt(7, 3) })
    expect(chordCells(state, NUMBER)).toEqual([POCKET])
    const chorded = run(state, { type: 'open', cell: NUMBER })
    expect(chorded.revealed[POCKET]).toBe(true)
    expect(chorded.clicks).toBe(2)
  })

  it('blows up on a chord with a wrong flag, and takes it back', () => {
    let state = run(started(), { type: 'flag', cell: cellAt(6, 2) }, { type: 'flag', cell: POCKET })
    state = run(state, { type: 'open', cell: NUMBER })
    expect(state.status).toBe('lost')
    expect(state.exploded).toBe(cellAt(7, 3))
    const back = run(state, { type: 'take-back' })
    expect(back.status).toBe('playing')
    expect(back.exploded).toBeNull()
    expect(back.revealed[cellAt(7, 3)]).toBe(false)
    expect(back.takeBacks).toBe(1)
    expect(back.clicks).toBe(1)
    expect(run(back, { type: 'take-back' })).toBe(back)
  })

  it('wins when every safe cell is open, flagging the rest', () => {
    const safe = MINES.flatMap((mine, cell) => (mine ? [] : [cell]))
    const won = run(started(), { type: 'open-many', cells: safe })
    expect(won.status).toBe('won')
    expect(countFlags(won)).toBe(level.mines)
    expect(run(won, { type: 'flag', cell: 5 })).toBe(won)
  })

  it('counts clicks, but not the solver’s', () => {
    const state = run(started(), { type: 'open', cell: POCKET })
    expect(state.clicks).toBe(2)
    const bySolver = run(started(), { type: 'open-many', cells: [POCKET], bySolver: true })
    expect(bySolver.clicks).toBe(1)
    expect(bySolver.solverUsed).toBe(true)
  })

  it('counts a hint once', () => {
    const hint = { kind: 'safe' as const, cells: [POCKET], clues: [NUMBER], rule: 'count' as const }
    const state = run(started(), { type: 'hint', hint }, { type: 'hint', hint })
    expect(state.hintsUsed).toBe(1)
    expect(run(state, { type: 'open', cell: POCKET }).hint).toBeNull()
  })

  it('replays the same board from its opening', () => {
    const played = run(started(), { type: 'flag', cell: cellAt(6, 2) }, { type: 'open', cell: POCKET })
    const replay = run(played, { type: 'restart' })
    expect(replay.mines).toBe(MINES)
    expect(replay.revealed).toEqual(started().revealed)
    expect(countFlags(replay)).toBe(0)
    expect(replay.status).toBe('ready')
    expect(replay.gameId).toBe(played.gameId + 1)
  })

  it('starts a new game', () => {
    const state = run(started(), { type: 'new-game', levelId: 'hard' })
    expect(state.mines).toBeNull()
    expect(state.revealed).toHaveLength(cellCount(LEVELS.hard))
    expect(state.status).toBe('ready')
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(started(), { type: 'flag', cell: cellAt(6, 2) }, { type: 'open', cell: POCKET })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.revealed).toEqual(played.revealed)
    expect(restored.flags).toEqual(played.flags)
    expect(restored.clicks).toBe(2)
    expect(restored.status).toBe('playing')
  })

  it('keeps a board that has not been started', () => {
    expect(restoreGame(toSnapshot(createGame('medium')))!.levelId).toBe('medium')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(started())
    expect(restoreGame({ ...snapshot, levelId: 'huge' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, mines: MINES.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, mines: MINES.map(() => false) })).toBeNull()
    expect(restoreGame({ ...snapshot, revealed: snapshot.revealed.map((open, cell) => open || cell === cellAt(6, 0)) })).toBeNull()
    expect(restoreGame({ ...snapshot, revealed: MINES.map((mine) => !mine) })).toBeNull()
    expect(restoreGame({ ...snapshot, flags: snapshot.flags.map((_, cell) => cell === 0) })).toBeNull()
  })
})
