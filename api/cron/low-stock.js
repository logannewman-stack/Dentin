import webpush from 'web-push'
import { adminClient, json } from '../_lib/supabase.js'

/**
 * Vercel Cron — runs daily (see vercel.json).
 *
 * Sweeps every practice for items below their reorder point, lots nearing
 * expiry and equipment service that is coming due, records alerts, and pushes
 * a single digest per device rather than one notification per item.
 */
function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:alerts@dentin.app'

  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export default async function handler(req, res) {
  // Vercel Cron sends the project's CRON_SECRET as a bearer token.
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return json(res, 401, { error: 'Unauthorized' })
  }

  const pushReady = configureWebPush()

  try {
    const supabase = adminClient()
    const summary = []
    // supabase-js returns errors instead of throwing. Swallowing one here
    // would report "0 items short" for a practice that is actually out of
    // stock — silent alert loss. Fail the run so the next cron retries.
    const must = ({ data, error }, what) => {
      if (error) throw new Error(`${what}: ${error.message}`)
      return data
    }

    const practices = must(await supabase.from('practices').select('id, name'), 'practices query')

    for (const practice of practices ?? []) {
      // --- what is short ---
      const short = must(
        await supabase
          .from('v_inventory_status')
          .select('id, product_id, product_name, on_hand, par_level, stock_status, days_of_cover')
          .eq('practice_id', practice.id)
          .in('stock_status', ['out', 'low']),
        'inventory status query',
      )

      // --- what is expiring inside 30 days ---
      const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
      const expiring = must(
        await supabase
          .from('lots')
          .select('id, lot_number, expires_at, quantity, inventory_item_id')
          .eq('practice_id', practice.id)
          .not('expires_at', 'is', null)
          .lte('expires_at', horizon)
          .gt('quantity', 0),
        'expiring lots query',
      )

      // --- equipment service due inside 14 days ---
      const serviceHorizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
      const service = must(
        await supabase
          .from('assets')
          .select('id, name, next_service_at')
          .eq('practice_id', practice.id)
          .not('next_service_at', 'is', null)
          .lte('next_service_at', serviceHorizon)
          .neq('status', 'retired'),
        'assets service query',
      )

      const out = (short ?? []).filter((s) => s.stock_status === 'out')
      const low = (short ?? []).filter((s) => s.stock_status === 'low')

      // Record alerts, skipping anything still open from a previous run.
      const rows = [
        ...(short ?? []).map((s) => ({
          practice_id: practice.id,
          type: s.stock_status === 'out' ? 'out_of_stock' : 'low_stock',
          severity: s.stock_status === 'out' ? 'critical' : 'warning',
          title:
            s.stock_status === 'out'
              ? `${s.product_name} is out of stock`
              : `${s.product_name} hit its reorder point`,
          body:
            s.days_of_cover != null
              ? `About ${s.days_of_cover} days of cover left`
              : `${s.on_hand} of ${s.par_level} par`,
          inventory_item_id: s.id,
          product_id: s.product_id,
        })),
        ...(expiring ?? []).map((l) => ({
          practice_id: practice.id,
          type: 'expiring',
          severity: 'warning',
          title: 'A lot is expiring soon',
          body: `Lot ${l.lot_number ?? '—'} expires ${l.expires_at}`,
          inventory_item_id: l.inventory_item_id,
        })),
        ...(service ?? []).map((a) => ({
          practice_id: practice.id,
          type: 'service_due',
          severity: 'warning',
          title: `${a.name} service due`,
          body: `Scheduled for ${a.next_service_at}`,
          asset_id: a.id,
        })),
      ]

      if (rows.length) {
        const existing = must(
          await supabase
            .from('alerts')
            .select('type, inventory_item_id, asset_id')
            .eq('practice_id', practice.id)
            .is('resolved_at', null),
          'open alerts query',
        )

        const seen = new Set(
          (existing ?? []).map((e) => `${e.type}:${e.inventory_item_id ?? e.asset_id}`),
        )
        const fresh = rows.filter(
          (r) => !seen.has(`${r.type}:${r.inventory_item_id ?? r.asset_id}`),
        )
        if (fresh.length) {
          must(await supabase.from('alerts').insert(fresh), 'alerts insert')
        }
      }

      // --- one digest push per device ---
      let delivered = 0
      if (pushReady && (out.length || low.length || service?.length)) {
        const subs = must(
          await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('practice_id', practice.id),
          'push subscriptions query',
        )

        const parts = []
        if (out.length) parts.push(`${out.length} out of stock`)
        if (low.length) parts.push(`${low.length} at reorder point`)
        if (service?.length) parts.push(`${service.length} service due`)

        const payload = JSON.stringify({
          title: out.length ? 'Stock is out' : 'Time to reorder',
          body: `${parts.join(' · ')}. Tap to price the restock.`,
          tag: 'dentin-low-stock',
          renotify: true,
          url: '/alerts',
          data: { reorderUrl: '/orders/new' },
        })

        for (const sub of subs ?? []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
            )
            delivered += 1
          } catch (e) {
            // 404/410 mean the browser dropped the subscription — clean it up.
            if (e.statusCode === 404 || e.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            }
          }
        }
      }

      summary.push({
        practice: practice.name,
        out: out.length,
        low: low.length,
        expiring: expiring?.length ?? 0,
        serviceDue: service?.length ?? 0,
        pushDelivered: delivered,
      })
    }

    return json(res, 200, { ok: true, pushConfigured: pushReady, practices: summary })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
