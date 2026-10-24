import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { text } from '@/controller/shared/coerce'
import { catalog } from '@/controller/shared/catalog'
import type { ShippingMethodVo } from '@/typings/openapi'

/** 运输方式路由表 */
export const shippingRoutes: Route[] = [
  { method: 'GET', match: '/shipping-methods', handle: async () => {
    const list = await catalog<ShippingMethodVo>('/wms/shippingMethod/listNoPage')
    if (!list.ok) return fail(list.message)
    const rows = list.rows.map((row) => ({
      id: text(row.id),
      name: text(row.shippingMethodName),
      containers: row.areaNumber ?? 0,
    }))
    return ok({ list: rows, total: rows.length, page: 1, pageSize: rows.length || 1 })
  } },
]
