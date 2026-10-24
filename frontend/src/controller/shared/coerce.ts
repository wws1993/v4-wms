import type { Row } from './types'

export function text(value: unknown) {
  return value == null ? '' : String(value)
}

export function num(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function idOf(value: unknown) {
  const raw = text(value).trim()
  if (!raw || !/^-?\d+$/.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : raw
}

export function flagStatus(value: unknown) {
  const raw = text(value)
  if (raw === '启用' || raw === '0') return '0'
  if (raw === '停用' || raw === '1') return '1'
  return raw
}

export function flagLabel(value: unknown) {
  const raw = text(value)
  if (raw === '0') return '启用'
  if (raw === '1') return '停用'
  return raw
}

export function userStatusCode(value: unknown) {
  const raw = text(value)
  if (raw === '启用' || raw === '1' || raw === '正常') return '1'
  if (raw === '停用' || raw === '0') return '0'
  return raw
}

export function userStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1' || raw === '正常') return '启用'
  if (raw === '0') return '停用'
  return raw
}

export function dictStatusCode(value: unknown) {
  const raw = text(value)
  if (raw === '正常' || raw === '1') return '1'
  if (raw === '停用' || raw === '0') return '0'
  return raw
}

export function dictStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1') return '正常'
  if (raw === '0') return '停用'
  return raw
}

export function orderNumOf(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

export function byOrderNum<T extends { orderNum?: number }>(rows: T[]) {
  return rows.slice().sort((left, right) => {
    const a = left.orderNum
    const b = right.orderNum
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return a - b
  })
}

export function flat(value: unknown) {
  return text(value).replace(/[\r\n]+/g, '').trim()
}

export function yesFlag(value: unknown) {
  const raw = text(value).trim()
  if (raw === '1' || raw === 'Y' || raw === 'y' || raw === 'true' || raw === '是') return true
  if (raw === '0' || raw === 'N' || raw === 'n' || raw === 'false' || raw === '否') return false
  return undefined
}

export function yesCode(value: unknown) {
  return value === true || value === '1' || value === '是' || value === 'Y' ? '1' : '0'
}

export function arrivalOf(value: unknown) {
  const raw = text(value).trim().replace('T', ' ')
  if (!raw) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  return raw
}

/** 取出行上的嵌套对象字段；非对象则返回 undefined。 */
export function nested(row: object, key: string) {
  const value = (row as Row)[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined
}

export function stamp(value: unknown, size = 16) {
  return text(value).replace('T', ' ').slice(0, size)
}

export function slashDay(value: unknown) {
  const day = text(value).replace('T', ' ').slice(0, 10).replace(/-/g, '/')
  return /^\d{4}\/\d{2}\/\d{2}$/.test(day) ? day : ''
}

export function inDayRange(value: unknown, from: unknown, to: unknown) {
  const day = stamp(value, 10)
  if (!day) return !from && !to
  if (from && day < text(from).slice(0, 10)) return false
  if (to && day > text(to).slice(0, 10)) return false
  return true
}

export function brief(message: string) {
  if (message.includes('production_order_status')) return '完工列表查询失败，数据表还没有 production_order_status'
  if (message.includes('shipment_order_type')) return '出库单表缺少 shipment_order_type 字段，请后端补齐后再建单'
  if (message.includes('源仓库')) return '源仓库不能为空'
  if (message.includes('目标') && message.includes('空')) return '请选择目标堆位'
  if (message.includes('移库单号')) return '移库单号不能为空'
  if (message.includes('出库单号')) return '出库单号不能为空'
  if (message.includes('inventory') && message.includes('null')) return '未找到在库批次'
  const line = message.split('\n').map((item) => item.trim()).find((item) => item && !item.startsWith('#')) || message
  return line.length > 80 ? '丰联接口返回错误' : line
}

export function hourText(value: unknown) {
  const raw = stamp(value, 13)
  return raw.length >= 13 ? `${raw}时` : raw
}

export function clockBound(value: unknown, end: boolean) {
  const raw = text(value).replace('T', ' ').trim()
  if (!raw) return ''
  if (raw.length >= 19) return raw.slice(0, 19)
  if (raw.length >= 13) return `${raw.slice(0, 13)}:${end ? '59:59' : '00:00'}`
  const day = raw.slice(0, 10)
  return day ? `${day} ${end ? '23:59:59' : '00:00:00'}` : ''
}

export function dayText(value: unknown) {
  const raw = text(value).trim()
  return raw ? raw.slice(0, 10) : ''
}

/** 展开嵌套数组 / JSON 字符串里的 row-column 点，兼容 `[[{row,column}]]`。 */
export function areaPoints(value: unknown) {
  const out: Row[] = []
  const seen = new Set<string>()
  const push = (item: Row) => {
    const line = item.row
    const column = item.column ?? item.col
    if (line == null || column == null || line === '' || column === '') return
    const key = `${line}-${column}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ row: line, column })
  }
  const walk = (node: unknown, depth = 0) => {
    if (node == null || depth > 8) return
    if (typeof node === 'string') {
      const raw = node.trim()
      if (!raw) return
      const flat = raw.replace(/\s+/g, '')
      if (/^\d+-\d+(,\d+-\d+)*$/.test(flat)) {
        for (const part of flat.split(',')) {
          const [row, column] = part.split('-').map(Number)
          if (Number.isFinite(row) && Number.isFinite(column)) push({ row, column })
        }
        return
      }
      try { walk(JSON.parse(raw), depth + 1) } catch { /* 非 JSON */ }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (typeof node === 'object') {
      const row = node as Row
      if (row.row != null && (row.column != null || row.col != null)) {
        push(row)
        return
      }
      if ('areas' in row) walk(row.areas, depth + 1)
      if ('areaItems' in row) walk(row.areaItems, depth + 1)
    }
  }
  walk(value)
  return out
}

export function cellsText(row: Row) {
  const area = nested(row, 'area')
  const points = areaPoints([row.areas, row.areaItems, area?.areaItems, area?.areas])
  return points.map((item) => `${item.row}-${item.column}`).join(',')
}

export function cellsBody(value: unknown) {
  return text(value).split(',').filter(Boolean).map((item) => {
    const [row, column] = item.split('-').map(Number)
    return { row, column }
  }).filter((item) => Number.isFinite(item.row) && Number.isFinite(item.column))
}

export function objectRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object') as Row[]
}

const ELEMENT_FIELDS: Record<string, string> = {
  as: 'as', pb: 'pb', cd: 'cd', f: 'f', hg: 'hg', cu: 'cu', ag: 'ag', au: 'au',
  As: 'as', Pb: 'pb', Cd: 'cd', F: 'f', Hg: 'hg', Cu: 'cu', Ag: 'ag', Au: 'au',
}

export function elementListOf(row?: Row) {
  if (!row) return [] as Row[]
  for (const key of ['elements', 'elementList', 'receiptOrderElements']) {
    const list = row[key]
    if (Array.isArray(list) && list.length) return list as Row[]
  }
  return [] as Row[]
}

export function elementFields(row: Row) {
  const fields: Row = { as: '', pb: '', cd: '', f: '', hg: '', cu: '', ag: '', au: '' }
  for (const item of elementListOf(row)) {
    const key = ELEMENT_FIELDS[text(item.elementCode)] || ELEMENT_FIELDS[text(item.elementName)]
    if (!key || item.elementValue == null || item.elementValue === '') continue
    fields[key] = text(item.elementValue)
  }
  return fields
}

export function normalizeResult(result: Row) {
  const out: Row = {}
  for (const [key, value] of Object.entries(result)) {
    const name = key.trim()
    if (!(name in out) || out[name] == null || out[name] === '') out[name] = value
  }
  return out
}

export function resultObject(row: Row) {
  if (row.result && typeof row.result === 'object') return normalizeResult(row.result as Row)
  if (typeof row.resultJson === 'string' && row.resultJson) {
    try { return normalizeResult(JSON.parse(row.resultJson) as Row) } catch { return {} }
  }
  return {}
}

export function blWeightOf(result: Row) {
  const raw = result.ladingWeight ?? result.waybillWeight ?? result.blWeight ?? result.netWeight ?? result.grossWeight
  if (raw == null || raw === '') return ''
  return raw
}
