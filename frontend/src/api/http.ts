import { handleMock } from '@/mock/handle'
import type { ApiResult } from '@/types'
import { handleLive } from './fenglian'

const LIVE_AUTH = new Set(['/auth/login', '/auth/captcha', '/auth/logout', '/auth/password'])

/** 关闭 mock 后，白名单里的模块走丰联接口；文档未覆盖的路径仍走本地 mock。 */
export function useLiveApi() {
  return import.meta.env.VITE_USE_MOCK === 'false'
}

/** 登录、验证码、退出、修改密码始终请求丰联，不随其它模块的 mock 开关。 */
export function useLiveAuth() {
  return true
}

/** 当前模块是否已列入 VITE_LIVE_MODULES。登录三条路径不走这里。 */
export function isLiveModule(name: string) {
  if (!useLiveApi()) return false
  const raw = import.meta.env.VITE_LIVE_MODULES || ''
  return raw.split(',').map((item) => item.trim()).filter(Boolean).includes(name)
}

function moduleFor(path: string) {
  if (path === '/auth/users' || path.startsWith('/auth/users/') || path.startsWith('/roles/')) return 'auth'
  if (path.startsWith('/settings/')) return 'settings'
  if (path.startsWith('/warehouses/stacks')) return 'stacks'
  if (path.startsWith('/warehouses')) return 'warehouses'
  if (path === '/materials' || path.startsWith('/materials/')) return 'materials'
  if (path.startsWith('/shipping-methods')) return 'shipping'
  if (path.startsWith('/partners')) return 'partners'
  if (path.startsWith('/bonded-books')) return 'bonded'
  if (path.startsWith('/inbound')) return 'inbound'
  if (path.startsWith('/ocr/')) return 'ocr'
  if (path.startsWith('/audit-logs')) return 'audit'
  if (path.startsWith('/dicts')) return 'dicts'
  if (path === '/floor-plans' || path.startsWith('/floor-plans/')) return 'floor'
  return ''
}

export async function request<T = unknown>(
  method: string,
  url: string,
  options?: { params?: Record<string, unknown>; body?: unknown },
): Promise<ApiResult<T>> {
  const path = url.split('?')[0]
  const moduleName = moduleFor(path)
  if ((useLiveAuth() && LIVE_AUTH.has(path)) || (moduleName && isLiveModule(moduleName))) {
    const live = await handleLive(method, url, options?.body, options?.params)
    if (live) return live as ApiResult<T>
  }
  return handleMock(method, url, options?.body, options?.params) as ApiResult<T>
}
