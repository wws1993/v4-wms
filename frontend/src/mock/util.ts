import type { PageResult } from '@/types'

export function ok<T>(data: T, message = 'ok') {
  return { success: true as const, data, message }
}

export function fail(message: string) {
  return { success: false as const, data: null, message }
}

export function filled(value: unknown) {
  return value !== undefined && value !== null && String(value) !== ''
}

export function pageOf<T>(rows: T[], query: Record<string, unknown>, pred?: (row: T) => boolean): PageResult<T> {
  const filtered = pred ? rows.filter(pred) : rows.slice()
  const page = Math.max(1, Number(query.page || 1))
  const pageSize = Math.max(1, Number(query.pageSize || 10))
  const start = (page - 1) * pageSize
  return { list: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize }
}

export function inRange(value: string, from?: unknown, to?: unknown) {
  const day = (value || '').slice(0, 10)
  if (filled(from) && day < String(from).slice(0, 10)) return false
  if (filled(to) && day > String(to).slice(0, 10)) return false
  return true
}

export function includes(value: unknown, keyword: unknown) {
  if (!filled(keyword)) return true
  return String(value ?? '').toLowerCase().includes(String(keyword).toLowerCase())
}

export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const head = columns.map((col) => csvCell(col.label)).join(',')
  const body = rows.map((row) => columns.map((col) => csvCell(row[col.key])).join(',')).join('\n')
  return `${head}\n${body}`
}

export function nowText() {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function daysBefore(dateText: string) {
  const then = new Date(dateText.slice(0, 10) + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - then.getTime()) / 86400000)
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
