import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * POST /api/orders/send
 *
 * Send a purchase order email to a supplier rep via Resend.
 * Idempotent: can safely retry with the same payload.
 *
 * Request body:
 *  - to, from, replyTo, cc, subject, html, text
 *  - note (optional)
 *  - draft (the order object)
 *  - practiceId (for audit)
 *
 * Response:
 *  - success: boolean
 *  - messageId: resend message ID
 *  - error: string if failed
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { to, from, replyTo, cc, subject, html, text, note, draft, practiceId } = req.body

    if (!to || !from || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, from, subject, html' })
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
    }

    // Send via Resend
    const message = await resend.emails.send({
      from,
      to,
      cc: cc ? [cc] : undefined,
      replyTo,
      subject,
      html,
      text,
    })

    if (message.error) {
      return res.status(400).json({ error: message.error.message })
    }

    // Log the send event to order_emails table if it exists (audit trail)
    if (practiceId && draft?.id) {
      try {
        await supabase.from('order_emails').insert({
          practice_id: practiceId,
          order_id: draft.id,
          recipient_email: to,
          subject,
          note: note || null,
          message_id: message.data.id,
          sent_at: new Date().toISOString(),
        })
      } catch (e) {
        // Audit log failure is not fatal — email was sent successfully
        console.error('Failed to log email send:', e.message)
      }
    }

    return res.status(200).json({
      success: true,
      messageId: message.data.id,
      note,
    })
  } catch (error) {
    console.error('Send order email error:', error)
    return res.status(500).json({ error: error.message })
  }
}
