import { AlertCircle } from 'lucide-react'
import { isDemo } from '@/lib/repoCore'

/**
 * Banner shown at the top of the app when in demo mode.
 * Makes it clear this is a read-only preview and actions aren't available.
 */
export default function DemoBanner() {
  if (!isDemo) return null

  return (
    <div className="z-50 border-b border-ios-orange/30 bg-ios-orange/8 px-3 py-2.5">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5 lg:max-w-6xl">
        <AlertCircle size={16} className="shrink-0 text-ios-orange" aria-hidden="true" />
        <p className="flex-1 text-caption font-medium text-label-2">
          <span className="font-semibold text-ios-orange">Read-only demo</span> — explore everything, but actions aren't available. <a href="/welcome" className="ml-1 underline hover:text-label">Start a free trial to use it.</a>
        </p>
      </div>
    </div>
  )
}
