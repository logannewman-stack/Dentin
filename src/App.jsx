import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import TabBar from '@/components/ui/TabBar'
import SideNav from '@/components/ui/SideNav'
import DemoBanner from '@/components/DemoBanner'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { useSkin } from '@/lib/skin'
import { useData } from '@/hooks/useData'
import { ACTIVE_SUB_STATUSES, getSubscription, listAlerts } from '@/lib/repository'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const ItemDetail = lazy(() => import('@/pages/ItemDetail'))
const Scan = lazy(() => import('@/pages/Scan'))
const Orders = lazy(() => import('@/pages/Orders'))
const OrderDetail = lazy(() => import('@/pages/OrderDetail'))
const Reorder = lazy(() => import('@/pages/Reorder'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Equipment = lazy(() => import('@/pages/Equipment'))
const Insights = lazy(() => import('@/pages/Insights'))
const Catalog = lazy(() => import('@/pages/Catalog'))
const Vendors = lazy(() => import('@/pages/Vendors'))
const PriceCheck = lazy(() => import('@/pages/PriceCheck'))
const ContractImport = lazy(() => import('@/pages/ContractImport'))
const Benchmark = lazy(() => import('@/pages/Benchmark'))
const Value = lazy(() => import('@/pages/Value'))
const Invoices = lazy(() => import('@/pages/Invoices'))
const InvoiceImport = lazy(() => import('@/pages/InvoiceImport'))
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail'))
const Expiry = lazy(() => import('@/pages/Expiry'))
const Team = lazy(() => import('@/pages/Team'))
const Account = lazy(() => import('@/pages/Account'))
const Procedures = lazy(() => import('@/pages/Procedures'))
const MarketScan = lazy(() => import('@/pages/MarketScan'))
const Search = lazy(() => import('@/pages/Search'))
const Settings = lazy(() => import('@/pages/Settings'))
const PaymentMethods = lazy(() => import('@/pages/PaymentMethods'))
const Compliance = lazy(() => import('@/pages/Compliance'))
const InventoryImport = lazy(() => import('@/pages/InventoryImport'))
const Billing = lazy(() => import('@/pages/Billing'))
const Welcome = lazy(() => import('@/pages/Welcome'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Paywall = lazy(() => import('@/pages/Paywall'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))

function Loading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-canvas">
      <div className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-brand-600/25 border-t-brand-600" />
    </div>
  )
}

/**
 * Push transition. Detail routes slide in from the trailing edge and the tab
 * roots cross-fade, which is how iOS distinguishes drilling in from switching
 * context.
 */
const ROOTS = ['/', '/inventory', '/orders', '/insights', '/scan']

/**
 * Navigation transitions.
 *
 * UINavigationController does three different things and this does the same
 * three. Pushing a detail slides it in from the right edge while the screen
 * behind it drifts a quarter-width left and dims — that parallax is what tells
 * you the old screen is still there, underneath. Popping runs it backwards.
 * Switching tabs does neither: iOS crossfades those, and sliding between
 * siblings implies a hierarchy that is not there.
 *
 * `mode="popLayout"` takes the leaving screen out of flow so the two overlap
 * during the handover instead of stacking.
 */
const PUSH_EASE = [0.32, 0.72, 0, 1]

function RouteShell({ children }) {
  const location = useLocation()
  const navType = useNavigationType()
  const [skin] = useSkin()
  const isRoot = ROOTS.includes(location.pathname)

  // Root-to-root is a tab switch. Testing only the incoming path would call a
  // pop back to Today a tab switch and drop the slide.
  const prevPath = useRef(location.pathname)
  const cameFromRoot = ROOTS.includes(prevPath.current)
  useEffect(() => {
    prevPath.current = location.pathname
  }, [location.pathname])

  const tabSwitch = isRoot && cameFromRoot
  const popping = navType === 'POP'

  // Motion halved is part of the software language — screens change with a
  // short nudge rather than sliding a full width across the display.
  const variants = skin === 'software'
    ? {
        initial: isRoot ? { opacity: 0 } : { opacity: 0, x: 28 },
        animate: { opacity: 1, x: 0 },
        exit: isRoot ? { opacity: 0 } : { opacity: 0, x: 12 },
      }
    : tabSwitch
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0 },
      }
    : {
        initial: { x: popping ? '-25%' : '100%', opacity: popping ? 0.6 : 1 },
        animate: { x: 0, opacity: 1 },
        exit: { x: popping ? '100%' : '-25%', opacity: popping ? 1 : 0.6 },
      }

  return (
    // Clipped: a screen parked at 100% would otherwise widen the document and
    // hand every page a horizontal scrollbar mid-transition.
    <div className="overflow-x-clip">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{
            duration: skin === 'software' ? (isRoot ? 0.18 : 0.28) : tabSwitch ? 0.16 : 0.34,
            ease: PUSH_EASE,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function AppRoutes() {
  const { session, loading, onboarded } = useAuth()
  const location = useLocation()
  const { data: alerts } = useData(() => (session ? listAlerts() : Promise.resolve([])), [session])
  const urgent = (alerts ?? []).filter((a) => a.severity === 'critical').length

  // Subscription state gates the whole app once setup is done. `subKey`
  // re-runs the read when the paywall asks ("already paid? check again").
  const [subKey, setSubKey] = useState(0)
  const recheckSub = useCallback(() => setSubKey((k) => k + 1), [])
  const { data: sub, loading: subLoading } = useData(
    () => (session && onboarded ? getSubscription() : Promise.resolve(null)),
    [session, onboarded, subKey],
  )

  // Password recovery sits outside every gate: the link signs the user in
  // with a recovery session, and they must be able to set a new password
  // whether or not they are onboarded or paying.
  if (location.pathname === '/reset-password') {
    return (
      <Suspense fallback={<Loading />}>
        <ResetPassword />
      </Suspense>
    )
  }

  if (loading) return <Loading />

  // Signed out — the welcome screen owns the whole surface.
  if (!session) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Signed in, but whether the practice is set up is not known yet — wait
  // rather than flashing the wizard at an already-onboarded user.
  if (onboarded == null) return <Loading />

  // Signed in but the practice is not set up yet.
  if (!onboarded) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Set up but not paying: the wall. Nothing is deleted — the practice's
  // data waits exactly where it was until the subscription resumes.
  if (subLoading) return <Loading />
  if (!ACTIVE_SUB_STATUSES.includes(sub?.status)) {
    return (
      <Suspense fallback={<Loading />}>
        <Paywall
          status={sub?.status ?? 'none'}
          hasCustomer={Boolean(sub?.hasCustomer)}
          onRecheck={recheckSub}
        />
      </Suspense>
    )
  }

  return (
    <>
      <DemoBanner />
      <Suspense fallback={<Loading />}>
        <RouteShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/import" element={<InventoryImport />} />
            <Route path="/inventory/:id" element={<ItemDetail />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/price-check/:productId" element={<PriceCheck />} />
            <Route path="/search" element={<Search />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<Reorder />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/vendors/compare" element={<MarketScan />} />
            <Route path="/vendors/import" element={<ContractImport />} />
            <Route path="/vendors/benchmark" element={<Benchmark />} />
            {/* /invoices/import and /:id stay above the main /invoices list */}
            <Route path="/invoices/import" element={<InvoiceImport />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/expiry" element={<Expiry />} />
            <Route path="/team" element={<Team />} />
            <Route path="/account" element={<Account />} />
            <Route path="/procedures" element={<Procedures />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/insights/value" element={<Value />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/payments" element={<PaymentMethods />} />
            <Route path="/settings/compliance" element={<Compliance />} />
            <Route path="/settings/billing" element={<Billing />} />
            {/* Still routable when the gate is bypassed, so both flows can be
                demoed without turning sign-in back on. */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteShell>
      </Suspense>

      <SideNav badges={{ '/': urgent }} />
      <TabBar badges={{ '/': urgent }} />
    </>
  )
}

export default function App() {
  return (
    /**
     * Entrance animations run on JS transforms, which the reduced-motion CSS
     * in index.css cannot reach. Without this, a reader who asks for reduced
     * motion gets content stuck at its `initial` opacity — invisible, not just
     * unanimated. `reducedMotion="user"` snaps those elements to their final
     * state instead.
     */
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  )
}
