import { CircleHelp, LayoutGrid, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { Suspense, useEffect, useEffectEvent, useState } from 'react'
import { GamePicker } from './components/GamePicker'
import { GameTabs } from './components/GameTabs'
import { HelpDialog } from './components/HelpDialog'
import { LoadError } from './components/LoadError'
import { SiteLogo } from './components/SiteLogo'
import { GAMES } from './games'
import { navigate, usePathname } from './hooks/usePathname'
import { useStoredState } from './hooks/useStoredState'
import { useTheme } from './hooks/useTheme'
import { sound } from './lib/sound'
import { isBoolean, readStored, writeStored } from './lib/storage'
import './App.css'

const SITE_NAME = 'Puzzle Games'
/** Where the full name won't fit, as on the home screen (see the manifest). */
const SHORT_SITE_NAME = 'Puzzles'
const LAST_GAME_KEY = 'last-game'

const isGameId = (value: unknown): value is string => GAMES.some((game) => game.id === value)

/** The site around the games: header, tabs, sound and theme, and the help dialog. */
export default function App() {
  const pathname = usePathname()
  const [lastGameId] = useState(() => readStored(LAST_GAME_KEY, GAMES[0].id, isGameId))
  const routed = GAMES.find((game) => game.path === pathname)
  const game = routed ?? GAMES.find((candidate) => candidate.id === lastGameId) ?? GAMES[0]
  const { theme, toggleTheme } = useTheme()
  const [soundOn, setSoundOn] = useStoredState('sound', true, isBoolean)
  // Help belongs to one game, so switching games closes it.
  const [helpFor, setHelpFor] = useState<string | null>(null)
  const helpOpen = helpFor === game.id
  const [pickerOpen, setPickerOpen] = useState(false)

  // Every address names a game: "/" and unknown paths become the last game played.
  useEffect(() => {
    if (!routed) navigate(game.path, { replace: true })
  }, [routed, game.path])

  useEffect(() => {
    writeStored(LAST_GAME_KEY, game.id)
    document.title = `${game.title} · ${SITE_NAME}`
  }, [game])

  useEffect(() => {
    sound.enabled = soundOn
  }, [soundOn])

  // Each game's code arrives when it is first opened. Once the page has settled, fetch the rest
  // too, so switching games never has to wait.
  useEffect(() => {
    const preloadAll = () => GAMES.forEach((game) => void game.preload().catch(() => {}))
    if ('requestIdleCallback' in window) {
      const idle = window.requestIdleCallback(preloadAll, { timeout: 4000 })
      return () => window.cancelIdleCallback(idle)
    }
    const timer = setTimeout(preloadAll, 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const unlockAudio = (event: Event) => {
      // Browsers don't count a modifier key on its own as a gesture that may start audio.
      if (event instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
      sound.unlock()
    }
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) {
      return
    }
    if (event.key === 'm' || event.key === 'M') {
      setSoundOn((on) => !on)
    } else if (event.key === '?' && !document.querySelector('dialog[open]')) {
      setHelpFor(game.id)
    } else if ((event.key === 'g' || event.key === 'G') && !document.querySelector('dialog[open]')) {
      setPickerOpen(true)
    } else {
      return
    }
    event.preventDefault()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleShortcut(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const { Game, Help } = game

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">
          <SiteLogo />
          <span className="brand-full">{SITE_NAME}</span>
          <span className="brand-short" aria-hidden="true">
            {SHORT_SITE_NAME}
          </span>
        </h1>
        <GameTabs games={GAMES} currentId={game.id} onSelect={(next) => navigate(next.path)} />
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setPickerOpen(true)}
            aria-label="All games"
            title="All games (G)"
          >
            <LayoutGrid aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setHelpFor(game.id)}
            aria-label="How to play"
            title="How to play (?)"
          >
            <CircleHelp aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSoundOn(!soundOn)}
            aria-label="Sound"
            aria-pressed={soundOn}
            title={soundOn ? 'Mute (M)' : 'Unmute (M)'}
          >
            {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label="Dark theme"
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="game" aria-label={game.title}>
        <LoadError key={game.id}>
          <Suspense fallback={<div className="game-loading" aria-busy="true" />}>
            <Game paused={helpOpen} />
          </Suspense>
        </LoadError>
      </main>

      {pickerOpen && (
        <GamePicker
          games={GAMES}
          currentId={game.id}
          onSelect={(next) => {
            setPickerOpen(false)
            navigate(next.path)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {helpOpen && (
        <HelpDialog title={`How to play ${game.title}`} onClose={() => setHelpFor(null)}>
          <LoadError>
            <Suspense fallback={<p className="help-lead">Loading…</p>}>
              <Help />
            </Suspense>
          </LoadError>
        </HelpDialog>
      )}
    </div>
  )
}
