import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A stopwatch that runs while `running` is true. `elapsed` refreshes a few times per second
 * for display; `read()` gives the exact value at any moment.
 */
export function useStopwatch(running: boolean, initialMs = 0) {
  const accumulated = useRef(initialMs)
  const startedAt = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(initialMs)

  const read = useCallback(
    () => accumulated.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current),
    [],
  )

  useEffect(() => {
    if (!running) return
    startedAt.current = performance.now()
    const interval = setInterval(() => setElapsed(read()), 250)
    return () => {
      clearInterval(interval)
      accumulated.current = read()
      startedAt.current = null
      setElapsed(accumulated.current)
    }
  }, [running, read])

  const reset = useCallback((ms = 0) => {
    accumulated.current = ms
    if (startedAt.current !== null) startedAt.current = performance.now()
    setElapsed(ms)
  }, [])

  return { elapsed, read, reset }
}
