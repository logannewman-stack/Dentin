import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, PackagePlus, Search as SearchIcon, TrendingDown } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Pill, SearchField } from '@/components/ui/Controls'
import ProductTile from '@/components/ProductTile'
import { useData } from '@/hooks/useData'
import { listCatalog, listInventory } from '@/lib/repository'
import { STOCK_STATUS, coverShort, money, qty, unitMoney } from '@/lib/format'

const SUGGESTIONS = ['gloves', 'composite', 'anesthetic', 'burs', 'masks', 'implant']

/**
 * One search box over two things a practice thinks about differently: what
 * they already stock, and what they could start stocking. Kept as separate
 * sections rather than one blended list, because the actions differ.
 */
export default function Search() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: inventory } = useData(() => listInventory(), [])
  const { data: catalog } = useData(() => listCatalog(), [])

  const q = query.trim().toLowerCase()

  const matches = useMemo(() => {
    if (q.length < 2) return { stocked: [], available: [] }

    const test = (p) =>
      p.productName.toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q) ||
      (p.categoryName ?? '').toLowerCase().includes(q) ||
      (p.gtin ?? '').includes(q) ||
      (p.bin ?? '').toLowerCase().includes(q)

    const stocked = (inventory ?? []).filter(test)
    const stockedIds = new Set(stocked.map((s) => s.productId))
    const available = (catalog ?? [])
      .filter((p) => !p.tracked && !stockedIds.has(p.productId))
      .filter(test)

    return { stocked, available: available.slice(0, 12) }
  }, [q, inventory, catalog])

  const total = matches.stocked.length + matches.available.length

  return (
    <Screen
      title="Search"
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
          autoFocus
          placeholder="Items, brands, barcodes, bins"
        />
      }
    >
      {q.length < 2 ? (
        <>
          <Section title="Try">
            {SUGGESTIONS.map((s) => (
              <Row
                key={s}
                title={s}
                onClick={() => setQuery(s)}
                chevron={false}
                leading={<SearchIcon size={16} className="text-label-3" aria-hidden="true" />}
              />
            ))}
          </Section>
          <p className="px-1 pt-3 text-footnote text-label-3">
            Search covers what you stock and the full dental catalog — including barcodes and bin
            locations.
          </p>
        </>
      ) : total === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No matches"
          body={`Nothing in your inventory or the catalog matches “${query}”.`}
        />
      ) : (
        <>
          {matches.stocked.length > 0 ? (
            <Section title={`In your inventory (${matches.stocked.length})`}>
              {matches.stocked.map((item) => (
                <Row
                  key={item.id}
                  to={`/inventory/${item.id}`}
                  leading={<ProductTile product={item} size={40} imageUrl={item.imageUrl} />}
                  title={item.productName}
                  subtitle={`${item.brand}${item.bin ? ` · ${item.bin}` : ''}`}
                  trailing={
                    <div className="text-right">
                      <p className="tnum text-callout font-semibold">
                        {qty(item.onHand)}
                        <span className="text-label-3">/{qty(item.parLevel)}</span>
                      </p>
                      <p className="text-caption text-label-3">{coverShort(item.daysOfCover)}</p>
                    </div>
                  }
                >
                  {item.stockStatus !== 'ok' ? (
                    <span className="mt-1 inline-flex">
                      <Pill
                        tone={
                          item.stockStatus === 'out'
                            ? 'critical'
                            : item.stockStatus === 'low'
                              ? 'warning'
                              : 'caution'
                        }
                      >
                        {STOCK_STATUS[item.stockStatus].label}
                      </Pill>
                    </span>
                  ) : null}
                </Row>
              ))}
            </Section>
          ) : null}

          {matches.available.length > 0 ? (
            <Section
              title={`In the catalog (${matches.available.length})`}
              footer="Add any of these to start tracking par levels and pricing."
            >
              {matches.available.map((p) => (
                <Row
                  key={p.id}
                  to="/catalog"
                  leading={<ProductTile product={p} size={40} />}
                  title={p.productName}
                  subtitle={`${p.brand}${
                    p.bestUnitPrice ? ` · ${unitMoney(p.bestUnitPrice)}/unit` : ''
                  }`}
                  chevron={false}
                  trailing={
                    <span className="flex items-center gap-2">
                      {p.bestPrice ? (
                        <span className="tnum text-callout font-semibold">{money(p.bestPrice)}</span>
                      ) : null}
                      <PackagePlus
                        size={19}
                        className="text-brand-600 dark:text-brand-400"
                        aria-hidden="true"
                      />
                    </span>
                  }
                />
              ))}
            </Section>
          ) : null}

          {matches.stocked.some((i) => i.stockStatus !== 'ok') ? (
            <Row
              to="/orders/new"
              className="mt-4 rounded-card bg-surface shadow-card"
              leading={<TrendingDown size={18} className="text-brand-600" aria-hidden="true" />}
              title="Price a restock for these"
              subtitle="Compare every supplier before you buy"
            />
          ) : null}
        </>
      )}
    </Screen>
  )
}
