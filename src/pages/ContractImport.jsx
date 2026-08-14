import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileSpreadsheet,
  Hash,
  ScanBarcode,
  Upload,
} from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, Section } from '@/components/ios/List'
import { Pill } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
import Sheet from '@/components/ios/Sheet'
import { useToast } from '@/components/ios/Toast'
import { useData } from '@/hooks/useData'
import { importContractPrices, listVendors, matchContractRows } from '@/lib/repository'
import { guessMapping, parseCsv } from '@/lib/csv'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

const FIELDS = [
  { key: 'price', label: 'Price', hint: 'Your contracted price per pack', required: true },
  { key: 'gtin', label: 'Barcode / GTIN', hint: 'Strongest way to match' },
  { key: 'mfrSku', label: 'Manufacturer part #', hint: 'Next best match key' },
  { key: 'description', label: 'Description', hint: 'Fallback match, and shown in review' },
  { key: 'packSize', label: 'Pack size', hint: 'Units per pack, for per-unit maths' },
  { key: 'vendorSku', label: 'Vendor item #', hint: 'Their catalog number' },
]

const SAMPLE = `Item Number,MFG Part,Description,UOM Qty,Your Price
4471902,MT-N-M,Micro-Touch Nitrile Exam Gloves Medium,200,24.80
4471903,CTX-L3-EL,Level 3 Procedure Masks Earloop,50,19.95
4471904,3M-FSU-A2B,Filtek Supreme Ultra A2 Body,20,81.40`

export default function ContractImport() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const { data: vendors } = useData(() => listVendors(), [])
  const withAccounts = useMemo(() => (vendors ?? []).filter((v) => v.hasAccount), [vendors])

  const [supplierId, setSupplierId] = useState(null)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [matched, setMatched] = useState(null)
  const [editingField, setEditingField] = useState(null)
  const [busy, setBusy] = useState(false)

  const vendor = withAccounts.find((v) => v.supplierId === supplierId) ?? null

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
      setMatched(await matchContractRows(parsed.rows, mapping))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const { applied, skipped } = await importContractPrices(supplierId, matched)
      toast({
        title: `${applied} contract prices applied`,
        body: skipped ? `${skipped} rows skipped` : `${vendor.name} pricing is now live`,
      })
      navigate('/vendors')
    } catch (e) {
      toast({ title: 'Import failed', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    if (!matched) return null
    return {
      total: matched.length,
      gtin: matched.filter((m) => m.matchedBy === 'gtin').length,
      mpn: matched.filter((m) => m.matchedBy === 'mpn').length,
      name: matched.filter((m) => m.matchedBy === 'name').length,
      unmatched: matched.filter((m) => !m.usable).length,
      usable: matched.filter((m) => m.usable).length,
    }
  }, [matched])

  return (
    <Screen
      title="Import contract pricing"
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
      <div className="mt-3 flex items-start gap-2.5 rounded-card bg-surface p-3.5">
        <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-footnote text-label-2">
          Ask your rep for a contracted-price file — most distributors will send a CSV or EDI 832
          for your account. These prices override list everywhere in Dentin, because they are what
          the invoice will say.
        </p>
      </div>

      {/* 1 — vendor */}
      <Section title="1. Which vendor">
        {withAccounts.map((v) => (
          <Row
            key={v.supplierId}
            title={v.name}
            subtitle={v.accountNumber ?? 'No account number on file'}
            chevron={false}
            onClick={() => setSupplierId(v.supplierId)}
            trailing={
              supplierId === v.supplierId ? (
                <Pill tone="brand" icon={Check}>
                  Selected
                </Pill>
              ) : null
            }
          />
        ))}
        {!withAccounts.length ? (
          <Row
            title="No vendor accounts yet"
            subtitle="Add an account before importing its pricing"
            to="/vendors"
          />
        ) : null}
      </Section>

      {/* 2 — the file */}
      {supplierId ? (
        <Section
          title="2. The price file"
          footer="Nothing is applied until you review the matches."
        >
          <Row
            leading={<Upload size={16} className="text-brand-600" aria-hidden="true" />}
            title="Choose a CSV file"
            subtitle="Comma, semicolon or tab separated"
            chevron={false}
            onClick={() => fileRef.current?.click()}
          />
          <Row
            leading={<FileSpreadsheet size={16} className="text-label-3" aria-hidden="true" />}
            title="Paste a sample"
            subtitle="Try the format without a file"
            chevron={false}
            onClick={() => {
              setText(SAMPLE)
              ingest(SAMPLE)
            }}
          />
        </Section>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={onFile}
        className="hidden"
      />

      {supplierId ? (
        <div className="mt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text.trim() && ingest(text)}
            rows={4}
            placeholder="…or paste the file contents here"
            className="w-full rounded-card bg-surface p-3.5 font-mono text-caption text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      ) : null}

      {/* 3 — mapping */}
      {parsed ? (
        <Section
          title={`3. Map the columns (${parsed.rows.length} rows)`}
          footer="Dentin guesses from the header names. Tap any row to change it."
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

      {parsed && mapping.price ? (
        <div className="mt-3">
          <Button className="w-full" size="lg" loading={busy} onClick={review}>
            Review {parsed.rows.length} rows
          </Button>
        </div>
      ) : null}

      {/* 4 — match preview */}
      {stats ? (
        <>
          <Section title="4. What matched">
            <Row
              leading={<ScanBarcode size={16} className="text-ios-blue" aria-hidden="true" />}
              title="Matched by barcode"
              subtitle="Same GS1 code — certain"
              detail={String(stats.gtin)}
              chevron={false}
            />
            <Row
              leading={<Hash size={16} className="text-ios-blue" aria-hidden="true" />}
              title="Matched by part number"
              subtitle="Same manufacturer part"
              detail={String(stats.mpn)}
              chevron={false}
            />
            <Row
              leading={<AlertTriangle size={16} className="text-ios-orange" aria-hidden="true" />}
              title="Matched by description"
              subtitle="A guess — spot-check these"
              detail={String(stats.name)}
              chevron={false}
            />
            <Row
              leading={<AlertTriangle size={16} className="text-ios-red" aria-hidden="true" />}
              title="Could not be used"
              subtitle="No catalog match, or no price"
              detail={String(stats.unmatched)}
              chevron={false}
            />
          </Section>

          <Section title="Preview">
            {matched.slice(0, 12).map((row) => (
              <Row
                key={row.index}
                chevron={false}
                className={cn(!row.usable && 'opacity-50')}
                title={row.product?.name ?? row.description}
                subtitle={row.issue ?? `${row.mfrSku ?? row.gtin ?? ''} · pack of ${row.packSize}`}
                trailing={
                  <div className="text-right">
                    <p className="tnum text-callout font-semibold">
                      {row.price != null ? money(row.price) : '—'}
                    </p>
                    {row.matchedBy ? (
                      <p className="text-caption text-label-3">
                        {row.matchedBy === 'gtin'
                          ? 'barcode'
                          : row.matchedBy === 'mpn'
                            ? 'part #'
                            : 'description'}
                      </p>
                    ) : null}
                  </div>
                }
              />
            ))}
            {matched.length > 12 ? (
              <Row
                chevron={false}
                title={`+ ${matched.length - 12} more rows`}
                subtitle="All of them import — this is just a sample"
              />
            ) : null}
          </Section>

          <div className="mt-4">
            <Button
              className="w-full"
              size="lg"
              loading={busy}
              disabled={!stats.usable}
              onClick={apply}
            >
              Apply {stats.usable} contract prices
            </Button>
            {stats.unmatched > 0 ? (
              <p className="mt-2 text-center text-footnote text-label-3">
                {stats.unmatched} rows will be skipped
              </p>
            ) : null}
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
