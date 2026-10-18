import { useCallback, useEffect } from 'react'
import { useMediaQuery } from './useMediaQuery'
import { useStoredState } from './useStoredState'

export type Theme = 'light' | 'dark'

/** Keep in sync with --bg in index.css and the inline theme script in index.html. */
const THEME_COLORS: Record<Theme, string> = { light: '#eef0f8', dark: '#0c0f1d' }

const isThemeChoice = (value: unknown): value is Theme | null =>
  value === 'light' || value === 'dark' || value === null

/** Follows the system theme until the player picks one. */
export function useTheme() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [choice, setChoice] = useStoredState<Theme | null>('theme', null, isThemeChoice)
  const theme: Theme = choice ?? (prefersDark ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  }, [theme])

  const toggleTheme = useCallback(() => setChoice(theme === 'dark' ? 'light' : 'dark'), [theme, setChoice])

  return { theme, toggleTheme }
}
