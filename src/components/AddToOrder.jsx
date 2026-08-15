import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, PackagePlus, Truck } from 'lucide-react'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { Pill } from '@/components/ui/Controls'
import { useToast } from '@/components/ui/Toast'
import { addToDraftOrder, findInboundFor } from '@/lib/repository'
import { fullDate, qty } from '@/lib/format'
import { haptic } from '@/lib/utils'

const STATUS_LABEL = {
  submitted: 'Submitted',
  confirmed: 'In transit',
  shipped: 'In transit',
  partial: 'Partially received',
}

/**
 * One-tap "add to the next order" with a duplicate-order guard.
 *
 * Before anything lands in a draft, open POs are checked for the same
 * product. If units are already inbound the add pauses on a sheet that says
 * so — with the order it is riding on — because the most expensive click in
 * procurement is ordering what is already on the truck. Ordering more anyway
 * stays one tap away; this is a speed bump, not a wall.
 */
export default function AddToOrder({
  productId,
  productName,
  supplierId,
  supplierName,
  unitPrice,
  quantity = 1,
  size = 'sm',
  variant = 'secondary',
  className,
  label = 'Add to order',
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [inbound, setInbound] = useState(null) // rows → guard sheet is open

  const add = async () => {
    setBusy(true)
    try {
      const result = await addToDraftOrder({
        productId,
        supplierId,
        supplierName,
        quantity,
        unitPrice,
      })
      haptic([8, 20, 8])
      setInbound(null)
      toast({
        title: result.merged ? `Now ${qty(result.lineQuantity)} in the draft` : 'Added to next order',
        body: `${productName} · ${result.reference} to ${result.supplierName ?? supplierName}`,
        action: {
          label: 'View',
          Icon: ArrowRight,
          onPress: () => navigate(`/orders/${result.orderId}`),
        },
      })
    } catch (e) {
      toast({ title: 'Could not add', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    setBusy(true)
    try {
      const rows = await findInboundFor(productId)
      if (rows.length) {
        haptic([10, 30, 10])
        setInbound(rows)
        setBusy(false)
        return
      }
    } catch {
      /* the guard is advisory — if the check fails, adding still works */
    }
    await add()
  }

  const totalInbound = (inbound ?? []).reduce((sum, r) => sum + r.quantity, 0)

  return (
    <>
      <Button
        size={size}
        variant={variant}
        icon={PackagePlus}
        loading={busy && !inbound}
        className={className}
        onClick={(e) => {
          // Rows and cards are often clickable themselves.
          e.stopPropagation()
          check()
        }}
      >
        {label}
      </Button>

      {/* Duplicate-order guard */}
      <Sheet
        open={Boolean(inbound)}
        onClose={() => setInbound(null)}
        title="Already on the way"
        detent="medium"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              size="lg"
              variant="secondary"
              onClick={() => {
                setInbound(null)
                navigate(`/orders/${inbound[0].orderId}`)
              }}
            >
              View {inbound?.[0]?.reference}
            </Button>
            <Button className="w-full" size="lg" loading={busy} onClick={add}>
              I need more — add to order
            </Button>
          </div>
        }
      >
        {inbound ? (
          <div className="py-2">
            <p className="px-1 text-subhead text-label-2">
              <span className="font-semibold text-label">{qty(totalInbound)}</span> ×{' '}
              <span className="font-semibold text-label">{productName}</span>{' '}
              {inbound.length === 1 ? 'is' : 'are'} already inbound on{' '}
              {inbound.length === 1 ? 'an open order' : `${inbound.length} open orders`}. Ordering
              again would double up.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {inbound.map((row) => (
                <button
                  key={row.orderId}
                  type="button"
                  onClick={() => {
                    setInbound(null)
                    navigate(`/orders/${row.orderId}`)
                  }}
                  className="press w-full rounded-card border border-line bg-surface p-3 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-subhead font-semibold">
                        <span className="ident">{row.reference}</span> · {row.supplierName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-footnote text-label-3">
                        <Truck size={12} aria-hidden="true" />
                        {qty(row.quantity)} en route
                        {row.expectedAt ? ` · arrives ${fullDate(row.expectedAt)}` : ''}
                      </p>
                    </div>
                    <Pill tone={row.status === 'partial' ? 'warning' : 'brand'}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Pill>
                  </div>
                </button>
              ))}
            </div>

            <p className="mt-3 px-1 text-footnote text-label-3">
              Meant to top up beyond what is coming? Go ahead — the draft keeps both honest.
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  )
}
