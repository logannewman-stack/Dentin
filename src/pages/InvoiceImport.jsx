import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  FileSpreadsheet,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Upload,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  invoiceHeaderFrom,
  listVendors,
  matchInvoiceRows,
  parseInvoiceText,
  reconcileInvoice,
  saveInvoice,
  suggestOrderForInvoice,
} from '@/lib/repository'
import { fullDate, money, qty, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const FIELDS = [
  { key: 'price', label: 'Unit price', hint: 'What they billed per pack', required: true },
  { key: 'quantity', label: 'Quantity', hint: 'How many they billed' },
  { key: 'packSize', label: 'Pack size', hint: 'Units per pack — decides per-each maths' },
  { key: 'lineTotal', label: 'Extended amount', hint: 'Line total, if the file prints one' },
  { key: 'description', label: 'Description', hint: 'Shown in review, and a fallback match' },
  { key: 'mfrSku', label: 'Manufacturer part #', hint: 'Strongest match key on an invoice' },
  { key: 'gtin', label: 'Barcode / GTIN', hint: 'Certain when it is there' },
  { key: 'vendorSku', label: 'Vendor item #', hint: 'Their catalog number' },
  { key: 'invoiceNumber', label: 'Invoice number', hint: 'Read from the first row' },
  { key: 'invoiceDate', label: 'Invoice date', hint: 'Read from the first row' },
]

/**
 * Flags in the order a human should read them: money first, then things that
 * are wrong in a different way, then the merely unfamiliar.
 */
const FLAGS = {
  price_up: { label: 'Price up', tone: 'critical', rank: 0 },
  qty_mismatch: { label: 'Quantity', tone: 'warning', rank: 1 },
  not_on_order: { label: 'Not ordered', tone: 'warning', rank: 2 },
  new_item: { label: 'New item', tone: 'info', rank: 3 },
  price_down: { label: 'Price down', tone: 'good', rank: 4 },
  ok: { label: 'Matches', tone: 'quiet', rank: 5 },
}

const SOURCE_LABEL = {
  order: 'the purchase order',
  contract: 'your contract price',
  last_invoice: 'the last invoice',
}

/** A sample dated today, so it lands after the invoices already on file. */
function sampleInvoice() {
  const on = new Date().toISOString().slice(0, 10)
  return [
    'Invoice No,Invoice Date,Item Number,MFG Part,Description,UOM Qty,Qty Shipped,Unit Price,Extended',
    `INV-88377,${on},4471902,MT-N-M,"Micro-Touch Nitrile Exam Gloves, Medium",200,10,31.20,312.00`,
    `INV-88377,${on},4471945,3M-AT-1262,Attest Biological Spore Tests,25,2,68.20,136.40`,
    `INV-88377,${on},4471903,CTX-L3-EL,"Level 3 Procedure Masks, Earloop",50,6,23.95,143.70`,
    `INV-88377,${on},4471960,HAL-SP-35,Sterilization Pouches 3.5in x 9in,200,4,17.20,68.80`,
    `INV-88377,${on},4472011,,Fuel and handling surcharge,1,1,12.50,12.50`,
    `INV-88377,${on},,,Invoice total,,,,673.40`,
  ].join('\n')
}

/**
 * One billed line, with the comparison beside it.
 *
 * Written as a block rather than a `Row` because the sentence underneath is
 * the point of the whole screen and must wrap, not truncate.
 */
function LineRow({ line }) {
  const flag = FLAGS[line.flag] ?? FLAGS.ok
  const over = (line.variance ?? 0) > 0

  return (
    <div className="row flex-wrap items-start py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-subhead font-medium text-label">
          {line.productName ?? line.description}
        </span>
        <span className="block text-caption text-label-3">
          {qty(line.quantity)} × {line.packSize > 1 ? `pack of ${line.packSize}` : 'each'}
          {line.unitPrice != null ? ` · ${unitMoney(line.unitPrice)} per unit` : ''}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2.5">
        <span className="text-right">
          <span className="tnum block text-callout font-semibold">{money(line.price)}</span>
          {line.expectedPrice != null ? (
            <span className="tnum block text-caption text-label-3">
              expected {money(line.expectedPrice)}
            </span>
          ) : null}
        </span>
        <Pill tone={flag.tone}>{flag.label}</Pill>
      </span>

      {line.variance != null && line.variance !== 0 ? (
        <span className="w-full pt-1">
          <span
            className={cn(
              'tnum text-footnote font-semibold',
              over ? 'text-ios-red' : 'text-ios-green',
            )}
          >
            {over ? '+' : '−'}
            {money(Math.abs(line.variance))}
            {line.variancePct != null
              ? ` · ${over ? '+' : '−'}${Math.abs(line.variancePct).toFixed(1)}%`
              : ''}
          </span>
          {line.expectedSource ? (
            <span className="text-footnote text-label-3">
              {' '}
              against {line.expectedLabel ?? SOURCE_LABEL[line.expectedSource]}
            </span>
          ) : null}
        </span>
      ) : null}

      <p className="w-full pt-1 text-footnote leading-snug text-label-2">{line.message}</p>
    </div>
  )
}

export default function InvoiceImport() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const { data: vendors } = useData(() => listVendors(), [])

  const [supplierId, setSupplierId] = useState(null)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [orderId, setOrderId] = useState(null)
  const [orderPicked, setOrderPicked] = useState(false)
  const [preview, setPreview] = useState(null)
  const [editingField, setEditingField] = useState(null)
  const [busy, setBusy] = useState(false)

  const vendor = (vendors ?? []).find((v) => v.supplierId === supplierId) ?? null
  const { data: candidates } = useData(
    () => (supplierId ? suggestOrderForInvoice({ supplierId, invoiceDate }) : Promise.resolve([])),
    [supplierId, invoiceDate],
  )

  // How the invoice arrived is recorded on the row: a pasted invoice and a
  // vendor's own CSV export are not equally trustworthy six months later.
  const [source, setSource] = useState('paste')

  const ingest = (raw, from = 'paste') => {
    setSource(from)
    const result = parseInvoiceText(raw)
    if (!result.rows.length) {
      toast({ title: 'Nothing to read', body: 'No billed lines found in that file', tone: 'error' })
      return
    }
    const header = invoiceHeaderFrom(result.rows, result.mapping)
    setParsed(result)
    setMapping(result.mapping)
    if (header.invoiceNumber) setInvoiceNumber(header.invoiceNumber)
    if (header.invoiceDate) setInvoiceDate(header.invoiceDate)
    setPreview(null)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    ingest(await file.text(), 'csv')
  }

  const review = async () => {
    setBusy(true)
    try {
      const matched = await matchInvoiceRows(parsed.rows, mapping, { supplierId, orderId })
      setPreview(
        await reconcileInvoice({
          supplierId,
          orderId,
          invoiceNumber: invoiceNumber || null,
          invoiceDate: invoiceDate || null,
          matchedRows: matched,
          source,
        }),
      )
    } catch (e) {
      toast({ title: 'Could not reconcile', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    setBusy(true)
    try {
      await saveInvoice(preview)
      toast({
        title: 'Invoice filed',
        body:
          preview.overcharge > 0
            ? `${money(preview.overcharge)} billed above what you expected`
            : preview.flaggedLines
              ? `${preview.flaggedLines} lines worth a look, none of them over your price`
              : 'Every line matched what you expected',
      })
      navigate('/invoices')
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const { flagged, matching } = useMemo(() => {
    const lines = preview?.lines ?? []
    return {
      flagged: lines
        .filter((l) => l.flag !== 'ok')
        .sort(
          (a, b) =>
            (FLAGS[a.flag]?.rank ?? 9) - (FLAGS[b.flag]?.rank ?? 9) ||
            (b.variance ?? 0) - (a.variance ?? 0),
        ),
      matching: lines.filter((l) => l.flag === 'ok'),
    }
  }, [preview])

  return (
    <Screen
      title="Check an invoice"
      subtitle={vendor?.name}
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
      <div className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface p-3">
        <ReceiptText size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-footnote text-label-2">
          Drop the invoice in and Dentin lines every billed price up against the purchase order,
          your contracted price, and what the same item cost last time. Nothing is filed until you
          have looked at what it found.
        </p>
      </div>

      {/* 1 — vendor */}
      <Section title="1. Which vendor">
        {(vendors ?? []).map((v) => (
          <Row
            key={v.supplierId}
            title={v.name}
            subtitle={v.hasAccount ? (v.accountNumber ?? 'Account on file') : 'No account on file'}
            chevron={false}
            onClick={() => {
              setSupplierId(v.supplierId)
              setOrderId(null)
              setOrderPicked(false)
              setPreview(null)
            }}
            trailing={
              supplierId === v.supplierId ? (
                <Pill tone="brand" icon={Check}>
                  Selected
                </Pill>
              ) : null
            }
          />
        ))}
        {!vendors?.length ? <Row title="Loading vendors…" chevron={false} /> : null}
      </Section>

      {/* 2 — the file */}
      {supplierId ? (
        <>
          <Section title="2. The invoice" footer="Comma, semicolon or tab separated.">
            <Row
              leading={<Upload size={16} className="text-brand-600" aria-hidden="true" />}
              title="Choose a file"
              subtitle="A CSV export from the vendor portal"
              chevron={false}
              onClick={() => fileRef.current?.click()}
            />
            <Row
              leading={<FileSpreadsheet size={16} className="text-label-3" aria-hidden="true" />}
              title="Paste a sample"
              subtitle="Try the format without a file"
              chevron={false}
              onClick={() => {
                const sample = sampleInvoice()
                setText(sample)
                ingest(sample)
              }}
            />
          </Section>

          <div className="mt-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text.trim() && ingest(text)}
              rows={4}
              placeholder="…or paste the invoice lines here"
              className="w-full rounded-card border border-line bg-surface p-3 font-mono text-caption text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={onFile}
        className="hidden"
      />

      {/* 3 — what this invoice is */}
      {parsed ? (
        <Section
          title="3. Invoice number and date"
          footer="The date decides which earlier prices count as 'last time'."
        >
          <Row
            title="Invoice number"
            chevron={false}
            trailing={
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-88377"
                aria-label="Invoice number"
                className="focus-ring w-[160px] rounded-[3px] border border-line bg-canvas px-2 py-1 text-right text-subhead text-label placeholder:text-label-3"
              />
            }
          />
          <Row
            title="Invoice date"
            chevron={false}
            trailing={
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                aria-label="Invoice date"
                className="focus-ring w-[160px] rounded-[3px] border border-line bg-canvas px-2 py-1 text-right text-subhead text-label"
              />
            }
          />
        </Section>
      ) : null}

      {/* 4 — the purchase order it bills */}
      {parsed ? (
        <Section
          title="4. Is this for a purchase order?"
          footer="Attaching the PO makes it the strongest comparison — the price you actually agreed for this shipment."
        >
          {(candidates ?? []).map((c) => (
            <Row
              key={c.orderId}
              leading={
                <ShoppingCart size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />
              }
              title={c.reference ?? 'Order'}
              subtitle={`placed ${fullDate(c.placedAt)} · ${money(c.total)}`}
              chevron={false}
              onClick={() => {
                setOrderId(c.orderId)
                setOrderPicked(true)
                setPreview(null)
              }}
              trailing={
                orderId === c.orderId ? (
                  <Pill tone="brand" icon={Check}>
                    Attached
                  </Pill>
                ) : c.best ? (
                  <Pill tone="quiet">Closest</Pill>
                ) : null
              }
            />
          ))}
          <Row
            title="Not for a Dentin order"
            subtitle="Ordered on the vendor's own site, or by phone"
            chevron={false}
            onClick={() => {
              setOrderId(null)
              setOrderPicked(true)
              setPreview(null)
            }}
            trailing={
              orderPicked && !orderId ? (
                <Pill tone="brand" icon={Check}>
                  Selected
                </Pill>
              ) : null
            }
          />
        </Section>
      ) : null}

      {/* 5 — mapping */}
      {parsed ? (
        <Section
          title={`5. Map the columns (${parsed.rows.length} lines)`}
          footer={
            parsed.skippedRows.length
              ? `${parsed.skippedRows.length} row${
                  parsed.skippedRows.length === 1 ? '' : 's'
                } skipped as invoice totals rather than billed lines. Tap any row to change a guess.`
              : 'Dentin guesses from the header names. Tap any row to change it.'
          }
        >
          {FIELDS.map((field) => (
            <Row
              key={field.key}
              title={field.label}
              subtitle={field.hint}
              onClick={() => setEditingField(field.key)}
              trailing={
                mapping[field.key] ? (
                  <span className="max-w-[120px] truncate text-callout text-label-3">
                    {mapping[field.key]}
                  </span>
                ) : field.required ? (
                  <Pill tone="critical">Required</Pill>
                ) : (
                  <span className="text-callout text-label-3">Not mapped</span>
                )
              }
            />
          ))}
        </Section>
      ) : null}

      {parsed && (mapping.price || mapping.lineTotal) ? (
        <div className="mt-3">
          <Button className="w-full" size="lg" loading={busy} onClick={review}>
            Check {parsed.rows.length} lines against what you expected
          </Button>
        </div>
      ) : null}

      {/* What Dentin found */}
      {preview ? (
        <>
          {preview.flaggedLines === 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-card border border-ios-green/35 bg-surface p-3">
              <BadgeCheck size={19} className="mt-0.5 shrink-0 text-ios-green" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-headline font-semibold">Every line matched what you expected</p>
                <p className="mt-0.5 text-footnote text-label-2">
                  All {preview.lines.length} lines were billed at the price you agreed, in the
                  quantity you ordered. File it and move on.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-card border border-line bg-surface p-3">
              {/* Flagged lines and money over-billed are not the same thing. A
                  first invoice is all new items and costs nothing extra; saying
                  "$0.00 over" next to "12 lines flagged" would read as alarm. */}
              {preview.overcharge > 0 ? (
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] bg-ios-red/12 text-ios-red">
                    <TrendingUp size={21} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-title2 font-bold">{money(preview.overcharge)}</p>
                    <p className="text-footnote text-label-3">
                      billed above what you expected, across {preview.flaggedLines} of{' '}
                      {preview.lines.length} lines
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <ReceiptText
                    size={19}
                    className="mt-0.5 shrink-0 text-ios-orange"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-headline font-semibold">
                      Nothing was billed above your price
                    </p>
                    <p className="mt-0.5 text-footnote text-label-2">
                      {preview.flaggedLines} of {preview.lines.length} lines still want a look —
                      items Dentin has never seen billed before, quantities that differ, or things
                      that were not on the order.
                    </p>
                  </div>
                </div>
              )}
              {preview.unmatchedLines > 0 ? (
                <p className="mt-3 border-t border-separator/50 pt-2.5 text-footnote text-label-2">
                  {preview.unmatchedLines} line
                  {preview.unmatchedLines === 1 ? ' did' : 's did'} not match anything in your
                  catalog. {preview.unmatchedLines === 1 ? 'It is' : 'They are'} filed exactly as
                  printed so you can still read {preview.unmatchedLines === 1 ? 'it' : 'them'}.
                </p>
              ) : null}
            </div>
          )}

          {flagged.length > 0 ? (
            <Section title="Worth a look">
              <div className="panel">
                {flagged.map((line, i) => (
                  <LineRow key={`${line.description}-${i}`} line={line} />
                ))}
              </div>
            </Section>
          ) : null}

          {matching.length > 0 ? (
            <Section
              title={`${matching.length} line${matching.length === 1 ? '' : 's'} matched`}
              footer="Billed at the price you expected."
            >
              {matching.map((line, i) => (
                <Row
                  key={`${line.description}-ok-${i}`}
                  chevron={false}
                  title={line.productName ?? line.description}
                  subtitle={line.message}
                  trailing={
                    <span className="tnum text-callout font-semibold">{money(line.price)}</span>
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section title="Totals">
            <Row title="Goods" detail={money(preview.subtotal)} chevron={false} />
            {preview.shipping ? (
              <Row title="Shipping" detail={money(preview.shipping)} chevron={false} />
            ) : null}
            {preview.tax ? <Row title="Tax" detail={money(preview.tax)} chevron={false} /> : null}
            <Row
              title="Invoice total"
              chevron={false}
              trailing={<span className="tnum text-body font-semibold">{money(preview.total)}</span>}
            />
            <Row
              title="Billed above expected"
              chevron={false}
              trailing={
                <span
                  className={cn(
                    'tnum text-body font-semibold',
                    preview.overcharge > 0 ? 'text-ios-red' : 'text-label-3',
                  )}
                >
                  {money(preview.overcharge)}
                </span>
              }
            />
          </Section>

          <div className="mt-4">
            <Button className="w-full" size="lg" loading={busy} onClick={commit}>
              {preview.overcharge > 0
                ? `File it — ${money(preview.overcharge)} to query`
                : 'File this invoice'}
            </Button>
            <p className="mt-2 text-center text-footnote text-label-3">
              Filing it records what was billed, so next month has something to compare against.
            </p>
          </div>
        </>
      ) : null}

      {/* Column picker */}
      <Sheet
        open={Boolean(editingField)}
        onClose={() => setEditingField(null)}
        title={FIELDS.find((f) => f.key === editingField)?.label ?? ''}
        detent="medium"
      >
        <Section>
          <Row
            title="Not mapped"
            chevron={false}
            onClick={() => {
              setMapping((m) => {
                const next = { ...m }
                delete next[editingField]
                return next
              })
              setEditingField(null)
            }}
          />
          {(parsed?.headers ?? []).map((header) => (
            <Row
              key={header}
              title={header}
              subtitle={parsed.rows[0]?.[header] || '—'}
              chevron={false}
              onClick={() => {
                setMapping((m) => ({ ...m, [editingField]: header }))
                setEditingField(null)
              }}
              trailing={
                mapping[editingField] === header ? (
                  <Pill tone="brand" icon={Check}>
                    Selected
                  </Pill>
                ) : null
              }
            />
          ))}
        </Section>
      </Sheet>
    </Screen>
  )
}
