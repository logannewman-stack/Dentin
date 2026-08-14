import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import TabBar from '@/components/ios/TabBar'
import { useData } from '@/hooks/useData'
import { listAlerts } from '@/lib/repository'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const ItemDetail = lazy(() => import('@/pages/ItemDetail'))
const Scan = lazy(() => import('@/pages/Scan'))
const Orders = lazy(() => import('@/pages/Orders'))
const Reorder = lazy(() => import('@/pages/Reorder'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Equipment = lazy(() => import('@/pages/Equipment'))
const Settings = lazy(() => import('@/pages/Settings'))

function Loading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-canvas">
      <div className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-brand-600/25 border-t-brand-600" />
    </div>
  )
}

export default function App() {
  const { data: alerts } = useData(() => listAlerts(), [])
  const urgent = (alerts ?? []).filter((a) => a.severity === 'critical').length

  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/:id" element={<ItemDetail />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<Reorder />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <TabBar badges={{ '/': urgent }} />
    </>
  )
}
