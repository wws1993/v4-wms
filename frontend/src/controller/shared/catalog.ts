import { clearSessionList, loadSessionList, SESSION_LIST, type CacheRow } from '@/api/catalogCache'
import { ruoyiGet } from '@/api/ruoyi'
import { warehouseCodeOf } from '@/plan/model'
import type { AccountBookVo, AreaVo, ItemVo, MerchantVo, WarehouseVo } from '@/typings/openapi'
import { flat, idOf, nested, text } from './coerce'
import { labelOf } from './dict'
import type { Query, Row } from './types'

/**
 * 拉取无分页目录列表（优先 data 数组，其次 rows）。
 * @typeParam TRow OpenAPI Vo 行类型
 */
export async function catalog<TRow = Row>(path: string) {
  const result = await ruoyiGet<TRow>(path)
  if (!result.ok) return { ok: false as const, message: result.message, rows: [] as TRow[] }
  const rows = Array.isArray(result.data) ? result.data as TRow[] : result.rows
  return { ok: true as const, message: result.message, rows }
}

/** 清除仓库目录会话缓存。 */
export function clearWarehouseCache() {
  clearSessionList(SESSION_LIST.warehouse)
}

/** 拉取仓库列表（listNoPage，失败则分页兜底）。 */
export async function warehouseRows() {
  const listed = await loadSessionList(SESSION_LIST.warehouse, SESSION_LIST.warehouse, async () => {
    const cataloged = await catalog<WarehouseVo>('/wms/warehouse/listNoPage')
    let rows = cataloged.rows as CacheRow[]
    let loaded = cataloged.ok && rows.length > 0
    if (!rows.length) {
      const page = await ruoyiGet<WarehouseVo>('/wms/warehouse/list', { pageNum: 1, pageSize: 200 })
      if (page.ok) {
        rows = page.rows as CacheRow[]
        loaded = true
      }
    }
    return { ok: loaded, rows }
  })
  return listed.rows as WarehouseVo[]
}

/** 按编号/名称/id 查找仓库主键。 */
export async function findWarehouseId(name: unknown) {
  const rows = await warehouseRows()
  const raw = text(name)
  const found = rows.find((row) => text(row.warehouseCode) === raw || text(row.warehouseName) === raw || text(row.id) === raw)
  return idOf(found?.id)
}

/** 从「仓#堆位」文案取出堆位段。 */
export function areaSlot(value: string) {
  const hash = value.lastIndexOf('#')
  return (hash >= 0 ? value.slice(hash + 1) : value).trim()
}

/** 从「仓#堆位」文案取出仓标记。 */
export function areaMark(value: string) {
  const hash = value.indexOf('#')
  if (hash <= 0) return ''
  return value.slice(0, hash).replace(/^#/, '').replace(/仓$/, '')
}

/** 从堆位行嵌套仓库信息得到仓号标记。 */
export function houseMark(row: AreaVo | Row) {
  const bag = row as Row
  const house = bag.warehouse && typeof bag.warehouse === 'object' ? bag.warehouse as Row : undefined
  const name = flat(house?.warehouseCode || house?.warehouseName || (typeof bag.warehouse === 'string' ? bag.warehouse : ''))
  if (!name || /^\d+$/.test(name)) return ''
  return warehouseCodeOf(name).replace(/仓$/, '')
}

/** 读取堆位编号字段。 */
export function areaCodeValue(row: AreaVo | Row) {
  const bag = row as Row
  return flat(bag.areaCode || bag.area_code || bag.code)
}

/** 读取堆位名称字段。 */
export function areaNameValue(row: AreaVo | Row) {
  const bag = row as Row
  return flat(bag.areaName || bag.area_name || bag.name)
}

/** 清除堆位目录会话缓存。 */
export function clearAreaCache() {
  clearSessionList(SESSION_LIST.area)
}

/** 拉取全量堆位（listNoPage，失败则分页扫）。 */
export async function areaRows() {
  const listed = await loadSessionList(SESSION_LIST.area, SESSION_LIST.area, async () => {
    const rows: CacheRow[] = []
    const seen = new Set<string>()
    const push = (list: AreaVo[]) => {
      for (const row of list) {
        const key = flat(row.id) || areaCodeValue(row) || areaNameValue(row)
        if (!key || seen.has(key)) continue
        seen.add(key)
        rows.push(row as CacheRow)
      }
    }
    const list = await catalog<AreaVo>('/wms/area/listNoPage')
    let loaded = list.ok
    if (list.ok) push(list.rows)
    if (!rows.length) {
      let paged = 0
      for (let page = 1; page <= 20; page += 1) {
        const result = await ruoyiGet<AreaVo>('/wms/area/list', { pageNum: page, pageSize: 200 })
        if (!result.ok) break
        loaded = true
        if (!result.rows.length) break
        push(result.rows)
        paged += result.rows.length
        if (result.rows.length < 200 || (result.total > 0 && paged >= result.total)) break
      }
    }
    return { ok: loaded, rows }
  })
  return listed.rows as AreaVo[]
}

/** 规范化堆位文案便于比较。 */
function normStack(value: string) {
  return value.replace(/＃/g, '#').replace(/\s+/g, '').toUpperCase()
}

/** 堆位编号/名称/id 是否与原文精确匹配。 */
function areaExact(row: AreaVo, raw: string) {
  const want = normStack(raw)
  return [areaCodeValue(row), areaNameValue(row), flat(row.id)].some((item) => normStack(item) === want)
}

/** 堆位是否命中槽位段。 */
function areaSlotHit(row: AreaVo, slot: string) {
  if (!slot) return false
  const want = normStack(slot)
  const code = areaCodeValue(row)
  const name = areaNameValue(row)
  return [code, name, areaSlot(code), areaSlot(name)].some((item) => item && (normStack(item) === want || normStack(item).endsWith(`#${want}`)))
}

/** 按仓标记反查仓库 id。 */
async function warehouseIdByMark(mark: string) {
  const rows = await warehouseRows()
  const found = rows.find((row) => {
    const code = flat(row.warehouseCode)
    const name = flat(row.warehouseName)
    const marks = [code, name].map((item) => warehouseCodeOf(item).replace(/仓$/, ''))
    return marks.includes(mark) || code === mark || name === mark || code === `${mark}仓` || name === `${mark}#` || code === `#${mark}` || name === `#${mark}`
  })
  return found?.id
}

/** 按仓库 id 过滤堆位列表。 */
export async function listAreas(params: Query) {
  const rows = await areaRows()
  const warehouseId = text(params.warehouseId)
  if (!warehouseId) return rows
  return rows.filter((row) => text(row.warehouseId) === warehouseId || text(nested(row, 'warehouse')?.id) === warehouseId)
}

/** 在堆位列表中按编号/槽位/仓标记匹配一行。 */
function matchArea(rows: AreaVo[], code: unknown) {
  const raw = flat(code)
  if (!raw) return undefined
  const byId = rows.find((row) => flat(row.id) === raw)
  if (byId) return byId
  const exact = rows.find((row) => areaExact(row, raw))
  if (exact) return exact
  const slot = areaSlot(raw)
  const mark = areaMark(raw)
  const hits = rows.filter((row) => areaSlotHit(row, slot))
  if (!hits.length) return undefined
  if (!mark) return hits.length === 1 ? hits[0] : undefined
  const want = normStack(mark)
  const scoped = hits.filter((row) => {
    if (normStack(houseMark(row)) === want) return true
    const codeText = normStack(areaCodeValue(row) || areaNameValue(row))
    return codeText.startsWith(`${want}#`) || codeText.startsWith(`#${want}#`)
  })
  if (scoped.length) return scoped[0]
  return undefined
}

/** 按编号/名称/id 查找堆位，必要时打详情或按仓缩小范围。 */
export async function findArea(code: unknown) {
  const raw = flat(code)
  if (!raw) return undefined
  const rows = await areaRows()
  const matched = matchArea(rows, raw)
  if (matched) return matched
  if (/^\d+$/.test(raw)) {
    const detail = await ruoyiGet<AreaVo, AreaVo>(`/wms/area/${raw}`)
    const data = detail.ok && detail.data && typeof detail.data === 'object' ? detail.data : undefined
    if (data && (data.id != null || areaCodeValue(data) || areaNameValue(data))) return data
  }
  const mark = areaMark(raw)
  const slot = areaSlot(raw)
  if (!mark) return undefined
  const houseId = await warehouseIdByMark(mark)
  if (houseId == null) return undefined
  const houseRows = rows.filter((row) => flat(row.warehouseId) === flat(houseId))
  return houseRows.find((row) => areaExact(row, raw) || areaSlotHit(row, slot))
    || (await listAreas({ warehouseId: idOf(houseId) })).find((row) => areaExact(row, raw) || areaSlotHit(row, slot))
}

/** 清除物料目录会话缓存。 */
export function clearItemCache() {
  clearSessionList(SESSION_LIST.item)
}

/** 拉取物料目录（带缓存）。 */
export async function itemCatalog() {
  const listed = await loadSessionList(SESSION_LIST.item, SESSION_LIST.item, async () => {
    const result = await catalog<ItemVo>('/wms/item/listNoPage')
    return { ok: result.ok, rows: result.ok ? result.rows as CacheRow[] : [] }
  })
  return { ok: listed.ok, rows: listed.rows as ItemVo[] }
}

/** 物料目录行列表。 */
export async function itemCatalogRows() {
  return (await itemCatalog()).rows
}

/** 按 id/编码/名称/矿区查找物料。 */
export async function findItem(value: unknown) {
  const rows = await itemCatalogRows()
  const raw = text(value)
  return rows.find((row) => (
    text(row.id) === raw
    || text((row as Row).itemCode) === raw
    || text(row.itemName) === raw
    || text(row.mineralSource) === raw
    || text((row as Row).mineArea) === raw
  ))
}

/** 拉取往来单位目录（带缓存）。 */
export async function merchantRows() {
  const listed = await loadSessionList(SESSION_LIST.merchant, SESSION_LIST.merchant, async () => {
    const result = await catalog<MerchantVo>('/wms/merchant/listNoPage')
    return { ok: result.ok, rows: result.rows as CacheRow[] }
  })
  return { ok: listed.ok, rows: listed.rows as MerchantVo[] }
}

/** 清除往来单位目录会话缓存。 */
export function clearMerchantCache() {
  clearSessionList(SESSION_LIST.merchant)
}

/** 按名称/编码/id 查找往来单位。 */
export async function findMerchant(name: unknown) {
  const list = await merchantRows()
  const raw = text(name)
  return list.rows.find((row) => text(row.merchantName) === raw || text(row.merchantCode) === raw || text(row.id) === raw)
}

/** 按编号/名称/id 查找账册。 */
export async function findBook(name: unknown) {
  const list = await catalog<AccountBookVo>('/wms/accountBook/listNoPage')
  const raw = text(name)
  return list.rows.find((row) => text(row.accountCode) === raw || text(row.accountName) === raw || text(row.id) === raw)
}

/** 加载仓库列表（别名）。 */
export async function loadHouses() {
  return warehouseRows()
}

/** 将片区字典值转为展示标签。 */
export function areaLabelText(value: unknown, areaNames: { label: string; value: string }[] = []) {
  const raw = text(value)
  if (!raw) return ''
  return labelOf(areaNames, raw) || raw
}

/** 行上的片区标识是否匹配目标标签。 */
export function areaLabelHit(row: Row, want: string, areaNames: { label: string; value: string }[] = []) {
  if (!want) return true
  const label = areaLabelText(row.areaLabel, areaNames)
  const raw = text(row.areaLabel)
  return label === want || raw === want
}
