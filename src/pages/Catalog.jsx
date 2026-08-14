import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, PackagePlus, PackageSearch, Sparkles } from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, Section } from '@/components/ios/List'
import { EmptyState, Pill, SearchField, Stepper } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
import Sheet from '@/components/ios/Sheet'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ios/Toast'
import { useData } from '@/hooks/useData'
import { addToInventory, listCatalog, listLocations } from '@/lib/repository'
import { money, unitMoney } from '@/lib/format'

export default function Catalog() {
  const navigate = useNavigate()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null)
  const [adding, setAdding] = useState(null)
  const [par, setPar] = useState(4)
  const [onHand, setOnHand] = useState(0)
  const [locationId, setLocationId] = useState(null)
  const [busy, setBusy] = useState(false)

  const { data: products } = useData(() => listCatalog(), [])
  const { data: locations } = useData(() => listLocations(), [])

  const filtered = useMemo(() => {
    let out = products ?? []
    if (category) out = out.filter((p) => p.categorySlug === category)
    if (query) {
      const q = query.toLowerCase()
      out = out.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          (p.gtin ?? '').includes(q),
      )
    }
    return out
  }, [products, category, query])

  const categories = useMemo(() => {
    const map = new Map()
    for (const p of products ?? []) {
      if (!map.has(p.categorySlug)) {
        map.set(p.categorySlug, { slug: p.categorySlug, name: p.categoryName, count: 0 })
      }
      map.get(p.categorySlug).count += 1
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const p of filtered) {
      if (!map.has(p.categoryName)) map.set(p.categoryName, [])
      map.get(p.categoryName).push(p)
    }
    return [...map.entries()]
  }, [filtered])

  const openAdd = (product) => {
    setAdding(product)
    setPar(4)
    setOnHand(0)
    setLocationId(locations?.[0]?.id ?? null)
  }

  const confirmAdd = async () => {
    setBusy(true)
    try {
      await addToInventory({
        productId: adding.productId,
        locationId,
        parLevel: par,
        reorderPoint: Math.max(1, Math.floor(par / 3)),
        onHand,
      })
      toast({
        title: 'Added to inventory',
        body: `${adding.productName} · par ${par}`,
      })
      setAdding(null)
    } catch (e) {
      toast({ title: 'Could not add', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Catalog"
      subtitle={`${products?.length ?? 0} products`}
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
      toolbar={
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search the dental catalog"
        />
      }
    >
      {/* Category chips */}
      <div className="hide-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-subhead font-medium transition-colors ${
            category === null ? 'bg-brand-600 text-white' : 'bg-surface text-label-2'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setCategory(c.slug === category ? null : c.slug)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-subhead font-medium transition-colors ${
              category === c.slug ? 'bg-brand-600 text-white' : 'bg-surface text-label-2'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing matches"
          body={`No catalog product matches “${query}”. Try a brand or a barcode.`}
        />
      ) : (
        grouped.map(([name, items]) => (
          <Section key={name} title={name}>
            {items.map((p) => (
              <Row
                key={p.id}
                chevron={false}
                onClick={() => (p.tracked ? null : openAdd(p))}
                disabled={p.tracked}
                leading={<ProductTile product={p} size={40} />}
                title={p.productName}
                subtitle={`${p.brand}${p.bestUnitPrice ? ` · ${unitMoney(p.bestUnitPrice)}/unit` : ''}`}
                trailing={
                  p.tracked ? (
                    <Pill tone="good" icon={Check}>
                      Tracked
                    </Pill>
                  ) : (
                    <span className="flex items-center gap-2">
                      {p.bestPrice ? (
                        <span className="tnum text-callout font-semibold">
                          {money(p.bestPrice)}
                        </span>
                      ) : null}
                      <PackagePlus
                        size={19}
                        className="text-brand-600 dark:text-brand-400"
                        aria-hidden="true"
                      />
                    </span>
                  )
                }
              />
            ))}
          </Section>
        ))
      )}

      {/* Add sheet */}
      <Sheet
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        title="Track this item"
        detent="medium"
        footer={
          <Button className="w-full" size="lg" loading={busy} onClick={confirmAdd}>
            Add to inventory
          </Button>
        }
      >
        {adding ? (
          <div className="py-2">
            <div className="flex items-start gap-3.5 rounded-card bg-surface p-4">
              <ProductTile product={adding} size={54} />
              <div className="min-w-0 flex-1">
                <h3 className="text-headline font-semibold leading-snug">{adding.productName}</h3>
                <p className="mt-0.5 text-subhead text-label-3">
                  {adding.brand} · {adding.unit}
                </p>
                {adding.bestPrice ? (
                  <p className="mt-1.5 flex items-center gap-1 text-footnote text-brand-600 dark:text-brand-400">
                    <Sparkles size={12} strokeWidth={2.4} aria-hidden="true" />
                    Best {money(adding.bestPrice)} across {adding.offerCount} suppliers
                  </p>
                ) : null}
              </div>
            </div>

            {(locations?.length ?? 0) > 1 ? (
              <Section title="Location">
                {locations.map((l) => (
                  <Row
                    key={l.id}
                    title={l.name}
                    chevron={false}
                    onClick={() => setLocationId(l.id)}
                    trailing={locationId === l.id ? <Pill tone="brand">Selected</Pill> : null}
                  />
                ))}
              </Section>
            ) : null}

            <div className="mt-4 rounded-card bg-surface p-4">
              <p className="text-headline font-semibold">Par level</p>
              <p className="mb-3 mt-0.5 text-footnote text-label-3">
                What a restock brings you back up to.
              </p>
              <Stepper value={par} onChange={setPar} min={1} unit={adding.unit} />
            </div>

            <div className="mt-3 rounded-card bg-surface p-4">
              <p className="text-headline font-semibold">On hand today</p>
              <p className="mb-3 mt-0.5 text-footnote text-label-3">
                Count what is on the shelf right now — you can adjust later.
              </p>
              <Stepper value={onHand} onChange={setOnHand} min={0} />
            </div>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
