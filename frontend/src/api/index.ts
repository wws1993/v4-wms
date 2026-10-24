import type { CargoLot } from '@/plan/model'
import {
  clearAllSessionLists,
  clearDictCache,
  clearSessionKey,
  clearSessionList,
  listSessionCaches,
  SESSION_LIST,
  type CacheEntry,
} from './catalogCache'
import { request } from './http'
import type { AuthUser, FloorPlan, PageResult } from '@/types'

type Q = Record<string, unknown>
type B = Record<string, unknown>
type Page = ApiPage
interface ApiPage extends PageResult<Record<string, unknown>> {}
interface FilePayload { filename: string; content?: string; blob?: Blob }

export const authApi = {
  login: (body: B) => request<AuthUser>('POST', '/auth/login', { body }),
  captcha: () => request<{ uuid: string; img: string; enabled: boolean }>('GET', '/auth/captcha'),
  logout: () => request('POST', '/auth/logout'),
  changePassword: (body: B) => request('POST', '/auth/password', { body }),
  users: (params: Q) => request<Page>('GET', '/auth/users', { params }),
  createUser: (body: B) => request('POST', '/auth/users', { body }),
  updateUser: (id: string, body: B) => request('PUT', `/auth/users/${id}`, { body }),
  setUserStatus: (id: string, body: B) => request('PUT', `/auth/users/${id}/status`, { body }),
  permissions: () => request<Record<string, string[]>>('GET', '/roles/permissions'),
  savePermissions: (role: string, pages: string[]) => request('PUT', `/roles/${role}/permissions`, { body: { pages } }),
}

export const roleApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/system/roles'),
  options: () => request<{ label: string; value: string }[]>('GET', '/system/roles/options'),
  menus: (id: string) => request<string[]>('GET', `/system/roles/${id}/menus`),
  create: (body: B) => request('POST', '/system/roles', { body }),
  update: (id: string, body: B) => request('PUT', `/system/roles/${id}`, { body }),
  remove: (id: string) => request('DELETE', `/system/roles/${id}`),
}

export const menuApi = {
  tree: () => request<Record<string, unknown>[]>('GET', '/system/menus'),
  create: (body: B) => request('POST', '/system/menus', { body }),
  update: (id: string, body: B) => request('PUT', `/system/menus/${id}`, { body }),
  remove: (id: string) => request('DELETE', `/system/menus/${id}`),
  init: () => request<{ created: number }>('POST', '/system/menus/init'),
}

export const settingsApi = {
  get: () => request<Record<string, unknown>>('GET', '/settings/params'),
  save: (body: B) => request('PUT', '/settings/params', { body }),
}

export const warehouseApi = {
  list: (params: Q) => request<Page>('GET', '/warehouses', { params }),
  catalog: () => request<Page>('GET', '/warehouses/catalog'),
  create: (body: B) => request('POST', '/warehouses', { body }),
  update: (id: string, body: B) => request('PUT', `/warehouses/${id}`, { body }),
  setStatus: (id: string, body: B) => request('PUT', `/warehouses/${id}/status`, { body }),
  remove: (id: string) => request('DELETE', `/warehouses/${id}`),
  stacks: (params: Q) => request<Page>('GET', '/warehouses/stacks', { params }),
  createStack: (body: B) => request('POST', '/warehouses/stacks', { body }),
  updateStack: (id: string, body: B) => request('PUT', `/warehouses/stacks/${id}`, { body }),
  setStackStatus: (id: string, body: B) => request('PUT', `/warehouses/stacks/${id}/status`, { body }),
  removeStack: (id: string) => request('DELETE', `/warehouses/stacks/${id}`),
  inspectStack: (id: string) => request('POST', `/warehouses/stacks/${id}/inspect`),
}

export const dictApi = {
  types: (params: Q) => request<Page>('GET', '/dicts/types', { params }),
  createType: (body: B) => request('POST', '/dicts/types', { body }),
  updateType: (id: string, body: B) => request('PUT', `/dicts/types/${id}`, { body }),
  removeType: (id: string) => request('DELETE', `/dicts/types/${id}`),
  refresh: () => {
    clearDictCache()
    return request('DELETE', '/dicts/cache')
  },
  data: (params: Q) => request<Page>('GET', '/dicts/data', { params }),
  labels: (type: string) => request<string[]>('GET', '/dicts/labels', { params: { type } }),
  createData: (body: B) => request('POST', '/dicts/data', { body }),
  updateData: (id: string, body: B) => request('PUT', `/dicts/data/${id}`, { body }),
  removeData: (id: string) => request('DELETE', `/dicts/data/${id}`),
}

/** 前端会话缓存（字典、档案列表、平面图列表等）。字典清空时同步刷新后端字典缓存。 */
export const cacheApi = {
  list: (): CacheEntry[] => listSessionCaches(),
  clearKey: async (key: string) => {
    const dictHit = key === SESSION_LIST.dict || key.startsWith(SESSION_LIST.dict)
    clearSessionKey(key)
    if (dictHit) {
      const res = await request('DELETE', '/dicts/cache')
      return res.success ? { success: true as const, message: res.message || '已清空' } : res
    }
    return { success: true as const, message: '已清空' }
  },
  clearGroup: async (group: string) => {
    clearSessionList(group)
    if (group === SESSION_LIST.dict) {
      const res = await request('DELETE', '/dicts/cache')
      return res.success ? { success: true as const, message: res.message || '已清空' } : res
    }
    return { success: true as const, message: '已清空' }
  },
  clearAll: async () => {
    clearAllSessionLists()
    const res = await request('DELETE', '/dicts/cache')
    return res.success ? { success: true as const, message: res.message || '已全部清空' } : { success: true as const, message: '前端缓存已清空' }
  },
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function parseMaterialCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return []
  const head = splitCsvLine(lines[0])
  const at = (names: string[]) => head.findIndex((cell) => names.includes(cell))
  const mineAt = at(['矿区'])
  if (mineAt < 0) return null
  const cargoAt = at(['矿种类型', '货物类型'])
  const originAt = at(['原产国', '备案原产国'])
  const orderAt = at(['排序'])
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    return {
      mineArea: cells[mineAt] || '',
      cargoType: cargoAt >= 0 ? cells[cargoAt] || '' : '',
      originCountry: originAt >= 0 ? cells[originAt] || '' : '',
      orderNum: orderAt >= 0 ? cells[orderAt] || '' : '',
    }
  }).filter((row) => row.mineArea)
}

async function importMaterials(file: File) {
  if (/\.xlsx?$/i.test(file.name) && !file.name.toLowerCase().endsWith('.csv')) {
    return { success: false, data: null, message: '请上传 CSV。可先导出，再用表格软件另存为 CSV' }
  }
  const rows = parseMaterialCsv(await file.text())
  if (!rows) return { success: false, data: null, message: '表头需要矿区、矿种类型、原产国、排序' }
  if (!rows.length) return { success: false, data: null, message: '没有可导入的物料' }
  const listed = await materialApi.list({ page: 1, pageSize: 500 })
  const existing = listed.success && listed.data ? listed.data.list : []
  let saved = 0
  const errors: string[] = []
  for (const row of rows) {
    if (!row.mineArea) {
      errors.push('缺少矿区')
      continue
    }
    const cargoType = row.cargoType || '达标矿'
    if (!['报备矿', '达标矿', '混成品'].includes(cargoType)) {
      errors.push(`${row.mineArea} 矿种类型请填报备矿、达标矿或混成品`)
      continue
    }
    const body = {
      name: row.mineArea,
      cargoType,
      mineArea: row.mineArea,
      originCountry: row.originCountry,
      orderNum: row.orderNum || 1,
    }
    const found = existing.find((item) => String(item.mineArea || item.name) === row.mineArea)
    const res = found
      ? await materialApi.update(String(found.id), body)
      : await materialApi.create(body)
    if (res.success) saved += 1
    else errors.push(`${row.mineArea} ${res.message}`)
  }
  if (!saved) return { success: false, data: null, message: errors[0] || '导入失败' }
  if (errors.length) return { success: false, data: null, message: `已写入 ${saved} 条，其余未导入：${errors[0]}` }
  return { success: true, data: null, message: `已导入 ${saved} 条物料档案` }
}

export const materialApi = {
  list: (params: Q) => request<Page>('GET', '/materials', { params }),
  create: (body: B) => request('POST', '/materials', { body }),
  update: (id: string, body: B) => request('PUT', `/materials/${id}`, { body }),
  remove: (id: string) => request('DELETE', `/materials/${id}`),
  exportRows: (params: Q = {}) => request<FilePayload>('GET', '/materials/export', { params }),
  importFile: (file: File) => importMaterials(file),
  filings: (params: Q) => request<Page>('GET', '/material-sources/filings', { params }),
  filingsByItem: (itemId: string) => request<Record<string, unknown>[]>('GET', '/material-sources/filings/by-item', { params: { itemId } }),
  createFiling: (body: B) => request('POST', '/material-sources/filings', { body }),
  updateFiling: (id: string, body: B) => request('PUT', `/material-sources/filings/${id}`, { body }),
  exportFilings: (params: Q = {}) => request<FilePayload>('GET', '/material-sources/filings/export', { params }),
  lots: (code: string) => request<Record<string, unknown>[]>('GET', `/material-sources/filings/${encodeURIComponent(code)}/lots`),
  exportLots: (code: string) => request<FilePayload>('GET', `/material-sources/filings/${encodeURIComponent(code)}/lots/export`),
}

export const shippingApi = {
  list: () => request<Page>('GET', '/shipping-methods'),
}

export const partnerApi = {
  list: (params: Q) => request<Page>('GET', '/partners', { params }),
  create: (body: B) => request('POST', '/partners', { body }),
  update: (id: string, body: B) => request('PUT', `/partners/${id}`, { body }),
  setStatus: (id: string, body: B) => request('PUT', `/partners/${id}/status`, { body }),
  remove: (id: string) => request('DELETE', `/partners/${id}`),
  consignors: () => request<string[]>('GET', '/partners/consignors'),
}

export const ledgerApi = {
  monthly: (params: Q) => request<Page>('GET', '/ledger/monthly', { params }),
  exportMonthly: (params: Q = {}) => request<FilePayload>('GET', '/ledger/monthly/export', { params }),
}

export const bondedApi = {
  list: (params: Q) => request<Page>('GET', '/bonded-books', { params }),
  create: (body: B) => request('POST', '/bonded-books', { body }),
}

/** 平面图。丰联放行后整图 JSON 经 `/wms/floorPlan` 上传，驾驶舱与设置页都从服务器读回。 */
export const floorApi = {
  get: () => request<FloorPlan>('GET', '/floor-plans'),
  save: (body: FloorPlan) => request<FloorPlan>('PUT', '/floor-plans', { body }),
}

export const dashboardApi = {
  weight: () => request<{ rawWet: number; rawDry: number; fgWet: number; fgDry: number }>('GET', '/dashboard/weight'),
  receiptDaily: () => request<{ day: string; dry: number }[]>('GET', '/dashboard/receipt-daily'),
  areas: () => request<CargoLot[]>('GET', '/dashboard/areas'),
}

export const inboundApi = {
  list: (params: Q) => request<Page>('GET', '/inbound', { params }),
  get: (id: string) => request<Record<string, unknown>>('GET', `/inbound/${encodeURIComponent(id)}`),
  create: (body: B) => request('POST', '/inbound', { body }),
  update: (id: string, body: B) => request('PUT', `/inbound/${id}`, { body }),
}

export const transferApi = {
  list: (params: Q) => request<Page>('GET', '/transfers', { params }),
  create: (body: B) => request('POST', '/transfers', { body }),
  batch: (body: B) => request<{ count: number }>('POST', '/transfers/batch', { body }),
}

export const inventoryApi = {
  list: (params: Q) => request<Page>('GET', '/inventory', { params }),
  home: () => request<CargoLot[]>('GET', '/inventory/home'),
  detail: (batchNo: string, params?: Q) => request<Record<string, unknown>>('GET', `/inventory/batches/${encodeURIComponent(batchNo)}`, { params }),
  exportLedger: (params: Q = {}) => request<FilePayload>('GET', '/inventory/ledger/export', { params }),
  alerts: (params: Q) => request<Page>('GET', '/inventory/alerts', { params }),
}

export const stocktakeApi = {
  list: (params: Q) => request<Page>('GET', '/stocktakes', { params }),
  create: (body: B) => request('POST', '/stocktakes', { body }),
  exportRows: (params: Q = {}) => request<FilePayload>('GET', '/stocktakes/export', { params }),
}

export const productionApi = {
  list: (params: Q) => request<Page>('GET', '/production', { params }),
  create: (body: B) => request('POST', '/production', { body }),
  process: (id: string, body: B) => request('POST', `/production/${encodeURIComponent(id)}/process`, { body }),
  finish: (id: string, body: B) => request('POST', `/production/${encodeURIComponent(id)}/finish`, { body }),
  detail: (batchNo: string) => request<{ list: Record<string, unknown>[] }>('GET', `/production/${encodeURIComponent(batchNo)}`),
  inspections: (params: Q) => request<Page>('GET', '/production/inspections', { params }),
  inspectLots: (params: Q = {}) => request<Page>('GET', '/production/inspections/lots', { params }),
  getInspection: (id: string) => request<Record<string, unknown>>('GET', `/production/inspections/${encodeURIComponent(id)}`),
  createInspection: (body: B) => request('POST', '/production/inspections', { body }),
  updateInspection: (id: string, body: B) => request('PUT', `/production/inspections/${encodeURIComponent(id)}`, { body }),
}

export const outboundApi = {
  list: (params: Q) => request<Page>('GET', '/outbound', { params }),
  get: (id: string) => request<Record<string, unknown>>('GET', `/outbound/${encodeURIComponent(id)}`),
  create: (body: B) => request('POST', '/outbound', { body }),
  update: (id: string, body: B) => request('PUT', `/outbound/${id}`, { body }),
  approve: (id: string) => request('POST', `/outbound/${id}/approve`),
  complete: (id: string) => request('POST', `/outbound/${id}/complete`),
}

export const customsApi = {
  list: (params: Q) => request<Page>('GET', '/customs/reconcile', { params }),
  details: (id: string) => request<Record<string, unknown>[]>('GET', `/customs/reconcile/${id}/details`),
  declare: () => request('POST', '/customs/declarations', { body: {} }),
  writeOff: () => request('POST', '/customs/bonded-books/write-off', { body: {} }),
}

export const ocrApi = {
  list: (params: Q) => request<Page>('GET', '/ocr/tasks', { params }),
  recognize: (body: B) => request('POST', '/ocr/recognize', { body }),
  update: (id: string, body: B) => request('PUT', `/ocr/tasks/${id}`, { body }),
}

export const warningApi = {
  list: (params: Q) => request<Page>('GET', '/warning-records', { params }),
}

export const auditApi = {
  list: (params: Q) => request<Page>('GET', '/audit-logs', { params }),
  detail: (id: string) => request<Record<string, unknown>>('GET', `/audit-logs/${id}`),
}
