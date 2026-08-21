import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribe } from '@/lib/repository'

/**
 * Load async data, re-running when `deps` change and whenever the repository
 * reports a local mutation. Keeps the previous value on refetch so lists do
 * not flash empty between reads.
 */
export function useData(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const alive = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  // Compare deps by VALUE, not by array identity. Callers write the deps
  // inline — `[session]`, `[id]`, `[months]` — so a parent re-render hands us
  // a brand new array every time and a reference check would refetch on every
  // keystroke elsewhere on the page. Every deps array in the app holds
  // primitives or plain serialisable objects, so a JSON key is a safe
  // stand-in; a function in there would collapse to null and under-fire, which
  // is worth knowing if that ever changes.
  const depsKey = JSON.stringify(deps)

  const run = useCallback(async () => {
    try {
      const data = await loaderRef.current()
      if (alive.current) setState({ data, loading: false, error: null })
    } catch (error) {
      if (alive.current) setState((s) => ({ ...s, loading: false, error }))
    }
    // depsKey IS the dependency — the lint rule cannot see through the
    // stringify, and listing `deps` itself would defeat the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey])

  useEffect(() => {
    alive.current = true
    run()
    return () => {
      alive.current = false
    }
  }, [run])

  useEffect(() => subscribe(run), [run])

  return { ...state, reload: run }
}
