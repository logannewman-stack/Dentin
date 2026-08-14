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

  const run = useCallback(async () => {
    try {
      const data = await loaderRef.current()
      if (alive.current) setState({ data, loading: false, error: null })
    } catch (error) {
      if (alive.current) setState((s) => ({ ...s, loading: false, error }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

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
