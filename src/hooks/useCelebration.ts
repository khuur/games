import { useEffect, useEffectEvent, useState } from 'react'
import { sound } from '../lib/sound'
import { useMediaQuery } from './useMediaQuery'

/**
 * Gives a win a moment on the board before the results appear: a fanfare and confetti right
 * after the winning move, then `onShowResults`. Returns the value to pass to <Confetti burst>.
 */
export function useCelebration(won: boolean, onShowResults: () => void): number {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [confettiBurst, setConfettiBurst] = useState(0)

  const playFanfare = useEffectEvent(() => {
    sound.win()
    if (!reducedMotion) setConfettiBurst((burst) => burst + 1)
  })
  const showResults = useEffectEvent(onShowResults)

  useEffect(() => {
    if (!won) return
    const fanfare = setTimeout(() => playFanfare(), 450)
    const results = setTimeout(() => showResults(), 1600)
    return () => {
      clearTimeout(fanfare)
      clearTimeout(results)
    }
  }, [won])

  return confettiBurst
}
