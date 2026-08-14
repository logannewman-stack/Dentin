import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Info, Undo2 } from 'lucide-react'
import { haptic } from '@/lib/utils'

const ToastContext = createContext(null)

const TONES = {
  success: { Icon: Check, bg: 'bg-ios-green' },
  error: { Icon: AlertTriangle, bg: 'bg-ios-red' },
  info: { Icon: Info, bg: 'bg-label' },
}

/**
 * Toasts drop from under the nav bar, the way a system banner does on iOS —
 * not up from the bottom, where they would sit on the tab bar and the home
 * indicator.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    ({ title, body, tone = 'success', duration = 3200, action }) => {
      const id = Math.random().toString(36).slice(2)
      haptic(tone === 'error' ? [10, 40, 10] : 8)
      setToasts((t) => [...t.slice(-2), { id, title, body, tone, action }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { Icon, bg } = TONES[t.tone] ?? TONES.info
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.5, bottom: 0 }}
                onDragEnd={(_, info) => info.offset.y < -30 && dismiss(t.id)}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-[3px] bg-surface py-2.5 pl-2.5 pr-4 shadow-raised"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] ${bg} text-white`}
                  aria-hidden="true"
                >
                  <Icon size={15} strokeWidth={2.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-semibold text-label">
                    {t.title}
                  </span>
                  {t.body ? (
                    <span className="block truncate text-caption text-label-3">{t.body}</span>
                  ) : null}
                </span>
                {t.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      t.action.onPress()
                      dismiss(t.id)
                    }}
                    className="press flex shrink-0 items-center gap-1 text-subhead font-semibold text-brand-600 dark:text-brand-400"
                  >
                    <Undo2 size={13} strokeWidth={2.6} />
                    {t.action.label}
                  </button>
                ) : null}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx.toast
}
