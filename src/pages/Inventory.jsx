import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  FileSpreadsheet,
  Minus,
  PackagePlus,
  PackageSearch,
  Search as SearchIcon,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Gauge, Pill, SearchField, SegmentedControl } from '@/components/ui/Controls'
import Sheet from '@/components/ui/Sheet'
import SwipeRow from '@/components/ui/SwipeRow'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { listInventory, listLocations, recordMovement } from '@/lib/repository'
import { STOCK_STATUS, coverLabel, qty } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: 'attention', label: 'Needs action' },
  { value: 'all', label: 'All' },
  { value: 'ok', label: 'Healthy' },
]

export default function Inventory() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [category, setCategory] = useState(null)
  const [locationId, setLocationId] = useState(null)

  const filter = params.get('filter') ?? 'attention'
  const setFilter = (value) => setParams(value === 'attention' ? {} : { filter: value })

  const { data: locations } = useData(() => listLocations(), [])
  const { data: all, loading } = useData(() => listInventory(), [])

  const rows = useMemo(() => {
    let out = all ?? []
    if (locationId) out = out.filter((r) => r.locationId === locationId)
    if (category) out = out.filter((r) => r.categorySlug === category)
    if (filter === 'attention') {
      out = out.filter((r) => ['out', 'low', 'below_par'].includes(r.stockStatus))
    } else if (filter === 'ok') {
      out = out.filter((r) => r.stockStatus === 'ok')
    }
    if (query) {
      const q = query.toLowerCase()
      out = out.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          (r.brand ?? '').toLowerCase().includes(q) ||
          (r.bin ?? '').toLowerCase().includes(q) ||
          (r.gtin ?? '').includes(q),
      )
    }
    return out
  }, [all, filter, query, category, locationId])

  const counts = useMemo(() => {
    const base = (all ?? []).filter(
      (r) =>
        (!locationId || r.locationId === locationId) && (!category || r.categorySlug === category),
    )
    return {
      attention: base.filter((r) => ['out', 'low', 'below_par'].includes(r.stockStatus)).length,
      all: base.length,
      ok: base.filter((r) => r.stockStatus === 'ok').length,
    }
  }, [all, category, locationId])

  const categories = useMemo(() => {
    const map = new Map()
    for (const r of all ?? []) {
      if (!map.has(r.categorySlug)) map.set(r.categorySlug, { slug: r.categorySlug, name: r.categoryName, count: 0 })
      map.get(r.categorySlug).count += 1
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [all])

  // Group by category so a long list stays navigable.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.categoryName)) map.set(r.categoryName, [])
      map.get(r.categoryName).push(r)
    }
    return [...map.entries()]
  }, [rows])

  const activeFilters = (category ? 1 : 0) + (locationId ? 1 : 0)

  return (
    <Screen
      title="Inventory"
      subtitle={`${counts.all} tracked items`}
      trailing={
        <>
          <Link
            to="/inventory/import"
            aria-label="Import inventory from a file"
            className="press flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
          >
            <FileSpreadsheet size={20} strokeWidth={2} />
          </Link>
          <Link
            to="/search"
            aria-label="Search everything"
            className="press flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
          >
            <SearchIcon size={20} strokeWidth={2} />
          </Link>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
            className="press relative flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
          >
            <SlidersHorizontal size={20} strokeWidth={2} />
            {activeFilters ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-600" />
            ) : null}
          </button>
        </>
      }
      toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search items, brands, bins" />}
    >
      <div className="pb-1 pt-2">
        <SegmentedControl
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loading ? (
        <div className="space-y-2 pt-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={query ? 'No matches' : 'Everything is above par'}
          body={
            query
              ? `Nothing matches "${query}". Try a brand, a bin or a barcode.`
              : 'No item is below its reorder point right now.'
          }
        />
      ) : (
        grouped.map(([categoryName, items]) => (
          <Section key={categoryName} title={categoryName}>
            {items.map((item) => {
              const status = STOCK_STATUS[item.stockStatus]
              return (
                <SwipeRow
                  key={item.id}
                  actions={[
                    {
                      label: 'Use 1',
                      icon: Minus,
                      tone: 'brand',
                      onPress: async () => {
                        await recordMovement({
                          inventoryItemId: item.id,
                          type: 'consumed',
                          quantity: 1,
                          reason: 'Swiped from inventory',
                        })
                        toast({
                          title: `${qty(item.onHand - 1)} left`,
                          body: item.productName,
                          action: {
                            label: 'Undo',
                            onPress: () =>
                              recordMovement({
                                inventoryItemId: item.id,
                                type: 'received',
                                quantity: 1,
                                reason: 'Undo',
                              }),
                          },
                        })
                      },
                    },
                    {
                      label: 'Reorder',
                      icon: ShoppingCart,
                      tone: 'warning',
                      onPress: () => navigate('/orders/new'),
                    },
                  ]}
                >
                <Row
                  to={`/inventory/${item.id}`}
                  leading={<ProductTile product={item} size={32} imageUrl={item.imageUrl} />}
                  title={item.productName}
                  subtitle={`${item.brand}${item.bin ? ` · ${item.bin}` : ''}`}
                  trailing={
                    <div className="flex items-center gap-2.5">
                      <p
                        className={cn(
                          'tnum text-subhead font-semibold',
                          item.stockStatus === 'out'
                            ? 'text-ios-red'
                            : item.stockStatus === 'low'
                              ? 'text-ios-orange'
                              : 'text-label',
                        )}
                      >
                        {qty(item.onHand)}
                        <span className="font-normal text-label-3">/{qty(item.parLevel)}</span>
                      </p>
                      <Gauge
                        value={item.pctOfPar ?? 0}
                        size={30}
                        stroke={3.5}
                        tone={
                          item.stockStatus === 'out'
                            ? 'critical'
                            : item.stockStatus === 'low'
                              ? 'warning'
                              : item.stockStatus === 'below_par'
                                ? 'warning'
                                : 'good'
                        }
                      />
                    </div>
                  }
                >
                  {item.stockStatus !== 'ok' ? (
                    <span className="mt-1 flex items-center gap-1.5">
                      <Pill
                        tone={
                          item.stockStatus === 'out'
                            ? 'critical'
                            : item.stockStatus === 'low'
                              ? 'warning'
                              : 'caution'
                        }
                      >
                        {status.label}
                      </Pill>
                      {item.daysOfCover != null ? (
                        <span className="text-caption text-label-3">
                          {coverLabel(item.daysOfCover)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </Row>
                </SwipeRow>
              )
            })}
          </Section>
        ))
      )}

      <Section footer="Swipe any row left to draw stock down or jump straight to reordering.">
        <Row
          to="/catalog"
          leading={<PackagePlus size={18} className="text-brand-600" aria-hidden="true" />}
          title="Add items from the catalog"
          subtitle="Start tracking something you stock but have not logged"
        />
      </Section>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter" detent="medium">
        <Section title="Location">
          <Row
            title="All locations"
            onClick={() => setLocationId(null)}
            chevron={false}
            trailing={locationId === null ? <Pill tone="brand">Selected</Pill> : null}
          />
          {(locations ?? []).map((l) => (
            <Row
              key={l.id}
              title={l.name}
              subtitle={`${l.operatories} operatories`}
              onClick={() => setLocationId(l.id)}
              chevron={false}
              trailing={locationId === l.id ? <Pill tone="brand">Selected</Pill> : null}
            />
          ))}
        </Section>

        <Section title="Category">
          <Row
            title="All categories"
            onClick={() => setCategory(null)}
            chevron={false}
            trailing={category === null ? <Pill tone="brand">Selected</Pill> : null}
          />
          {categories.map((c) => (
            <Row
              key={c.slug}
              title={c.name}
              detail={String(c.count)}
              onClick={() => setCategory(c.slug)}
              chevron={false}
              trailing={category === c.slug ? <Pill tone="brand">Selected</Pill> : null}
            />
          ))}
        </Section>
      </Sheet>
    </Screen>
  )
}
