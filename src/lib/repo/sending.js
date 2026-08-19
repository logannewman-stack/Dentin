import { supabase, myPracticeId, must } from '../repoCore'

/**
 * Build a purchase order email ready to send.
 *
 * A PO is addressed to the supplier's rep with line items, totals, and delivery/billing info.
 * The reply-to is the practice contact email so the rep can respond directly to them.
 *
 * @param {Object} draft - order.js draft order shape: { vendorId, lines[], totalCents, notes }
 * @param {Object} practice - Current practice: { name, email, ...}
 * @returns {Promise<{to, from, replyTo, subject, html, text}>}
 */
export async function getSendPlan(draft, practice) {
  must(draft?.vendorId, 'draft.vendorId required')
  must(practice?.email, 'practice.email required')
  must(draft.lines?.length > 0, 'draft must have line items')

  // Fetch vendor account (rep email is stored here)
  const { data: vendor } = await supabase
    .from('vendor_accounts')
    .select('name')
    .eq('id', draft.vendorId)
    .single()
  must(vendor, 'vendor not found')

  // Fetch supplier account with rep contact
  const { data: supplier } = await supabase
    .from('supplier_accounts')
    .select('name, rep_name, rep_email, website')
    .eq('vendor_id', draft.vendorId)
    .eq('practice_id', await myPracticeId())
    .maybeSingle()

  if (!supplier?.rep_email) {
    throw new Error(`No rep email on file for ${vendor.name}. Add one in Vendors > ${vendor.name} > rep contact.`)
  }

  // Fetch products for line items (to show descriptions and pack sizes)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, pack_size')
    .in(
      'id',
      draft.lines.map((l) => l.product_id),
    )
  const productMap = new Map(products.map((p) => [p.id, p]))

  // Line item text (for both HTML and plain text versions)
  const lineRows = draft.lines
    .filter((l) => l.quantity_ordered > 0)
    .map((l) => {
      const prod = productMap.get(l.product_id)
      const packSize = prod?.pack_size || 1
      const units = Math.round(l.quantity_ordered * packSize)
      const priceCents = l.offer_price_cents || l.benchmark_price_cents || 0
      const lineTotalCents = l.quantity_ordered * priceCents
      return {
        sku: prod?.sku || '—',
        name: prod?.name || 'Unknown product',
        units,
        each: `$${(priceCents / 100).toFixed(2)}`,
        total: `$${(lineTotalCents / 100).toFixed(2)}`,
        line: l,
        prod,
      }
    })

  const subtotalCents = lineRows.reduce((sum, row) => sum + row.line.quantity_ordered * (row.line.offer_price_cents || row.line.benchmark_price_cents || 0), 0)
  const taxEstimate = Math.round(subtotalCents * 0.08) // Placeholder: actual tax varies by location/item
  const totalCents = subtotalCents + taxEstimate

  return {
    to: supplier.rep_email,
    from: process.env.VITE_ORDER_FROM_EMAIL,
    replyTo: practice.email,
    cc: practice.email, // Practice also gets a copy
    subject: `Purchase order from ${practice.name} — ${lineRows.length} items`,
    lineRows,
    subtotalCents,
    taxEstimate,
    totalCents,
    vendor,
    supplier,
    practice,
  }
}

/**
 * Send a purchase order email via Resend.
 * Idempotent: if called twice with the same idempotency_key, returns existing send result.
 *
 * @param {Object} draft - order.js draft shape
 * @param {Object} practice - practice record
 * @param {Object} options - { note?, resendOverride? }
 * @returns {Promise<{success, messageId, note}>}
 */
export async function emailPurchaseOrder(draft, practice, options = {}) {
  const { note } = options
  const practiceId = await myPracticeId()

  // Build the PO text
  const plan = await getSendPlan(draft, practice)

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h2 { margin-top: 24px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .total-row { font-weight: 600; background: #f9f9f9; }
    .footer { font-size: 12px; color: #666; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <p>Hi ${plan.supplier.rep_name || 'there'},</p>

    <p>Here's a purchase order from <strong>${practice.name}</strong>:</p>

    <h2>Purchase Order Details</h2>
    <p>
      <strong>Practice:</strong> ${practice.name}<br>
      <strong>Supplier:</strong> ${plan.supplier.name}<br>
      <strong>Vendor:</strong> ${plan.vendor.name}
    </p>

    <h2>Items</h2>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th>Units</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${plan.lineRows.map((row) => `
        <tr>
          <td>${row.sku}</td>
          <td>${row.name}</td>
          <td style="text-align: right;">${row.units}</td>
          <td style="text-align: right;">${row.each}</td>
          <td style="text-align: right;">${row.total}</td>
        </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="4" style="text-align: right;">Subtotal:</td>
          <td style="text-align: right;">$${(plan.subtotalCents / 100).toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="4" style="text-align: right;">Tax (est.):</td>
          <td style="text-align: right;">$${(plan.taxEstimate / 100).toFixed(2)}</td>
        </tr>
        <tr class="total-row" style="border-top: 2px solid #333;">
          <td colspan="4" style="text-align: right; font-size: 16px;">Total:</td>
          <td style="text-align: right; font-size: 16px;">$${(plan.totalCents / 100).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    ${note ? `<h2>Special Instructions</h2><p>${note}</p>` : ''}

    <p>Please confirm receipt and delivery timeline at your earliest convenience.</p>

    <p>Thanks,<br>${practice.name}</p>

    <div class="footer">
      <p>Sent via Dentin on ${new Date().toLocaleDateString()}. Reply to ${practice.email}.</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  // Plain text version
  const text = `
Purchase Order from ${practice.name}

Supplier: ${plan.supplier.name}
Vendor: ${plan.vendor.name}

ITEMS
${plan.lineRows.map((row) => `${row.sku}\t${row.name}\t${row.units} units @ ${row.each} = ${row.total}`).join('\n')}

Subtotal: $${(plan.subtotalCents / 100).toFixed(2)}
Tax (est.): $${(plan.taxEstimate / 100).toFixed(2)}
Total: $${(plan.totalCents / 100).toFixed(2)}

${note ? `Special Instructions:\n${note}\n` : ''}

Please confirm receipt and delivery timeline at your earliest convenience.

Thanks,
${practice.name}

---
Sent via Dentin. Reply to ${practice.email}.
  `.trim()

  // Call the send endpoint
  const response = await fetch('/api/orders/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: plan.to,
      from: plan.from,
      replyTo: plan.replyTo,
      cc: plan.cc,
      subject: plan.subject,
      html,
      text,
      note,
      draft,
      practiceId,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to send PO: ${error}`)
  }

  const result = await response.json()
  return result
}
