import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CameraOff,
  Check,
  Keyboard,
  Minus,
  PackageSearch,
  Plus,
  X,
  Zap,
} from 'lucide-react'
import Sheet from '@/components/ios/Sheet'
import Button from '@/components/ios/Button'
import { Pill, Stepper } from '@/components/ios/Controls'
import ProductTile from '@/components/ProductTile'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { recordMovement, resolveGtin } from '@/lib/repository'
import { qty } from '@/lib/format'
import { haptic } from '@/lib/utils'

const MODES = [
  { value: 'received', label: 'Receive', hint: 'Adds to stock', Icon: Plus },
  { value: 'consumed', label: 'Use', hint: 'Draws stock down', Icon: Minus },
]

export default function Scan() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('received')
  const [hit, setHit] = useState(null)
  const [amount, setAmount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [toast, setToast] = useState(null)

  const lookup = useCallback(async (code) => {
    haptic([10, 30, 10])
    const result = await resolveGtin(code)
    setAmount(1)
    setHit(result)
  }, [])

  const { videoRef, status, error, torchOn, torchAvailable, toggleTorch } = useBarcodeScanner({
    onDetect: lookup,
    enabled: !hit,
  })

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const commit = async () => {
    if (!hit?.inventoryItemId) return
    setBusy(true)
    try {
      await recordMovement({
        inventoryItemId: hit.inventoryItemId,
        type: mode,
        quantity: amount,
        reason: `Scanned ${hit.gtin}`,
      })
      setToast({
        title: mode === 'received' ? 'Stock received' : 'Stock updated',
        body: `${hit.name} · ${mode === 'received' ? '+' : '−'}${qty(amount)}`,
      })
      setHit(null)
    } finally {
      setBusy(false)
    }
  }

  const cameraBroken = ['denied', 'unsupported', 'error'].includes(status)

  return (
    <div className="fixed inset-0 z-20 bg-black">
      {/* Camera */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full object-cover"
        aria-label="Barcode camera"
      />

      {/* Vignette + reticle */}
      {!cameraBroken ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />
          <div className="absolute left-1/2 top-1/2 h-44 w-[78%] max-w-[320px] -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-0 rounded-[18px] border-2 border-white/25" />
            {/* Corner brackets */}
            {[
              'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[18px]',
              'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[18px]',
              'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[18px]',
              'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[18px]',
            ].map((cls) => (
              <span key={cls} className={`absolute h-9 w-9 border-brand-400 ${cls}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Camera unavailable */}
      {cameraBroken ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white/70">
            <CameraOff size={28} strokeWidth={1.7} />
          </span>
          <h2 className="text-title3 font-semibold text-white">Camera unavailable</h2>
          <p className="mt-1.5 max-w-[32ch] text-subhead text-white/60">{error}</p>
          <Button className="mt-6" variant="secondary" icon={Keyboard} onClick={() => setManualOpen(true)}>
            Enter barcode manually
          </Button>
        </div>
      ) : null}

      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Close scanner"
          className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
        >
          <X size={20} strokeWidth={2.4} />
        </button>

        <p className="text-footnote font-medium text-white/85">
          {status === 'scanning' ? 'Point at the barcode' : 'Starting camera…'}
        </p>

        {torchAvailable ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            aria-pressed={torchOn}
            className={`press flex h-9 w-9 items-center justify-center rounded-full backdrop-blur ${
              torchOn ? 'bg-white text-black' : 'bg-black/45 text-white'
            }`}
          >
            <Zap size={18} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="h-9 w-9" />
        )}
      </div>

      {/* Mode + manual entry */}
      <div
        className="absolute inset-x-0 bottom-0 px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <div className="mx-auto flex max-w-sm gap-1 rounded-[14px] bg-black/50 p-1 backdrop-blur">
          {MODES.map(({ value, label, hint, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                haptic(6)
                setMode(value)
              }}
              aria-pressed={mode === value}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-[11px] py-2.5 transition-colors ${
                mode === value ? 'bg-white text-black' : 'text-white/75'
              }`}
            >
              <span className="flex items-center gap-1.5 text-callout font-semibold">
                <Icon size={15} strokeWidth={2.6} />
                {label}
              </span>
              <span className="text-caption2 opacity-70">{hint}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="press mx-auto mt-3 flex items-center gap-1.5 text-footnote font-medium text-white/70"
        >
          <Keyboard size={14} strokeWidth={2.2} />
          Enter a barcode manually
        </button>
      </div>

      {/* Confirmation toast */}
      {toast ? (
        <div
          role="status"
          className="absolute inset-x-0 flex justify-center px-4"
          style={{ top: 'calc(env(safe-area-inset-top) + 62px)' }}
        >
          <div className="flex items-center gap-2.5 rounded-full bg-ios-green px-4 py-2.5 text-white shadow-raised">
            <Check size={16} strokeWidth={3} />
            <span className="text-subhead font-semibold">{toast.title}</span>
            <span className="text-footnote text-white/85">{toast.body}</span>
          </div>
        </div>
      ) : null}

      {/* Scan result */}
      <Sheet
        open={Boolean(hit)}
        onClose={() => setHit(null)}
        title={hit?.matched ? 'Confirm' : 'Unknown barcode'}
        detent="medium"
        footer={
          hit?.matched && hit?.inventoryItemId ? (
            <Button className="w-full" size="lg" loading={busy} onClick={commit}>
              {mode === 'received' ? `Receive ${qty(amount)}` : `Use ${qty(amount)}`}
            </Button>
          ) : (
            <Button className="w-full" size="lg" variant="secondary" onClick={() => setHit(null)}>
              Scan again
            </Button>
          )
        }
      >
        {hit?.matched ? (
          <div className="py-3">
            <div className="flex items-start gap-3.5 rounded-card bg-surface p-4">
              <ProductTile
                product={{ brand: hit.brand, categorySlug: hit.categoryName }}
                size={54}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-headline font-semibold leading-snug">{hit.name}</h3>
                <p className="mt-0.5 text-subhead text-label-3">{hit.brand}</p>
                <p className="mt-1.5 font-mono text-caption text-label-3">{hit.gtin}</p>
              </div>
            </div>

            {hit.inventoryItemId ? (
              <>
                <div className="mt-4 flex flex-col items-center gap-1 rounded-card bg-surface p-5">
                  <p className="text-subhead text-label-3">
                    {mode === 'received' ? 'How many arrived?' : 'How many used?'}
                  </p>
                  <div className="py-3">
                    <Stepper value={amount} onChange={setAmount} min={1} max={9999} />
                  </div>
                  <p className="tnum text-footnote text-label-3">
                    {qty(hit.onHand)} on hand →{' '}
                    <span className="font-semibold text-label">
                      {qty(
                        mode === 'received'
                          ? hit.onHand + amount
                          : Math.max(0, hit.onHand - amount),
                      )}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/inventory/${hit.inventoryItemId}`)}
                  className="press mt-3 w-full text-center text-subhead font-medium text-brand-600 dark:text-brand-400"
                >
                  Open item details
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-card bg-surface p-4 text-center">
                <Pill tone="warning">Not tracked yet</Pill>
                <p className="mt-2 text-subhead text-label-3">
                  This product is in the catalog but is not on your inventory list.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill/10 text-label-3">
              <PackageSearch size={26} strokeWidth={1.7} />
            </span>
            <h3 className="text-headline font-semibold">No catalog match</h3>
            <p className="mt-1 font-mono text-subhead text-label-3">{hit?.gtin}</p>
            <p className="mt-2 max-w-[34ch] text-footnote text-label-3">
              Barcodes resolve against your catalog. Add this product and its barcode to match it
              on the next scan.
            </p>
          </div>
        )}
      </Sheet>

      {/* Manual entry */}
      <Sheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Enter barcode"
        detent="small"
        footer={
          <Button
            className="w-full"
            size="lg"
            disabled={manualCode.trim().length < 6}
            onClick={() => {
              setManualOpen(false)
              lookup(manualCode.trim())
              setManualCode('')
            }}
          >
            Look up
          </Button>
        }
      >
        <div className="py-4">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="099999000010"
            aria-label="Barcode number"
            className="w-full rounded-card bg-surface px-4 py-4 text-center font-mono text-title3 tracking-[1px] text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <p className="mt-2.5 text-center text-footnote text-label-3">
            Useful when a box is scuffed or the label is worn.
          </p>
        </div>
      </Sheet>
    </div>
  )
}
