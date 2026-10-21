import { clearSessionList, loadSessionList, SESSION_LIST } from '@/api/catalogCache'
import { ruoyiGet } from '@/api/ruoyi'
import { warehouseCodeOf } from '@/plan/model'
import { flat, idOf, nested, text } from './coerce'
import { labelOf } from './dict'
import type { Query, Row } from './types'

export async function catalog(path: string) {
  const result = await ruoyiGet(path)
  if (!result.ok) return { ok: false as const, message: result.message, rows: [] as Row[] }
  const rows = Array.isArray(result.data) ? result.data as Row[] : result.rows
  return { ok: true as const, message: result.message, rows }
}

export function clearWarehouseCache() {
  clearSessionList(SESSION_LIST.warehouse)
}

export async function warehouseRows() {
  const listed = await loadSessionList(SESSION_LIST.warehouse, SESSION_LIST.warehouse, async () => {
    const cataloged = await catalog('/wms/warehouse/listNoPage')
    let rows = cataloged.rows
    let loaded = cataloged.ok && rows.length > 0
    if (!rows.length) {
      const page = await ruoyiGet('/wms/warehouse/list', { pageNum: 1, pageSize: 200 })
      if (page.ok) {
        rows = page.rows
        loaded = true
      }
    }
    return { ok: loaded, rows }
  })
  return listed.rows
}

export async function findWarehouseId(name: unknown) {
  const rows = await warehouseRows()
  const raw = text(name)
  const found = rows.find((row) => text(row.warehouseCode) === raw || text(row.warehouseName) === raw || text(row.id) === raw)
  return idOf(found?.id)
}

export function areaSlot(value: string) {
  const hash = value.lastIndexOf('#')
  return (hash >= 0 ? value.slice(hash + 1) : value).trim()
}

export function areaMark(value: string) {
  const hash = value.indexOf('#')
  if (hash <= 0) return ''
  return value.slice(0, hash).replace(/^#/, '').replace(/仓$/, '')
}

export function houseMark(row: Row) {
  const house = row.warehouse && typeof row.warehouse === 'object' ? row.warehouse as Row : undefined
  const name = flat(house?.warehouseCode || house?.warehouseName || (typeof row.warehouse === 'string' ? row.warehouse : ''))
  if (!name || /^\d+$/.test(name)) return ''
  return warehouseCodeOf(name).replace(/仓$/, '')
}

export function areaCodeValue(row: Row) {
  return flat(row.areaCode || row.area_code || row.code)
}

export function areaNameValue(row: Row) {
  return flat(row.areaName || row.area_name || row.name)
}

export function clearAreaCache() {
  clearSessionList(SESSION_LIST.area)
}

export async function areaRows() {
  const listed = await loadSessionList(SESSION_LIST.area, SESSION_LIST.area, async () => {
    const rows: Row[] = []
    const seen = new Set<string>()
    const push = (list: Row[]) => {
      for (const row of list) {
        const key = flat(row.id) || areaCodeValue(row) || areaNameValue(row)
        if (!key || seen.has(key)) continue
        seen.add(key)
        rows.push(row)
      }
    }
    const list = await catalog('/wms/area/listNoPage')
    let loaded = list.ok
    if (list.ok) push(list.rows)
    if (!rows.length) {
      let paged = 0
      for (let page = 1; page <= 20; page += 1) {
        const result = await ruoyiGet('/wms/area/list', { pageNum: page, pageSize: 200 })
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
  return listed.rows
}

function normStack(value: string) {
  return value.replace(/＃/g, '#').replace(/\s+/g, '').toUpperCase()
}

function areaExact(row: Row, raw: string) {
  const want = normStack(raw)
  return [areaCodeValue(row), areaNameValue(row), flat(row.id)].some((item) => normStack(item) === want)
}

function areaSlotHit(row: Row, slot: string) {
  if (!slot) return false
  const want = normStack(slot)
  const code = areaCodeValue(row)
  const name = areaNameValue(row)
  return [code, name, areaSlot(code), areaSlot(name)].some((item) => item && (normStack(item) === want || normStack(item).endsWith(`#${want}`)))
}

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

export async function listAreas(params: Query) {
  const rows = await areaRows()
  const warehouseId = text(params.warehouseId)
  if (!warehouseId) return rows
  return rows.filter((row) => text(row.warehouseId) === warehouseId || text(nested(row, 'warehouse')?.id) === warehouseId)
}

function matchArea(rows: Row[], code: unknown) {
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

export async function findArea(code: unknown) {
  const raw = flat(code)
  if (!raw) return undefined
  const rows = await areaRows()
  const matched = matchArea(rows, raw)
  if (matched) return matched
  if (/^\d+$/.test(raw)) {
    const detail = await ruoyiGet(`/wms/area/${raw}`)
    const data = detail.ok && detail.data && typeof detail.data === 'object' ? detail.data as Row : undefined
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

export function clearItemCache() {
  clearSessionList(SESSION_LIST.item)
}

export async function itemCatalog() {
  const listed = await loadSessionList(SESSION_LIST.item, SESSION_LIST.item, async () => {
    const result = await catalog('/wms/item/listNoPage')
    return { ok: result.ok, rows: result.ok ? result.rows : [] }
  })
  return listed
}

export async function itemCatalogRows() {
  return (await itemCatalog()).rows
}

export async function findItem(value: unknown) {
  const rows = await itemCatalogRows()
  const raw = text(value)
  return rows.find((row) => (
    text(row.id) === raw
    || text(row.itemCode) === raw
    || text(row.itemName) === raw
    || text(row.mineralSource) === raw
    || text(row.mineArea) === raw
  ))
}

export async function merchantRows() {
  const listed = await loadSessionList(SESSION_LIST.merchant, SESSION_LIST.merchant, async () => {
    const result = await catalog('/wms/merchant/listNoPage')
    return { ok: result.ok, rows: result.rows }
  })
  return listed
}

export function clearMerchantCache() {
  clearSessionList(SESSION_LIST.merchant)
}

export async function findMerchant(name: unknown) {
  const list = await merchantRows()
  const raw = text(name)
  return list.rows.find((row) => text(row.merchantName) === raw || text(row.merchantCode) === raw || text(row.id) === raw)
}

export async function findBook(name: unknown) {
  const list = await catalog('/wms/accountBook/listNoPage')
  const raw = text(name)
  return list.rows.find((row) => text(row.accountCode) === raw || text(row.accountName) === raw || text(row.id) === raw)
}

export async function loadHouses() {
  return warehouseRows()
}

export function areaLabelText(value: unknown, areaNames: { label: string; value: string }[] = []) {
  const raw = text(value)
  if (!raw) return ''
  return labelOf(areaNames, raw) || raw
}

export function areaLabelHit(row: Row, want: string, areaNames: { label: string; value: string }[] = []) {
  if (!want) return true
  const label = areaLabelText(row.areaLabel, areaNames)
  const raw = text(row.areaLabel)
  return label === want || raw === want
}
