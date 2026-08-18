import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  Copy,
  FileSpreadsheet,
  Hash,
  History,
  Mail,
  ScanBarcode,
  Upload,
  Wrench,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill, SearchField } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  dismissPriceImport,
  getImportAddress,
  getPriceImport,
  importContractPrices,
  listPriceImports,
  listVendors,
  matchContractRows,
  rememberVendorMatch,
  savePriceImport,
  searchCatalogForMatch,
} from '@/lib/repository'
import { guessMapping, parseCsv } from '@/lib/csv'
import { money, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const FIELDS = [
  { key: 'price', label: 'Price', hint: 'Your contracted price per pack', required: true },
  { key: 'gtin', label: 'Barcode / GTIN', hint: 'Strongest way to match' },
  { key: 'mfrSku', label: 'Manufacturer part #', hint: 'Next best match key' },
  { key: 'description', label: 'Description', hint: 'Fallback match, and shown in review' },
  { key: 'packSize', label: 'Pack size', hint: 'Units per pack, for per-unit maths' },
  { key: 'vendorSku', label: 'Vendor item #', hint: 'Their catalog number — how matches are remembered' },
]

const DELIMITER_LABEL = { ',': 'commas', ';': 'semicolons', '\t': 'tabs', '|': 'pipes' }

const MATCH_LABEL = {
  learned: 'remembered',
  manual: 'you matched it',
  gtin: 'barcode',
  mpn: 'part #',
  name: 'description',
}

const SAMPLE = `Item Number,MFG Part,Description,UOM Qty,Your Price
4471902,MT-N-M,Micro-Touch Nitrile Exam Gloves Medium,200,24.80
4471903,CTX-L3-EL,Level 3 Procedure Masks Earloop,50,19.95
4471904,3M-FSU-A2B,Filtek Supreme Ultra A2 Body,20,81.40`

/**
 * The first few words of a description, as a starting search. Numbers are left
 * out on purpose: the pack size in a vendor's line ("2-Ply", "500/cs") is the
 * part least likely to be written the same way in the catalog.
 */
function searchSeed(text) {
  return String(text ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length >= 3 && /[A-Za-z]/.test(word))
    .slice(0, 3)
    .join(' ')
}

export default function ContractImport() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const { data: vendors } = useData(() => listVendors(), [])
  const { data: pending } = useData(() => listPriceImports(), [])
  const { data: inboxAddress } = useData(() => getImportAddress(), [])

  const [supplierId, setSupplierId] = useState(null)
  const [vendorQuery, setVendorQuery] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [source, setSource] = useState(null)
  const [mapping, setMapping] = useState({})
  const [matched, setMatched] = useState(null)
  const [editingField, setEditingField] = useState(null)
  const [fixing, setFixing] = useState(null)
  const [fixQuery, setFixQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const vendor = (vendors ?? []).find((v) => v.supplierId === supplierId) ?? null

  // Every vendor, not just the ones with an account: a rep sends a price file
  // long before anyone has typed an account number, and refusing the file
  // until then is friction for no reason.
  const { accountVendors, otherVendors } = useMemo(() => {
    const needle = vendorQuery.trim().toLowerCase()
    const hits = (vendors ?? []).filter(
      (v) =>
        !needle ||
        v.name.toLowerCase().includes(needle) ||
        String(v.accountNumber ?? '').toLowerCase().includes(needle),
    )
    return {
      accountVendors: hits.filter((v) => v.hasAccount),
      otherVendors: hits.filter((v) => !v.hasAccount),
    }
  }, [vendors, vendorQuery])

  // Debounced, so a long catalog is not queried on every keystroke.
  const [fixNeedle, setFixNeedle] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setFixNeedle(fixQuery), 180)
    return () => clearTimeout(timer)
  }, [fixQuery])

  const { data: candidates } = useData(
    () => (fixing ? searchCatalogForMatch(fixNeedle) : Promise.resolve([])),
    [fixing?.index, fixNeedle],
  )

  /** Learned matches are per vendor, so a review made under another is stale. */
  const chooseVendor = (id) => {
    setSupplierId(id)
    setMatched(null)
  }

  /**
   * A dropped file exists in this tab and nowhere else. Keeping a copy means a
   * bad mapping is recoverable without asking the rep to send it again, and the
   * prices it becomes can point back at the file they came from.
   */
  const savedRef = useRef('')
  const keepCopy = async (raw, { from, filename, rowCount }) => {
    if (savedRef.current === raw) return
    savedRef.current = raw
    try {
      const record = await savePriceImport({
        supplierId,
        source: from,
        filename,
        content: raw,
        rowCount,
      })
      setSource(record)
    } catch (e) {
      toast({
        title: 'Could not keep a copy',
        body: `${e.message}. The import still works.`,
        tone: 'error',
      })
    }
  }

  const ingest = (raw, { from = 'upload', filename = null } = {}) => {
    const result = parseCsv(raw)
    if (!result.rows.length) {
      toast({ title: 'Nothing to read', body: 'No data rows found in that file', tone: 'error' })
      return
    }
    setParsed(result)
    setMapping(guessMapping(result.headers))
    setMatched(null)
    if (from === 'inbox') return

    setSource(null)
    // The sample is not a real file and does not belong in the inbox.
    if (from !== 'sample') keepCopy(raw, { from, filename, rowCount: result.rows.length })
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    ingest(await file.text(), { from: 'upload', filename: file.name })
  }

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      const raw = await file.text()
      setText(raw.slice(0, 4000))
      ingest(raw, { from: 'upload', filename: file.name })
      return
    }
    const dropped = e.dataTransfer?.getData('text')
    if (dropped?.trim()) {
      setText(dropped)
      ingest(dropped, { from: 'paste' })
    }
  }

  /** A forwarded file opens straight into the mapping step with its contents. */
  const openFromInbox = async (record) => {
    setBusy(true)
    try {
      const full = record.content ? record : await getPriceImport(record.id)
      if (!full?.content) throw new Error('That file has no contents')
      if (full.supplierId) setSupplierId(full.supplierId)
      setSource(full)
      setText(full.content.slice(0, 4000))
      ingest(full.content, { from: 'inbox' })
    } catch (e) {
      toast({ title: 'Could not open that file', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    const record = source
    setSource(null)
    setParsed(null)
    setMatched(null)
    try {
      await dismissPriceImport(record.id)
      toast({ title: 'Dismissed', body: 'It stays on file — nothing was deleted' })
    } catch (e) {
      toast({ title: 'Could not dismiss it', body: e.message, tone: 'error' })
    }
  }

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(inboxAddress.address)
      toast({ title: 'Address copied', body: 'Forward the rep’s email there' })
    } catch {
      toast({ title: 'Copy it by hand', body: inboxAddress.address, tone: 'info' })
    }
  }

  const review = async () => {
    setBusy(true)
    try {
      setMatched(await matchContractRows(parsed.rows, mapping, { supplierId }))
    } catch (e) {
      toast({ title: 'Could not match those rows', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const openFix = (row) => {
    setFixQuery(searchSeed(row.description))
    setFixNeedle(searchSeed(row.description))
    setFixing(row)
  }

  /** Resolve one row by hand — and remember it, so this is a one-time cost. */
  const resolveFix = async (row, product) => {
    setMatched((list) =>
      list.map((m) =>
        m.index === row.index
          ? {
              ...m,
              product,
              matchedBy: 'manual',
              confidence: 1,
              usable: m.price != null && m.price >= 0,
              issue: m.price == null ? m.issue : null,
            }
          : m,
      ),
    )
    setFixing(null)

    try {
      const { remembered } = await rememberVendorMatch({
        supplierId,
        vendorSku: row.vendorSku,
        productId: product.id,
      })
      toast({
        title: product.name,
        body: remembered
          ? `Item ${row.vendorSku} will match this from now on`
          : 'Matched for this import',
      })
    } catch (e) {
      toast({ title: 'Matched here, but not remembered', body: e.message, tone: 'error' })
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const { applied, skipped } = await importContractPrices(supplierId, matched, {
        importId: source?.id,
      })
      toast({
        title: `${applied} contract prices applied`,
        body: skipped
          ? `${skipped} rows skipped`
          : `${vendor?.name ?? 'That vendor'} pricing is now live`,
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
    const by = (kind) => matched.filter((m) => m.matchedBy === kind).length
    return {
      total: matched.length,
      learned: by('learned'),
      manual: by('manual'),
      gtin: by('gtin'),
      mpn: by('mpn'),
      name: by('name'),
      fixable: matched.filter((m) => !m.product && m.price != null).length,
      noPrice: matched.filter((m) => m.price == null).length,
      usable: matched.filter((m) => m.usable).length,
    }
  }, [matched])

  const fixable = useMemo(
    () => (matched ?? []).filter((m) => !m.product && m.price != null),
    [matched],
  )

  const pendingFiles = pending ?? []

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
      <div className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface p-3">
        <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-footnote text-label-2">
          Ask your rep for a contracted-price file — most distributors will send a CSV or EDI 832
          for your account. These prices override list everywhere in Dentin, because they are what
          the invoice will say.
        </p>
      </div>

      {/* Files that arrived on their own */}
      {pendingFiles.length ? (
        <Section
          title="Waiting for you"
          footer="Forwarded price files stay here until you apply or dismiss them."
        >
          {pendingFiles.map((file) => (
            <Row
              key={file.id}
              leading={
                <RowIcon tint="blue">
                  <Mail size={13} strokeWidth={2.2} />
                </RowIcon>
              }
              title={file.subject || file.filename || 'Price file'}
              subtitle={[
                file.fromAddress ?? (file.source === 'email' ? 'Forwarded' : 'Uploaded'),
                relativeTime(file.receivedAt),
                file.rowCount ? `${file.rowCount} rows` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={() => openFromInbox(file)}
              trailing={source?.id === file.id ? <Pill tone="brand">Open</Pill> : null}
            />
          ))}
        </Section>
      ) : null}

      {inboxAddress ? (
        <Section footer="Reps send these by email. Forward one to that address and it arrives here, ready to map — the file never has to be in front of you.">
          <Row
            leading={
              <RowIcon tint="quiet">
                <Mail size={13} strokeWidth={2.2} />
              </RowIcon>
            }
            title="Forward a price file"
            subtitle={
              inboxAddress.isExample
                ? 'Example address — a live practice gets its own'
                : 'Your practice’s private address'
            }
            chevron={false}
            onClick={copyAddress}
            trailing={
              <span className="flex items-center gap-1 text-callout text-brand-600 dark:text-brand-400">
                <Copy size={13} aria-hidden="true" />
                Copy
              </span>
            }
          >
            <span className="mt-0.5 truncate font-mono text-caption text-label-2">
              {inboxAddress.address}
            </span>
          </Row>
        </Section>
      ) : null}

      {/* 1 — vendor */}
      <Section
        title="1. Which vendor"
        footer={
          vendor && !vendor.hasAccount
            ? 'You have no account with them yet. Load the pricing anyway — it is still what they would invoice.'
            : undefined
        }
      >
        {vendor ? (
          <Row
            leading={
              <RowIcon tint="brand">
                <Building2 size={13} strokeWidth={2.2} />
              </RowIcon>
            }
            title={vendor.name}
            subtitle={
              vendor.hasAccount
                ? (vendor.accountNumber ?? 'Account on file')
                : 'No account with them yet'
            }
            chevron={false}
            onClick={() => chooseVendor(null)}
            trailing={
              <span className="text-callout text-brand-600 dark:text-brand-400">Change</span>
            }
          />
        ) : (
          <>
            <div className="p-2.5">
              <SearchField
                value={vendorQuery}
                onChange={setVendorQuery}
                placeholder="Search every vendor"
              />
            </div>

            {accountVendors.map((v) => (
              <Row
                key={v.supplierId}
                title={v.name}
                subtitle={v.accountNumber ?? 'Account on file'}
                chevron={false}
                onClick={() => chooseVendor(v.supplierId)}
                trailing={<Pill tone="brand">Your account</Pill>}
              />
            ))}

            {otherVendors.slice(0, 12).map((v) => (
              <Row
                key={v.supplierId}
                title={v.name}
                subtitle={v.blurb || 'No account yet'}
                chevron={false}
                onClick={() => chooseVendor(v.supplierId)}
              />
            ))}

            {otherVendors.length > 12 ? (
              <Row
                chevron={false}
                title={`${otherVendors.length - 12} more vendors`}
                subtitle="Type a name to narrow the list"
              />
            ) : null}

            {vendors && !accountVendors.length && !otherVendors.length ? (
              <EmptyState
                icon={Building2}
                title="No vendor matches"
                body="Try a shorter name. Any vendor works here, account or not."
              />
            ) : null}
          </>
        )}
      </Section>

      {/* 2 — the file. Open once a vendor is picked, and stays open for a
          forwarded file that arrived before anyone chose one. */}
      {supplierId || parsed ? (
        <Section
          title="2. The price file"
          footer="Nothing is applied until you review the matches."
        >
          {source ? (
            <Row
              leading={
                <RowIcon tint="blue">
                  <Mail size={13} strokeWidth={2.2} />
                </RowIcon>
              }
              title={source.filename || source.subject || 'Forwarded file'}
              subtitle={source.fromAddress ?? 'From your inbox'}
              chevron={false}
              trailing={
                <span className="text-callout text-brand-600 dark:text-brand-400">Dismiss</span>
              }
              onClick={dismiss}
            />
          ) : null}

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'm-2.5 flex flex-col gap-2.5 rounded-[3px] border border-dashed p-3 transition-colors duration-100',
              dragging ? 'border-brand-600 bg-brand-600/5' : 'border-line',
            )}
          >
            <p className="text-footnote text-label-3">
              Drop a file here, or paste the rows. Comma, semicolon, tab or pipe separated, and a
              title block above the header is fine.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              onChange={onFile}
              className="hidden"
            />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Paste the file contents here"
              className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 font-mono text-caption text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
              <Button
                className="flex-1"
                disabled={!text.trim()}
                onClick={() => ingest(text, { from: 'paste' })}
              >
                Read pasted rows
              </Button>
              <Button
                variant="plain"
                onClick={() => {
                  setText(SAMPLE)
                  ingest(SAMPLE, { from: 'sample' })
                }}
              >
                Sample
              </Button>
            </div>
          </div>
        </Section>
      ) : null}

      {/* 3 — mapping */}
      {parsed ? (
        <Section
          title={`3. Map the columns (${parsed.rows.length} rows)`}
          footer={[
            `Read with ${DELIMITER_LABEL[parsed.delimiter] ?? 'commas'}.`,
            parsed.skippedRows
              ? `Skipped ${parsed.skippedRows} row${parsed.skippedRows === 1 ? '' : 's'} above the header.`
              : null,
            'Dentin guesses from the header names — tap any row to change it.',
          ]
            .filter(Boolean)
            .join(' ')}
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
          <Button
            className="w-full"
            size="lg"
            loading={busy && !matched}
            disabled={!supplierId}
            onClick={review}
          >
            Review {parsed.rows.length} rows
          </Button>
          {!supplierId ? (
            <p className="mt-2 text-center text-footnote text-label-3">
              Choose the vendor above — prices are loaded per vendor.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 4 — match preview */}
      {stats ? (
        <>
          <Section
            title="4. What matched"
            footer="Spot-check the description matches — they are the only ones that are a judgement call."
          >
            {stats.learned ? (
              <Row
                leading={<History size={16} className="text-ios-green" aria-hidden="true" />}
                title="Matched from memory"
                subtitle={`${stats.learned} matched from what you taught Dentin last time`}
                detail={String(stats.learned)}
                chevron={false}
              />
            ) : null}
            {stats.manual ? (
              <Row
                leading={<Check size={16} className="text-ios-green" aria-hidden="true" />}
                title="Matched by you, just now"
                subtitle="Remembered for the next file from this vendor"
                detail={String(stats.manual)}
                chevron={false}
              />
            ) : null}
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
              subtitle="A judgement call — spot-check these"
              detail={String(stats.name)}
              chevron={false}
            />
            <Row
              leading={<Wrench size={16} className="text-ios-orange" aria-hidden="true" />}
              title="Rows you can fix"
              subtitle="Nothing matched — pick the product once and it sticks"
              detail={String(stats.fixable)}
              chevron={false}
            />
            {stats.noPrice ? (
              <Row
                leading={<AlertTriangle size={16} className="text-ios-red" aria-hidden="true" />}
                title="No price in the mapped column"
                subtitle="Check the column mapping above"
                detail={String(stats.noPrice)}
                chevron={false}
              />
            ) : null}
          </Section>

          {fixable.length ? (
            <Section
              title="Fix these"
              footer="Each one you match is remembered against the vendor's item number, so the next file from them lands on its own."
            >
              {fixable.slice(0, 20).map((row) => (
                <Row
                  key={row.index}
                  title={row.description}
                  subtitle={row.issue ?? 'No catalog product matched'}
                  onClick={() => openFix(row)}
                  trailing={
                    <div className="text-right">
                      <p className="tnum text-callout font-semibold">{money(row.price)}</p>
                      <p className="text-caption text-label-3">
                        {row.vendorSku ? `item ${row.vendorSku}` : 'no item #'}
                      </p>
                    </div>
                  }
                />
              ))}
              {fixable.length > 20 ? (
                <Row
                  chevron={false}
                  title={`+ ${fixable.length - 20} more unmatched rows`}
                  subtitle="Fix what you recognise — the rest are skipped, not lost"
                />
              ) : null}
            </Section>
          ) : null}

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
                        {MATCH_LABEL[row.matchedBy] ?? row.matchedBy}
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
            <p className="mt-2 text-center text-footnote text-label-3">
              {stats.usable} of {stats.total} rows ready
              {stats.fixable ? ` · ${stats.fixable} still fixable above` : ''}
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

      {/* Manual matcher */}
      <Sheet
        open={Boolean(fixing)}
        onClose={() => setFixing(null)}
        title={fixing?.description ?? 'Find the product'}
        detent="large"
      >
        {fixing ? (
          <div className="py-2">
            <div className="rounded-card border border-line bg-surface p-3">
              <p className="text-footnote text-label-2">
                {vendor?.name ?? 'This vendor'} calls it{' '}
                <span className="font-mono">{fixing.vendorSku ?? fixing.mfrSku ?? 'no item #'}</span>{' '}
                at {money(fixing.price)}. Pick what it is in your catalog — Dentin remembers it
                against that item number.
              </p>
            </div>

            <div className="pt-2.5">
              <SearchField
                value={fixQuery}
                onChange={setFixQuery}
                placeholder="Search the catalog"
                autoFocus
              />
            </div>

            <Section>
              {(candidates ?? []).map((product) => (
                <Row
                  key={product.id}
                  title={product.name}
                  subtitle={[product.brand, product.mfrSku, product.unit]
                    .filter(Boolean)
                    .join(' · ')}
                  chevron={false}
                  onClick={() => resolveFix(fixing, product)}
                />
              ))}
              {!(candidates ?? []).length ? (
                <EmptyState
                  icon={FileSpreadsheet}
                  title="Nothing in the catalog matches"
                  body="Try fewer words. If you do not stock it yet, leave the row — it is skipped, not lost, and you can add the product later."
                />
              ) : null}
            </Section>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
