import { useEffect, useEffectEvent } from 'react'
import { isInteger } from '../lib/storage'
import { useStoredState } from './useStoredState'

export const SOLVER_SPEEDS = [
  { label: '0.5×', interval: 1100 },
  { label: '1×', interval: 650 },
  { label: '2×', interval: 340 },
  { label: '4×', interval: 170 },
  { label: '8×', interval: 75 },
]

export type SolverMode = 'off' | 'running' | 'paused'

const isSpeedIndex = (value: unknown): value is number =>
  isInteger(value) && value >= 0 && value < SOLVER_SPEEDS.length

interface AutoSolverOptions {
  running: boolean
  /** Changes after every move, which schedules the next one. */
  position: unknown
  /** Plays one move. */
  step: () => void
}

/** Plays one move per tick while `running`, at the player's chosen speed. */
export function useAutoSolver({ running, position, step }: AutoSolverOptions) {
  const [speedIndex, setSpeedIndex] = useStoredState('solver-speed', 2, isSpeedIndex)
  const speed = SOLVER_SPEEDS[speedIndex]
  const tick = useEffectEvent(step)

  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => tick(), speed.interval)
    return () => clearTimeout(timer)
  }, [running, position, speed.interval])

  return { speed, speedIndex, setSpeedIndex }
}
