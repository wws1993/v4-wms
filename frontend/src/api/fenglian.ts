import { presentAudit } from '@/audit/present'
import { pagesFor } from '@/nav'
import { defaultPlan, hostOf, stackCode } from '@/plan/model'
import { loadFloorPlan, parseFloorPlan, saveFloorPlan } from '@/plan/storage'
import type { FloorPlan, RoleKey } from '@/types'
import { fail, ok, toCsv } from '@/mock/util'
import { passwordIssue } from '@/security/policy'
import { ruoyiGet, ruoyiSend, writeToken, type RuoyiBody, type RuoyiResult } from './ruoyi'

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
  { id: 'alerts', words: ['预警'] },
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

function pagesFromRouters(nodes: unknown, role: RoleKey) {
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
  const matched = MENU_WORDS.filter((item) => item.words.some((word) => joined.includes(word.toLowerCase()))).map((item) => item.id)
  const allowed = pagesFor(role)
  const pages = matched.filter((id) => allowed.includes(id))
  if (!pages.length) return allowed
  if (allowed.includes('dashboard') && !pages.includes('dashboard')) pages.unshift('dashboard')
  for (const id of ['bonded', 'ledgerMonthly', 'production', 'alertLogs', 'dicts']) {
    if (allowed.includes(id) && !pages.includes(id)) pages.push(id)
  }
  return pages
}

async function dictRows(type: string) {
  const result = await ruoyiGet(`/system/dict/data/type/${type}`)
  let rows = result.ok ? (Array.isArray(result.data) ? result.data as Row[] : result.rows) : []
  if (!rows.length) {
    const listed = await ruoyiGet('/system/dict/data/list', { pageNum: 1, pageSize: 200, dictType: type })
    rows = listed.ok ? listed.rows : []
  }
  return rows
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
    status: flagLabel(row.status),
  }
}

function warehouseRow(row: Row) {
  const occupy = text(row.occupy)
  const matched = occupy.match(/(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)/)
  return {
    id: text(row.id),
    code: text(row.warehouseCode || row.warehouseName),
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
    code: text(row.areaCode || row.areaName),
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

const PROTOTYPE_SOURCES: Record<string, string> = {
  'YL-CU-002': '智利精矿',
  'YL-CU-003': '澳洲精矿',
}

function withItemSource<T extends { code: string; source: string; cargoType: string }>(row: T): T {
  const saved = readItemSources()[row.code]
  const known = row.cargoType === '报备矿' ? PROTOTYPE_SOURCES[row.code] : ''
  return { ...row, source: saved || row.source || known || '' }
}

function itemRow(row: Row, categories: { label: string; value: string }[], kinds: { label: string; value: string }[]) {
  return withItemSource({
    id: text(row.id),
    code: text(row.itemCode),
    name: text(row.itemName),
    cargoType: labelOf(categories, row.itemCategory) || text(row.itemCategory),
    kind: labelOf(kinds, row.type) || text(row.type),
    source: '',
  })
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
  if (Array.isArray(value)) return value as Row[]
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as Row[] : []
  } catch {
    return []
  }
}

function cellsText(row: Row) {
  const areas = areaPoints(row.areas)
  const points = areas.length ? areas : areaPoints(row.areaItems)
  return points.map((item) => `${item.row}-${item.column}`).filter((item) => !item.startsWith('undefined')).join(',')
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
  const raw = text(value).trim()
  if (!raw) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`
  return `${raw.replace(' ', 'T')}:00`
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

async function findWarehouseId(name: unknown) {
  const list = await catalog('/wms/warehouse/listNoPage')
  const raw = text(name)
  const found = list.rows.find((row) => text(row.warehouseCode) === raw || text(row.warehouseName) === raw || text(row.id) === raw)
  return idOf(found?.id)
}

async function findArea(code: unknown) {
  const list = await catalog('/wms/area/listNoPage')
  const raw = text(code)
  return list.rows.find((row) => text(row.areaCode) === raw || text(row.areaName) === raw || text(row.id) === raw)
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

async function findShipping(name: unknown) {
  const list = await catalog('/wms/shippingMethod/listNoPage')
  const raw = text(name)
  return list.rows.find((row) => text(row.shippingMethodName) === raw || text(row.shippingMethodCode) === raw || text(row.id) === raw)
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

function receiptRow(row: Row, minerals: { label: string; value: string }[], statuses: { label: string; value: string }[], currencies: { label: string; value: string }[]) {
  const method = row.shippingMethod as Row | undefined
  const consignor = row.consignor as Row | undefined
  const area = row.area as Row | undefined
  const item = row.item as Row | undefined
  return {
    id: text(row.id),
    orderNo: text(row.receiptOrderNo),
    time: text(row.arrivalDate || row.createTime).replace('T', ' ').slice(0, 16),
    customsNo: text(row.recordNo),
    blNo: text(row.waybillNo),
    shipName: text(row.shipName),
    oreType: labelOf(minerals, row.mineralType) || text(row.mineralType),
    shipMode: text(method?.shippingMethodName),
    containerCount: method?.areaNumber ?? '',
    consignor: text(consignor?.merchantName || row.consignorId),
    material: text(item?.itemName),
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
    as: '', pb: '', cd: '', f: '', hg: '',
  }
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

async function resolveShip(value: unknown) {
  const raw = text(value).trim()
  if (!raw) return { ok: true as const, id: undefined as string | number | undefined }
  let sawDict = false
  for (const type of ['wms_ship_name', 'wms_ship']) {
    const options = await dictOf(type)
    if (!options.length) continue
    sawDict = true
    const hit = options.find((item) => item.label === raw || item.value === raw)
    if (!hit) continue
    const id = idOf(hit.value)
    if (id == null) return { ok: false as const, message: '船名字典取值不是编号' }
    return { ok: true as const, id }
  }
  if (sawDict) return { ok: false as const, message: `船名「${raw}」不在船名字典中` }
  const id = idOf(raw)
  if (id == null) return { ok: false as const, message: '船名需填写后端字典编号，当前接口不接收船名文本' }
  return { ok: true as const, id }
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
    pages: pagesFromRouters(routerData, roleKey),
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
    status: flagStatus(body.status || '启用'),
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
    status: flagStatus(status),
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
  const id = import.meta.env.VITE_SYSTEM_PARAM_ID || '1'
  const result = await ruoyiGet(`/wms/system/params/${id}`)
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
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/warehouse', payload)
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
  }
  const status = text(body.status)
  if (status) payload.status = flagStatus(status)
  else if (!id) payload.status = '0'
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/area', payload)
  return result.ok ? ok({ id: savedId(result) }, '已保存') : fail(result.message)
}

async function removeItem(id: string) {
  const detail = await ruoyiGet(`/wms/item/${id}`)
  const code = detail.ok ? text((detail.data as Row | undefined)?.itemCode) : ''
  const result = await ruoyiSend('DELETE', `/wms/item/${id}`)
  if (!result.ok) return fail(result.message)
  if (code) rememberItemSource(code, '')
  return ok(true, '已删除')
}

async function saveItem(id: string | undefined, body: Row) {
  const cargoType = text(body.cargoType)
  const kind = text(body.kind)
  const source = kind === '原料' ? text(body.source) : ''
  if (kind === '原料' && !source) return fail('请选择矿源')
  const payload: Row = {
    itemCode: body.code,
    itemName: body.name,
    itemCategory: await dictValue('wms_item_category', cargoType),
    type: await dictValue('wms_item_type', kind),
  }
  if (id) payload.id = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/item', payload)
  if (!result.ok) return fail(result.message)
  rememberItemSource(text(body.code), source)
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
  const shipping = query.shipMode ? await findShipping(query.shipMode) : undefined
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters: Query = {
    shippingMethodId: shipping ? idOf(shipping.id) : undefined,
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
    list: result.rows.map((row) => receiptRow(row, minerals, statuses, currencies)),
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, note || result.message)
}

async function createReceipt(body: Row) {
  const orcId = idOf(body.orcId)
  if (orcId == null) return fail('请先完成入库报关单识别，并填写 OCR 任务编号')
  const consignor = await findMerchant(body.consignor)
  const area = await findArea(body.stackCode)
  const item = await findItem(body.material)
  const shipping = await findShipping(body.shipMode)
  const mineralType = await codeFromDict('wms_mineral_type', body.oreType)
  const ship = await resolveShip(body.shipName)
  if (!consignor) return fail('委托方在往来单位中不存在')
  if (!area) return fail('预定堆位不存在')
  if (!item) return fail('请选择物料')
  if (!shipping) return fail('装运方式在货运方式档案中不存在')
  if (mineralType == null) return fail('矿种需与后端字典编码一致')
  if (!ship.ok) return fail(ship.message)
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
    shippingMethodId: idOf(shipping.id),
    arrivalDate: arrivalOf(body.time),
    entityId: owner ? idOf(owner.id) : undefined,
    ebookId: book ? idOf(book.id) : undefined,
    areas: cellsBody(body.cells),
  }
  if (ship.id != null) payload.shipName = ship.id
  const result = await ruoyiSend('POST', '/wms/receiptOrder', payload)
  return result.ok ? ok(result.data, '入库预约已创建') : fail(result.message)
}

async function receiveReceipt(id: string, body: Row) {
  const detail = await ruoyiGet(`/wms/receiptOrder/${id}`)
  if (!detail.ok) return fail(detail.message)
  const row = (detail.data || {}) as Row
  const wet = num(body.wetWeight)
  const dry = num(body.dryWeight)
  const moisture = num(body.moistureContent)
  if (wet == null || dry == null || moisture == null) return fail('到货收货需填写湿重、干重和水分。预约单不支持修改，请删除后重建。')
  const mineralType = body.oreType ? await codeFromDict('wms_mineral_type', body.oreType) : row.mineralType
  const shipping = body.shipMode ? await findShipping(body.shipMode) : undefined
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const itemType = body.category ? await codeFromDict('wms_item_type', body.category) : undefined
  const result = await ruoyiSend('PUT', '/wms/receiptOrder', {
    receiptOrderId: idOf(id),
    receiptOrdeCode: text(row.receiptOrderNo || body.orderNo),
    mineralType: mineralType ?? row.mineralType,
    shippingMethodId: shipping ? idOf(shipping.id) : row.shippingMethodId,
    wetWeight: wet,
    dryWeight: dry,
    moistureContent: moisture,
    itemType,
    ebookId: book ? idOf(book.id) : row.ebookId,
    remark: text(body.remark),
    weightOrcId: idOf(body.weightOrcId),
    elementsOrcId: idOf(body.elementsOrcId),
  })
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

async function recognize(body: Row) {
  const type = OCR_TYPE[text(body.docType)]
  if (type == null) return fail('后端暂无该单据类型，当前支持入库报关单、出库报关单、重量单、品质单')
  const file = body.__file
  if (!(file instanceof Blob)) return fail('请重新选择要识别的文件')
  const form = new FormData()
  form.append('file', file, text(body.fileName) || 'scan.bin')
  const query: Query = { ocrLogType: type }
  if (body.customsNo) query.orderNo = body.customsNo
  const result = await ruoyiSend('POST', '/wms/ocr', form, query)
  if (!result.ok) return fail(result.message)
  const row = (result.data || {}) as Row
  return ok(ocrRow(row), '识别完成，可手工修正')
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

  if (upper === 'GET' && path === '/warehouses') {
    const result = await ruoyiGet('/wms/warehouse/list', pageParams(query, {
      warehouseCode: query.keyword || undefined,
      status: query.status ? flagStatus(query.status) : undefined,
    }))
    return pageOf(result, result.rows.map(warehouseRow), query)
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
    const result = await ruoyiGet('/wms/area/list', pageParams(query, {
      areaCode: query.keyword || undefined,
      warehouseId: warehouseIdValue,
      areaIdentification: query.areaLabel || undefined,
    }))
    const houses = await catalog('/wms/warehouse/listNoPage')
    const grids = await gridsFromPlan()
    const rows = result.rows.map(stackRow).map((row) => {
      const house = !row.warehouse || /^\d+$/.test(row.warehouse)
        ? houses.rows.find((item) => text(item.id) === text(row.warehouseId))
        : undefined
      const grid = grids.get(row.id) || grids.get(row.code)
      return {
        ...row,
        warehouse: house ? text(house.warehouseName || house.warehouseCode || row.warehouse) : row.warehouse,
        grid: grid?.grid || row.grid,
        gridCols: grid?.gridCols,
        gridRows: grid?.gridRows,
      }
    })
    return pageOf(result, rows, query)
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
  if (upper === 'GET' && path === '/materials') {
    const categories = await dictOf('wms_item_category')
    const kinds = await dictOf('wms_item_type')
    const result = await ruoyiGet('/wms/item/list', pageParams(query, {
      itemName: query.keyword || undefined,
      type: query.kind ? await dictValue('wms_item_type', query.kind) : undefined,
      itemCategory: query.cargoType ? await dictValue('wms_item_category', query.cargoType) : undefined,
    }))
    return pageOf(result, result.rows.map((row) => itemRow(row, categories, kinds)), query)
  }
  if (upper === 'POST' && path === '/materials') return saveItem(undefined, payload)
  const itemId = path.match(/^\/materials\/([^/]+)$/)
  if (itemId && upper === 'PUT') return saveItem(decodeURIComponent(itemId[1]), payload)
  if (itemId && upper === 'DELETE') return removeItem(decodeURIComponent(itemId[1]))

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
  if (receiptId && upper === 'PUT') return receiveReceipt(decodeURIComponent(receiptId[1]), payload)

  if (upper === 'GET' && path === '/ocr/tasks') {
    if (text(query.docType) === '提单') return fail('后端暂不支持提单识别')
    const result = await ruoyiGet('/wms/ocr/list', pageParams(query, {
      ocrLogType: query.docType ? OCR_TYPE[text(query.docType)] : undefined,
    }))
    return pageOf(result, result.rows.map(ocrRow), query)
  }
  if (upper === 'POST' && path === '/ocr/recognize') return recognize(payload)
  const ocrId = path.match(/^\/ocr\/tasks\/([^/]+)$/)
  if (ocrId && upper === 'PUT') return correctOcr(decodeURIComponent(ocrId[1]), payload)

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

  return null
}
