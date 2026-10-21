import type { Route } from './types'
import { routes } from './register'

export type { Ctx, Handler, Route } from './types'
export { routes }

export async function dispatch(
  method: string,
  url: string,
  body?: unknown,
  params?: Record<string, unknown>,
) {
  const path = url.split('?')[0]
  const payload = (body || {}) as Record<string, unknown>
  const query = params || {}
  const upper = method.toUpperCase()

  for (const route of routes as Route[]) {
    if (route.method !== upper) continue
    if (typeof route.match === 'string') {
      if (route.match !== path) continue
      return route.handle({ path, method: upper, query, body: payload, params: [] })
    }
    const hit = path.match(route.match)
    if (!hit) continue
    return route.handle({
      path,
      method: upper,
      query,
      body: payload,
      params: hit.slice(1).map((item) => decodeURIComponent(item)),
    })
  }
  return null
}
