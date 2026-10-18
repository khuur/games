import { useEffect, useEffectEvent, useReducer, useState } from 'react'
import { usePageVisible } from './usePageVisible'
import { useStopwatch } from './useStopwatch'

/**
 * `stuck` means no legal moves are left (undo brings the game back to `playing`); `lost` ends the
 * game, as when a mine goes off.
 */
export type GameStatus = 'ready' | 'playing' | 'stuck' | 'lost' | 'won'

interface GameSessionOptions<S, A> {
  reducer: (state: S, action: A) => S
  /** A saved game (or a fresh one) and the time already spent on it. */
  load: () => { state: S; elapsedMs: number }
  save: (state: S, elapsedMs: number) => void
  /** Stops the clock, for example while a dialog covers the game. */
  timerPaused: boolean
}

/**
 * What every game needs around its rules: a reducer, a clock that only runs while the game is
 * being played, and saving progress whenever it changes or the player leaves.
 */
export function useGameSession<S extends { status: GameStatus }, A>({
  reducer,
  load,
  save,
  timerPaused,
}: GameSessionOptions<S, A>) {
  const [initial] = useState(load)
  const [state, dispatch] = useReducer(reducer, initial.state)
  const visible = usePageVisible()
  const stopwatch = useStopwatch(state.status === 'playing' && visible && !timerPaused, initial.elapsedMs)

  const persist = useEffectEvent(() => save(state, stopwatch.read()))

  useEffect(() => {
    persist()
  }, [state])

  useEffect(() => {
    // The clock keeps moving between state changes, so save it whenever the game is left too.
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    const saveNow = () => persist()
    document.addEventListener('visibilitychange', saveIfHidden)
    window.addEventListener('pagehide', saveNow)
    return () => {
      document.removeEventListener('visibilitychange', saveIfHidden)
      window.removeEventListener('pagehide', saveNow)
      persist()
    }
  }, [])

  return { state, dispatch, stopwatch }
}
