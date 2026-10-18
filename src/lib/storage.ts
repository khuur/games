/** Keep in sync with the inline theme script in index.html. */
const PREFIX = 'puzzles:'

/** Reads a JSON value from localStorage, falling back when it is missing, invalid or blocked. */
export function readStored<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage may be full or disabled (private browsing); the game still works without it.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // See writeStored.
  }
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

export const isInteger = (value: unknown): value is number => Number.isInteger(value)
