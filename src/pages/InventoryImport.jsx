import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, FileSpreadsheet, Upload } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import BackButton from '@/components/ui/BackButton'
import { Row, Section } from '@/components/ui/List'
import { Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { importInventoryRows, matchInventoryRows } from '@/lib/repository'
import { guessMapping, parseCsv } from '@/lib/csv'
import { qty } from '@/lib/format'
import { cn } from '@/lib/utils'

const FIELDS = [
  { key: 'description', label: 'Item name', hint: 'Shown in review, and the fallback match' },
  { key: 'gtin', label: 'Barcode / GTIN', hint: 'Strongest way to match' },
  { key: 'mfrSku', label: 'Manufacturer part #', hint: 'Next best match key' },
  { key: 'onHand', label: 'On hand', hint: 'Current count — becomes starting stock' },
  { key: 'parLevel', label: 'Par level', hint: 'Target stock, if your sheet has one' },
]

const SAMPLE = `Item Name,MFG Part,On Hand,Par
Micro-Touch Nitrile Exam Gloves Medium,MT-N-M,12,16
Septocaine Articaine 4% w/ Epi,SEP-ART-100,5,8
Filtek Supreme Ultra A2 Body,3M-FSU-A2B,4,6`

/**
 * A stocktake sheet or distributor export in, a working inventory out.
 * Matching follows the same honesty ladder as contract pricing — barcode,
 * then part number, then exact name — and unmatched rows are listed, never
 * silently dropped.
 */
export default function InventoryImport() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [matched, setMatched] = useState(null)
  const [editingField, setEditingField] = useState(null)
  const [busy, setBusy] = useState(false)

  const ingest = (raw) => {
    const result = parseCsv(raw)
    if (!result.rows.length) {
      toast({ title: 'Nothing to read', body: 'No data rows found in that file', tone: 'error' })
      return
    }
    setParsed(result)
    setMapping(guessMapping(result.headers))
    setMatched(null)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    ingest(await file.text())
  }

  const review = async () => {
    setBusy(true)
    try {
      setMatched(await matchInventoryRows(parsed.rows, mapping))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const { created, updated, skipped } = await importInventoryRows(matched)
      toast({
        title: `${created + updated} items on the shelf`,
        body: [
          created ? `${created} added` : null,
          updated ? `${updated} counts updated` : null,
          skipped ? `${skipped} unmatched` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
      navigate('/inventory')
    } catch (e) {
      toast({ title: 'Import failed', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    if (!matched) return null
    return {
      usable: matched.filter((m) => m.usable).length,
      unmatched: matched.filter((m) => !m.usable).length,
    }
  }, [matched])

  return (
    <Screen
      title="Import inventory"
      largeTitle={false}
      leading={
        <BackButton />
      }
    >
      {/* 1. Get the file in */}
      <Section
        title="1 · The file"
        footer="A stocktake sheet, or an order-history export from a distributor portal — Schein, Patterson, Benco and Darby all export CSV."
      >
        <div className="flex flex-col gap-2.5 p-3">
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
          <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>
            Choose a CSV file
          </Button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or paste rows here"
            rows={4}
            className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 font-mono text-caption text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!text.trim()}
              variant="secondary"
              onClick={() => ingest(text)}
            >
              Read pasted rows
            </Button>
            <Button variant="plain" onClick={() => setText(SAMPLE)}>
              Sample
            </Button>
          </div>
        </div>
      </Section>

      {/* 2. Columns */}
      {parsed ? (
        <Section
          title={`2 · Columns (${parsed.rows.length} rows)`}
          footer="Guesses from your headers — tap any field to point it at a different column."
        >
          {FIELDS.map((f) => (
            <Row
              key={f.key}
              title={f.label}
              subtitle={f.hint}
              onClick={() => setEditingField(f)}
              trailing={
                mapping[f.key] ? (
                  <Pill tone="brand">{mapping[f.key]}</Pill>
                ) : (
                  <Pill>Not set</Pill>
                )
              }
            />
          ))}
          <div className="p-3">
            <Button
              className="w-full"
              loading={busy && !matched}
              disabled={!mapping.description && !mapping.gtin && !mapping.mfrSku}
              onClick={review}
            >
              Match against the catalog
            </Button>
          </div>
        </Section>
      ) : null}

      {/* 3. Review */}
      {matched && stats ? (
        <>
          <Section
            title="3 · Review"
            footer="Unmatched rows are listed, not lost — add those products from the Catalog and re-import, or scan them in."
          >
            <div className="grid grid-cols-2 gap-px bg-line">
              <div className="bg-surface px-3 py-2.5">
                <p className="tnum text-title2 font-bold text-ios-green">{stats.usable}</p>
                <p className="text-caption text-label-3">matched, ready to import</p>
              </div>
              <div className="bg-surface px-3 py-2.5">
                <p className={cn('tnum text-title2 font-bold', stats.unmatched ? 'text-ios-orange' : 'text-label-3')}>
                  {stats.unmatched}
                </p>
                <p className="text-caption text-label-3">unmatched</p>
              </div>
            </div>

            {matched.slice(0, 40).map((m, i) => (
              <Row
                key={i}
                chevron={false}
                className={cn(!m.usable && 'opacity-50')}
                title={m.product?.name ?? m.description ?? m.mfrSku ?? m.gtin ?? `Row ${i + 1}`}
                subtitle={
                  m.usable
                    ? `${qty(m.onHand)} on hand${m.parLevel ? ` · par ${qty(m.parLevel)}` : ''}`
                    : 'No catalog match'
                }
                trailing={
                  m.usable ? (
                    <Pill tone="good" icon={Check}>
                      {m.matchedBy}
                    </Pill>
                  ) : (
                    <Pill tone="warning">Skipped</Pill>
                  )
                }
              />
            ))}
            {matched.length > 40 ? (
              <p className="row block py-2 text-caption text-label-3">
                …and {matched.length - 40} more rows
              </p>
            ) : null}
          </Section>

          <div className="mt-3">
            <Button
              className="w-full"
              size="lg"
              icon={FileSpreadsheet}
              loading={busy}
              disabled={!stats.usable}
              onClick={apply}
            >
              Import {stats.usable} item{stats.usable === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      ) : null}

      {/* Column picker */}
      <Sheet
        open={Boolean(editingField)}
        onClose={() => setEditingField(null)}
        title={editingField ? `Column for ${editingField.label}` : ''}
        detent="medium"
      >
        {editingField && parsed ? (
          <div className="py-2">
            <Row
              title="Not in this file"
              onClick={() => {
                setMapping((m) => ({ ...m, [editingField.key]: undefined }))
                setEditingField(null)
              }}
              chevron={false}
            />
            {parsed.headers.map((h) => (
              <Row
                key={h}
                title={h}
                subtitle={`e.g. ${String(parsed.rows[0]?.[h] ?? '—').slice(0, 40)}`}
                chevron={false}
                onClick={() => {
                  setMapping((m) => ({ ...m, [editingField.key]: h }))
                  setEditingField(null)
                }}
                trailing={
                  mapping[editingField.key] === h ? (
                    <Check size={16} className="text-brand-600" strokeWidth={2.6} />
                  ) : null
                }
              />
            ))}
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
