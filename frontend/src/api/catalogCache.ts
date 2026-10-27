/** 下拉和档案类列表的会话缓存。成功结果写入 sessionStorage，同一时刻的重复请求只打一次接口。 */

export type CacheRow = Record<string, unknown>

export const SESSION_LIST = {
  dict: 'wms_dict_enum:',
  role: 'wms_role_options',
  item: 'wms_item_list',
  warehouse: 'wms_warehouse_list',
  area: 'wms_area_list',
  filing: 'wms_filing_list',
  merchant: 'wms_merchant_list',
  floorPlan: 'wms_floor_plan_list',
  accountBook: 'wms_account_book_list',
  shippingMethod: 'wms_shipping_method_list',
  inventory: 'wms_inventory_catalog',
  inventoryDetail: 'wms_inventory_detail_catalog',
  receiptOrder: 'wms_receipt_order_catalog',
  productionOrder: 'wms_production_order_catalog',
} as const

export type SessionListName = typeof SESSION_LIST[keyof typeof SESSION_LIST]

export const SESSION_LABELS: Record<SessionListName, string> = {
  [SESSION_LIST.dict]: '字典',
  [SESSION_LIST.role]: '角色选项',
  [SESSION_LIST.item]: '物料档案',
  [SESSION_LIST.warehouse]: '仓库档案',
  [SESSION_LIST.area]: '堆位档案',
  [SESSION_LIST.filing]: '矿源备案',
  [SESSION_LIST.merchant]: '往来主体',
  [SESSION_LIST.floorPlan]: '平面图列表',
  [SESSION_LIST.accountBook]: '账册档案',
  [SESSION_LIST.shippingMethod]: '运输方式',
  [SESSION_LIST.inventory]: '库存目录',
  [SESSION_LIST.inventoryDetail]: '库存明细目录',
  [SESSION_LIST.receiptOrder]: '入库单目录',
  [SESSION_LIST.productionOrder]: '生产单目录',
}

export type CacheEntry = {
  group: SessionListName
  groupLabel: string
  key: string
  label: string
  present: boolean
  count: number
  json: string
}

type Listed = { ok: boolean; rows: CacheRow[] }

type Bucket = {
  generation: number
  pending: Map<string, Promise<Listed>>
}

const buckets = new Map<string, Bucket>()

function bucket(name: string) {
  let current = buckets.get(name)
  if (!current) {
    current = { generation: 0, pending: new Map() }
    buckets.set(name, current)
  }
  return current
}

function copyRows(rows: CacheRow[]) {
  return rows.map((row) => ({ ...row }))
}

function readRows(key: string) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as CacheRow[] : null
  } catch {
    return null
  }
}

function writeRows(key: string, rows: CacheRow[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(rows))
  } catch {
    // 会话存储写满或被禁用时，本次仍返回查询结果
  }
}

function storageKeys(name: string) {
  const keys: string[] = []
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index)
    if (key === name || key?.startsWith(name)) keys.push(key)
  }
  return keys
}

function groupOf(key: string): SessionListName | null {
  const names = Object.values(SESSION_LIST)
  const hit = names.find((name) => key === name || key.startsWith(name))
  return hit || null
}

function entryOf(group: SessionListName, key: string): CacheEntry {
  const rows = readRows(key)
  const present = rows != null
  const suffix = group === SESSION_LIST.dict ? key.slice(group.length) : ''
  const label = suffix ? `${SESSION_LABELS[group]} · ${suffix}` : SESSION_LABELS[group]
  let json = '[]'
  if (present) {
    try { json = JSON.stringify(rows, null, 2) } catch { json = '[]' }
  }
  return {
    group,
    groupLabel: SESSION_LABELS[group],
    key,
    label,
    present,
    count: present ? rows.length : 0,
    json,
  }
}

/** 列出已知缓存组。字典按已写入的类型拆开；其余组即使未命中也显示一行。 */
export function listSessionCaches(): CacheEntry[] {
  const entries: CacheEntry[] = []
  for (const group of Object.values(SESSION_LIST)) {
    if (group === SESSION_LIST.dict) {
      const keys = storageKeys(group).sort()
      if (!keys.length) {
        entries.push(entryOf(group, group))
        continue
      }
      keys.forEach((key) => entries.push(entryOf(group, key)))
      continue
    }
    entries.push(entryOf(group, group))
  }
  return entries
}

/** 作废一组缓存。字典按前缀清掉全部类型，其余列表按自己的键清掉。 */
export function clearSessionList(name: string) {
  const current = bucket(name)
  current.generation += 1
  current.pending.clear()
  storageKeys(name).forEach((key) => sessionStorage.removeItem(key))
}

/** 清空单个存储键，并作废所属组的进行中请求。 */
export function clearSessionKey(key: string) {
  const group = groupOf(key)
  if (group) {
    const current = bucket(group)
    current.generation += 1
    current.pending.clear()
  }
  sessionStorage.removeItem(key)
}

export function clearAllSessionLists() {
  Object.values(SESSION_LIST).forEach((name) => clearSessionList(name))
}

export function clearDictCache() {
  clearSessionList(SESSION_LIST.dict)
}

/**
 * 读会话缓存。命中则直接返回；未命中时执行 load，仅在 ok 时写入。
 * name 是同一组缓存的代号，storageKey 是这一份数据的存储键。字典的 storageKey 带类型后缀。
 */
export async function loadSessionList(name: string, storageKey: string, load: () => Promise<Listed>): Promise<Listed> {
  const cached = readRows(storageKey)
  if (cached) return { ok: true, rows: copyRows(cached) }
  const current = bucket(name)
  const pending = current.pending.get(storageKey)
  if (pending) {
    const result = await pending
    return { ok: result.ok, rows: copyRows(result.rows) }
  }
  const generation = current.generation
  const task = load().then((result) => {
    if (result.ok && generation === current.generation) writeRows(storageKey, result.rows)
    return result
  }).finally(() => {
    if (current.pending.get(storageKey) === task) current.pending.delete(storageKey)
  })
  current.pending.set(storageKey, task)
  const result = await task
  return { ok: result.ok, rows: copyRows(result.rows) }
}
