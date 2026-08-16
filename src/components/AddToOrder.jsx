import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, PackagePlus, Truck } from 'lucide-react'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { Pill } from '@/components/ui/Controls'
import { useToast } from '@/components/ui/Toast'
import { addToDraftOrder, assessOrderQuantity, findInboundFor } from '@/lib/repository'
import { fullDate, money, qty } from '@/lib/format'
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
  const [inbound, setInbound] = useState(null) // rows → duplicate guard is open
  const [spoil, setSpoil] = useState(null) // analysis → expiry guard is open

  const doAdd = async (qtyToAdd) => {
    setBusy(true)
    try {
      const result = await addToDraftOrder({
        productId,
        supplierId,
        supplierName,
        quantity: qtyToAdd,
        unitPrice,
      })
      haptic([8, 20, 8])
      setInbound(null)
      setSpoil(null)
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

  // Second gate: will this quantity even get used before it expires? Runs on
  // every add, sized from the practice's CDT/movement burn history.
  const add = async () => {
    try {
      const warning = await assessOrderQuantity(productId, quantity, unitPrice)
      if (warning) {
        haptic([10, 30, 10])
        setInbound(null)
        setSpoil(warning)
        setBusy(false)
        return
      }
    } catch {
      /* advisory — if the check fails, adding still works */
    }
    await doAdd(quantity)
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

      {/* Expiry guard — the bulk quantity priced against real usage */}
      <Sheet
        open={Boolean(spoil)}
        onClose={() => setSpoil(null)}
        title="Likely to expire first"
        detent="medium"
        footer={
          spoil ? (
            <div className="flex flex-col gap-2">
              {spoil.safeUnits > 0 ? (
                <Button className="w-full" size="lg" loading={busy} onClick={() => doAdd(spoil.safeUnits)}>
                  Add {qty(spoil.safeUnits)} instead — the amount you'll use
                </Button>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                variant="secondary"
                loading={busy && !spoil.safeUnits}
                onClick={() => doAdd(quantity)}
              >
                Add {qty(quantity)} anyway
              </Button>
            </div>
          ) : null
        }
      >
        {spoil ? (
          <div className="py-2">
            <p className="px-1 text-subhead text-label-2">
              At your pace —{' '}
              <b className="tnum text-label">{spoil.dailyBurn.toFixed(2)}</b>/day
              {spoil.burnSource === 'procedures'
                ? ` from your CDT procedure history (last ${spoil.burnWindowDays} days)`
                : ' from stock movements'}{' '}
              — only{' '}
              <b className="tnum text-label">{qty(Math.max(0, spoil.safeUnits))}</b> of{' '}
              <b className="tnum text-label">{qty(quantity)}</b> would be used before expiry.
            </p>

            <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
              <div className="bg-surface px-3 py-2.5">
                <p className="tnum text-title3 font-bold text-ios-red">
                  {Math.round(spoil.spoilPct)}%
                </p>
                <p className="text-caption text-label-3">projected to expire</p>
              </div>
              <div className="bg-surface px-3 py-2.5">
                <p className="tnum text-title3 font-bold text-ios-red">
                  {money(spoil.lossDollars)}
                </p>
                <p className="text-caption text-label-3">thrown away</p>
              </div>
              <div className="bg-surface px-3 py-2.5">
                <p className="tnum text-title3 font-bold">{money(spoil.effectiveUnitPrice)}</p>
                <p className="text-caption text-label-3">
                  true cost/pack vs {money(spoil.unitPrice)}
                </p>
              </div>
            </div>

            <p className="mt-3 flex items-start gap-2 px-1 text-footnote text-label-3">
              <CalendarClock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Counts the {qty(spoil.onHand)} already on your shelf being used first, and ~
                {Math.round(spoil.shelfLifeDays / 30.44)} months of dating on the new stock. If
                your schedule picks up, the math moves with it.
              </span>
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  )
}
