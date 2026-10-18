/** Formats a duration as m:ss (h:mm:ss past an hour), optionally with tenths of a second. */
export function formatTime(ms: number, withTenths = false): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.floor(clamped / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const time = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
  return withTenths ? `${time}.${Math.floor((clamped % 1000) / 100)}` : time
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
