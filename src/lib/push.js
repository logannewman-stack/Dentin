import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Web push.
 *
 * On iOS this only works once the practice adds Dentin to the Home Screen —
 * Safari does not expose the Push API to a browser tab. `pushSupport()`
 * reports that precisely so the UI can explain it rather than silently fail.
 */
export function pushSupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'unavailable' }

  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

  if (isIos && !standalone) {
    return { supported: false, reason: 'ios-needs-install', standalone }
  }
  if (!hasApi) return { supported: false, reason: 'unsupported', standalone }
  return { supported: true, reason: null, standalone }
}

export function permission() {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush() {
  const support = pushSupport()
  if (!support.supported) throw new Error(support.reason)

  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapid) throw new Error('missing-vapid-key')

  const result = await Notification.requestPermission()
  if (result !== 'granted') throw new Error('permission-denied')

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }))

  // Demo mode has no backend to store the endpoint against.
  if (isSupabaseConfigured && supabase) {
    const json = subscription.toJSON()
    const { data: profile } = await supabase
      .from('profiles')
      .select('practice_id')
      .single()

    const { data: session } = await supabase.auth.getUser()

    await supabase.from('push_subscriptions').upsert(
      {
        practice_id: profile?.practice_id,
        user_id: session?.user?.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    )
  }

  return subscription
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  if (isSupabaseConfigured && supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
}

/** Local notification so the practice can confirm alerts actually arrive. */
export async function sendTestNotification() {
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('Dentin', {
    body: 'Alerts are on. You will hear from us when stock runs low.',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'dentin-test',
  })
}
