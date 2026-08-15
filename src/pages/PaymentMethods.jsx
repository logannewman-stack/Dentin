import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, CreditCard, Landmark, Plus, Trash2 } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Section } from '@/components/ui/List'
import { Pill, SegmentedControl, Toggle } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { listPaymentMethods, removePaymentMethod, savePaymentMethod } from '@/lib/repository'

const EMPTY_FORM = { kind: 'bank', label: '', detail: '', isDefault: false }

/**
 * The instruments the practice pays vendors with. Only display labels live
 * here — the number that can actually move money stays with the payment
 * processor, which is why there is no card-number field to type into.
 */
export default function PaymentMethods() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: methods } = useData(() => listPaymentMethods(), [])

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      await savePaymentMethod(form)
      toast({ title: 'Payment method added', body: form.label })
      setAdding(false)
      setForm(EMPTY_FORM)
    } catch (e) {
      toast({ title: 'Could not add', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m) => {
    try {
      await removePaymentMethod(m.id)
      toast({ title: 'Removed', body: m.label })
    } catch (e) {
      toast({ title: 'Could not remove', body: e.message, tone: 'error' })
    }
  }

  return (
    <Screen
      title="Payment methods"
      largeTitle={false}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
      }
    >
      <Section footer="ACH from the operating account is how most vendors prefer to be paid — card surcharges vary by supplier.">
        {(methods ?? []).map((m) => {
          const Icon = m.kind === 'bank' ? Landmark : CreditCard
          return (
            <div key={m.id} className="row py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-line text-label-2">
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-subhead font-medium text-label">{m.label}</span>
                  {m.isDefault ? <Pill tone="brand">Default</Pill> : null}
                </span>
                <span className="ident block text-caption text-label-3">{m.detail}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${m.label}`}
                onClick={() => remove(m)}
                className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-line text-label-3"
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </Section>

      <div className="mt-2">
        <Button className="w-full" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
          Add a payment method
        </Button>
      </div>

      <p className="px-1 pt-3 text-footnote text-label-3">
        Dentin stores display labels only. Bank and card numbers live with the payment processor,
        never in this app.
      </p>

      {/* Add */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add payment method"
        detent="medium"
        footer={
          <Button
            className="w-full"
            size="lg"
            loading={busy}
            disabled={!form.label.trim()}
            onClick={add}
          >
            Add {form.kind === 'bank' ? 'bank account' : 'card'}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 py-3">
          <SegmentedControl
            value={form.kind}
            onChange={(kind) => setForm((f) => ({ ...f, kind }))}
            options={[
              { value: 'bank', label: 'Bank (ACH)' },
              { value: 'card', label: 'Card' },
            ]}
          />

          <label className="block">
            <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
              Name
            </span>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={form.kind === 'bank' ? 'Operating account' : 'Practice Visa'}
              className="mt-1 w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-body text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>

          <label className="block">
            <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
              Display detail
            </span>
            <input
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              placeholder={form.kind === 'bank' ? 'ACH ····4821' : '···· 9214 · exp 02/27'}
              className="mt-1 w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 font-mono text-body text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <span className="mt-1 block text-caption text-label-3">
              Last four only — enough to recognize it on a statement.
            </span>
          </label>

          <div className="flex items-center justify-between rounded-[3px] border border-line bg-surface px-3 py-2.5">
            <span className="text-subhead text-label">Use as default</span>
            <Toggle
              checked={form.isDefault}
              onChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
              label="Use as default"
            />
          </div>
        </div>
      </Sheet>
    </Screen>
  )
}
