export const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))

export function money(amount: unknown, currency?: unknown) {
  if (amount == null || amount === '') return '—'
  const value = Number(amount)
  const num = Number.isFinite(value) ? value.toLocaleString('en-US') : String(amount)
  const mark = currency === 'USD' || String(currency || '').includes('美元') ? '$' : '¥'
  return `${mark} ${num}`
}

export function qualityLine(row: Record<string, unknown>) {
  const keys = ['cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg']
  const text = keys.map((key) => (row[key] ? `${key.toUpperCase()}${row[key]}` : '')).filter(Boolean).join('；')
  return text || '—'
}

export function cellKeys(row?: Record<string, unknown>) {
  let cols = Number(row?.gridCols || 0)
  let rows = Number(row?.gridRows || 0)
  if (!(cols > 0 && rows > 0)) {
    const matched = String(row?.grid || '').match(/(\d+)\s*[×xX]\s*(\d+)/)
    if (!matched) return []
    cols = Number(matched[1])
    rows = Number(matched[2])
  }
  const list: string[] = []
  for (let rowIndex = 1; rowIndex <= rows; rowIndex += 1) {
    for (let col = 1; col <= cols; col += 1) list.push(`${rowIndex}-${col}`)
  }
  return list
}

export function dash(value: unknown) {
  return value == null || value === '' ? '—' : String(value)
}
