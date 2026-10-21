import { clearDictCache, loadSessionList, SESSION_LIST } from '@/api/catalogCache'
import { ruoyiGet } from '@/api/ruoyi'
import { num, text } from './coerce'
import type { Row } from './types'

export { clearDictCache }

export const MERCHANT_FALLBACK = [
  { label: '委托方', value: '1' },
  { label: '物流账册主体', value: '2' },
  { label: '流向企业', value: '3' },
]

export const MERCHANT_DICT_TYPES = ['wms_merchant_type', 'merchant_type']

export async function dictRows(type: string) {
  const listed = await loadSessionList(SESSION_LIST.dict, SESSION_LIST.dict + type, async () => {
    const result = await ruoyiGet(`/system/dict/data/type/${type}`)
    let rows = result.ok ? (Array.isArray(result.data) ? result.data as Row[] : result.rows) : []
    let loaded = result.ok && rows.length > 0
    if (!rows.length) {
      const fallback = await ruoyiGet('/system/dict/data/list', { pageNum: 1, pageSize: 200, dictType: type })
      if (fallback.ok) {
        rows = fallback.rows
        loaded = true
      }
    }
    return { ok: loaded, rows }
  })
  return listed.rows
}

export async function dictOf(type: string) {
  const rows = await dictRows(type)
  return rows.map((row) => ({ label: text(row.dictLabel), value: text(row.dictValue) })).filter((row) => row.label || row.value)
}

export async function merchantTypes() {
  for (const type of MERCHANT_DICT_TYPES) {
    const rows = await dictOf(type)
    if (rows.length) return rows
  }
  return MERCHANT_FALLBACK
}

export function enabledDictLabels(rows: Row[]) {
  return rows
    .filter((row) => text(row.status) !== '0' && text(row.status) !== '停用')
    .sort((a, b) => Number(a.dictSort ?? 0) - Number(b.dictSort ?? 0))
    .map((row) => text(row.dictLabel))
    .filter(Boolean)
}

export async function dictLabels(type: string) {
  const types = MERCHANT_DICT_TYPES.includes(type) ? MERCHANT_DICT_TYPES : [type]
  for (const item of types) {
    const labels = enabledDictLabels(await dictRows(item))
    if (labels.length) return labels
  }
  return []
}

export function labelOf(options: { label: string; value: string }[], value: unknown) {
  const raw = text(value)
  return options.find((item) => item.value === raw)?.label || raw
}

export function codeOf(options: { label: string; value: string }[], label: unknown) {
  const raw = text(label)
  const hit = options.find((item) => item.label === raw || item.value === raw)
  return hit ? num(hit.value) : num(raw)
}

export async function dictValue(type: string, label: unknown) {
  const raw = text(label)
  if (!raw) return undefined
  const options = await dictOf(type)
  if (!options.length) return raw
  const hit = options.find((item) => item.label === raw || item.value === raw)
  return hit ? hit.value : raw
}

export async function codeFromDict(type: string, label: unknown) {
  const options = await dictOf(type)
  if (!options.length) return num(label)
  return codeOf(options, label)
}

export function currencyValue(options: { label: string; value: string }[], value: unknown) {
  const raw = text(value).trim()
  if (!raw) return undefined
  const direct = options.find((item) => item.label === raw || item.value === raw)
  if (direct) return direct.value
  if (raw === 'CNY' || raw.includes('人民币')) return options.find((item) => item.label.includes('人民币'))?.value || raw
  if (raw === 'USD' || raw.includes('美元')) return options.find((item) => item.label.includes('美元'))?.value || raw
  return raw
}

export function currencyMark(options: { label: string; value: string }[], value: unknown) {
  const label = labelOf(options, value)
  if (label.includes('美元') || text(value) === 'USD') return 'USD'
  if (label.includes('人民币') || text(value) === 'CNY') return 'CNY'
  return label || text(value)
}
