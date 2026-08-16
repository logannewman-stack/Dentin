import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, format } from 'date-fns'
import {
  BadgeCheck,
  ChevronLeft,
  ExternalLink,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  listCredentials,
  removeCredential,
  renewCredential,
  saveCredential,
} from '@/lib/repository'
import { cn } from '@/lib/utils'

const DUE_SOON_DAYS = 60

/** current | due | overdue, plus the pieces every row wants to show. */
export function credentialStatus(cred, now = new Date()) {
  const days = differenceInCalendarDays(new Date(cred.expiresAt), now)
  if (days < 0) {
    return { state: 'overdue', days, tone: 'critical', label: 'Overdue' }
  }
  if (days <= DUE_SOON_DAYS) {
    return { state: 'due', days, tone: 'warning', label: `Due in ${days}d` }
  }
  return { state: 'current', days, tone: 'good', label: 'Current' }
}

const day = (iso) => format(new Date(iso), 'MMM d, yyyy')

const EMPTY_FORM = { name: '', holder: '', authority: '', cadenceMonths: 12, completedAt: '' }

/**
 * The practice's certification wall: when each credential was last earned,
 * when it lapses, and where to renew it. Dentin tracks the record — it does
 * not decide the law, so cadences are editable and the screen says plainly
 * that requirements vary by state.
 */
export default function Compliance() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: credentials } = useData(() => listCredentials(), [])

  const [detail, setDetail] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () => (credentials ?? []).map((c) => ({ ...c, status: credentialStatus(c) })),
    [credentials],
  )
  const attention = rows.filter((r) => r.status.state !== 'current')
  const current = rows.filter((r) => r.status.state === 'current')
  const counts = {
    overdue: rows.filter((r) => r.status.state === 'overdue').length,
    due: rows.filter((r) => r.status.state === 'due').length,
    current: current.length,
  }

  // The sheet re-derives from the live list so a renewal updates in place.
  const open = detail ? (rows.find((r) => r.id === detail) ?? null) : null

  const renew = async () => {
    setBusy(true)
    try {
      const result = await renewCredential(open.id)
      toast({
        title: 'Marked renewed',
        body: `${open.name} · next due ${day(result.expiresAt ?? open.expiresAt)}`,
      })
    } catch (e) {
      toast({ title: 'Could not update', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      await removeCredential(open.id)
      setDetail(null)
      toast({ title: 'Removed', body: open.name })
    } catch (e) {
      toast({ title: 'Could not remove', body: e.message, tone: 'error' })
    }
  }

  const add = async () => {
    setBusy(true)
    try {
      await saveCredential({
        name: form.name.trim(),
        holder: form.holder.trim() || 'All staff',
        authority: form.authority.trim(),
        cadenceMonths: Math.max(1, Number(form.cadenceMonths) || 12),
        completedAt: form.completedAt ? new Date(`${form.completedAt}T12:00:00`).toISOString() : undefined,
      })
      toast({ title: 'Certification added', body: form.name })
      setAdding(false)
      setForm(EMPTY_FORM)
    } catch (e) {
      toast({ title: 'Could not add', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const CredRow = ({ cred }) => (
    <Row
      onClick={() => setDetail(cred.id)}
      leading={
        cred.status.state === 'current' ? (
          <ShieldCheck size={16} strokeWidth={1.9} className="text-ios-green" aria-hidden="true" />
        ) : (
          <ShieldAlert
            size={16}
            strokeWidth={1.9}
            className={cred.status.state === 'overdue' ? 'text-ios-red' : 'text-ios-orange'}
            aria-hidden="true"
          />
        )
      }
      title={cred.name}
      subtitle={`${cred.holder} · ${cred.authority}`}
      trailing={
        <div className="text-right">
          <p
            className={cn(
              'tnum text-footnote',
              cred.status.state === 'overdue'
                ? 'font-semibold text-ios-red'
                : cred.status.state === 'due'
                  ? 'font-semibold text-ios-orange'
                  : 'text-label-3',
            )}
          >
            {cred.status.state === 'overdue' ? 'Expired ' : ''}
            {day(cred.expiresAt)}
          </p>
          <Pill tone={cred.status.tone}>{cred.status.label}</Pill>
        </div>
      }
    />
  )

  return (
    <Screen
      title="Compliance & training"
      subtitle={
        counts.overdue + counts.due > 0
          ? `${counts.overdue + counts.due} need${counts.overdue + counts.due === 1 ? 's' : ''} attention`
          : 'All current'
      }
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
      {/* The wall at a glance */}
      <div className="panel mt-3 grid grid-cols-3 gap-px bg-line">
        {[
          ['Current', counts.current, 'text-ios-green'],
          ['Due soon', counts.due, 'text-ios-orange'],
          ['Overdue', counts.overdue, 'text-ios-red'],
        ].map(([label, value, color]) => (
          <div key={label} className="bg-surface px-3 py-2.5">
            <p className={cn('tnum text-title2 font-bold', value > 0 ? color : 'text-label-3')}>
              {value}
            </p>
            <p className="text-caption text-label-3">{label}</p>
          </div>
        ))}
      </div>

      {attention.length > 0 ? (
        <Section title="Needs attention">
          {attention.map((cred) => (
            <CredRow key={cred.id} cred={cred} />
          ))}
        </Section>
      ) : null}

      {current.length > 0 ? (
        <Section title="Current">
          {current.map((cred) => (
            <CredRow key={cred.id} cred={cred} />
          ))}
        </Section>
      ) : null}

      <div className="mt-3">
        <Button className="w-full" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
          Add a certification
        </Button>
      </div>

      <p className="px-1 pb-1 pt-3 text-footnote text-label-3">
        Renewal requirements vary by state and role. Dentin tracks your records and points at the
        issuing authority — confirm specifics with your state board.
      </p>

      {/* Detail */}
      <Sheet
        open={Boolean(open)}
        onClose={() => setDetail(null)}
        title={open?.name ?? ''}
        detent="large"
        footer={
          open ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-none px-3" onClick={remove} aria-label="Remove">
                <Trash2 size={15} strokeWidth={2} />
              </Button>
              <Button className="flex-1" icon={BadgeCheck} loading={busy} onClick={renew}>
                Mark renewed today
              </Button>
            </div>
          ) : null
        }
      >
        {open ? (
          <div className="py-2">
            <div className="rounded-card border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-headline font-semibold">{open.name}</p>
                  <p className="mt-0.5 text-footnote text-label-3">
                    {open.holder} · {open.authority}
                  </p>
                </div>
                <Pill tone={open.status.tone}>{open.status.label}</Pill>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-separator/50 pt-3">
                <div>
                  <dt className="text-caption text-label-3">Last certified</dt>
                  <dd className="text-subhead font-semibold">{day(open.completedAt)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-label-3">
                    {open.status.state === 'overdue' ? 'Expired' : 'Valid until'}
                  </dt>
                  <dd
                    className={cn(
                      'text-subhead font-semibold',
                      open.status.state === 'overdue' && 'text-ios-red',
                      open.status.state === 'due' && 'text-ios-orange',
                    )}
                  >
                    {day(open.expiresAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-label-3">Cadence</dt>
                  <dd className="text-subhead font-semibold">
                    Every {open.cadenceMonths} mo
                  </dd>
                </div>
              </dl>

              {open.notes ? (
                <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-2">
                  {open.notes}
                </p>
              ) : null}
            </div>

            {open.renewals?.length ? (
              <Section
                title="Where to renew"
                footer="Links go to the issuing authority or accredited providers — Dentin has no affiliation."
              >
                {open.renewals.map((r) => (
                  <Row
                    key={r.url}
                    title={r.label}
                    subtitle={r.url.replace(/^https?:\/\/(www\.)?/, '')}
                    chevron={false}
                    trailing={
                      <ExternalLink size={14} className="text-label-3" aria-hidden="true" />
                    }
                    onClick={() => window.open(r.url, '_blank', 'noopener,noreferrer')}
                  />
                ))}
              </Section>
            ) : null}

            <p className="px-1 pt-3 text-footnote text-label-3">
              Marking it renewed records today as the completion date and sets the next due date{' '}
              {open.cadenceMonths} months out.
            </p>
          </div>
        ) : null}
      </Sheet>

      {/* Add */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a certification"
        detent="large"
        footer={
          <Button className="w-full" size="lg" loading={busy} disabled={!form.name.trim()} onClick={add}>
            Add certification
          </Button>
        }
      >
        <div className="flex flex-col gap-3 py-3">
          {[
            ['name', 'Certification', 'Nitrous oxide monitoring'],
            ['holder', 'Who holds it', 'All staff, or a person'],
            ['authority', 'Issuing authority', 'State board · OSHA · AHA'],
          ].map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                {label}
              </span>
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="mt-1 w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-body text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                Renews every (months)
              </span>
              <input
                type="number"
                min={1}
                max={120}
                value={form.cadenceMonths}
                onChange={(e) => setForm((f) => ({ ...f, cadenceMonths: e.target.value }))}
                className="tnum mt-1 w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-body text-label focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="block">
              <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                Last completed
              </span>
              <input
                type="date"
                value={form.completedAt}
                onChange={(e) => setForm((f) => ({ ...f, completedAt: e.target.value }))}
                className="mt-1 w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-body text-label focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
          </div>

          <p className="text-footnote text-label-3">
            Leave the date empty to count from today. The due date is computed from the cadence.
          </p>
        </div>
      </Sheet>
    </Screen>
  )
}
