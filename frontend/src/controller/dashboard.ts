import type { Route } from '@/api-map/types'
import type { CargoLot } from '@/plan/model'
import { fail, ok } from '@/api/result'
import { ruoyiGet, type RuoyiResult } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { brief, num, objectRows, text } from '@/controller/shared/coerce'
import { dictOf } from '@/controller/shared/dict'
import { areaRows, warehouseRows } from '@/controller/shared/catalog'
import { homeLot, homeSource } from '@/controller/inventory'

async function cockpitWeight() {
  const result = await ruoyiGet('/wms/home/weight')
  if (!result.ok) return fail(brief(result.message))
  const data = (result.data && typeof result.data === 'object' ? result.data : {}) as Row
  return ok({
    rawWet: num(data.wetWeight) ?? 0,
    rawDry: num(data.dryWeight) ?? 0,
    fgWet: num(data.prodWetWeight) ?? 0,
    fgDry: num(data.prodDryWeight) ?? 0,
  })
}

function receiptDailyRows(result: RuoyiResult) {
  if (result.rows.length) return result.rows
  const data = result.data
  if (Array.isArray(data)) return objectRows(data)
  if (!data || typeof data !== 'object') return []
  const bag = data as Row
  if (bag.arrivalDate != null || bag.totalDryWeight != null) return [bag]
  return []
}

function receiptDay(value: unknown) {
  const raw = text(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(5, 10) : raw
}

async function cockpitReceiptDaily() {
  const result = await ruoyiGet('/wms/home/receiptDailyWeight')
  if (!result.ok) return fail(brief(result.message))
  return ok(receiptDailyRows(result).map((row) => ({
    day: receiptDay(row.arrivalDate),
    dry: num(row.totalDryWeight) ?? 0,
  })))
}

async function cockpitAreas() {
  const [result, areas, houses, categories] = await Promise.all([
    ruoyiGet('/wms/home/areas'),
    areaRows(),
    warehouseRows(),
    dictOf('wms_item_category'),
  ])
  if (!result.ok) return fail(brief(result.message))
  const lots = homeSource(result).map((row) => homeLot(row, areas, houses, categories)).filter((lot): lot is CargoLot => Boolean(lot))
  return ok(lots)
}

export const dashboardRoutes: Route[] = [
  { method: 'GET', match: '/dashboard/weight', handle: () => cockpitWeight() },
  { method: 'GET', match: '/dashboard/receipt-daily', handle: () => cockpitReceiptDaily() },
  { method: 'GET', match: '/dashboard/areas', handle: () => cockpitAreas() },
]
