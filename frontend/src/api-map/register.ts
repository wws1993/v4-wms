import type { Route } from './types'
import { authRoutes } from '@/controller/auth'
import { roleRoutes } from '@/controller/role'
import { menuRoutes } from '@/controller/menu'
import { settingsRoutes } from '@/controller/settings'
import { floorRoutes } from '@/controller/floor'
import { dictRoutes } from '@/controller/dict'
import { warehouseRoutes } from '@/controller/warehouse'
import { materialRoutes } from '@/controller/material'
import { shippingRoutes } from '@/controller/shipping'
import { partnerRoutes } from '@/controller/partner'
import { bondedRoutes } from '@/controller/bonded'
import { inboundRoutes } from '@/controller/inbound'
import { dashboardRoutes } from '@/controller/dashboard'
import { inventoryRoutes } from '@/controller/inventory'
import { transferRoutes } from '@/controller/transfer'
import { stocktakeRoutes } from '@/controller/stocktake'
import { ocrRoutes } from '@/controller/ocr'
import { warningRoutes } from '@/controller/warning'
import { auditRoutes } from '@/controller/audit'
import { productionRoutes } from '@/controller/production'
import { outboundRoutes } from '@/controller/outbound'

/** Exact handleLive registration order */
export const routes: Route[] = [
  ...authRoutes,
  ...roleRoutes,
  ...menuRoutes,
  ...settingsRoutes,
  ...floorRoutes,
  ...dictRoutes,
  ...warehouseRoutes,
  ...materialRoutes,
  ...shippingRoutes,
  ...partnerRoutes,
  ...bondedRoutes,
  ...inboundRoutes,
  ...dashboardRoutes,
  ...inventoryRoutes,
  ...transferRoutes,
  ...stocktakeRoutes,
  ...ocrRoutes,
  ...warningRoutes,
  ...auditRoutes,
  ...productionRoutes,
  ...outboundRoutes,
]
