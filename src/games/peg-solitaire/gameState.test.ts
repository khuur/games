import { describe, expect, it } from 'vitest'
import { createGame, pegReducer, restoreGame, toSnapshot, type PegAction, type PegState } from './gameState'
import { BOARDS, countPegs, legalJumps, solve, startingPegs } from './pegSolitaire'

const run = (state: PegState, ...actions: PegAction[]) => actions.reduce(pegReducer, state)
const english = BOARDS.english
const firstJump = legalJumps(english, startingPegs(english))[0]

describe('pegReducer', () => {
  it('jumps, removes the jumped peg and remembers the jump for the animation', () => {
    const state = run(createGame('english'), { type: 'jump', jump: firstJump })
    expect(countPegs(state.pegs)).toBe(31)
    expect(state.pegs[firstJump.over]).toBe(false)
    expect(state.pegs[firstJump.to]).toBe(true)
    expect(state.lastJump).toEqual({ ...firstJump, id: 1 })
    expect(state.status).toBe('playing')
  })

  it('ignores illegal jumps and empty holes', () => {
    const state = createGame('english')
    expect(run(state, { type: 'jump', jump: { from: 0, over: 1, to: 2 } })).toBe(state)
    expect(run(state, { type: 'select', hole: english.startHole })).toBe(state)
  })

  it('undoes and redoes exactly', () => {
    const played = run(createGame('english'), { type: 'jump', jump: firstJump })
    const undone = run(played, { type: 'undo' })
    expect(undone.pegs).toEqual(startingPegs(english))
    expect(undone.future).toEqual([firstJump])
    expect(run(undone, { type: 'redo' }).pegs).toEqual(played.pegs)
  })

  it('wins with one peg left and locks the board', () => {
    const jumps = solve(BOARDS.triangle, startingPegs(BOARDS.triangle))!
    const won = run(createGame('triangle'), ...jumps.map((jump): PegAction => ({ type: 'jump', jump })))
    expect(won.status).toBe('won')
    expect(countPegs(won.pegs)).toBe(1)
    expect(run(won, { type: 'undo' })).toBe(won)
  })

  it('notices when no jump is left, and undo gets out of it', () => {
    // Always taking the last legal jump runs the triangle into a dead end.
    let state = createGame('triangle')
    while (state.status === 'ready' || state.status === 'playing') {
      const options = legalJumps(BOARDS.triangle, state.pegs)
      state = run(state, { type: 'jump', jump: options[options.length - 1] })
    }
    expect(state.status).toBe('stuck')
    expect(countPegs(state.pegs)).toBeGreaterThan(1)
    expect(run(state, { type: 'undo' }).status).toBe('playing')
  })

  it('switches boards with a fresh id', () => {
    const state = run(createGame('english'), { type: 'new-game', boardId: 'triangle' })
    expect(state.boardId).toBe('triangle')
    expect(state.pegs).toHaveLength(15)
    expect(state.gameId).toBe(1)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const second = legalJumps(english, run(createGame('english'), { type: 'jump', jump: firstJump }).pegs)[0]
    const played = run(createGame('english'), { type: 'jump', jump: firstJump }, { type: 'jump', jump: second }, { type: 'undo' })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.pegs).toEqual(played.pegs)
    expect(restored.future).toEqual([second])
  })

  it('rejects corrupt games', () => {
    const snapshot = toSnapshot(run(createGame('english'), { type: 'jump', jump: firstJump }))
    expect(restoreGame({ ...snapshot, boardId: 'hexagon' as never })).toBeNull()
    expect(restoreGame({ ...snapshot, history: [{ from: 0, over: 1, to: 2 }] })).toBeNull()
    expect(restoreGame({ ...snapshot, history: [] })).toBeNull()
  })
})
