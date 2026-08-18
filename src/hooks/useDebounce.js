import { useState, useEffect } from 'react'

/**
 * Debounce a value — commonly used for search inputs to avoid excessive
 * filtering while the user is still typing.
 */
export function useDebounce(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
