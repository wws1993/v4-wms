import { presentAudit } from '@/audit/present'
import { pagesFor } from '@/nav'
import { defaultPlan, hostOf, stackCode, warehouseCodeOf, type CargoLot } from '@/plan/model'
import { loadFloorPlan, parseFloorPlan, saveFloorPlan } from '@/plan/storage'
import type { FloorPlan, RoleKey } from '@/types'
import { fail, ok, toCsv } from '@/api/result'
import { passwordIssue } from '@/security/policy'
import { isMediaPath, mediaUrl } from './media'
import { ruoyiBlob, ruoyiGet, ruoyiSend, writeToken, type RuoyiBody, type RuoyiResult } from './ruoyi'

type Row = Record<string, unknown>
type Query = Record<string, unknown>

const ROLE_WORDS: Record<RoleKey, string[]> = {
  admin: ['admin', 'administrator', '系统管理员', '管理员'],
  warehouse: ['warehouse', '仓管员', '仓管'],
  customs: ['customs', '关务员', '关务'],
}

const ROLE_LABEL: Record<RoleKey, string> = {
  admin: '系统管理员',
  warehouse: '仓管员',
  customs: '关务员',
}

const MENU_WORDS: { id: string; words: string[] }[] = [
  { id: 'dashboard', words: ['概览', '驾驶舱', '首页'] },
  { id: 'warehouses', words: ['仓位管理', '仓库管理', '仓库'] },
  { id: 'stacks', words: ['堆位', '库区'] },
  { id: 'materials', words: ['物料', '商品'] },
  { id: 'partners', words: ['往来'] },
  { id: 'bonded', words: ['账册', '保税'] },
  { id: 'settings', words: ['系统设置', '参数设置'] },
  { id: 'inbound', words: ['入库'] },
  { id: 'transfer', words: ['移库'] },
  { id: 'inventory', words: ['库存'] },
  { id: 'stocktake', words: ['盘点', '盘库'] },
  { id: 'warningLogs', words: ['预警日志'] },
  { id: 'outbound', words: ['出库'] },
  { id: 'production', words: ['生产', '完工', '加工'] },
  { id: 'customs', words: ['关务'] },
  { id: 'ocr', words: ['ocr', '识别'] },
  { id: 'audit', words: ['操作日志', '审计'] },
  { id: 'dicts', words: ['字典'] },
]

const MERCHANT_FALLBACK = [
  { label: '委托方', value: '1' },
  { label: '物流账册主体', value: '2' },
  { label: '流向企业', value: '3' },
]

const SOURCE_LABEL = ['手工维护', '入库自动', '出库识别']
const OCR_TYPE: Record<string, number> = { 入库报关单: 0, 出库报关单: 1, 重量单: 2, 品质单: 3, 品质证书: 3 }
const OCR_TYPE_LABEL = ['入库报关单', '出库报关单', '重量单', '品质单']
const OCR_STATUS: Record<number, string> = { 0: '待修正', 2: '已回填', 3: '已归档' }
const OPER_ACTION = ['其它', '新增', '修改', '删除']

function text(value: unknown) {
  return value == null ? '' : String(value)
}

function num(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function idOf(value: unknown) {
  const raw = text(value).trim()
  if (!raw || !/^-?\d+$/.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : raw
}

function flagStatus(value: unknown) {
  const raw = text(value)
  if (raw === '启用' || raw === '0') return '0'
  if (raw === '停用' || raw === '1') return '1'
  return raw
}

function flagLabel(value: unknown) {
  const raw = text(value)
  if (raw === '0') return '启用'
  if (raw === '1') return '停用'
  return raw
}

function userStatusCode(value: unknown) {
  const raw = text(value)
  if (raw === '启用' || raw === '1' || raw === '正常') return '1'
  if (raw === '停用' || raw === '0') return '0'
  return raw
}

function userStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1' || raw === '正常') return '启用'
  if (raw === '0') return '停用'
  return raw
}

function dictStatusCode(value: unknown) {
  const raw = text(value)
  if (raw === '正常' || raw === '1') return '1'
  if (raw === '停用' || raw === '0') return '0'
  return raw
}

function dictStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1') return '正常'
  if (raw === '0') return '停用'
  return raw
}

function pageParams(query: Query, extra: Query = {}) {
  const params: Query = { pageNum: query.page || 1, pageSize: query.pageSize || 10, ...extra }
  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] == null) delete params[key]
  })
  return params
}

function range(query: Query) {
  const params: Query = {}
  if (query.from) params.beginTime = `${text(query.from).slice(0, 10)} 00:00:00`
  if (query.to) params.endTime = `${text(query.to).slice(0, 10)} 23:59:59`
  return Object.keys(params).length ? { params } : {}
}

function pageOf(result: RuoyiResult, list: Row[], query: Query) {
  if (!result.ok) return fail(result.message)
  return ok({ list, total: result.total, page: Number(query.page || 1), pageSize: Number(query.pageSize || 10) }, result.message)
}

function roleOf(blob: string): RoleKey | '' {
  const lower = blob.toLowerCase()
  const keys = Object.keys(ROLE_WORDS) as RoleKey[]
  return keys.find((key) => ROLE_WORDS[key].some((word) => lower.includes(word.toLowerCase()))) || ''
}

function pagesFromRouters(nodes: unknown) {
  const titles: string[] = []
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    list.forEach((node) => {
      const row = node as Row
      if (row.hidden === true) return
      const meta = row.meta as Row | undefined
      if (meta?.title) titles.push(text(meta.title))
      if (row.name) titles.push(text(row.name))
      if (row.path) titles.push(text(row.path))
      walk(row.children)
    })
  }
  walk(nodes)
  const joined = titles.join(' ').toLowerCase()
  const pages = MENU_WORDS.filter((item) => item.words.some((word) => joined.includes(word.toLowerCase()))).map((item) => item.id)
  if (!pages.includes('dashboard')) pages.unshift('dashboard')
  return pages
}

const DICT_CACHE_PREFIX = 'wms_dict_enum:'
const dictPending = new Map<string, Promise<Row[]>>()
let dictGeneration = 0

function readDictCache(type: string) {
  try {
    const raw = sessionStorage.getItem(DICT_CACHE_PREFIX + type)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : null
  } catch {
    return null
  }
}

function writeDictCache(type: string, rows: Row[], generation: number) {
  if (generation !== dictGeneration) return
  try {
    sessionStorage.setItem(DICT_CACHE_PREFIX + type, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

export function clearDictCache() {
  dictGeneration += 1
  dictPending.clear()
  const keys: string[] = []
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index)
    if (key?.startsWith(DICT_CACHE_PREFIX)) keys.push(key)
  }
  keys.forEach((key) => sessionStorage.removeItem(key))
}

async function loadDictRows(type: string, generation: number) {
  const result = await ruoyiGet(`/system/dict/data/type/${type}`)
  let rows = result.ok ? (Array.isArray(result.data) ? result.data as Row[] : result.rows) : []
  let loaded = result.ok && rows.length > 0
  if (!rows.length) {
    const listed = await ruoyiGet('/system/dict/data/list', { pageNum: 1, pageSize: 200, dictType: type })
    if (listed.ok) {
      rows = listed.rows
      loaded = true
    }
  }
  if (loaded) writeDictCache(type, rows, generation)
  return rows
}

async function dictRows(type: string) {
  const cached = readDictCache(type)
  if (cached) return cached.map((row) => ({ ...row }))
  const pending = dictPending.get(type)
  if (pending) return (await pending).map((row) => ({ ...row }))
  const generation = dictGeneration
  const task = loadDictRows(type, generation).finally(() => {
    if (dictPending.get(type) === task) dictPending.delete(type)
  })
  dictPending.set(type, task)
  return (await task).map((row) => ({ ...row }))
}

async function dictOf(type: string) {
  const rows = await dictRows(type)
  return rows.map((row) => ({ label: text(row.dictLabel), value: text(row.dictValue) })).filter((row) => row.label || row.value)
}

const MERCHANT_DICT_TYPES = ['wms_merchant_type', 'merchant_type']

async function merchantTypes() {
  for (const type of MERCHANT_DICT_TYPES) {
    const rows = await dictOf(type)
    if (rows.length) return rows
  }
  return MERCHANT_FALLBACK
}

function enabledDictLabels(rows: Row[]) {
  return rows
    .filter((row) => text(row.status) !== '0' && text(row.status) !== '停用')
    .sort((a, b) => Number(a.dictSort ?? 0) - Number(b.dictSort ?? 0))
    .map((row) => text(row.dictLabel))
    .filter(Boolean)
}

async function dictLabels(type: string) {
  const types = MERCHANT_DICT_TYPES.includes(type) ? MERCHANT_DICT_TYPES : [type]
  for (const item of types) {
    const labels = enabledDictLabels(await dictRows(item))
    if (labels.length) return labels
  }
  return []
}

function labelOf(options: { label: string; value: string }[], value: unknown) {
  const raw = text(value)
  return options.find((item) => item.value === raw)?.label || raw
}

function codeOf(options: { label: string; value: string }[], label: unknown) {
  const raw = text(label)
  const hit = options.find((item) => item.label === raw || item.value === raw)
  return hit ? num(hit.value) : num(raw)
}

let roleCache: Row[] | null = null

async function roles() {
  if (roleCache) return roleCache
  const result = await ruoyiGet('/system/role/optionselect')
  roleCache = result.ok ? (Array.isArray(result.data) ? result.data as Row[] : result.rows) : []
  return roleCache
}

async function roleIdFor(key: string) {
  const list = await roles()
  const found = list.find((row) => roleOf(`${row.roleKey || ''} ${row.roleName || ''}`) === key)
  return idOf(found?.roleId)
}

function userRow(row: Row) {
  const roleBlob = `${text(row.roleKey)} ${(Array.isArray(row.roles) ? row.roles as Row[] : []).map((item) => `${item.roleKey || ''} ${item.roleName || ''}`).join(' ')}`
  const roleKey = roleOf(roleBlob) || 'warehouse'
  const named = (Array.isArray(row.roles) ? row.roles as Row[] : []).map((item) => text(item.roleName)).find(Boolean)
  return {
    id: text(row.userId ?? row.id),
    username: text(row.userName),
    name: text(row.nickName),
    roleKey,
    roleName: named || ROLE_LABEL[roleKey],
    phone: text(row.phonenumber),
    status: userStatusLabel(row.status),
  }
}

function orderNumOf(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

function byOrderNum<T extends { orderNum?: number }>(rows: T[]) {
  return rows.slice().sort((left, right) => {
    const a = left.orderNum
    const b = right.orderNum
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return a - b
  })
}

function warehouseRow(row: Row) {
  const occupy = text(row.occupy)
  const matched = occupy.match(/(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)/)
  return {
    id: text(row.id),
    code: text(row.warehouseCode || row.warehouseName),
    orderNum: orderNumOf(row.orderNum),
    capacity: row.storageCapacity,
    area: row.area,
    stackCount: row.areaNum ?? 0,
    used: matched ? Number(matched[1]) : undefined,
    rate: matched ? Number(matched[2]) : num(occupy.replace('%', '')),
    occupyText: matched ? '' : occupy,
    status: flagLabel(row.status),
  }
}

function stackRow(row: Row) {
  const house = row.warehouse && typeof row.warehouse === 'object' ? row.warehouse as Row : undefined
  const warehouseText = typeof row.warehouse === 'string' ? text(row.warehouse) : ''
  const warehouseId = text(row.warehouseId || house?.id)
  return {
    id: text(row.id),
    code: text(row.areaCode || row.area_code || row.areaName || row.area_name),
    orderNum: orderNumOf(row.orderNum),
    warehouse: text(house?.warehouseName || house?.warehouseCode || warehouseText || warehouseId),
    warehouseId,
    areaLabel: text(row.areaIdentification),
    grid: '',
    capacity: row.inventoryCapacity,
    status: flagLabel(row.status),
  }
}

const ITEM_SOURCE_KEY = 'wms_item_source'

function readItemSources(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ITEM_SOURCE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, string> : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function rememberItemSource(code: string, source: string) {
  if (!code) return
  const map = readItemSources()
  if (source) map[code] = source
  else delete map[code]
  localStorage.setItem(ITEM_SOURCE_KEY, JSON.stringify(map))
}

function withItemSource<T extends { code: string; source: string }>(row: T): T {
  const saved = readItemSources()[row.code]
  return { ...row, source: row.source || saved || '' }
}

function itemRow(row: Row, categories: { label: string; value: string }[], kinds: { label: string; value: string }[]) {
  return withItemSource({
    id: text(row.id),
    code: text(row.itemCode),
    name: text(row.itemName),
    cargoType: labelOf(categories, row.itemCategory) || text(row.itemCategory),
    kind: labelOf(kinds, row.type) || text(row.type),
    source: text(row.mineralSource),
  })
}

const ITEM_CACHE_KEY = 'wms_item_list'
let itemGeneration = 0
let itemPending: Promise<Row[]> | null = null

function readItemCache() {
  try {
    const raw = sessionStorage.getItem(ITEM_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : null
  } catch {
    return null
  }
}

function writeItemCache(rows: Row[], generation: number) {
  if (generation !== itemGeneration) return
  try {
    sessionStorage.setItem(ITEM_CACHE_KEY, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

function clearItemCache() {
  itemGeneration += 1
  itemPending = null
  sessionStorage.removeItem(ITEM_CACHE_KEY)
}

async function loadItemCatalog(generation: number) {
  const result = await ruoyiGet('/wms/item/list', { pageNum: 1, pageSize: 100 })
  const rows = result.ok ? result.rows : []
  if (result.ok) writeItemCache(rows, generation)
  return rows
}

async function itemCatalog() {
  const cached = readItemCache()
  if (cached) return cached.map((row) => ({ ...row }))
  if (itemPending) return (await itemPending).map((row) => ({ ...row }))
  const generation = itemGeneration
  const task = loadItemCatalog(generation).finally(() => {
    if (itemPending === task) itemPending = null
  })
  itemPending = task
  return (await task).map((row) => ({ ...row }))
}

function itemCatalogQuery(query: Query) {
  return Number(query.page || 1) === 1
    && Number(query.pageSize || 10) === 100
    && !text(query.keyword)
    && !text(query.kind)
    && !text(query.cargoType)
}

async function listItems(query: Query) {
  const categories = await dictOf('wms_item_category')
  const kinds = await dictOf('wms_item_type')
  if (itemCatalogQuery(query)) {
    const rows = await itemCatalog()
    return ok({
      list: rows.map((row) => itemRow(row, categories, kinds)),
      total: rows.length,
      page: 1,
      pageSize: 100,
    })
  }
  const result = await ruoyiGet('/wms/item/list', pageParams(query, {
    itemName: query.keyword || undefined,
    type: query.kind ? await dictValue('wms_item_type', query.kind) : undefined,
    itemCategory: query.cargoType ? await dictValue('wms_item_category', query.cargoType) : undefined,
  }))
  return pageOf(result, result.rows.map((row) => itemRow(row, categories, kinds)), query)
}

function merchantRow(row: Row, types: { label: string; value: string }[]) {
  const source = Number(row.source)
  return {
    id: text(row.id),
    code: text(row.merchantCode),
    name: text(row.merchantName),
    role: labelOf(types, row.merchantType),
    phone: text(row.mobile),
    status: flagLabel(row.status),
    source: SOURCE_LABEL[source] || text(row.source),
  }
}

function bookRow(row: Row) {
  const warn = text(row.earlyWarningTime)
  return {
    id: text(row.id),
    code: text(row.accountCode),
    name: text(row.accountName),
    operator: text(row.operatingUnit),
    value: row.goodsValue,
    customsNo: text(row.customsDeclarationNumber),
    status: text(row.filingStatus),
    prevBook: text(row.oldAccountName),
    prevBookId: row.oldAccountId,
    warnDate: warn ? warn.slice(0, 10) : '',
  }
}

function areaPoints(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Row[]
  if (value && typeof value === 'object') return [value as Row]
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object') as Row[]
    if (parsed && typeof parsed === 'object') return [parsed as Row]
  } catch { /* 不是 JSON 时按 行-列 文本再认一次 */ }
  return []
}

function cellsText(row: Row) {
  const areas = areaPoints(row.areas)
  const points = areas.length ? areas : areaPoints(row.areaItems)
  const joined = points.map((item) => {
    const line = item.row
    const column = item.column ?? item.col
    if (line == null || column == null || line === '' || column === '') return ''
    return `${line}-${column}`
  }).filter(Boolean).join(',')
  if (joined) return joined
  const raw = text(row.areaItems).replace(/\s+/g, '')
  return /^\d+-\d+(,\d+-\d+)*$/.test(raw) ? raw : ''
}

function currencyValue(options: { label: string; value: string }[], value: unknown) {
  const raw = text(value).trim()
  if (!raw) return undefined
  const direct = options.find((item) => item.label === raw || item.value === raw)
  if (direct) return direct.value
  if (raw === 'CNY' || raw.includes('人民币')) return options.find((item) => item.label.includes('人民币'))?.value || raw
  if (raw === 'USD' || raw.includes('美元')) return options.find((item) => item.label.includes('美元'))?.value || raw
  return raw
}

function currencyMark(options: { label: string; value: string }[], value: unknown) {
  const label = labelOf(options, value)
  if (label.includes('美元') || text(value) === 'USD') return 'USD'
  if (label.includes('人民币') || text(value) === 'CNY') return 'CNY'
  return label || text(value)
}

function arrivalOf(value: unknown) {
  const raw = text(value).trim().replace('T', ' ')
  if (!raw) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  return raw
}

function cellsBody(value: unknown) {
  return text(value).split(',').filter(Boolean).map((item) => {
    const [row, column] = item.split('-').map(Number)
    return { row, column }
  }).filter((item) => Number.isFinite(item.row) && Number.isFinite(item.column))
}

async function catalog(path: string) {
  const result = await ruoyiGet(path)
  if (!result.ok) return { ok: false as const, message: result.message, rows: [] as Row[] }
  const rows = Array.isArray(result.data) ? result.data as Row[] : result.rows
  return { ok: true as const, message: result.message, rows }
}

const WAREHOUSE_CACHE_KEY = 'wms_warehouse_list'
let warehouseGeneration = 0
let warehousePending: Promise<Row[]> | null = null

function readWarehouseCache() {
  try {
    const raw = sessionStorage.getItem(WAREHOUSE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : null
  } catch {
    return null
  }
}

function writeWarehouseCache(rows: Row[], generation: number) {
  if (generation !== warehouseGeneration) return
  try {
    sessionStorage.setItem(WAREHOUSE_CACHE_KEY, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

export function clearWarehouseCache() {
  warehouseGeneration += 1
  warehousePending = null
  sessionStorage.removeItem(WAREHOUSE_CACHE_KEY)
}

async function loadWarehouseRows(generation: number) {
  const listed = await catalog('/wms/warehouse/listNoPage')
  let rows = listed.rows
  let loaded = listed.ok && rows.length > 0
  if (!rows.length) {
    const page = await ruoyiGet('/wms/warehouse/list', { pageNum: 1, pageSize: 200 })
    if (page.ok) {
      rows = page.rows
      loaded = true
    }
  }
  if (loaded) writeWarehouseCache(rows, generation)
  return rows
}

async function warehouseRows() {
  const cached = readWarehouseCache()
  if (cached) return cached.map((row) => ({ ...row }))
  if (warehousePending) return (await warehousePending).map((row) => ({ ...row }))
  const generation = warehouseGeneration
  const task = loadWarehouseRows(generation).finally(() => {
    if (warehousePending === task) warehousePending = null
  })
  warehousePending = task
  return (await task).map((row) => ({ ...row }))
}

async function findWarehouseId(name: unknown) {
  const rows = await warehouseRows()
  const raw = text(name)
  const found = rows.find((row) => text(row.warehouseCode) === raw || text(row.warehouseName) === raw || text(row.id) === raw)
  return idOf(found?.id)
}

function flat(value: unknown) {
  return text(value).replace(/[\r\n]+/g, '').trim()
}

function areaSlot(value: string) {
  const hash = value.lastIndexOf('#')
  return (hash >= 0 ? value.slice(hash + 1) : value).trim()
}

function areaMark(value: string) {
  const hash = value.indexOf('#')
  if (hash <= 0) return ''
  return value.slice(0, hash).replace(/^#/, '').replace(/仓$/, '')
}

function houseMark(row: Row) {
  const house = row.warehouse && typeof row.warehouse === 'object' ? row.warehouse as Row : undefined
  const name = flat(house?.warehouseCode || house?.warehouseName || (typeof row.warehouse === 'string' ? row.warehouse : ''))
  if (!name || /^\d+$/.test(name)) return ''
  return warehouseCodeOf(name).replace(/仓$/, '')
}

function areaCodeValue(row: Row) {
  return flat(row.areaCode || row.area_code || row.code)
}

function areaNameValue(row: Row) {
  return flat(row.areaName || row.area_name || row.name)
}

const AREA_CACHE_KEY = 'wms_area_list'
let areaGeneration = 0
let areaPending: Promise<Row[]> | null = null

function readAreaCache() {
  try {
    const raw = sessionStorage.getItem(AREA_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : null
  } catch {
    return null
  }
}

function writeAreaCache(rows: Row[], generation: number) {
  if (generation !== areaGeneration) return
  try {
    sessionStorage.setItem(AREA_CACHE_KEY, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

export function clearAreaCache() {
  areaGeneration += 1
  areaPending = null
  sessionStorage.removeItem(AREA_CACHE_KEY)
}

async function loadAreaRows(generation: number) {
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
  if (loaded) writeAreaCache(rows, generation)
  return rows
}

async function areaRows() {
  const cached = readAreaCache()
  if (cached) return cached.map((row) => ({ ...row }))
  if (areaPending) return (await areaPending).map((row) => ({ ...row }))
  const generation = areaGeneration
  const task = loadAreaRows(generation).finally(() => {
    if (areaPending === task) areaPending = null
  })
  areaPending = task
  return (await task).map((row) => ({ ...row }))
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

async function listAreas(params: Query) {
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

async function findArea(code: unknown) {
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

async function findMerchant(name: unknown) {
  const list = await catalog('/wms/merchant/listNoPage')
  const raw = text(name)
  return list.rows.find((row) => text(row.merchantName) === raw || text(row.merchantCode) === raw || text(row.id) === raw)
}

async function findItem(value: unknown) {
  const list = await catalog('/wms/item/listNoPage')
  const raw = text(value)
  return list.rows.find((row) => text(row.id) === raw || text(row.itemCode) === raw || text(row.itemName) === raw)
}

async function findBook(name: unknown) {
  const list = await catalog('/wms/accountBook/listNoPage')
  const raw = text(name)
  return list.rows.find((row) => text(row.accountCode) === raw || text(row.accountName) === raw || text(row.id) === raw)
}

async function codeFromDict(type: string, label: unknown) {
  const options = await dictOf(type)
  if (!options.length) return num(label)
  return codeOf(options, label)
}

function materialName(row: Row, items: Row[]) {
  const embedded = row.item as Row | undefined
  const named = text(embedded?.itemName || row.itemName)
  if (named) return named
  const id = text(row.itemId || embedded?.id)
  const hit = items.find((item) => text(item.id) === id)
  return text(hit?.itemName)
}

function filingNoOf(row: Row) {
  const filings = Array.isArray(row.mineralSourceFiling) ? row.mineralSourceFiling as Row[] : []
  return text(filings[0]?.recordNumber)
}

function shipModeOf(row: Row, translates: { label: string; value: string }[]) {
  const method = nested(row, 'shippingMethod')
  const code = text(method?.id ?? (typeof row.shippingMethod === 'object' ? row.shippingMethodId : row.shippingMethod))
  return labelOf(translates, code)
}

function receiptRow(row: Row, minerals: { label: string; value: string }[], statuses: { label: string; value: string }[], currencies: { label: string; value: string }[], categories: { label: string; value: string }[], translates: { label: string; value: string }[], items: Row[] = []) {
  const method = nested(row, 'shippingMethod')
  const consignor = row.consignor as Row | undefined
  const area = row.area as Row | undefined
  const item = row.item as Row | undefined
  return {
    id: text(row.id),
    orderNo: text(row.receiptOrderNo),
    time: text(row.arrivalDate || row.createTime).replace('T', ' ').slice(0, 16),
    operateTime: text(row.updateTime || row.createTime).replace('T', ' ').slice(0, 19),
    customsNo: text(row.recordNo),
    blNo: text(row.waybillNo),
    shipName: text(row.shipName),
    oreType: labelOf(minerals, row.mineralType) || text(row.mineralType),
    shipMode: shipModeOf(row, translates),
    containerCount: method?.areaNumber ?? '',
    consignor: text(consignor?.merchantName || row.consignorId),
    material: materialName(row, items),
    cargoType: labelOf(categories, item?.itemCategory) || text(item?.itemCategory),
    filingNo: filingNoOf(row),
    stackCode: text(area?.areaCode || area?.areaName),
    cells: cellsText(row),
    amount: row.payableAmount,
    currency: currencyMark(currencies, row.currency),
    checklistNo: text(row.verificationCode),
    status: labelOf(statuses, row.receiptOrderStatus) || text(row.receiptOrderStatus),
    orcId: row.orcLogId,
    wet: row.wetWeight ?? '',
    dry: row.dryWeight ?? '',
    moisture: row.moistureContent ?? '',
    weightOrcId: text(row.weightOrcId),
    elementsOrcId: text(row.elementsOrcId),
    shippingMethodId: text(row.shippingMethodId || method?.id || (typeof row.shippingMethod === 'object' ? '' : row.shippingMethod)),
    remark: text(row.remark),
    ...elementFields(row),
  }
}

const ELEMENT_FIELDS: Record<string, string> = {
  as: 'as', pb: 'pb', cd: 'cd', f: 'f', hg: 'hg', cu: 'cu', ag: 'ag', au: 'au',
  As: 'as', Pb: 'pb', Cd: 'cd', F: 'f', Hg: 'hg', Cu: 'cu', Ag: 'ag', Au: 'au',
}

function elementFields(row: Row) {
  const fields: Row = { as: '', pb: '', cd: '', f: '', hg: '', cu: '', ag: '', au: '' }
  const list = Array.isArray(row.elements) ? row.elements as Row[] : []
  for (const item of list) {
    const key = ELEMENT_FIELDS[text(item.elementCode)] || ELEMENT_FIELDS[text(item.elementName)]
    if (!key || item.elementValue == null || item.elementValue === '') continue
    fields[key] = text(item.elementValue)
  }
  return fields
}

function resultObject(row: Row) {
  if (row.result && typeof row.result === 'object') return row.result as Row
  if (typeof row.resultJson === 'string' && row.resultJson) {
    try { return JSON.parse(row.resultJson) as Row } catch { return {} }
  }
  return {}
}

function ocrRow(row: Row) {
  const result = resultObject(row)
  const type = Number(row.ocrLogType)
  const status = Number(row.ocrLogStatus)
  return {
    id: text(row.id),
    time: text(row.createTime).replace('T', ' ').slice(0, 16),
    docType: OCR_TYPE_LABEL[type] || text(row.ocrLogType),
    fileName: text(row.sourceUrl || row.orderNo),
    customsNo: text(result.recordNo || result.customsNo || row.orderNo),
    checklistNo: text(result.verificationCode || result.checklistNo),
    consignee: text(result.consignee || result.merchantName),
    shipName: text(result.shipName),
    blNo: text(result.waybillNo || result.blNo),
    amount: result.payableAmount ?? result.amount ?? '',
    currency: text(result.currency),
    wet: result.wetWeight ?? result.wet ?? '',
    dry: result.dryWeight ?? result.dry ?? '',
    moisture: result.moistureContent ?? result.moisture ?? '',
    confidence: '—',
    status: OCR_STATUS[status] || text(row.ocrLogStatus),
    ocrLogType: row.ocrLogType,
    orderId: row.orderId,
    orderNo: row.orderNo,
    qualityNo: text(result.qualityNo || result.certificateNo),
    timeText: text(result.time || result.arrivalDate || result.recordTime),
    ...elementFields(result),
  }
}

let floorRecordId = ''
let floorRead: Promise<{ success: boolean; message: string; plan: FloorPlan | null }> | null = null

function floorRows(result: RuoyiResult) {
  const data = result.data
  if (Array.isArray(data)) return data as Row[]
  if (result.rows.length) return result.rows
  if (!data || typeof data !== 'object') return []
  const row = data as Row
  if (Array.isArray(row.records)) return row.records as Row[]
  if (Array.isArray(row.list)) return row.list as Row[]
  if (Array.isArray(row.rows)) return row.rows as Row[]
  if ('jsonData' in row) return [row]
  return []
}

function parseStoredPlan(value: unknown) {
  let current = value
  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    try { current = JSON.parse(current) } catch { return null }
  }
  return parseFloorPlan(current)
}

function newestFloor(rows: Row[]) {
  if (!rows.length) return undefined
  return [...rows].sort((a, b) => text(a.updateTime || a.createTime || a.id).localeCompare(text(b.updateTime || b.createTime || b.id)))[rows.length - 1]
}

function rememberFloor(plan: FloorPlan) {
  try { saveFloorPlan(plan) } catch { /* 配额不足时仍以服务器上的 JSON 为准 */ }
}

async function fetchFloorRows() {
  const result = await ruoyiGet('/wms/floorPlan/listNoPage')
  if (!result.ok) return { ok: false as const, message: result.message, rows: [] as Row[] }
  return { ok: true as const, message: result.message, rows: floorRows(result) }
}

async function publishFloor(plan: FloorPlan) {
  const jsonData = JSON.stringify(plan)
  const result = floorRecordId
    ? await ruoyiSend('PUT', '/wms/floorPlan', { id: floorRecordId, jsonData })
    : await ruoyiSend('POST', '/wms/floorPlan', { jsonData })
  if (!result.ok) return result
  const created = result.data && typeof result.data === 'object' ? text((result.data as Row).id) : text(result.data)
  if (created && created !== '[object Object]') floorRecordId = created
  else if (!floorRecordId) {
    const listed = await fetchFloorRows()
    const row = listed.ok ? newestFloor(listed.rows) : undefined
    if (row) floorRecordId = text(row.id)
  }
  rememberFloor(plan)
  return result
}

async function readFloorOnce() {
  const listed = await fetchFloorRows()
  if (!listed.ok) return { success: false, message: listed.message, plan: null as FloorPlan | null }
  const row = newestFloor(listed.rows)
  if (!row) {
    floorRecordId = ''
    const local = loadFloorPlan()
    if (local?.items.length) {
      const posted = await publishFloor(local)
      if (!posted.ok) return { success: false, message: posted.message, plan: null }
      return { success: true, message: posted.message, plan: local }
    }
    return { success: true, message: listed.message, plan: defaultPlan() }
  }
  floorRecordId = text(row.id)
  let source: unknown = row.jsonData
  if ((source == null || source === '') && floorRecordId) {
    const detail = await ruoyiGet(`/wms/floorPlan/${floorRecordId}`)
    if (!detail.ok) return { success: false, message: detail.message, plan: null }
    const body = detail.data && typeof detail.data === 'object' ? detail.data as Row : {}
    source = body.jsonData
  }
  const plan = parseStoredPlan(source) || (text(source) ? null : defaultPlan())
  if (!plan) return { success: false, message: '平面图数据无法解析', plan: null }
  rememberFloor(plan)
  return { success: true, message: listed.message, plan }
}

function readFloor() {
  if (!floorRead) floorRead = readFloorOnce().finally(() => { floorRead = null })
  return floorRead
}

async function loadFloor() {
  const loaded = await readFloor()
  if (!loaded.success || !loaded.plan) return fail(loaded.message || '平面图读取失败')
  return ok(loaded.plan)
}

async function saveFloor(body: Row) {
  const plan = parseFloorPlan(body)
  if (!plan) return fail('平面图数据无效')
  if (!floorRecordId) {
    const listed = await fetchFloorRows()
    if (!listed.ok) return fail(listed.message)
    const row = newestFloor(listed.rows)
    if (row) floorRecordId = text(row.id)
  }
  const saved = await publishFloor(plan)
  return saved.ok ? ok(plan, '平面图已保存') : fail(saved.message)
}

async function gridsFromPlan() {
  const loaded = await readFloor()
  const plan = loaded.plan || loadFloorPlan()
  const map = new Map<string, { grid: string; gridCols: number; gridRows: number }>()
  if (!plan) return map
  for (const item of plan.items) {
    if (item.type !== 'stack') continue
    const host = hostOf(item, plan.items)
    if (!host) continue
    const cols = Math.max(1, Math.round(item.cols))
    const rows = Math.max(1, Math.round(item.rows))
    const grid = { grid: `${cols}×${rows}`, gridCols: cols, gridRows: rows }
    if (item.stackId) map.set(item.stackId, grid)
    if (item.archiveCode) map.set(item.archiveCode, grid)
    const slot = item.name.replace(/^\d+#/, '').trim()
    if (slot) map.set(stackCode(host.name, slot), grid)
  }
  return map
}

async function dictValue(type: string, label: unknown) {
  const raw = text(label)
  if (!raw) return undefined
  const options = await dictOf(type)
  if (!options.length) return raw
  const hit = options.find((item) => item.label === raw || item.value === raw)
  return hit ? hit.value : raw
}


const WARNING_TYPE: Record<string, number> = { 库容: 1, 库龄: 2, 码头超期: 3, 备案用量: 4 }
const WARNING_TYPE_LABEL = ['', '库容', '库龄', '码头超期', '备案用量']
const WARNING_LEVEL: Record<string, number> = { 低: 1, 中: 2, 高: 3 }
const WARNING_LEVEL_LABEL = ['', '低', '中', '高']

function warningRow(row: Row) {
  const type = Number(row.warningType)
  const level = Number(row.warningLevel)
  return {
    id: text(row.id),
    time: text(row.warningDate).replace('T', ' ').slice(0, 10),
    type: WARNING_TYPE_LABEL[type] || text(row.warningType),
    level: WARNING_LEVEL_LABEL[level] || text(row.warningLevel),
    target: text(row.targetName),
    detail: text(row.warningDesc),
    status: text(row.status),
  }
}

async function listWarningRecords(query: Query) {
  const result = await ruoyiGet('/wms/warningRecord/list', pageParams(query, {
    warningType: query.type ? WARNING_TYPE[text(query.type)] : undefined,
    warningLevel: query.level ? WARNING_LEVEL[text(query.level)] : undefined,
    keyword: text(query.keyword).trim() || undefined,
    startDate: query.from || undefined,
    endDate: query.to || undefined,
  }))
  if (!result.ok) return fail(result.message)
  return pageOf(result, result.rows.map(warningRow), query)
}

function splitChange(content: string) {
  const arrow = content.split('→')
  if (arrow.length < 2) return { before: '—', after: content || '—' }
  return { before: arrow[0].trim() || '—', after: arrow.slice(1).join('→').trim() || '—' }
}

function auditRow(row: Row) {
  const change = splitChange(text(row.operContent))
  const action = text(row.businessCategory) || OPER_ACTION[Number(row.businessType)] || '—'
  const failed = Number(row.status) === 0
  return presentAudit({
    id: text(row.operId),
    time: text(row.operTime).replace('T', ' ').slice(0, 16),
    operator: text(row.operName),
    module: text(row.title),
    action,
    bizNo: text(row.businessNo),
    customsAccount: text(row.title).includes('关务') ? '是' : '否',
    ip: text(row.operIp),
    before: change.before,
    after: change.after,
    content: text(row.operContent),
    detail: text(row.operDetail),
    result: failed ? `异常${text(row.errorMsg) ? `；${text(row.errorMsg)}` : ''}` : '成功',
  })
}

function tokenOf(raw: RuoyiBody) {
  const data = raw.data && typeof raw.data === 'object' ? raw.data as Row : {}
  return text(raw.token || data.token || data.access_token)
}

async function login(body: Row) {
  const result = await ruoyiSend('POST', '/login', {
    username: body.username,
    password: body.password,
    code: body.code || '',
    uuid: body.uuid || '',
  })
  if (!result.ok) return fail(result.message)
  const token = tokenOf(result.raw)
  if (!token) return fail('登录成功但未返回令牌')
  writeToken(token)
  const info = await ruoyiGet('/getInfo')
  if (!info.ok) {
    writeToken('')
    return fail(info.message)
  }
  const packet = (info.data && typeof info.data === 'object' ? info.data : info.raw) as Row
  const user = (packet.user && typeof packet.user === 'object' ? packet.user : packet) as Row
  const roleBlob = `${text(user.userName)} ${JSON.stringify(packet.roles || user.roles || '')}`
  const roleKey = roleOf(roleBlob) || (user.admin ? 'admin' : 'warehouse')
  const routers = await ruoyiGet('/getRouters')
  const routerData = Array.isArray(routers.data) ? routers.data : routers.rows
  return ok({
    id: text(user.userId || user.id),
    username: text(user.userName || body.username),
    name: text(user.nickName || user.userName || body.username),
    roleKey,
    roleName: ROLE_LABEL[roleKey],
    pages: pagesFromRouters(routerData),
  }, '登录成功')
}

async function captcha() {
  const result = await ruoyiGet('/captchaImage')
  if (!result.ok) return fail(result.message)
  const data = (result.data && typeof result.data === 'object' ? result.data : result.raw) as Row
  const img = text(data.img || result.raw.img)
  return ok({
    uuid: text(data.uuid || result.raw.uuid),
    enabled: data.captchaEnabled !== false && result.raw.captchaEnabled !== false,
    img: img ? (img.startsWith('data:') ? img : `data:image/gif;base64,${img}`) : '',
  })
}

async function users(query: Query) {
  const result = await ruoyiGet('/system/user/list', pageParams(query, { userName: query.keyword || undefined }))
  return pageOf(result, result.rows.map(userRow), query)
}

async function saveUser(id: string | undefined, body: Row) {
  const roleKey = text(body.roleKey || 'warehouse')
  const matchedRole = await roleIdFor(roleKey)
  if (!matchedRole) return fail(`丰联后台没有与「${ROLE_LABEL[roleKey as RoleKey] || roleKey}」对应的角色`)
  const payload: Row = {
    userName: body.username,
    nickName: body.name,
    phonenumber: body.phone || '',
    status: userStatusCode(body.status || '启用'),
    roleIds: [matchedRole],
  }
  if (!id) {
    const password = text(body.password)
    if (!password) return fail('请填写密码')
    const issue = passwordIssue(password)
    if (issue) return fail(issue)
    payload.password = password
  }
  if (id) payload.userId = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/user', payload)
  if (!result.ok) return fail(result.message)
  roleCache = null
  return ok(true, id ? '已保存' : '账号已创建')
}

function statusReply(saved: { success: boolean; message: string; data: unknown }, status: unknown) {
  if (!saved.success) return saved
  return ok(true, text(status) === '停用' ? '已停用' : '已启用')
}

async function setUserStatus(id: string, body: Row) {
  const status = text(body.status)
  if (status !== '启用' && status !== '停用') return fail('状态只能是启用或停用')
  const result = await ruoyiSend('PUT', '/system/user/changeStatus', {
    userId: idOf(id),
    status: userStatusCode(status),
  })
  return result.ok ? ok(true, status === '停用' ? '已停用' : '已启用') : fail(result.message)
}

function yesFlag(value: unknown) {
  const raw = text(value).trim()
  if (raw === '1' || raw === 'Y' || raw === 'y' || raw === 'true' || raw === '是') return true
  if (raw === '0' || raw === 'N' || raw === 'n' || raw === 'false' || raw === '否') return false
  return undefined
}

function yesCode(value: unknown) {
  return value === true || value === '1' || value === '是' || value === 'Y' ? '1' : '0'
}

async function saveParams(body: Row) {
  const items = Array.isArray(body.qualityItems) ? body.qualityItems as Row[] : []
  const elements = items.map((item) => ({
    elementCode: text(item.symbol).trim(),
    elementName: text(item.name).trim() || text(item.symbol).trim(),
    isRequired: text(item.isRequired) || '0',
    isHarmful: yesCode(item.harmful),
    isTaxDeclared: yesCode(item.taxable),
  })).filter((item) => item.elementCode || item.elementName)
  const fallback = elements.length ? elements : text(body.qualities).split(/[、,，]/).map((item) => item.trim()).filter(Boolean).map((symbol) => ({
    elementCode: symbol,
    elementName: symbol,
    isRequired: '0',
    isHarmful: '0',
    isTaxDeclared: '0',
  }))
  const result = await ruoyiSend('PUT', '/wms/system/params', {
    id: idOf(import.meta.env.VITE_SYSTEM_PARAM_ID || '1'),
    thresholdAlter: num(body.capacityWarn),
    agingAlert: num(body.ageWarn),
    dockAlert: num(body.dockDays),
    usageAlert: num(body.filingUsageWarn),
    elements: fallback,
  })
  return result.ok ? ok(true, '参数已保存') : fail(result.message)
}

async function loadParams() {
  const result = await ruoyiGet(`/wms/system/params`)
  if (!result.ok) return fail(result.message)
  const data = (result.data || {}) as Row
  const elements = Array.isArray(data.elements) ? data.elements as Row[] : []
  return ok({
    capacityWarn: data.thresholdAlter,
    ageWarn: data.agingAlert,
    dockDays: data.dockAlert,
    filingUsageWarn: data.usageAlert,
    qualities: elements.map((item) => text(item.elementCode || item.elementName)).filter(Boolean).join('、'),
    qualityItems: elements.map((item) => {
      const row: Row = {
        symbol: text(item.elementCode),
        name: text(item.elementName || item.elementCode),
        isRequired: text(item.isRequired || '0'),
      }
      const harmful = yesFlag(item.isHarmful)
      const taxable = yesFlag(item.isTaxDeclared)
      if (harmful !== undefined) row.harmful = harmful
      if (taxable !== undefined) row.taxable = taxable
      return row
    }).filter((item) => item.symbol || item.name),
  })
}

async function removeWarehouse(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/warehouse/${id}`)
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

async function removeStack(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/area/${id}`)
  if (result.ok) clearAreaCache()
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

async function saveWarehouse(id: string | undefined, body: Row) {
  const code = text(body.code)
  const payload: Row = {
    warehouseCode: code,
    warehouseName: code,
    storageCapacity: body.capacity,
    area: body.area,
    status: flagStatus(body.status),
  }
  const orderNum = orderNumOf(body.orderNum)
  if (orderNum != null) payload.orderNum = orderNum
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/warehouse', payload)
  if (result.ok && !id) clearWarehouseCache()
  return result.ok ? ok({ id: savedId(result) }, '已保存') : fail(result.message)
}

function savedId(result: { data: unknown }) {
  const data = result.data
  if (typeof data === 'string' || typeof data === 'number') {
    const id = text(data).trim()
    if (id && id !== 'true' && id !== 'false') return id
  }
  if (data && typeof data === 'object') {
    const row = data as Row
    const id = text(row.id)
    if (id && id !== '[object Object]') return id
  }
  return ''
}

async function saveStack(id: string | undefined, body: Row) {
  const given = text(body.warehouseId).trim()
  const warehouseId = given ? idOf(given) : await findWarehouseId(body.warehouse)
  if (!warehouseId) return fail('请选择已存在的仓库')
  const code = text(body.code)
  const payload: Row = {
    areaCode: code,
    areaName: code,
    warehouseId,
    inventoryCapacity: body.capacity,
    areaIdentification: body.areaLabel,
    orderNum: orderNumOf(body.orderNum) ?? 0,
  }
  const status = text(body.status)
  if (status) payload.status = flagStatus(status)
  else if (!id) payload.status = '0'
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/area', payload)
  if (result.ok) clearAreaCache()
  return result.ok ? ok({ id: savedId(result) }, '已保存') : fail(result.message)
}

async function removeItem(id: string) {
  const detail = await ruoyiGet(`/wms/item/${id}`)
  const code = detail.ok ? text((detail.data as Row | undefined)?.itemCode) : ''
  const result = await ruoyiSend('DELETE', `/wms/item/${id}`)
  if (!result.ok) return fail(result.message)
  if (code) rememberItemSource(code, '')
  clearItemCache()
  return ok(true, '已删除')
}

async function saveItem(id: string | undefined, body: Row) {
  const cargoType = text(body.cargoType)
  const kind = text(body.kind)
  const source = kind === '原料' ? text(body.source) : ''
  if (kind === '原料' && !source) return fail('请填写矿源')
  const payload: Row = {
    itemCode: body.code,
    itemName: body.name,
    itemCategory: await dictValue('wms_item_category', cargoType),
    type: await dictValue('wms_item_type', kind),
    mineralSource: source,
  }
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/item', payload)
  if (!result.ok) return fail(result.message)
  rememberItemSource(text(body.code), source)
  clearItemCache()
  return ok(true, '已保存')
}

async function removeMerchant(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/merchant/${id}`)
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

async function saveMerchant(id: string | undefined, body: Row) {
  const types = await merchantTypes()
  const merchantType = codeOf(types, body.role)
  if (merchantType == null) return fail('请选择往来单位角色')
  const payload: Row = {
    merchantCode: body.code,
    merchantName: body.name,
    merchantType,
    mobile: body.phone || '',
    status: flagStatus(body.status || '启用'),
    source: SOURCE_LABEL.indexOf(text(body.source)) >= 0 ? SOURCE_LABEL.indexOf(text(body.source)) : 0,
  }
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/merchant', payload)
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

function openBook(row: Row) {
  const status = text(row.filingStatus)
  return status === '在用' || status === '新账' || status === '有效'
}

async function saveBook(id: string | undefined, body: Row) {
  const warn = text(body.warnDate)
  if (!id) {
    if (!text(body.code) || !text(body.name)) return fail('请填写账册编号与名称')
    const listed = await catalog('/wms/accountBook/listNoPage')
    if (!listed.ok) return fail(listed.message)
    const linked = listed.rows.find(openBook)
    if (linked && !warn) return fail('衔接旧账册须填写旧账预警日期')
    const payload: Row = {
      accountCode: body.code,
      accountName: body.name,
      operatingUnit: '',
      filingStatus: '在用',
      oldAccountId: linked ? idOf(linked.id) : undefined,
      earlyWarningTime: warn || undefined,
      beginEarlyWarningTime: warn || undefined,
    }
    const result = await ruoyiSend('POST', '/wms/accountBook', payload)
    if (!result.ok) return fail(result.message)
    if (linked) {
      const stopped = await ruoyiSend('PUT', '/wms/accountBook', {
        id: idOf(linked.id),
        accountCode: linked.accountCode,
        accountName: linked.accountName,
        operatingUnit: linked.operatingUnit,
        goodsValue: linked.goodsValue,
        customsDeclarationNumber: linked.customsDeclarationNumber,
        filingStatus: '停用',
        oldAccountId: linked.oldAccountId,
        earlyWarningTime: linked.earlyWarningTime,
      })
      if (!stopped.ok) return fail(stopped.message)
      return ok(true, `账册已备案，${text(linked.accountCode)} 已停用`)
    }
    return ok(true, '账册已备案')
  }
  const current = await findBook(id)
  if (!current) return fail('账册不存在')
  const payload: Row = {
    id: idOf(id),
    accountCode: current.accountCode,
    accountName: body.name,
    operatingUnit: current.operatingUnit,
    goodsValue: current.goodsValue,
    customsDeclarationNumber: current.customsDeclarationNumber,
    filingStatus: current.filingStatus,
    oldAccountId: current.oldAccountId,
    earlyWarningTime: warn || current.earlyWarningTime || undefined,
  }
  const result = await ruoyiSend('PUT', '/wms/accountBook', payload)
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

async function listReceipts(query: Query) {
  const minerals = await dictOf('wms_mineral_type')
  const statuses = await dictOf('wms_receipt_status')
  const currencies = await dictOf('wms_currency_type')
  const categories = await dictOf('wms_item_category')
  const translates = await dictOf('wms_translate_type')
  const items = await catalog('/wms/item/listNoPage')
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters: Query = {
    shippingMethodId: query.shipMode ? await codeFromDict('wms_translate_type', query.shipMode) ?? undefined : undefined,
    mineralType: query.oreType ? await codeFromDict('wms_mineral_type', query.oreType) : undefined,
    receiptOrderStatus: query.status ? await codeFromDict('wms_receipt_status', query.status) : undefined,
    consignorId: consignor ? idOf(consignor.id) : undefined,
  }
  const hasRange = Boolean(query.from || query.to)
  const word = text(query.keyword).trim()
  const ask = (extra: Query, withRange: boolean) => ruoyiGet('/wms/receiptOrder/list', pageParams(query, {
    ...filters,
    ...extra,
    ...(withRange ? range(query) : {}),
  }))
  let useRange = hasRange
  let result = await ask(word ? { recordNo: word } : {}, useRange)
  let note = ''
  if (!result.ok && useRange) {
    useRange = false
    result = await ask(word ? { recordNo: word } : {}, false)
    if (result.ok) note = '入库列表暂不支持起止日期，已按其它条件查询'
  }
  if (result.ok && word && result.total === 0) result = await ask({ waybillNo: word }, useRange)
  if (!result.ok) return fail(result.message)
  return ok({
    list: result.rows.map((row) => receiptRow(row, minerals, statuses, currencies, categories, translates, items.rows)),
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, note || result.message)
}

async function getReceipt(id: string) {
  const [detail, minerals, statuses, currencies, categories, translates, items] = await Promise.all([
    ruoyiGet(`/wms/receiptOrder/${encodeURIComponent(id)}`),
    dictOf('wms_mineral_type'),
    dictOf('wms_receipt_status'),
    dictOf('wms_currency_type'),
    dictOf('wms_item_category'),
    dictOf('wms_translate_type'),
    catalog('/wms/item/listNoPage'),
  ])
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(detail.message || '入库单不存在')
  return ok(receiptRow(detail.data as Row, minerals, statuses, currencies, categories, translates, items.rows))
}

async function createReceipt(body: Row) {
  const orcId = idOf(body.orcId)
  if (orcId == null) return fail('请先完成入库报关单识别，并填写 OCR 任务编号')
  const consignor = await findMerchant(body.consignor)
  const area = await findArea(body.areaId) || await findArea(body.stackCode)
  const item = await findItem(body.material)
  const shippingMethodId = await codeFromDict('wms_translate_type', body.shipMode)
  const mineralType = await codeFromDict('wms_mineral_type', body.oreType)
  const shipName = text(body.shipName).trim()

  if (!consignor) return fail('委托方在往来单位中不存在')
  if (!area) {
    const known = (await areaRows()).map((row) => areaCodeValue(row) || areaNameValue(row)).filter(Boolean)
    const hint = known.length ? `，档案中有 ${known.slice(0, 8).join('、')}` : '，没有读到堆位档案'
    return fail(`预定堆位 ${text(body.stackCode) || text(body.areaId)} 不存在${hint}`)
  }
  if (!item) return fail('请选择物料')
  if (shippingMethodId == null) return fail('货运方式需与后端字典编码一致')
  if (mineralType == null) return fail('矿种需与后端字典编码一致')
  if (!shipName) return fail('请填写船名')
  const amount = num(body.amount)
  if (amount == null) return fail('请填写订单金额')
  const owner = body.logisticsOwner ? await findMerchant(body.logisticsOwner) : undefined
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const currencies = await dictOf('wms_currency_type')
  const payload: Row = {
    orcId,
    consignorId: idOf(consignor.id),
    waybillNo: body.blNo,
    verificationCode: body.checklistNo,
    recordNo: body.customsNo,
    currency: currencyValue(currencies, body.currency),
    payableAmount: amount,
    itemId: idOf(item.id),
    areaId: idOf(area.id),
    mineralType,
    shippingMethodId,
    arrivalDate: arrivalOf(body.time),
    entityId: owner ? idOf(owner.id) : undefined,
    ebookId: book ? idOf(book.id) : undefined,
    areas: cellsBody(body.cells),
    shipName,
  }
  const result = await ruoyiSend('POST', '/wms/receiptOrder', payload)
  return result.ok ? ok(result.data, '入库预约已创建') : fail(result.message)
}

const HARMFUL_ELEMENTS: Array<[string, string]> = [
  ['as', 'As'],
  ['pb', 'Pb'],
  ['cd', 'Cd'],
  ['f', 'F'],
  ['hg', 'Hg'],
]

function harmfulElements(body: Row) {
  return HARMFUL_ELEMENTS.flatMap(([key, code]) => {
    const value = num(text(body[key]).replace(/%/g, ''))
    return value == null ? [] : [{ elementCode: code, elementValue: value }]
  })
}

async function receiveReceipt(id: string, body: Row) {
  const detail = await ruoyiGet(`/wms/receiptOrder/${id}`)
  if (!detail.ok) return fail(detail.message)
  const row = (detail.data || {}) as Row
  const wet = num(body.wetWeight)
  const dry = num(body.dryWeight)
  const moisture = num(body.moistureContent)
  if (wet == null || dry == null || moisture == null) return fail('到货收货需填写湿重、干重和水分。预约单不支持修改，请删除后重建。')
  const orderNo = text(row.receiptOrderNo || body.orderNo)
  if (!orderNo) return fail('未找到入库单号')
  const mineralType = num(body.oreType ? await codeFromDict('wms_mineral_type', body.oreType) : row.mineralType)
  if (mineralType == null) return fail('矿种需与后端字典编码一致')
  const method = nested(row, 'shippingMethod')
  const shippingMethodId = idOf(row.shippingMethodId)
    ?? idOf(method?.id)
    ?? idOf(typeof row.shippingMethod === 'object' ? undefined : row.shippingMethod)
    ?? idOf(body.shipMode ? await codeFromDict('wms_translate_type', body.shipMode) : undefined)
  if (shippingMethodId == null) return fail('装运方式不能为空')
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const itemType = num(body.category ? await codeFromDict('wms_item_type', body.category) : row.receiptType)
  const ebookId = book ? idOf(book.id) : idOf(row.ebookId)
  const elements = harmfulElements(body)
  const payload: Row = {
    id: idOf(id),
    receiptOrdeCode: orderNo,
    mineralType,
    shippingMethodId,
    wetWeight: wet,
    dryWeight: dry,
    moistureContent: moisture,
  }
  if (itemType != null) payload.itemType = itemType
  if (ebookId != null) payload.ebookId = ebookId
  const remark = text(body.remark).trim()
  if (remark) payload.remark = remark
  const weightOrcId = idOf(body.weightOrcId)
  const elementsOrcId = idOf(body.elementsOrcId)
  if (weightOrcId != null) payload.weightOrcId = weightOrcId
  if (elementsOrcId != null) payload.elementsOrcId = elementsOrcId
  if (elements.length) payload.elements = elements
  const result = await ruoyiSend('PUT', '/wms/receiptOrder', payload)
  return result.ok ? ok(true, '到货收货已提交') : fail(result.message)
}

async function exportItems(query: Query) {
  const categories = await dictOf('wms_item_category')
  const kinds = await dictOf('wms_item_type')
  const result = await ruoyiGet('/wms/item/list', pageParams({ page: 1, pageSize: 500 }, {
    itemName: query.keyword || undefined,
    type: query.kind ? await dictValue('wms_item_type', query.kind) : undefined,
    itemCategory: query.cargoType ? await dictValue('wms_item_category', query.cargoType) : undefined,
  }))
  if (!result.ok) return fail(result.message)
  const rows = result.rows.map((row) => {
    const item = itemRow(row, categories, kinds)
    return { ...item, source: item.source || '—' }
  })
  const day = new Date().toISOString().slice(0, 10)
  return ok({
    filename: `物料档案_${day}.csv`,
    content: toCsv([
      { key: 'code', label: '物料编码' },
      { key: 'name', label: '名称' },
      { key: 'cargoType', label: '货物类型' },
      { key: 'kind', label: '类型' },
      { key: 'source', label: '矿源' },
    ], rows),
  })
}

const OCR_FIXED: Record<string, Row> = {
  入库报关单: {
    id: '100000000000000001',
    docType: '入库报关单',
    shipName: '海豚号',
    blNo: 'BL20260804002',
    customsNo: 'BG20260804088',
    checklistNo: 'HZ20260804012',
    amount: 218000,
    currency: '2',
    timeText: '2026-08-06',
  },
  提单: {
    id: '100000000000000001',
    docType: '提单',
    shipName: '海洋之星',
    blNo: 'BL20260801001',
    customsNo: 'BG20260801088',
    checklistNo: 'HZ20260801012',
    amount: 1280000,
    currency: '2',
    timeText: '2026-08-05',
  },
  出库报关单: {
    id: '100000000000000002',
    docType: '出库报关单',
    customsNo: 'BGCK2026080301',
    checklistNo: 'HZCK2026080301',
    consignee: '华东冶炼股份公司',
    consumer: '华东冶炼冶炼一分厂',
    wet: 100,
    amount: 218000,
    currency: 'USD',
  },
  重量单: {
    id: '100000000000000003',
    docType: '重量单',
    wet: 820,
    dry: 738,
    moisture: '10%',
  },
  品质单: {
    id: '100000000000000004',
    docType: '品质单',
    qualityNo: 'QA-20260803-001',
    moisture: '10%',
    cu: '22.5%',
    ag: '45 g/t',
    au: '0.8 g/t',
    as: '0.12%',
    pb: '0.05%',
    cd: '0.01%',
    f: '0.02%',
    hg: '0.001%',
  },
}

async function recognize(body: Row) {
  const docType = text(body.docType)
  const sample = OCR_FIXED[docType] || (docType === '品质证书' ? OCR_FIXED['品质单'] : undefined)
  if (!sample) return fail('当前写死识别仅支持入库报关单、出库报关单、提单、重量单、品质单')
  return ok({
    ...sample,
    fileName: text(body.fileName) || `${docType}.pdf`,
    status: '待修正',
  }, '识别完成，可手工修正')
}

async function correctOcr(id: string, body: Row) {
  const detail = await ruoyiGet(`/wms/ocr/${id}`)
  const current = detail.ok ? (detail.data || {}) as Row : {}
  const result = await ruoyiSend('PUT', '/wms/ocr', {
    id: idOf(id),
    ocrLogType: body.ocrLogType ?? current.ocrLogType,
    orderId: body.archiveOnly ? 0 : (body.orderId ?? current.orderId ?? 0),
    orderNo: body.customsNo || body.orderNo || current.orderNo,
    ocrLogStatus: body.archiveOnly ? 3 : 2,
    result: {
      ...resultObject(current),
      customsNo: body.customsNo,
      recordNo: body.customsNo,
      checklistNo: body.checklistNo,
      verificationCode: body.checklistNo,
      consignee: body.consignee,
    },
  })
  return result.ok ? ok(true, '修正已提交并回填') : fail(result.message)
}

function dictTypeRow(row: Row): Row {
  return {
    id: text(row.dictId),
    name: text(row.dictName),
    type: text(row.dictType),
    status: dictStatusLabel(row.status),
    remark: text(row.remark),
    createdAt: text(row.createTime),
  }
}

function dictDataRow(row: Row): Row {
  return {
    id: text(row.dictCode),
    sort: row.dictSort ?? 0,
    label: text(row.dictLabel),
    value: text(row.dictValue),
    type: text(row.dictType),
    isDefault: text(row.isDefault) === 'Y' ? '是' : '否',
    cssClass: text(row.cssClass),
    listClass: text(row.listClass),
    status: dictStatusLabel(row.status),
    remark: text(row.remark),
    createdAt: text(row.createTime),
  }
}

async function saveDictType(id: string | undefined, body: Row) {
  const name = text(body.name).trim()
  const type = text(body.type).trim()
  if (!name) return fail('请填写字典名称')
  if (!/^[a-z][a-z0-9_]*$/.test(type)) return fail('字典类型须以小写字母开头，只能含小写字母、数字和下划线')
  const payload: Row = {
    dictName: name,
    dictType: type,
    status: dictStatusCode(body.status || '正常'),
    remark: text(body.remark),
  }
  if (id) payload.dictId = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/dict/type', payload)
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

async function saveDictData(id: string | undefined, body: Row) {
  const label = text(body.label).trim()
  const value = text(body.value).trim()
  const type = text(body.type).trim()
  if (!type) return fail('请选择字典类型')
  if (!label) return fail('请填写字典标签')
  if (!value) return fail('请填写字典键值')
  const payload: Row = {
    dictSort: num(body.sort) ?? 0,
    dictLabel: label,
    dictValue: value,
    dictType: type,
    isDefault: text(body.isDefault) === '是' ? 'Y' : 'N',
    cssClass: text(body.cssClass),
    listClass: text(body.listClass),
    status: dictStatusCode(body.status || '正常'),
    remark: text(body.remark),
  }
  if (id) payload.dictCode = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/dict/data', payload)
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

function nested(row: Row, key: string) {
  const value = row[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined
}

function stamp(value: unknown, size = 16) {
  return text(value).replace('T', ' ').slice(0, size)
}

function slashDay(value: unknown) {
  const day = text(value).replace('T', ' ').slice(0, 10).replace(/-/g, '/')
  return /^\d{4}\/\d{2}\/\d{2}$/.test(day) ? day : ''
}

function inDayRange(value: unknown, from: unknown, to: unknown) {
  const day = stamp(value, 10)
  if (!day) return !from && !to
  if (from && day < text(from).slice(0, 10)) return false
  if (to && day > text(to).slice(0, 10)) return false
  return true
}

function brief(message: string) {
  if (message.includes('production_order_status')) return '完工列表查询失败，数据表还没有 production_order_status'
  if (message.includes('源仓库')) return '源仓库不能为空'
  if (message.includes('目标') && message.includes('空')) return '请选择目标堆位'
  if (message.includes('移库单号')) return '移库单号不能为空'
  if (message.includes('inventory') && message.includes('null')) return '未找到在库批次'
  const line = message.split('\n').map((item) => item.trim()).find((item) => item && !item.startsWith('#')) || message
  return line.length > 80 ? '丰联接口返回错误' : line
}

function inventoryLot(
  row: Row,
  categories: { label: string; value: string }[],
  kinds: { label: string; value: string }[],
  houses: Row[],
): Row {
  const consignor = nested(row, 'consignor')
  const area = nested(row, 'area')
  const item = nested(row, 'item')
  const receipt = nested(row, 'receiptOrder') || nested(row, 'receipt')
  const warehouseId = text(row.warehouseId || area?.warehouseId)
  const house = houses.find((entry) => text(entry.id) === warehouseId)
  const recordNo = text(receipt?.recordNo || row.recordNo)
  const batchNo = text(row.batchNo || recordNo || row.orderNo || row.id)
  const remain = num(row.remainQuantity ?? row.quantity ?? receipt?.dryWeight)
  const cargoType = labelOf(categories, item?.itemCategory ?? row.itemCategory) || text(row.cargoType)
  const kind = labelOf(kinds, item?.type ?? row.itemType)
  const finished = cargoType === '混成品' || kind === '成品'
  return {
    id: text(row.id),
    inventoryId: text(row.id),
    orderId: text(row.orderId || receipt?.id),
    batchNo,
    batchKind: finished || /^FL-/.test(batchNo) ? '生产批次号' : '报关单号',
    consignor: text(consignor?.merchantName || row.consignorName),
    consignorId: text(row.consignorId || consignor?.id),
    material: text(item?.itemName || row.itemName),
    cargoType,
    filingNo: text(row.filingNo || receipt?.filingNo),
    warehouse: text(house?.warehouseName || house?.warehouseCode || warehouseId),
    warehouseId,
    stackText: text(area?.areaCode || area?.areaName || row.areaCode),
    areaId: text(row.areaId || area?.id),
    areaLabel: text(area?.areaIdentification || row.areaIdentification),
    wet: receipt?.wetWeight ?? row.wetWeight ?? '',
    dry: receipt?.dryWeight ?? row.dryWeight ?? remain ?? '',
    remain: remain ?? '',
    originCountry: finished ? '—' : text(row.country || row.originCountry || receipt?.originCountry || receipt?.country),
    book: text(nested(row, 'accountBook')?.accountCode || row.accountCode || receipt?.accountCode),
    status: remain === 0 ? '已出库' : '在库',
    inDate: hourText(row.inboundTime || row.createTime || receipt?.arrivalDate),
    skuId: row.skuId,
    shipName: text(receipt?.shipName || row.shipName),
    blNo: text(receipt?.waybillNo || row.waybillNo),
    customsNo: recordNo,
    cu: row.cu ?? '', ag: row.ag ?? '', au: row.au ?? '', as: row.as ?? '',
    pb: row.pb ?? '', cd: row.cd ?? '', f: row.f ?? '', hg: row.hg ?? '',
  }
}

async function enrichLot(row: Row) {
  if (!row.orderId || row.customsNo) return row
  const detail = await ruoyiGet(`/wms/receiptOrder/${row.orderId}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return row
  const receipt = detail.data as Row
  const recordNo = text(receipt.recordNo)
  const batchNo = recordNo || text(row.batchNo)
  return {
    ...row,
    customsNo: recordNo,
    batchNo,
    batchKind: /^FL-/.test(batchNo) ? '生产批次号' : '报关单号',
    blNo: text(receipt.waybillNo || row.blNo),
    wet: receipt.wetWeight ?? row.wet,
    dry: receipt.dryWeight ?? row.dry,
    shipName: text(receipt.shipName || row.shipName),
    inDate: row.inDate || stamp(receipt.arrivalDate, 13),
  }
}

function hourText(value: unknown) {
  const raw = stamp(value, 13)
  return raw.length >= 13 ? `${raw}时` : raw
}

function clockBound(value: unknown, end: boolean) {
  const raw = text(value).replace('T', ' ').trim()
  if (!raw) return ''
  if (raw.length >= 19) return raw.slice(0, 19)
  if (raw.length >= 13) return `${raw.slice(0, 13)}:${end ? '59:59' : '00:00'}`
  const day = raw.slice(0, 10)
  return day ? `${day} ${end ? '23:59:59' : '00:00:00'}` : ''
}

function monthBounds() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return { from: `${month}-01 00:00:00`, to: `${month}-${String(last).padStart(2, '0')} 23:59:59` }
}

function inventoryPage(query: Query, list: Row[], total: number, message = 'ok') {
  return ok({
    list,
    total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, message)
}

async function loadHouses() {
  return warehouseRows()
}

function objectRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object') as Row[]
}

function homeSource(result: RuoyiResult) {
  if (result.rows.length) return result.rows
  const data = result.data
  if (Array.isArray(data)) return objectRows(data)
  if (!data || typeof data !== 'object') return []
  const bag = data as Row
  for (const key of ['list', 'rows', 'records', 'areas', 'inventories', 'items', 'areaList']) {
    const nestedRows = objectRows(bag[key])
    if (nestedRows.length) return nestedRows
  }
  for (const value of Object.values(bag)) {
    const nestedRows = objectRows(value)
    if (nestedRows.some((item) => item.areaId != null || item.areaItems || item.consignorName)) return nestedRows
  }
  if (bag.areaId != null || bag.areaItems || bag.consignorName) return [bag]
  return []
}

function homeLot(row: Row, areas: Row[], houses: Row[]): CargoLot | null {
  const area = nested(row, 'area')
  const consignor = nested(row, 'consignor')
  const areaId = text(row.areaId || area?.id)
  const known = areas.find((item) => text(item.id) === areaId)
  const code = text(known?.areaCode || known?.areaName || area?.areaCode || area?.areaName || row.areaCode)
  if (!areaId && !code) return null
  const warehouseId = text(row.warehouseId || known?.warehouseId || area?.warehouseId)
  const house = houses.find((item) => text(item.id) === warehouseId)
  const cells = cellsText(row).split(',').filter(Boolean)
  const dry = num(row.dryWeight ?? row.quantity ?? row.remainQuantity) ?? 0
  return {
    stackText: code,
    warehouse: text(house?.warehouseCode || house?.warehouseName || warehouseId),
    consignor: text(row.consignorName || consignor?.merchantName || row.merchantName),
    cargoType: text(row.cargoType),
    wet: dry,
    status: '在库',
    areaId: areaId || undefined,
    cells: cells.length ? cells : undefined,
  }
}

async function inventoryHome() {
  const [result, areas, houses] = await Promise.all([
    ruoyiGet('/wms/inventory/home'),
    areaRows(),
    warehouseRows(),
  ])
  if (!result.ok) return fail(brief(result.message))
  const lots = homeSource(result).map((row) => homeLot(row, areas, houses)).filter((lot): lot is CargoLot => Boolean(lot))
  return ok(lots)
}

async function listInventory(query: Query) {
  const [categories, kinds, houses, consignor, area, book, itemCategory, itemType] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_item_type'),
    loadHouses(),
    query.consignor ? findMerchant(query.consignor) : Promise.resolve(undefined),
    query.stack ? findArea(query.stack) : Promise.resolve(undefined),
    query.book ? findBook(query.book) : Promise.resolve(undefined),
    query.cargoType ? dictValue('wms_item_category', query.cargoType) : Promise.resolve(undefined),
    query.kind ? dictValue('wms_item_type', query.kind) : Promise.resolve(undefined),
  ])
  if (query.consignor && !consignor) return inventoryPage(query, [], 0)
  if (query.book && !book) return inventoryPage(query, [], 0)
  const house = query.warehouse
    ? houses.find((entry) => [entry.id, entry.warehouseCode, entry.warehouseName].some((value) => text(value) === text(query.warehouse)))
    : undefined
  if (query.warehouse && !house) return inventoryPage(query, [], 0)
  const span = query.timeMode === 'month'
    ? monthBounds()
    : { from: clockBound(query.from, false), to: clockBound(query.to, true) }
  const country = text(query.originCountry)
  const filters: Query = {
    consignorId: consignor ? idOf(consignor.id) : undefined,
    areaId: area ? idOf(area.id) : undefined,
    areaCode: area ? undefined : text(query.stack) || undefined,
    warehouseId: house ? idOf(house.id) : undefined,
    recordNo: query.keyword || undefined,
    itemCategory,
    itemType,
    country: country && country !== '—' ? country : undefined,
    filingNo: query.filingNo || undefined,
    accountBookId: book ? idOf(book.id) : undefined,
    ...(span.from || span.to ? { params: { beginTime: span.from || undefined, endTime: span.to || undefined } } : {}),
  }
  let note = ''
  let result = await ruoyiGet('/wms/inventory/list', pageParams(query, filters))
  if (result.ok && query.keyword && result.total === 0) {
    const retry = await ruoyiGet('/wms/inventory/list', pageParams(query, { ...filters, recordNo: undefined, batchNo: query.keyword }))
    if (retry.ok) result = retry
  }
  if (!result.ok && (span.from || span.to)) {
    const rest = { ...filters }
    delete rest.params
    const retry = await ruoyiGet('/wms/inventory/list', pageParams(query, rest))
    if (!retry.ok) return fail(brief(retry.message))
    result = retry
    note = '库存列表暂不支持起止时间，已按其它条件查询'
  }
  if (!result.ok) return fail(brief(result.message))
  let rows = await Promise.all(result.rows.map((row) => inventoryLot(row, categories, kinds, houses)).map(enrichLot))
  const seen = new Set<string>()
  rows = rows.filter((row) => {
    const id = text(row.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  const whole = rows.length >= result.total
  rows = rows.filter((row) => {
    if (query.status && row.status !== query.status) return false
    if (query.kind === '成品' && row.cargoType !== '混成品' && row.batchKind !== '生产批次号') return false
    if (query.kind === '原料' && (row.cargoType === '混成品' || row.batchKind === '生产批次号')) return false
    if (!whole) return true
    if (query.cargoType && row.cargoType !== query.cargoType) return false
    if (query.filingNo && !`${row.filingNo}`.includes(text(query.filingNo))) return false
    if (query.originCountry && row.originCountry !== query.originCountry) return false
    if (query.book && row.book !== query.book) return false
    if (query.warehouse && row.warehouse !== query.warehouse) return false
    if (query.keyword && !`${row.batchNo}${row.customsNo}${row.stackText}`.includes(text(query.keyword))) return false
    if ((span.from || span.to) && !inDayRange(row.inDate, span.from, span.to)) return false
    return true
  })
  const total = whole ? rows.length : result.total
  return inventoryPage(query, rows, total, note || result.message)
}

async function locateInventory(batchNo: string) {
  const listed = await ruoyiGet('/wms/inventory/list', { pageNum: 1, pageSize: 500 })
  if (!listed.ok) return undefined
  const direct = listed.rows.find((row) => [row.id, row.orderNo, row.recordNo, row.batchNo].some((value) => text(value) === batchNo))
  if (direct) return direct
  for (const row of listed.rows.slice(0, 40)) {
    const orderId = text(row.orderId)
    if (!orderId) continue
    const detail = await ruoyiGet(`/wms/receiptOrder/${orderId}`)
    const receipt = detail.ok && detail.data && typeof detail.data === 'object' ? detail.data as Row : undefined
    if (receipt && [receipt.recordNo, receipt.waybillNo, receipt.receiptOrderNo].some((value) => text(value) === batchNo)) return row
  }
  return undefined
}

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]).trim()
    if (value && value !== 'null' && value !== 'undefined') return value
  }
  return ''
}

function shotFrom(row: Row) {
  const source = text(row.sourceUrl).trim()
  const name = source.split('?')[0].split('/').filter(Boolean).pop() || text(row.ocrLogNo)
  return { image: mediaUrl(source), name, result: resultObject(row), no: text(row.ocrLogNo) }
}

async function ocrShot(id: unknown) {
  const key = text(id).trim()
  if (!key || key === '0') return undefined
  const detail = await ruoyiGet(`/wms/ocr/${encodeURIComponent(key)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return undefined
  return shotFrom(detail.data as Row)
}

async function ocrRows(orderId: string, orderNo: string) {
  if (!orderId && !orderNo) return [] as Row[]
  const query: Query = { pageNum: 1, pageSize: 50 }
  if (orderId) query.orderId = orderId
  else query.orderNo = orderNo
  const listed = await ruoyiGet('/wms/ocr/list', query)
  return listed.ok ? listed.rows : []
}

const QUALITY_ALIAS: Record<string, string[]> = {
  cu: ['cu', 'Cu', 'CU', '铜'],
  ag: ['ag', 'Ag', 'AG', '银'],
  au: ['au', 'Au', 'AU', '金'],
  as: ['as', 'As', 'AS', '砷'],
  pb: ['pb', 'Pb', 'PB', '铅'],
  cd: ['cd', 'Cd', 'CD', '镉'],
  f: ['f', 'F', '氟'],
  hg: ['hg', 'Hg', 'HG', '汞'],
}

function qualityValues(result: Row, receipt?: Row) {
  const bag: Row = { ...result }
  const nested = result.elements
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) Object.assign(bag, nested as Row)
  const out: Record<string, string> = {}
  for (const [key, aliases] of Object.entries(QUALITY_ALIAS)) out[key] = pick(bag, aliases)
  const list = receipt?.elements
  if (!Array.isArray(list)) return out
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const el = item as Row
    const code = text(el.elementCode || el.elementName).trim().toLowerCase()
    const name = text(el.elementName).trim()
    const match = Object.entries(QUALITY_ALIAS).find(([, aliases]) => aliases.some((alias) => alias.toLowerCase() === code || alias === name))
    if (match && !out[match[0]]) out[match[0]] = text(el.elementValue)
  }
  return out
}

async function attachLotDocs(row: Row): Promise<Row> {
  const finished = row.cargoType === '混成品' || row.batchKind === '生产批次号'
  const orderId = text(row.orderId)
  let receipt: Row | undefined
  if (orderId) {
    const detail = await ruoyiGet(`/wms/receiptOrder/${orderId}`)
    if (detail.ok && detail.data && typeof detail.data === 'object') receipt = detail.data as Row
  }
  const [inboundShot, outboundShot, weightShot, qualityShot, listed] = await Promise.all([
    ocrShot(receipt?.orcId ?? receipt?.orcLogId),
    ocrShot(receipt?.outOrcId ?? receipt?.outOcrId),
    ocrShot(receipt?.weightOrcId ?? receipt?.weightOcrId),
    ocrShot(receipt?.elementsOrcId ?? receipt?.elementsOcrId),
    ocrRows(orderId, text(row.customsNo || row.batchNo)),
  ])
  let inboundDoc = inboundShot
  let outboundDoc = outboundShot
  let weight = weightShot
  let quality = qualityShot
  for (const item of listed) {
    const type = Number(item.ocrLogType)
    const next = shotFrom(item)
    if (!next.image) continue
    if (type === 0 && !inboundDoc?.image) inboundDoc = next
    if (type === 1 && !outboundDoc?.image) outboundDoc = next
    if (type === 2 && !weight?.image) weight = next
    if (type === 3 && !quality?.image) quality = next
  }
  const customs = finished ? (outboundDoc || inboundDoc) : (inboundDoc || outboundDoc)
  const customsResult = inboundDoc?.result || {}
  const outboundResult = outboundDoc?.result || {}
  const weightResult = weight?.result || {}
  const elements = qualityValues(quality?.result || {}, receipt)
  const empty = { image: '', name: '' }
  const shot = (item?: { image: string; name: string }) => (item?.image ? { image: item.image, name: item.name } : empty)
  return {
    ...row,
    checklistNo: pick(customsResult, ['verificationCode', 'checklistNo']) || text(receipt?.verificationCode || row.checklistNo),
    declareDate: pick(customsResult, ['declarationDate', 'declareDate']),
    wet: text(row.wet).trim() || pick(weightResult, ['wetWeight', 'wet']) || text(receipt?.wetWeight),
    dry: text(row.dry).trim() || pick(weightResult, ['dryWeight', 'dry']) || text(receipt?.dryWeight),
    moisture: text(row.moisture).trim() || pick(weightResult, ['moistureContent', 'moisture']) || text(receipt?.moistureContent),
    filingNo: text(row.filingNo).trim() || text(receipt?.filingNo),
    originCountry: text(row.originCountry).trim() || text(receipt?.originCountry || receipt?.country),
    shipName: text(row.shipName) || pick(customsResult, ['shipName']) || text(receipt?.shipName),
    blNo: text(row.blNo) || pick(customsResult, ['waybillNo', 'blNo']) || text(receipt?.waybillNo),
    outCustomsNo: pick(outboundResult, ['recordNo', 'customsNo']) || text(row.outCustomsNo),
    outChecklistNo: pick(outboundResult, ['verificationCode', 'checklistNo']),
    flowTo: pick(outboundResult, ['flowTo', 'consignee', 'merchantName']) || pick(customsResult, ['flowTo', 'consignee', 'merchantName']),
    weightNo: text(weight?.no || pick(weightResult, ['certificateNo', 'docNo'])),
    qualityNo: text(quality?.no || pick(quality?.result || {}, ['certificateNo', 'docNo'])),
    cu: elements.cu || row.cu,
    ag: elements.ag || row.ag,
    au: elements.au || row.au,
    as: elements.as || row.as,
    pb: elements.pb || row.pb,
    cd: elements.cd || row.cd,
    f: elements.f || row.f,
    hg: elements.hg || row.hg,
    docs: {
      customs: shot(customs),
      inbound: shot(inboundDoc),
      outbound: shot(outboundDoc),
      weight: shot(weight),
      quality: shot(quality),
    },
    ocrRecords: listed.map((item) => {
      const type = Number(item.ocrLogType)
      const next = shotFrom(item)
      const status = Number(item.ocrLogStatus)
      return {
        id: text(item.id),
        docType: OCR_TYPE_LABEL[type] || text(item.ocrLogType),
        fileName: next.name,
        customsNo: pick(next.result, ['recordNo', 'customsNo']) || text(row.customsNo || row.batchNo),
        checklistNo: pick(next.result, ['verificationCode', 'checklistNo']),
        status: OCR_STATUS[status] || text(item.ocrLogStatus),
        time: text(item.createTime).replace('T', ' ').slice(0, 16),
        orderId: text(item.orderId || orderId),
      }
    }),
  }
}

function wantsDocs(value: unknown) {
  const flag = text(value).trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

async function inventoryBatch(batchNo: string, query: Query = {}) {
  const raw = await locateInventory(batchNo)
  if (!raw) return fail('批次不存在')
  const [categories, kinds, houses] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_item_type'),
    loadHouses(),
  ])
  const enriched = await enrichLot(inventoryLot(raw, categories, kinds, houses))
  const row = wantsDocs(query.docs) ? await attachLotDocs(enriched) : enriched
  const ledger = row.inDate ? [{ time: row.inDate, action: '入库', wet: row.wet, dry: row.dry, stack: row.stackText, consignee: '' }] : []
  return ok({ ...row, ledger, products: [] })
}

function movementOrderNo() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `YK${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function clockParts(value: unknown) {
  const raw = text(value).trim()
  if (!raw) return { date: undefined as string | undefined, hour: undefined as string | undefined }
  const [date, clock] = raw.split(' ')
  const hour = (clock || '00').slice(0, 2).padStart(2, '0')
  if (!date) return { date: undefined, hour: undefined }
  return { date, hour: `${hour}:00:00` }
}

async function createMovement(body: Row) {
  const batchNo = text(body.batchNo)
  const source = await locateInventory(text(body.inventoryId) || batchNo)
  if (!source) return fail('未找到在库批次')
  const target = await findArea(body.areaId) || await findArea(body.toStack)
  if (!target) return fail('目标堆位不存在')
  const sourceWarehouseId = idOf(source.warehouseId)
  const targetWarehouseId = idOf(target.warehouseId)
  if (sourceWarehouseId == null) return fail('源仓库不能为空')
  if (targetWarehouseId == null) return fail('目标堆位没有所属仓库')
  const scene = text(body.scene) || '整票移位'
  const partial = scene === '拆票移位'
  const qty = partial
    ? num(body.weight)
    : (num(body.weight) ?? num(source.dryWeight) ?? num(source.quantity) ?? num(source.remainQuantity))
  if (!(qty && qty > 0)) return fail(partial ? '请填写移库重量' : '该票没有可移重量')
  const orderNo = movementOrderNo()
  const from = clockParts(body.timeFrom)
  const to = clockParts(body.timeTo)
  const areas = cellsBody(body.cells)
  const result = await ruoyiSend('POST', '/wms/movementOrder', {
    movementOrderNo: orderNo,
    movementType: partial ? 1 : scene === '批量移位' ? 2 : 0,
    inventoryId: idOf(source.id),
    sourceWarehouseId,
    sourceAreaId: idOf(source.areaId),
    targetWarehouseId,
    targetAreaId: idOf(target.id),
    quantity: qty,
    totalQuantity: qty,
    remark: scene,
    ...(areas.length ? { areas } : {}),
    ...(from.date ? { startDate: from.date, startHour: from.hour } : {}),
    ...(to.date ? { endDate: to.date, endHour: to.hour } : {}),
  })
  if (!result.ok) return fail(brief(result.message))
  return ok({ orderNo, id: text((result.data as Row | undefined)?.id || result.data) }, '移库单已生成')
}

async function createMovements(body: Row) {
  const ids = Array.isArray(body.batchNos) ? body.batchNos.map(String) : []
  if (!ids.length) return fail('请勾选矿批次')
  if (!text(body.toStack)) return fail('请选择目标堆位')
  let count = 0
  for (const batchNo of ids) {
    const saved = await createMovement({ ...body, batchNo })
    if (!saved.success) return fail(`${batchNo} ${saved.message}`)
    count += 1
  }
  return ok({ count }, `已生成 ${count} 条移库单`)
}

async function listMovements(query: Query) {
  const [statuses, areas, consignor] = await Promise.all([
    dictOf('wms_movement_status'),
    areaRows(),
    query.consignor ? findMerchant(query.consignor) : Promise.resolve(undefined),
  ])
  const result = await ruoyiGet('/wms/movementOrder/list', pageParams(query, {
    consignorId: consignor ? idOf(consignor.id) : undefined,
  }))
  if (!result.ok) return fail(brief(result.message))
  const rows = result.rows.map((row) => movementView(row, areas, statuses)).filter((row): row is Row => Boolean(row)).filter((row) => {
    if (query.scene && row.scene !== query.scene) return false
    if (query.keyword && !`${row.orderNo}${row.customsNo}${row.prodBatch}${row.fromStack}${row.toStack}${row.inventoryId}`.includes(text(query.keyword))) return false
    if (!inDayRange(row.timeFrom, query.from, query.to)) return false
    return true
  })
  const local = Boolean(query.scene || query.from || query.to || query.keyword) || rows.length !== result.rows.length
  return ok({
    list: rows,
    total: local ? rows.length : result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  })
}

function movementView(row: Row, areas: Row[], statuses: { label: string; value: string }[]): Row | null {
  const sourceArea = nested(row, 'sourceArea')
  const targetArea = nested(row, 'targetArea')
  const sourceId = text(row.sourceAreaId || sourceArea?.id)
  const targetId = text(row.targetAreaId || targetArea?.id)
  const orderNo = text(row.movementOrderNo)
  if (!orderNo && !targetId) return null
  const source = areas.find((area) => text(area.id) === sourceId)
  const target = areas.find((area) => text(area.id) === targetId)
  const detail = Array.isArray(row.details) ? row.details[0] as Row : undefined
  const item = nested(row, 'item') || (detail ? nested(detail, 'item') : undefined)
  const consignor = nested(row, 'consignor')
  const time = movementHour(row.startDate, row.startHour, row.createTime)
  const end = movementHour(row.endDate, row.endHour, row.updateTime) || time
  return {
    id: text(row.id),
    orderNo: orderNo || text(row.id),
    scene: text(row.remark) || '整票移位',
    weight: row.totalQuantity ?? row.quantity ?? detail?.quantity ?? '',
    status: labelOf(statuses, row.movementOrderStatus) || '已移库',
    consignor: text(consignor?.merchantName || row.consignorName),
    inventoryId: text(row.inventoryId),
    customsNo: text(detail?.batchNo || row.recordNo || row.orderNo),
    prodBatch: '',
    material: text(item?.itemName || row.itemName),
    shipName: '—',
    containerCount: 0,
    fromStack: text(sourceArea?.areaCode || sourceArea?.areaName || source?.areaCode || source?.areaName || sourceId),
    toStack: text(targetArea?.areaCode || targetArea?.areaName || target?.areaCode || target?.areaName || targetId),
    timeFrom: time,
    timeTo: end,
  }
}

/** 移库时间只到小时。优先用开始/结束的日期和小时，没有时再从完整时间里取到时。 */
function movementHour(date: unknown, hour: unknown, fallback: unknown) {
  const day = text(date).replace('T', ' ').slice(0, 10)
  const clock = text(hour).trim()
  const mark = clock.slice(0, 2)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}$/.test(mark)) return `${day} ${mark}时`
  return hourText(fallback)
}

const FILING_STATUS = [
  { label: '有效', value: '1' },
  { label: '即将用尽', value: '2' },
  { label: '已用尽', value: '3' },
]

function dayText(value: unknown) {
  const raw = text(value).trim()
  return raw ? raw.slice(0, 10) : ''
}

function usageText(value: unknown) {
  const raw = text(value).trim()
  if (!raw) return '0.00%'
  if (raw.includes('%')) return raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : raw
}

async function filingStatusOptions() {
  const listed = await dictOf('wms_filing_status')
  return listed.length ? listed : FILING_STATUS
}

async function filingStatusCode(label: unknown) {
  const raw = text(label)
  if (!raw) return undefined
  const hit = (await filingStatusOptions()).find((item) => item.label === raw || item.value === raw)
  return hit ? hit.value : raw
}

async function filingQuery(query: Query) {
  return {
    mineralSource: text(query.source).trim() || undefined,
    recordNumber: text(query.keyword).trim() || undefined,
    category: text(query.sourceKind).trim() || undefined,
    status: await filingStatusCode(query.status),
    startTime: query.from ? dayText(query.from) : undefined,
    endTime: query.to ? dayText(query.to) : undefined,
  }
}

function filingRow(
  row: Row,
  sources: { label: string; value: string }[],
  kinds: { label: string; value: string }[],
  statuses: { label: string; value: string }[],
) {
  const fileUrl = text(row.fileUrl)
  const qty = num(row.filingsNum) ?? 0
  const used = num(row.verifiedTonnage) ?? 0
  const remain = num(row.remainingTonnage)
  return {
    id: text(row.id),
    source: labelOf(sources, row.mineralSource),
    sourceKind: labelOf(kinds, row.category),
    originCountry: text(row.originCountry),
    code: text(row.recordNumber),
    filingDate: dayText(row.recordTime),
    status: labelOf(statuses, row.status) || '有效',
    qty,
    usedQty: used,
    remain: remain ?? Math.max(0, Math.round((qty - used) * 100) / 100),
    usage: usageText(row.dosage),
    prodBatches: text(row.batchNumber) || '—',
    attachment: fileUrl,
    attachmentUrl: isMediaPath(fileUrl) ? mediaUrl(fileUrl) : '',
    attachmentText: fileUrl ? '1 个' : '—',
  }
}

async function filingRows(rows: Row[]) {
  const [sources, kinds, statuses] = await Promise.all([
    dictOf('wms_mineral_source'),
    dictOf('wms_mineral_type'),
    filingStatusOptions(),
  ])
  return rows.map((row) => filingRow(row, sources, kinds, statuses))
}

const FILING_CACHE_KEY = 'wms_filing_list'
let filingGeneration = 0
let filingPending: Promise<Row[]> | null = null

function readFilingCache() {
  try {
    const raw = sessionStorage.getItem(FILING_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : null
  } catch {
    return null
  }
}

function writeFilingCache(rows: Row[], generation: number) {
  if (generation !== filingGeneration) return
  try {
    sessionStorage.setItem(FILING_CACHE_KEY, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

function clearFilingCache() {
  filingGeneration += 1
  filingPending = null
  sessionStorage.removeItem(FILING_CACHE_KEY)
}

async function loadFilingCatalog(generation: number) {
  const result = await ruoyiGet('/wms/mineralSourceFiling/list', { pageNum: 1, pageSize: 500 })
  const rows = result.ok ? result.rows : []
  if (result.ok) writeFilingCache(rows, generation)
  return rows
}

async function filingCatalog() {
  const cached = readFilingCache()
  if (cached) return cached.map((row) => ({ ...row }))
  if (filingPending) return (await filingPending).map((row) => ({ ...row }))
  const generation = filingGeneration
  const task = loadFilingCatalog(generation).finally(() => {
    if (filingPending === task) filingPending = null
  })
  filingPending = task
  return (await task).map((row) => ({ ...row }))
}

function filingCatalogQuery(query: Query, filters: Query) {
  return Number(query.pageSize || 10) >= 500
    && !filters.mineralSource
    && !filters.recordNumber
    && !filters.category
    && !filters.status
    && !filters.startTime
    && !filters.endTime
}

async function listFilings(query: Query) {
  const filters = await filingQuery(query)
  if (filingCatalogQuery(query, filters)) {
    const rows = await filingCatalog()
    const page = Number(query.page || 1)
    const pageSize = Number(query.pageSize || 500)
    const start = (page - 1) * pageSize
    return ok({
      list: await filingRows(rows.slice(start, start + pageSize)),
      total: rows.length,
      page,
      pageSize,
    })
  }
  const result = await ruoyiGet('/wms/mineralSourceFiling/list', pageParams(query, filters))
  return pageOf(result, await filingRows(result.rows), query)
}

function filingFileOk(file: Blob, name: string) {
  const type = file.type || ''
  const lower = name.toLowerCase()
  return type.startsWith('image/') || type === 'application/pdf' || lower.endsWith('.pdf') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)
}

function filingUploadPath(data: unknown) {
  const raw = typeof data === 'string'
    ? data.trim()
    : data && typeof data === 'object'
      ? text((data as Row).fileUrl || (data as Row).url || (data as Row).path || (data as Row).fileName).trim()
      : ''
  if (!raw || raw === 'ok' || raw === '操作成功') return ''
  return raw.startsWith('/') || /^https?:/i.test(raw) || /\.[a-z0-9]{2,5}$/i.test(raw) ? raw : ''
}

async function uploadFilingFile(file: Blob) {
  const name = file instanceof File && file.name ? file.name : 'filing.png'
  if (!filingFileOk(file, name)) return fail('附件仅支持图片或 PDF')
  const form = new FormData()
  form.append('file', file, name)
  const result = await ruoyiSend('POST', '/wms/mineralSourceFiling', form)
  if (!result.ok) return fail(result.message || '附件上传失败')
  const path = filingUploadPath(result.data) || filingUploadPath(result.message)
  if (!path) return fail('附件上传未返回路径')
  return ok(path)
}

async function saveFiling(id: string | undefined, body: Row) {
  const source = text(body.source).trim()
  const sourceKind = text(body.sourceKind).trim()
  const originCountry = text(body.originCountry).trim()
  const code = text(body.code).trim()
  const filingDate = dayText(body.filingDate)
  const qty = num(body.qty)
  if (!source || !originCountry || !code) return fail('请填写矿源、备案原产国和备案编号')
  if (qty != null && qty <= 0) return fail('备案数量须大于 0')
  let fileUrl = text(body.attachment).trim()
  const file = body.__file
  if (file instanceof Blob) {
    const uploaded = await uploadFilingFile(file)
    if (!uploaded.success || !uploaded.data) return fail(uploaded.message || '附件上传失败')
    fileUrl = uploaded.data
  }
  const payload: Row = {
    mineralSource: source,
    originCountry,
    recordNumber: code,
  }
  if (sourceKind) payload.category = sourceKind
  if (filingDate) payload.recordTime = filingDate
  if (qty != null) payload.filingsNum = qty
  if (id) payload.id = idOf(id) ?? id
  if (fileUrl || id) payload.fileUrl = fileUrl
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/mineralSourceFiling', payload)
  if (!result.ok) return fail(result.message)
  clearFilingCache()
  return ok(true, id ? '已保存' : '备案已创建')
}

async function exportFilings(query: Query) {
  const filters = await filingQuery(query)
  try {
    const response = await ruoyiBlob('/wms/mineralSourceFiling/export', filters)
    const blob = response.data
    const type = blob.type || ''
    if (type.includes('json') || type.includes('text')) {
      const raw = await blob.text()
      try {
        const body = JSON.parse(raw) as { code?: number; msg?: string }
        if (body.code != null && body.code !== 200 && body.code !== 0) return fail(body.msg || '导出失败')
      } catch {
        return ok({ filename: `矿源备案_${new Date().toISOString().slice(0, 10)}.csv`, content: raw })
      }
    }
    const day = new Date().toISOString().slice(0, 10)
    return ok({ filename: `矿源备案_${day}.xlsx`, blob })
  } catch {
    return fail('导出失败')
  }
}

function filingLotRow(row: Row) {
  return {
    customsNo: text(row.customsNo || row.batchNo),
    prodBatch: row.batchKind === '生产批次号' ? text(row.batchNo) : '—',
    consignor: text(row.consignor),
    material: text(row.material),
    cargoType: text(row.cargoType),
    stack: text(row.stackText),
    wet: row.wet ?? '',
    dry: row.dry ?? '',
    inAt: text(row.inDate),
    status: text(row.status),
  }
}

async function filingLots(code: string) {
  const page = await listInventory({ page: 1, pageSize: 500, filingNo: code })
  if (!page.success || !page.data) return fail(page.message || '票货查询失败')
  const data = page.data as { list?: Row[] }
  return ok((data.list || []).map(filingLotRow))
}

async function exportFilingLots(code: string) {
  const listed = await filingLots(code)
  if (!listed.success || !Array.isArray(listed.data)) return fail(listed.message || '票货查询失败')
  return ok({
    filename: `矿源备案票货_${code}.csv`,
    content: toCsv([
      { key: 'customsNo', label: '报关单号' },
      { key: 'prodBatch', label: '生产批次号' },
      { key: 'consignor', label: '委托方' },
      { key: 'material', label: '物料' },
      { key: 'cargoType', label: '货物类型' },
      { key: 'stack', label: '堆位' },
      { key: 'wet', label: '湿重' },
      { key: 'dry', label: '干重(DMT)' },
      { key: 'inAt', label: '入库时间' },
      { key: 'status', label: '状态' },
    ], listed.data),
  })
}

function fileLabel(path: string) {
  if (!path) return '—'
  const names = path.split(/[、,]/).map((item) => item.trim().split(/[\\/]/).pop() || item.trim()).filter(Boolean)
  return names.join('、') || '—'
}

function checkScope(row: Row, areas: Row[]) {
  const details = Array.isArray(row.details) ? row.details as Row[] : []
  const groups = new Map<string, { name: string; codes: string[]; ids: Set<string> }>()
  const order: string[] = []
  for (const detail of details) {
    const area = nested(detail, 'area')
    const house = nested(area || {}, 'warehouse') || nested(detail, 'warehouse')
    const houseId = text(detail.warehouseId || area?.warehouseId || house?.id)
    const key = houseId || text(house?.warehouseName || house?.warehouseCode)
    if (!key) continue
    if (!groups.has(key)) {
      order.push(key)
      groups.set(key, { name: text(house?.warehouseName || house?.warehouseCode || key), codes: [], ids: new Set() })
    }
    const group = groups.get(key)!
    const named = text(house?.warehouseName || house?.warehouseCode)
    if (named) group.name = named
    const areaId = text(detail.areaId || area?.id)
    if (areaId) group.ids.add(areaId)
    const code = text(area?.areaCode || area?.areaName || detail.areaCode)
    if (code && !group.codes.includes(code)) group.codes.push(code)
  }
  const parts: string[] = []
  for (const key of order) {
    const group = groups.get(key)!
    const owned = areas.filter((area) => text(area.warehouseId || nested(area, 'warehouse')?.id) === key)
    const ownedIds = owned.map((area) => text(area.id)).filter(Boolean)
    const complete = ownedIds.length > 0 && ownedIds.every((id) => group.ids.has(id))
    if (complete) parts.push(group.name)
    else parts.push(...group.codes)
  }
  return parts.filter(Boolean).join(', ') || '—'
}

function checkView(row: Row, areas: Row[]) {
  const attachment = text(row.attachmentPath)
  const paths = attachment.split(/[、,]/).map((item) => item.trim()).filter(Boolean)
  return {
    id: text(row.checkOrderNo || row.id),
    operator: text(row.checkUser || row.createBy) || '—',
    time: slashDay(row.planDate) || slashDay(row.createTime) || '—',
    areaText: checkScope(row, areas),
    attachment: fileLabel(attachment),
    attachmentUrls: paths.map((item) => mediaUrl(item)),
    attachmentNames: paths.map((item) => item.split(/[\\/]/).pop() || item),
    remark: text(row.remark),
  }
}

async function listCheckOrders(query: Query) {
  const day = text(query.date).slice(0, 10)
  const result = await ruoyiGet('/wms/checkOrder/list', pageParams(query, {
    checkOrderNo: query.keyword || undefined,
    checkUser: query.person || undefined,
    planDate: day ? `${day} 00:00:00` : undefined,
  }))
  if (!result.ok) return fail(brief(result.message))
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  let source = result.rows
  let total = result.total
  if (source.length > pageSize) {
    total = Math.max(total, source.length)
    source = source.slice((page - 1) * pageSize, page * pageSize)
  }
  const areas = await areaRows()
  return ok({ list: source.map((row) => checkView(row, areas)), total, page, pageSize }, result.message)
}

async function createCheckOrder(body: Row) {
  const uploads = Array.isArray(body.__files) ? body.__files.filter((file): file is File => file instanceof File) : []
  if (!uploads.length) return fail('请上传附件')
  const areas = Array.isArray(body.areas) ? body.areas as Row[] : []
  const picked = areas.filter((item) => text(item.warehouseId) && text(item.areaId))
  if (!picked.length) return fail('请选择盘点区域')
  const day = dayText(body.date) || new Date().toISOString().slice(0, 10)
  const form = new FormData()
  form.append('planDate', `${day} 00:00:00`)
  const person = text(body.person).trim()
  if (person) form.append('checkUser', person)
  picked.forEach((item, index) => {
    form.append(`details[${index}].warehouseId`, text(item.warehouseId))
    form.append(`details[${index}].areaId`, text(item.areaId))
  })
  for (const file of uploads) form.append('file', file, file.name || 'attachment')
  const result = await ruoyiSend('POST', '/wms/checkOrder', form)
  return result.ok ? ok(true, '盘点记录已提交') : fail(brief(result.message))
}

async function exportCheckOrders(query: Query) {
  const pageSize = 200
  const rows: Row[] = []
  const filters: Query = { ...query }
  delete filters.page
  delete filters.pageSize
  for (let page = 1; page <= 100; page += 1) {
    const listed = await listCheckOrders({ ...filters, page, pageSize })
    if (!listed.success || !listed.data) return fail(listed.message || '导出失败')
    const data = listed.data as { list?: Row[]; total?: number }
    const list = data.list || []
    rows.push(...list)
    const total = Number(data.total || 0)
    if (!list.length || rows.length >= total) break
  }
  const day = new Date().toISOString().slice(0, 10)
  return ok({
    filename: `盘点单_${day}.csv`,
    content: toCsv([
      { key: 'id', label: '盘点单号' },
      { key: 'operator', label: '盘点人' },
      { key: 'time', label: '盘点日期' },
      { key: 'areaText', label: '盘点区域' },
      { key: 'attachment', label: '附件' },
    ], rows.map((row) => ({
      id: row.id,
      operator: row.operator,
      time: row.time,
      areaText: row.areaText,
      attachment: row.attachment,
    }))),
  })
}

function shipmentNo(detail: Row) {
  const shipment = nested(detail, 'shipmentOrder')
  if (!shipment) return ''
  return text(shipment.recordNo || shipment.customsNo || shipment.orderNo || shipment.shipmentOrderNo)
}

function productionLines(
  row: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
) {
  const details = Array.isArray(row.productionOrderDetails) ? row.productionOrderDetails as Row[] : []
  const consignor = text(nested(row, 'consignor')?.merchantName)
  return details.filter((detail) => num(detail.direction) !== 1).map((detail) => {
    const receipt = nested(detail, 'receiptOrder')
    const item = nested(detail, 'item')
    const area = nested(detail, 'area')
    const ship = text(receipt?.shipName)
    const voyage = text(receipt?.voyage || receipt?.voyageNo)
    return {
      inventoryId: text(detail.inventoryId),
      customsNo: text(receipt?.recordNo || detail.batchNo),
      consignor: consignor || text(detail.consignorName),
      cargoType: labelOf(categories, item?.itemCategory ?? detail.itemCategory),
      material: text(item?.itemName || detail.itemName),
      voyage: [ship, voyage].filter(Boolean).join(' / '),
      blNo: text(receipt?.waybillNo),
      originCountry: text(receipt?.originCountry || receipt?.country),
      wet: num(detail.wetWeight ?? receipt?.wetWeight) ?? 0,
      dry: num(receipt?.dryWeight ?? detail.dryWeight) ?? 0,
      feedDry: num(detail.dryWeight) ?? 0,
      stack: text(area?.areaCode || area?.areaName),
      areaLabel: labelOf(areaNames, area?.areaIdentification),
      outCustomsNo: shipmentNo(detail),
    }
  })
}

function productionDoc(
  row: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
  asFinish: boolean,
) {
  const lines = productionLines(row, categories, areaNames)
  const area = nested(row, 'area')
  const item = nested(row, 'item')
  const kind = num(row.productionType)
  const weighed = num(row.productionWeight)
  const finished = asFinish || num(row.productionOrderStatus) === 1 || (text(row.targetAreaId) !== '' && weighed != null && weighed > 0)
  const docType = finished ? '完工入库' : kind === 1 ? '加工过程' : '投料出库'
  const customs = [...new Set(lines.map((line) => line.customsNo).filter(Boolean))]
  const stacks = [...new Set(lines.map((line) => line.stack).filter(Boolean))]
  const outNos = [...new Set(lines.map((line) => line.outCustomsNo).filter(Boolean))]
  return {
    id: text(row.id),
    orderNo: text(row.productionOrderNo || row.workOrderNo || row.id),
    docType,
    finished,
    stage: finished ? '完工' : kind === 1 ? '加工' : '投料',
    consignor: text(nested(row, 'consignor')?.merchantName),
    prodBatch: text(row.batchNo),
    workOrder: text(row.workOrderNo),
    process: text(row.processName),
    time: stamp(row.startTime || row.createTime, 16),
    timeTo: stamp(row.endTime, 16),
    remark: text(row.remark),
    feedLines: lines,
    customsNos: customs.join('、'),
    outCustomsNo: outNos.join('、'),
    sourceStacks: stacks.join(' / '),
    outputDry: row.productionWeight ?? '',
    product: text(item?.itemName),
    stackCode: text(area?.areaCode || area?.areaName),
    areaLabel: labelOf(areaNames, area?.areaIdentification),
    warehouseId: text(row.targetWarehouseId || area?.warehouseId),
    areaId: text(row.targetAreaId || area?.id),
  }
}

async function productionDicts() {
  const [categories, areaNames] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_area_identification'),
  ])
  return { categories, areaNames }
}

function productionFilters(query: Query, consignorId: unknown) {
  const filters: Query = {}
  if (consignorId != null) filters.consignorId = consignorId
  const batch = text(query.batchNo).trim()
  if (batch) filters.batchNo = batch
  if (query.from) filters.startTime = clockBound(query.from, false)
  if (query.to) filters.endTime = clockBound(query.to, true)
  return filters
}

function productionKind(query: Query) {
  const asked = text(query.type || query.docType)
  if (asked === '2' || asked === '完工入库') return 2
  return 1
}

async function listProduction(query: Query) {
  const { categories, areaNames } = await productionDicts()
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters = productionFilters(query, consignor ? idOf(consignor.id) : undefined)
  const kind = productionKind(query)
  const result = await ruoyiGet('/wms/productionOrder/list', pageParams(query, { ...filters, type: kind }))
  if (!result.ok) return fail(brief(result.message))
  const word = text(query.keyword).trim()
  const list = result.rows.map((row) => productionDoc(row, categories, areaNames, kind === 2)).filter((row) => {
    if (!word) return true
    const lines = Array.isArray(row.feedLines) ? row.feedLines as Row[] : []
    return `${row.id}${row.orderNo}${row.prodBatch}${row.customsNos}${row.outCustomsNo}${lines.map((line) => line.customsNo).join('')}`.includes(word)
  })
  if (word) return ok({ list, total: list.length, page: 1, pageSize: list.length || Number(query.pageSize || 10) })
  return pageOf(result, list, query)
}

async function productionBatch(batchNo: string) {
  const { categories, areaNames } = await productionDicts()
  const result = await ruoyiGet('/wms/productionOrder/listNoPage', { batchNo })
  if (!result.ok) return fail(result.message)
  const list = result.rows.map((row) => productionDoc(row, categories, areaNames, num(row.productionOrderStatus) === 1))
  return ok({ list, prodBatch: batchNo })
}

async function joinedConsignorId(lines: Row[], fallback: unknown) {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown) => {
    const raw = text(value).trim()
    if (!raw || seen.has(raw)) return
    seen.add(raw)
    ids.push(raw)
  }
  for (const line of lines) {
    if (text(line.consignorId)) push(line.consignorId)
    else if (text(line.consignor)) {
      const merchant = await findMerchant(line.consignor)
      if (merchant) push(merchant.id)
    }
  }
  if (!ids.length) text(fallback).split(/[,、]/).forEach(push)
  return ids.join(',')
}

async function createProductionFeed(body: Row) {
  const batchNo = text(body.prodBatch || body.batchNo).trim()
  const lines = Array.isArray(body.feedLines) ? body.feedLines as Row[] : []
  if (!batchNo) return fail('请填写生产批次')
  const details = lines.map((line) => ({
    inventoryId: idOf(line.inventoryId),
    dryWeight: num(line.feedDry),
  })).filter((item) => item.inventoryId != null && item.dryWeight != null)
  if (!details.length) return fail('请勾选报关单')
  const consignorId = await joinedConsignorId(lines, body.consignorId)
  if (!consignorId) return fail('请选择委托方')
  const result = await ruoyiSend('POST', '/wms/productionOrder', { batchNo, consignorId, productionOrderDetails: details })
  return result.ok ? ok(result.data, '投料已登记') : fail(brief(result.message))
}

async function pushProduction(id: string, body: Row) {
  const processName = text(body.process || body.processName).trim()
  if (!id) return fail('请选择投料单')
  if (!processName) return fail('请填写工序')
  const payload: Row = { id: idOf(id), processName }
  const startTime = body.time || body.startTime ? clockBound(body.time || body.startTime, false) : ''
  const endTime = body.timeTo || body.endTime ? clockBound(body.timeTo || body.endTime, true) : ''
  if (startTime) payload.startTime = startTime
  if (endTime) payload.endTime = endTime
  const remark = text(body.remark).trim()
  if (remark) payload.remark = remark
  const result = await ruoyiSend('POST', '/wms/productionOrder/push', payload)
  return result.ok ? ok(result.data, '加工已登记') : fail(brief(result.message))
}

async function finishProduction(id: string, body: Row) {
  const weight = num(body.outputDry ?? body.productionWeight)
  if (!(weight != null && weight > 0)) return fail('请填写产量')
  if (!id) return fail('请选择生产单')
  let areaId = text(body.areaId)
  let warehouseId = text(body.warehouseId)
  if (!areaId || !warehouseId) {
    const areas = await areaRows()
    const code = text(body.stackCode)
    const area = areas.find((row) => text(row.id) === areaId || areaCodeValue(row) === code || areaNameValue(row) === code)
    if (area) {
      areaId = areaId || text(area.id)
      warehouseId = warehouseId || text(area.warehouseId || nested(area, 'warehouse')?.id)
    }
  }
  if (!areaId) return fail('请选择待检区堆位')
  const payload: Row = {
    id: idOf(id),
    productionWeight: weight,
    targetAreaId: idOf(areaId),
  }
  if (warehouseId) payload.targetWarehouseId = idOf(warehouseId)
  const result = await ruoyiSend('PUT', '/wms/productionOrder', payload)
  return result.ok ? ok(true, '已完工入库') : fail(brief(result.message))
}

export async function handleLive(method: string, url: string, body?: unknown, params?: Query) {
  const path = url.split('?')[0]
  const payload = (body || {}) as Row
  const query = params || {}
  const upper = method.toUpperCase()

  if (upper === 'POST' && path === '/auth/login') return login(payload)
  if (upper === 'GET' && path === '/auth/captcha') return captcha()
  if (upper === 'POST' && path === '/auth/logout') {
    const result = await ruoyiSend('POST', '/logout')
    writeToken('')
    return result.ok ? ok(true, '已退出') : ok(true, '已退出')
  }
  if (upper === 'POST' && path === '/auth/password') {
    const oldPassword = text(payload.oldPassword)
    const newPassword = text(payload.newPassword)
    if (!oldPassword || !newPassword) return fail('请填写原密码和新密码')
    if (oldPassword === newPassword) return fail('新密码不能与原密码相同')
    const issue = passwordIssue(newPassword)
    if (issue) return fail(issue)
    const result = await ruoyiSend('PUT', '/system/user/profile/updatePwd', undefined, { oldPassword, newPassword })
    return result.ok ? ok(true, '密码已更新') : fail(result.message)
  }
  if (upper === 'GET' && path === '/auth/users') return users(query)
  if (upper === 'POST' && path === '/auth/users') return saveUser(undefined, payload)
  const userStatus = path.match(/^\/auth\/users\/([^/]+)\/status$/)
  if (userStatus && upper === 'PUT') return setUserStatus(decodeURIComponent(userStatus[1]), payload)
  const userId = path.match(/^\/auth\/users\/([^/]+)$/)
  if (userId && upper === 'PUT') return saveUser(decodeURIComponent(userId[1]), payload)
  if (upper === 'GET' && path === '/roles/permissions') {
    return ok({ admin: pagesFor('admin'), warehouse: pagesFor('warehouse'), customs: pagesFor('customs') })
  }
  if (upper === 'PUT' && /^\/roles\/[^/]+\/permissions$/.test(path)) {
    return fail('角色菜单在丰联后台维护。重新登录后按后端路由显示可访问菜单。')
  }

  if (upper === 'GET' && path === '/settings/params') return loadParams()
  if (upper === 'PUT' && path === '/settings/params') return saveParams(payload)

  if (upper === 'GET' && path === '/floor-plans') return loadFloor()
  if (upper === 'PUT' && path === '/floor-plans') return saveFloor(payload)

  if (path.startsWith('/dicts')) {
    if (upper === 'GET' && path === '/dicts/types') {
      const result = await ruoyiGet('/system/dict/type/list', pageParams(query, {
        dictName: query.name || undefined,
        dictType: query.type || undefined,
        status: query.status ? dictStatusCode(query.status) : undefined,
      }))
      return pageOf(result, result.rows.map(dictTypeRow), query)
    }
    if (upper === 'POST' && path === '/dicts/types') return saveDictType(undefined, payload)
    if (upper === 'DELETE' && path === '/dicts/cache') {
      const result = await ruoyiSend('DELETE', '/system/dict/type/refreshCache')
      return result.ok ? ok(true, '字典缓存已刷新') : fail(result.message)
    }
    if (upper === 'GET' && path === '/dicts/labels') return ok(await dictLabels(text(query.type)))
    const dictTypeId = path.match(/^\/dicts\/types\/([^/]+)$/)
    if (dictTypeId && upper === 'PUT') return saveDictType(decodeURIComponent(dictTypeId[1]), payload)
    if (dictTypeId && upper === 'DELETE') {
      const result = await ruoyiSend('DELETE', `/system/dict/type/${decodeURIComponent(dictTypeId[1])}`)
      return result.ok ? ok(true, '已删除') : fail(result.message)
    }
    if (upper === 'GET' && path === '/dicts/data') {
      const result = await ruoyiGet('/system/dict/data/list', pageParams(query, {
        dictType: query.type || undefined,
        dictLabel: query.label || undefined,
        status: query.status ? dictStatusCode(query.status) : undefined,
      }))
      return pageOf(result, result.rows.map(dictDataRow), query)
    }
    if (upper === 'POST' && path === '/dicts/data') return saveDictData(undefined, payload)
    const dictCode = path.match(/^\/dicts\/data\/([^/]+)$/)
    if (dictCode && upper === 'PUT') return saveDictData(decodeURIComponent(dictCode[1]), payload)
    if (dictCode && upper === 'DELETE') {
      const result = await ruoyiSend('DELETE', `/system/dict/data/${decodeURIComponent(dictCode[1])}`)
      return result.ok ? ok(true, '已删除') : fail(result.message)
    }
  }

  if (upper === 'GET' && path === '/warehouses/catalog') {
    const rows = byOrderNum((await warehouseRows()).map(warehouseRow))
    return ok({ list: rows, total: rows.length, page: 1, pageSize: rows.length || 1 })
  }
  if (upper === 'GET' && path === '/warehouses') {
    const result = await ruoyiGet('/wms/warehouse/list', pageParams(query, {
      warehouseCode: query.keyword || undefined,
      status: query.status ? flagStatus(query.status) : undefined,
    }))
    return pageOf(result, byOrderNum(result.rows.map(warehouseRow)), query)
  }
  if (upper === 'POST' && path === '/warehouses') return saveWarehouse(undefined, payload)
  const warehouseStatus = path.match(/^\/warehouses\/([^/]+)\/status$/)
  if (warehouseStatus && upper === 'PUT') {
    const saved = await saveWarehouse(decodeURIComponent(warehouseStatus[1]), payload)
    return statusReply(saved, payload.status)
  }
  const warehouseId = path.match(/^\/warehouses\/([^/]+)$/)
  if (warehouseId && upper === 'PUT') return saveWarehouse(decodeURIComponent(warehouseId[1]), payload)
  if (warehouseId && upper === 'DELETE') return removeWarehouse(decodeURIComponent(warehouseId[1]))

  if (upper === 'GET' && path === '/warehouses/stacks') {
    const warehouseIdValue = query.warehouse ? await findWarehouseId(query.warehouse) : undefined
    const keyword = text(query.keyword)
    const areaLabel = text(query.areaLabel)
    const matched = (await areaRows()).filter((row) => {
      if (keyword && !`${areaCodeValue(row)}${areaNameValue(row)}`.includes(keyword)) return false
      if (warehouseIdValue != null && text(row.warehouseId) !== text(warehouseIdValue) && text(nested(row, 'warehouse')?.id) !== text(warehouseIdValue)) return false
      if (areaLabel && text(row.areaIdentification) !== areaLabel) return false
      return true
    })
    const houses = await warehouseRows()
    const grids = await gridsFromPlan()
    const areaNames = await dictOf('wms_area_identification')
    const rows = byOrderNum(matched.map(stackRow).map((row) => {
      const house = !row.warehouse || /^\d+$/.test(row.warehouse)
        ? houses.find((item) => text(item.id) === text(row.warehouseId))
        : undefined
      const grid = grids.get(row.id) || grids.get(row.code)
      return {
        ...row,
        areaLabel: labelOf(areaNames, row.areaLabel),
        warehouse: house ? text(house.warehouseName || house.warehouseCode || row.warehouse) : row.warehouse,
        grid: grid?.grid || row.grid,
        gridCols: grid?.gridCols,
        gridRows: grid?.gridRows,
      }
    }))
    const page = Number(query.page || 1)
    const pageSize = Number(query.pageSize || 10)
    const start = (page - 1) * pageSize
    return ok({ list: rows.slice(start, start + pageSize), total: rows.length, page, pageSize })
  }
  if (upper === 'POST' && path === '/warehouses/stacks') return saveStack(undefined, payload)
  const stackStatus = path.match(/^\/warehouses\/stacks\/([^/]+)\/status$/)
  if (stackStatus && upper === 'PUT') {
    const saved = await saveStack(decodeURIComponent(stackStatus[1]), payload)
    return statusReply(saved, payload.status)
  }
  const stackInspect = path.match(/^\/warehouses\/stacks\/([^/]+)\/inspect$/)
  if (stackInspect && upper === 'POST') return fail('后端未提供查验完成接口')
  const stackId = path.match(/^\/warehouses\/stacks\/([^/]+)$/)
  if (stackId && upper === 'PUT') return saveStack(decodeURIComponent(stackId[1]), payload)
  if (stackId && upper === 'DELETE') return removeStack(decodeURIComponent(stackId[1]))

  if (upper === 'GET' && path === '/materials/export') return exportItems(query)
  if (upper === 'GET' && path === '/materials') return listItems(query)
  if (upper === 'POST' && path === '/materials') return saveItem(undefined, payload)
  const itemId = path.match(/^\/materials\/([^/]+)$/)
  if (itemId && upper === 'PUT') return saveItem(decodeURIComponent(itemId[1]), payload)
  if (itemId && upper === 'DELETE') return removeItem(decodeURIComponent(itemId[1]))

  if (upper === 'GET' && path === '/material-sources/filings/export') return exportFilings(query)
  if (upper === 'GET' && path === '/material-sources/filings') return listFilings(query)
  if (upper === 'POST' && path === '/material-sources/filings') return saveFiling(undefined, payload)
  const filingLotsExport = path.match(/^\/material-sources\/filings\/([^/]+)\/lots\/export$/)
  if (filingLotsExport && upper === 'GET') return exportFilingLots(decodeURIComponent(filingLotsExport[1]))
  const filingLotsPath = path.match(/^\/material-sources\/filings\/([^/]+)\/lots$/)
  if (filingLotsPath && upper === 'GET') return filingLots(decodeURIComponent(filingLotsPath[1]))
  const filingId = path.match(/^\/material-sources\/filings\/([^/]+)$/)
  if (filingId && upper === 'PUT') return saveFiling(decodeURIComponent(filingId[1]), payload)

  if (upper === 'GET' && path === '/shipping-methods') {
    const list = await catalog('/wms/shippingMethod/listNoPage')
    if (!list.ok) return fail(list.message)
    const rows = list.rows.map((row) => ({
      id: text(row.id),
      name: text(row.shippingMethodName),
      containers: row.areaNumber ?? 0,
    }))
    return ok({ list: rows, total: rows.length, page: 1, pageSize: rows.length || 1 })
  }

  if (upper === 'GET' && path === '/partners/consignors') {
    const types = await merchantTypes()
    const consignor = types.find((item) => item.label === '委托方')
    const list = await catalog('/wms/merchant/listNoPage')
    if (!list.ok) return fail(list.message)
    const names = list.rows
      .filter((row) => !consignor || text(row.merchantType) === consignor.value)
      .map((row) => text(row.merchantName))
      .filter(Boolean)
    return ok(names)
  }
  if (upper === 'GET' && path === '/partners') {
    const types = await merchantTypes()
    const merchantType = query.role ? codeOf(types, query.role) : undefined
    const result = await ruoyiGet('/wms/merchant/list', pageParams(query, {
      merchantName: query.keyword || undefined,
      merchantType,
    }))
    return pageOf(result, result.rows.map((row) => merchantRow(row, types)), query)
  }
  if (upper === 'POST' && path === '/partners') return saveMerchant(undefined, payload)
  const merchantStatus = path.match(/^\/partners\/([^/]+)\/status$/)
  if (merchantStatus && upper === 'PUT') {
    const saved = await saveMerchant(decodeURIComponent(merchantStatus[1]), payload)
    return statusReply(saved, payload.status)
  }
  const merchantId = path.match(/^\/partners\/([^/]+)$/)
  if (merchantId && upper === 'PUT') return saveMerchant(decodeURIComponent(merchantId[1]), payload)
  if (merchantId && upper === 'DELETE') return removeMerchant(decodeURIComponent(merchantId[1]))

  if (/^\/bonded-books\/[^/]+\/lots/.test(path)) return fail('后端未提供账册票矿接口')
  if (upper === 'GET' && path === '/bonded-books') {
    const result = await ruoyiGet('/wms/accountBook/list', pageParams(query, {
      accountName: query.keyword || undefined,
      beginEarlyWarningTime: query.from || undefined,
      endEarlyWarningTime: query.to || undefined,
    }))
    return pageOf(result, result.rows.map(bookRow), query)
  }
  if (upper === 'POST' && path === '/bonded-books') return saveBook(undefined, payload)
  const bookId = path.match(/^\/bonded-books\/([^/]+)$/)
  if (bookId && upper === 'PUT') return saveBook(decodeURIComponent(bookId[1]), payload)

  if (upper === 'GET' && path === '/inbound') return listReceipts(query)
  if (upper === 'POST' && path === '/inbound') return createReceipt(payload)
  const receiptId = path.match(/^\/inbound\/([^/]+)$/)
  if (receiptId && upper === 'GET') return getReceipt(decodeURIComponent(receiptId[1]))
  if (receiptId && upper === 'PUT') return receiveReceipt(decodeURIComponent(receiptId[1]), payload)

  if (upper === 'GET' && path === '/inventory/home') return inventoryHome()
  if (upper === 'GET' && path === '/inventory') return listInventory(query)
  const inventoryBatchNo = path.match(/^\/inventory\/batches\/([^/]+)$/)
  if (inventoryBatchNo && upper === 'GET') return inventoryBatch(decodeURIComponent(inventoryBatchNo[1]), query)

  if (upper === 'GET' && path === '/transfers') return listMovements(query)
  if (upper === 'POST' && path === '/transfers') return createMovement(payload)
  if (upper === 'POST' && path === '/transfers/batch') return createMovements(payload)

  if (upper === 'GET' && path === '/stocktakes/export') return exportCheckOrders(query)
  if (upper === 'GET' && path === '/stocktakes') return listCheckOrders(query)
  if (upper === 'POST' && path === '/stocktakes') return createCheckOrder(payload)

  if (upper === 'GET' && path === '/ocr/tasks') {
    if (text(query.docType) === '提单') return fail('后端暂不支持提单识别')
    const result = await ruoyiGet('/wms/ocr/list', pageParams(query, {
      ocrLogType: query.docType ? OCR_TYPE[text(query.docType)] : undefined,
    }))
    if (!result.ok) return fail(result.message)
    const rows = result.rows.map(ocrRow).filter((row) => {
      if (!query.keyword) return true
      return `${row.customsNo}${row.fileName}${row.docType}${row.id}${row.orderNo || ''}`.includes(text(query.keyword))
    })
    if (query.keyword) return ok({ list: rows, total: rows.length, page: 1, pageSize: rows.length || 1 })
    return pageOf(result, rows, query)
  }
  if (upper === 'POST' && path === '/ocr/recognize') return recognize(payload)
  const ocrId = path.match(/^\/ocr\/tasks\/([^/]+)$/)
  if (ocrId && upper === 'PUT') return correctOcr(decodeURIComponent(ocrId[1]), payload)

  if (upper === 'GET' && path === '/warning-records') return listWarningRecords(query)

  if (upper === 'GET' && path === '/audit-logs') {
    const result = await ruoyiGet('/monitor/operlog/list', pageParams(query, {
      title: query.module || undefined,
      operName: query.operator || query.keyword || undefined,
      businessNo: query.bizNo || undefined,
      ...range(query),
    }))
    if (!result.ok) return fail(result.message)
    const rows = result.rows.map(auditRow).filter((row) => {
      if (query.customsNo && !`${row.customsNo}${row.detail}${row.content}${row.bizNo}`.includes(text(query.customsNo))) return false
      if (query.prodBatch && !`${row.prodBatch}${row.detail}${row.content}${row.bizNo}`.includes(text(query.prodBatch))) return false
      if (query.customsOnly === '是' && row.accountType !== '海关专用账号' && row.module !== '关务') return false
      return true
    })
    const narrowed = query.customsNo || query.prodBatch || query.customsOnly === '是'
    if (narrowed) return ok({ list: rows, total: rows.length, page: Number(query.page || 1), pageSize: Number(query.pageSize || 10) })
    return pageOf(result, rows, query)
  }
  const auditId = path.match(/^\/audit-logs\/([^/]+)$/)
  if (auditId && upper === 'GET') {
    const result = await ruoyiGet('/monitor/operlog/list', { pageNum: 1, pageSize: 1, operId: decodeURIComponent(auditId[1]) })
    if (!result.ok) return fail(result.message)
    const row = result.rows[0]
    return row ? ok(auditRow(row)) : fail('日志不存在')
  }

  if (upper === 'GET' && path === '/production') return listProduction(query)
  if (upper === 'POST' && path === '/production') return createProductionFeed(payload)
  const productionProcess = path.match(/^\/production\/([^/]+)\/process$/)
  if (productionProcess && upper === 'POST') return pushProduction(decodeURIComponent(productionProcess[1]), payload)
  const productionFinish = path.match(/^\/production\/([^/]+)\/finish$/)
  if (productionFinish && upper === 'POST') return finishProduction(decodeURIComponent(productionFinish[1]), payload)
  const productionId = path.match(/^\/production\/([^/]+)$/)
  if (productionId && upper === 'GET') return productionBatch(decodeURIComponent(productionId[1]))

  return null
}
