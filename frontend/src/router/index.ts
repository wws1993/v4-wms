import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { NAV, pageIdsFor } from '@/nav'
import { writeToken } from '@/api/ruoyi'
import { clearSessionClock, sessionExpired } from '@/security/session'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from '@/layouts/AdminLayout.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'
import MaterialsView from '@/views/MaterialsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import TransferView from '@/views/TransferView.vue'
import InboundView from '@/views/InboundView.vue'
import InventoryView from '@/views/InventoryView.vue'
import StocktakeView from '@/views/StocktakeView.vue'
import ProductionView from '@/views/ProductionView.vue'
import OutboundView from '@/views/OutboundView.vue'
import OcrView from '@/views/OcrView.vue'
import CustomsView from '@/views/CustomsView.vue'
import AlertsView from '@/views/AlertsView.vue'
import StacksView from '@/views/StacksView.vue'
import ResourceView from '@/views/ResourceView.vue'
import AuditView from '@/views/AuditView.vue'
import AlertLogView from '@/views/AlertLogView.vue'
import DictView from '@/views/DictView.vue'
import BondedView from '@/views/BondedView.vue'

const pages: Record<string, RouteRecordRaw['component']> = {
  dashboard: DashboardView,
  materials: MaterialsView,
  settings: SettingsView,
  stacks: StacksView,
  inbound: InboundView,
  transfer: TransferView,
  inventory: InventoryView,
  stocktake: StocktakeView,
  alerts: AlertsView,
  outbound: OutboundView,
  production: ProductionView,
  customs: CustomsView,
  ocr: OcrView,
  audit: AuditView,
  alertLogs: AlertLogView,
  dicts: DictView,
  bonded: BondedView,
}

const children: RouteRecordRaw[] = NAV.map((item) => ({
  path: item.path.slice(1),
  name: item.id,
  component: pages[item.id] || ResourceView,
  meta: { title: item.id === 'dashboard' ? '系统概览' : item.title, group: item.group, id: item.id, schema: item.id },
}))
children.push({ path: 'bonded', redirect: '/ledger/bonded' })

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: '登录' } },
    { path: '/', component: AdminLayout, redirect: '/dashboard', children },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && auth.user && sessionExpired()) {
    auth.logout()
    writeToken('')
    clearSessionClock()
    return { path: '/login', query: { reason: 'timeout' } }
  }
  if (to.meta.public) return auth.user && to.path === '/login' ? '/dashboard' : true
  if (!auth.user) return '/login'
  const id = String(to.meta.id || '')
  if (id && !pageIdsFor(auth.user).has(id)) return '/dashboard'
  return true
})

export default router
