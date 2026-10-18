import { useEffect, useState } from 'react'
import { readStored, writeStored } from '../lib/storage'

/** useState that survives reloads via localStorage. */
export function useStoredState<T>(key: string, fallback: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, isValid))

  useEffect(() => {
    writeStored(key, value)
  }, [key, value])

  return [value, setValue] as const
}
