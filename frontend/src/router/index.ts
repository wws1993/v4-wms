import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { NAV } from '@/nav'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from '@/layouts/AdminLayout.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'
import MaterialsView from '@/views/MaterialsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import TransferView from '@/views/TransferView.vue'
import ResourceView from '@/views/ResourceView.vue'

const pages: Record<string, RouteRecordRaw['component']> = {
  dashboard: DashboardView,
  materials: MaterialsView,
  settings: SettingsView,
  transfer: TransferView,
}

const children: RouteRecordRaw[] = NAV.map((item) => ({
  path: item.path.slice(1),
  name: item.id,
  component: pages[item.id] || ResourceView,
  meta: { title: item.id === 'dashboard' ? '系统概览' : item.title, group: item.group, id: item.id, schema: item.id },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: '登录' } },
    { path: '/', component: AdminLayout, redirect: '/dashboard', children },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) return auth.user && to.path === '/login' ? '/dashboard' : true
  if (!auth.user) return '/login'
  const id = String(to.meta.id || '')
  if (id && !auth.user.pages.includes(id)) return '/dashboard'
  return true
})

export default router
