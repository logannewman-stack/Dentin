import { adminClient, json, userClient } from '../_lib/supabase.js'

/**
 * POST /api/team/remove  { userId }
 *
 * Takes someone off the practice. Their account survives and their name
 * stays on every movement they recorded — an audit trail with holes in it is
 * worse than no audit trail — they simply lose access to this practice.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const userId = String(req.body?.userId ?? '')
  if (!userId) return json(res, 400, { error: 'Which person?' })

  try {
    const supabase = userClient(req)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return json(res, 401, { error: 'Sign in first' })
    if (auth.user.id === userId) {
      return json(res, 400, { error: 'You cannot remove yourself — transfer ownership instead' })
    }

    const { data: me } = await supabase
      .from('profiles')
      .select('practice_id, role')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (!me?.practice_id) return json(res, 400, { error: 'Finish practice setup first' })
    if (!['owner', 'manager'].includes(me.role)) {
      return json(res, 403, { error: 'Only the owner or a manager can remove people' })
    }

    const admin = adminClient()
    const { data: target } = await admin
      .from('profiles')
      .select('id, practice_id, role')
      .eq('id', userId)
      .maybeSingle()
    if (!target || target.practice_id !== me.practice_id) {
      return json(res, 404, { error: 'That person is not on your team' })
    }
    if (target.role === 'owner') {
      return json(res, 403, { error: 'The owner cannot be removed' })
    }

    const { error } = await admin.from('profiles').update({ practice_id: null }).eq('id', userId)
    if (error) return json(res, 500, { error: error.message })
    return json(res, 200, { ok: true })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
}
