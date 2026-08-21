import { AlertCircle } from 'lucide-react'
import { isDemo } from '@/lib/repoCore'

/**
 * Banner shown at the top of the app when in demo mode.
 * Makes it clear this is a read-only preview and actions aren't available.
 */
export default function DemoBanner() {
  if (!isDemo) return null

  return (
    <div className="z-50 bg-ios-orange px-4 py-2">
      <div className="mx-auto flex max-w-2xl items-center gap-2 lg:max-w-6xl">
        <AlertCircle size={15} strokeWidth={2.4} className="shrink-0 text-white" aria-hidden="true" />
        <p className="flex-1 text-footnote text-white/90">
          <span className="font-semibold text-white">Read-only demo</span> — look around, but
          actions are off.{' '}
          <a href="/welcome" className="font-semibold text-white underline underline-offset-2">
            Start a free trial
          </a>
        </p>
      </div>
    </div>
  )
}
