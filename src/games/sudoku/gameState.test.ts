import { describe, expect, it } from 'vitest'
import { createGame, isEditable, restoreGame, sudokuReducer, toSnapshot, type SudokuAction, type SudokuState } from './gameState'
import { digitBit, PEERS } from './sudoku'

const grid = (text: string) => [...text.replace(/\s/g, '')].map((char) => (char === '.' ? 0 : Number(char)))

const SOLUTION = grid(`
  534678912
  672195348
  198342567
  859761423
  426853791
  713924856
  961537284
  287419635
  345286179`)

/** The solution with the first row's last three cells and cell 80 left blank. */
const GIVENS = SOLUTION.map((digit, cell) => ([6, 7, 8, 80].includes(cell) ? 0 : digit))

const run = (state: SudokuState, ...actions: SudokuAction[]) => actions.reduce(sudokuReducer, state)
const enter = (cell: number, digit: number, note = false): SudokuAction => ({ type: 'enter', cell, digit, note })
const game = () => createGame('easy', { givens: GIVENS, solution: SOLUTION })

describe('sudokuReducer', () => {
  it('places digits, starting the game', () => {
    const state = run(game(), enter(6, 9))
    expect(state.values[6]).toBe(9)
    expect(state.status).toBe('playing')
    expect(state.mistakes).toBe(0)
  })

  it('leaves givens and right digits alone', () => {
    const state = run(game(), enter(6, 9))
    expect(isEditable(state, 0)).toBe(false)
    expect(isEditable(state, 6)).toBe(false)
    expect(run(state, enter(0, 1))).toBe(state)
    expect(run(state, enter(6, 0))).toBe(state)
  })

  it('counts wrong digits as mistakes, even once undone', () => {
    const state = run(game(), enter(6, 4))
    expect(state.mistakes).toBe(1)
    expect(isEditable(state, 6)).toBe(true)
    const undone = run(state, { type: 'undo' })
    expect(undone.values[6]).toBe(0)
    expect(undone.mistakes).toBe(1)
    expect(run(undone, { type: 'redo' }).mistakes).toBe(1)
  })

  it('erases a wrong digit, or replaces it', () => {
    expect(run(game(), enter(6, 4), enter(6, 0)).values[6]).toBe(0)
    expect(run(game(), enter(6, 4), enter(6, 4)).values[6]).toBe(0)
    const replaced = run(game(), enter(6, 4), enter(6, 9))
    expect(replaced.values[6]).toBe(9)
    expect(replaced.mistakes).toBe(1)
  })

  it('toggles pencil notes in empty cells', () => {
    const state = run(game(), enter(7, 1, true), enter(7, 4, true), enter(7, 1, true))
    expect(state.notes[7]).toBe(digitBit(4))
    expect(run(state, enter(7, 0)).notes[7]).toBe(0)
    expect(run(game(), enter(0, 1, true)).notes[0]).toBe(0)
  })

  it('clears a placed digit from the notes of every cell that sees it', () => {
    const state = run(game(), enter(7, 9, true), enter(80, 9, true), enter(7, 1, true), enter(6, 9))
    expect(PEERS[6]).toContain(7)
    expect(state.notes[7]).toBe(digitBit(1))
    expect(state.notes[80]).toBe(digitBit(9))
    // Undo brings the note back.
    expect(run(state, { type: 'undo' }).notes[7]).toBe(digitBit(9) | digitBit(1))
  })

  it('notices finished rows, columns and boxes', () => {
    // Cells 6 and 7 are the only gaps in their columns.
    expect(run(game(), enter(6, 9)).lastMove?.completed).toEqual([15])
    const state = run(game(), enter(6, 9), enter(7, 1))
    expect(state.lastMove?.completed).toEqual([16])
    expect(run(game(), enter(7, 3, true)).lastMove?.completed).toEqual([])
    const done = run(state, enter(8, 2))
    // Row 0 and box 2 are finished; column 8 still waits for cell 80.
    expect(done.lastMove?.completed.sort((a, b) => a - b)).toEqual([0, 20])
  })

  it('wins when the grid is full and right', () => {
    const won = run(game(), enter(6, 9), enter(7, 1), enter(8, 2), enter(80, 9))
    expect(won.status).toBe('won')
    expect(won.lastMove?.completed).toContain(26)
    expect(run(won, { type: 'undo' })).toBe(won)
  })

  it('redoes undone moves, and forgets them after a new one', () => {
    const state = run(game(), enter(6, 9), enter(7, 1), { type: 'undo' })
    expect(run(state, { type: 'redo' }).values[7]).toBe(1)
    expect(run(state, enter(8, 2)).future).toEqual([])
  })

  it('counts a hint once', () => {
    const hint = { kind: 'place' as const, cell: 6, digit: 9, technique: 'naked-single' as const, patterns: [] }
    const state = run(game(), { type: 'hint', hint }, { type: 'hint', hint })
    expect(state.hintsUsed).toBe(1)
    expect(run(state, enter(6, 9)).hint).toBeNull()
  })

  it('restarts the same puzzle', () => {
    const restarted = run(game(), enter(6, 4), enter(7, 1), { type: 'restart' })
    expect(restarted.values).toEqual(GIVENS)
    expect(restarted.mistakes).toBe(0)
    expect(restarted.gameId).toBe(1)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its moves', () => {
    const played = run(game(), enter(7, 3, true), enter(6, 4), enter(6, 9), enter(8, 2), { type: 'undo' })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.values).toEqual(played.values)
    expect(restored.notes).toEqual(played.notes)
    expect(restored.future).toEqual(played.future)
    expect(restored.mistakes).toBe(1)
    expect(restored.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(game(), enter(6, 9)))
    expect(restoreGame({ ...snapshot, levelId: 'expert' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, givens: GIVENS.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, solution: SOLUTION.map((digit, cell) => (cell === 0 ? 4 : digit)) })).toBeNull()
    expect(restoreGame({ ...snapshot, history: [{ cell: 0, digit: 5, note: false }] })).toBeNull()
    expect(restoreGame({ ...snapshot, future: [{ cell: 1, digit: 2, note: false }] })).toBeNull()
    const finished = toSnapshot(run(game(), enter(6, 9), enter(7, 1), enter(8, 2), enter(80, 9)))
    expect(restoreGame(finished)).toBeNull()
  })
})
