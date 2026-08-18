import { AlertTriangle, RotateCcw } from 'lucide-react'
import Button from './Button'

/**
 * Display when data loading fails, with actionable retry button.
 */
export default function ErrorState({ title = 'Could not load data', body, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-ios-red/25 bg-ios-red/8 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-[3px] bg-ios-red/12 text-ios-red">
        <AlertTriangle size={20} strokeWidth={2.2} />
      </span>
      <div>
        <p className="text-subhead font-semibold text-label">{title}</p>
        {body ? <p className="mt-1 text-footnote text-label-3">{body}</p> : null}
      </div>
      {onRetry ? (
        <Button
          onClick={onRetry}
          icon={RotateCcw}
          size="sm"
          variant="secondary"
          className="mt-2"
        >
          Try again
        </Button>
      ) : null}
    </div>
  )
}
