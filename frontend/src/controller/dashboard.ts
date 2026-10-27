import type { Route } from '@/api-map/types'
import type { CargoLot } from '@/plan/model'
import { fail, ok } from '@/api/result'
import { ruoyiGet, type RuoyiResult } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { brief, num, objectRows, text } from '@/controller/shared/coerce'
import { dictOf } from '@/controller/shared/dict'
import { areaRows, warehouseRows } from '@/controller/shared/catalog'
import { homeLot, homeSource } from '@/controller/inventory'
import type { AreaInventoryDto, InventorySumDto, ReceiptDailyWeightDto } from '@/typings/openapi'

/** 驾驶舱：原料/成品湿干重汇总。 */
async function cockpitWeight() {
  const result = await ruoyiGet<InventorySumDto, InventorySumDto>('/wms/home/weight')
  if (!result.ok) return fail(brief(result.message))
  const data = (result.data && typeof result.data === 'object' ? result.data : {}) as InventorySumDto
  return ok({
    rawWet: num(data.wetWeight) ?? 0,
    rawDry: num(data.dryWeight) ?? 0,
    fgWet: num(data.prodWetWeight) ?? 0,
    fgDry: num(data.prodDryWeight) ?? 0,
  })
}

/** 从若依结果中提取每日入库干重行。 */
function receiptDailyRows(result: RuoyiResult<ReceiptDailyWeightDto>) {
  if (result.rows.length) return result.rows
  const data = result.data
  if (Array.isArray(data)) return objectRows(data) as ReceiptDailyWeightDto[]
  if (!data || typeof data !== 'object') return [] as ReceiptDailyWeightDto[]
  const bag = data as ReceiptDailyWeightDto
  if (bag.arrivalDate != null || bag.totalDryWeight != null) return [bag]
  return []
}

/** 截取到货日为 MM-DD。 */
function receiptDay(value: unknown) {
  const raw = text(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(5, 10) : raw
}

/** 驾驶舱：每日入库干重。 */
async function cockpitReceiptDaily() {
  const result = await ruoyiGet<ReceiptDailyWeightDto, ReceiptDailyWeightDto[]>('/wms/home/receiptDailyWeight')
  if (!result.ok) return fail(brief(result.message))
  return ok(receiptDailyRows(result).map((row) => ({
    day: receiptDay(row.arrivalDate),
    dry: num(row.totalDryWeight) ?? 0,
  })))
}

/** 驾驶舱：堆位库存分布。 */
async function cockpitAreas() {
  const [result, areas, houses, categories] = await Promise.all([
    ruoyiGet<AreaInventoryDto>('/wms/home/areas'),
    areaRows(),
    warehouseRows(),
    dictOf('wms_item_category'),
  ])
  if (!result.ok) return fail(brief(result.message))
  const lots = homeSource(result).map((row) => homeLot(row, objectRows(areas), objectRows(houses), categories)).filter((lot): lot is CargoLot => Boolean(lot))
  return ok(lots)
}

/** 驾驶舱路由表 */
export const dashboardRoutes: Route[] = [
  { method: 'GET', match: '/dashboard/weight', handle: () => cockpitWeight() },
  { method: 'GET', match: '/dashboard/receipt-daily', handle: () => cockpitReceiptDaily() },
  { method: 'GET', match: '/dashboard/areas', handle: () => cockpitAreas() },
]
