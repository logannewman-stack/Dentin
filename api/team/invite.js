import { adminClient, json, userClient } from '../_lib/supabase.js'

// Who can bring someone else in. Owners and managers only — an assistant
// should not be able to widen access to the practice's purchasing.
const CAN_INVITE = ['owner', 'manager']
const ASSIGNABLE = ['manager', 'clinician', 'assistant', 'viewer']

/**
 * POST /api/team/invite  { email, role }
 *
 * Adds a teammate to the caller's practice. Seats are free and unlimited —
 * Dentin bills per location, not per person, because a practice that hides
 * the software from its assistants gets worse counts.
 *
 * The invitee is created and attached to the practice immediately, so when
 * they follow the emailed link and set a password they land straight in the
 * app with the right access — no separate acceptance step to get lost in.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const role = String(req.body?.role ?? 'assistant')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(res, 400, { error: 'That does not look like an email address' })
  }
  if (!ASSIGNABLE.includes(role)) return json(res, 400, { error: 'Unknown role' })

  try {
    const supabase = userClient(req)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return json(res, 401, { error: 'Sign in first' })

    const { data: me, error: meError } = await supabase
      .from('profiles')
      .select('practice_id, role')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (meError) return json(res, 500, { error: meError.message })
    if (!me?.practice_id) return json(res, 400, { error: 'Finish practice setup first' })
    if (!CAN_INVITE.includes(me.role)) {
      return json(res, 403, { error: 'Only the owner or a manager can invite people' })
    }

    const admin = adminClient()

    // Already a Dentin user? Attach them if they are unattached; never move
    // someone out of a practice they already belong to.
    const { data: existing } = await admin
      .from('profiles')
      .select('id, practice_id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      if (existing.practice_id && existing.practice_id !== me.practice_id) {
        return json(res, 409, { error: 'That person already belongs to another practice' })
      }
      if (existing.practice_id === me.practice_id) {
        return json(res, 409, { error: 'They are already on your team' })
      }
      const { error } = await admin
        .from('profiles')
        .update({ practice_id: me.practice_id, role })
        .eq('id', existing.id)
      if (error) return json(res, 500, { error: error.message })
      return json(res, 200, { ok: true, attached: true })
    }

    const origin = `https://${req.headers.host}`
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password?invite=1`,
    })
    if (inviteError) return json(res, 400, { error: inviteError.message })

    // The signup trigger created their profile; point it at this practice.
    const { error: attachError } = await admin
      .from('profiles')
      .update({ practice_id: me.practice_id, role })
      .eq('id', invited.user.id)
    if (attachError) return json(res, 500, { error: attachError.message })

    return json(res, 200, { ok: true, invited: true })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
