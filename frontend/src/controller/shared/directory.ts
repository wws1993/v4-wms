import { clearSessionList, loadSessionList, SESSION_LIST, type CacheRow, type SessionListName } from '@/api/catalogCache'
import { ruoyiGet } from '@/api/ruoyi'
import { num, text } from './coerce'
import type { Row } from './types'

type DirectoryDefinition = {
  path: string
  cache: SessionListName
}

export const DIRECTORY_ENDPOINTS = {
  warehouses: { path: '/wms/warehouse/listNoPage', cache: SESSION_LIST.warehouse },
  areas: { path: '/wms/area/listNoPage', cache: SESSION_LIST.area },
  items: { path: '/wms/item/listNoPage', cache: SESSION_LIST.item },
  merchants: { path: '/wms/merchant/listNoPage', cache: SESSION_LIST.merchant },
  filings: { path: '/wms/mineralSourceFiling/listNoPage', cache: SESSION_LIST.filing },
  accountBooks: { path: '/wms/accountBook/listNoPage', cache: SESSION_LIST.accountBook },
  shippingMethods: { path: '/wms/shippingMethod/listNoPage', cache: SESSION_LIST.shippingMethod },
  floorPlans: { path: '/wms/floorPlan/listNoPage', cache: SESSION_LIST.floorPlan },
  inventories: { path: '/wms/inventory/listNoPage', cache: SESSION_LIST.inventory },
  inventoryDetails: { path: '/wms/inventoryDetail/listNoPage', cache: SESSION_LIST.inventoryDetail },
  receiptOrders: { path: '/wms/receiptOrder/listNoPage', cache: SESSION_LIST.receiptOrder },
  productionOrders: { path: '/wms/productionOrder/listNoPage', cache: SESSION_LIST.productionOrder },
} as const satisfies Record<string, DirectoryDefinition>

export type DirectoryName = keyof typeof DIRECTORY_ENDPOINTS
export type DictionaryOption = { label: string; value: string }

export const MERCHANT_FALLBACK: DictionaryOption[] = [
  { label: '委托方', value: '1' },
  { label: '物流账册主体', value: '2' },
  { label: '流向企业', value: '3' },
]
export const MERCHANT_DICT_TYPES = ['wms_merchant_type', 'merchant_type']

function normalizedParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value != null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function cacheKey(cache: SessionListName, params: Record<string, unknown>) {
  const normalized = normalizedParams(params)
  return Object.keys(normalized).length ? `${cache}${JSON.stringify(normalized)}` : cache
}

function resultRows<TRow>(result: { data?: unknown; rows: TRow[] }) {
  if (Array.isArray(result.data)) return result.data as TRow[]
  if (result.data && typeof result.data === 'object') {
    const data = result.data as Row
    for (const key of ['rows', 'list', 'records', 'data']) {
      if (Array.isArray(data[key])) return data[key] as TRow[]
    }
    if ('jsonData' in data) return [data as TRow]
  }
  return result.rows
}

/** Read a cached listNoPage endpoint, optionally caching a distinct filtered result. */
export async function readDirectory<TRow = Row>(
  name: DirectoryName,
  params: Record<string, unknown> = {},
) {
  const definition = DIRECTORY_ENDPOINTS[name]
  const key = cacheKey(definition.cache, params)
  let message = ''
  const listed = await loadSessionList(definition.cache, key, async () => {
    const result = await ruoyiGet<TRow>(definition.path, normalizedParams(params))
    if (!result.ok) message = result.message
    return {
      ok: result.ok,
      rows: result.ok ? resultRows(result) as CacheRow[] : [],
    }
  })
  return {
    ok: listed.ok,
    rows: listed.rows as TRow[],
    message: listed.ok ? '' : message || '目录读取失败',
  }
}

/** Invalidate cached listNoPage results for a directory. */
export function clearDirectory(name: DirectoryName) {
  clearSessionList(DIRECTORY_ENDPOINTS[name].cache)
}

export function clearDictCache() {
  clearSessionList(SESSION_LIST.dict)
}

export async function readDictionaryRows(type: string) {
  const key = `${SESSION_LIST.dict}${type}`
  const listed = await loadSessionList(SESSION_LIST.dict, key, async () => {
    const result = await ruoyiGet('/system/dict/data/type/' + encodeURIComponent(type))
    return {
      ok: result.ok,
      rows: result.ok ? resultRows(result) as CacheRow[] : [],
    }
  })
  return { ok: listed.ok, rows: listed.rows }
}

export async function readDictionary(type: string): Promise<DictionaryOption[]> {
  const { rows } = await readDictionaryRows(type)
  return rows
    .map((row) => ({ label: text(row.dictLabel), value: text(row.dictValue) }))
    .filter((option) => option.label || option.value)
}

export async function readDictionaryOptions(type: string): Promise<DictionaryOption[]> {
  const { rows } = await readDictionaryRows(type)
  return rows
    .filter((row) => text(row.status) !== '0' && text(row.status) !== '停用')
    .map((row) => ({ label: text(row.dictLabel), value: text(row.dictValue) }))
    .filter((option) => option.label || option.value)
}

export function enabledDictLabels(rows: Row[]) {
  return rows
    .filter((row) => text(row.status) !== '0' && text(row.status) !== '停用')
    .sort((left, right) => Number(left.dictSort ?? 0) - Number(right.dictSort ?? 0))
    .map((row) => text(row.dictLabel))
    .filter(Boolean)
}

export async function readDictionaryLabels(type: string) {
  const types = MERCHANT_DICT_TYPES.includes(type) ? MERCHANT_DICT_TYPES : [type]
  for (const item of types) {
    const { rows } = await readDictionaryRows(item)
    const labels = enabledDictLabels(rows)
    if (labels.length) return labels
  }
  return []
}

export async function readMerchantTypes() {
  for (const type of MERCHANT_DICT_TYPES) {
    const options = await readDictionary(type)
    if (options.length) return options
  }
  return MERCHANT_FALLBACK
}

export function translateLabel(options: DictionaryOption[], value: unknown) {
  const raw = text(value)
  return options.find((option) => option.value === raw)?.label || raw
}

export function translateCode(options: DictionaryOption[], label: unknown) {
  const raw = text(label)
  const hit = options.find((option) => option.label === raw || option.value === raw)
  return hit ? num(hit.value) : num(raw)
}

export async function translateDictionaryValue(type: string, label: unknown) {
  const raw = text(label)
  if (!raw) return undefined
  const options = await readDictionary(type)
  if (!options.length) return raw
  const hit = options.find((option) => option.label === raw || option.value === raw)
  return hit ? hit.value : raw
}

export async function translateDictionaryCode(type: string, label: unknown) {
  const options = await readDictionary(type)
  return options.length ? translateCode(options, label) : num(label)
}

export function translateCurrency(options: DictionaryOption[], value: unknown) {
  const raw = text(value).trim()
  if (!raw) return undefined
  const direct = options.find((option) => option.label === raw || option.value === raw)
  if (direct) return direct.value
  if (raw === 'CNY' || raw.includes('人民币')) return options.find((option) => option.label.includes('人民币'))?.value || raw
  if (raw === 'USD' || raw.includes('美元')) return options.find((option) => option.label.includes('美元'))?.value || raw
  return raw
}

export function currencyLabel(options: DictionaryOption[], value: unknown) {
  const label = translateLabel(options, value)
  if (label.includes('美元') || text(value) === 'USD') return 'USD'
  if (label.includes('人民币') || text(value) === 'CNY') return 'CNY'
  return label || text(value)
}

export function directoryForPath(path: string) {
  const entry = Object.entries(DIRECTORY_ENDPOINTS).find(([, definition]) => definition.path === path)
  return entry?.[0] as DirectoryName | undefined
}
