import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import TabBar from '@/components/ios/TabBar'
import { ToastProvider } from '@/components/ios/Toast'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { useData } from '@/hooks/useData'
import { listAlerts } from '@/lib/repository'

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
const Expiry = lazy(() => import('@/pages/Expiry'))
const Team = lazy(() => import('@/pages/Team'))
const Procedures = lazy(() => import('@/pages/Procedures'))
const MarketScan = lazy(() => import('@/pages/MarketScan'))
const Search = lazy(() => import('@/pages/Search'))
const Settings = lazy(() => import('@/pages/Settings'))
const Welcome = lazy(() => import('@/pages/Welcome'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))

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

function RouteShell({ children }) {
  const location = useLocation()
  const isRoot = ROOTS.includes(location.pathname)

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={location.pathname}
        initial={isRoot ? { opacity: 0 } : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={isRoot ? { opacity: 0 } : { opacity: 0, x: 12 }}
        transition={{ duration: isRoot ? 0.18 : 0.28, ease: [0.32, 0.72, 0, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function AppRoutes() {
  const { session, loading, onboarded } = useAuth()
  const { data: alerts } = useData(() => (session ? listAlerts() : Promise.resolve([])), [session])
  const urgent = (alerts ?? []).filter((a) => a.severity === 'critical').length

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

  return (
    <>
      <Suspense fallback={<Loading />}>
        <RouteShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
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
            <Route path="/expiry" element={<Expiry />} />
            <Route path="/team" element={<Team />} />
            <Route path="/procedures" element={<Procedures />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Settings />} />
            {/* Still routable when the gate is bypassed, so both flows can be
                demoed without turning sign-in back on. */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteShell>
      </Suspense>

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
