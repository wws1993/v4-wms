export const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))

export function money(amount: unknown, currency?: unknown) {
  if (amount == null || amount === '') return '—'
  const value = Number(amount)
  const num = Number.isFinite(value) ? value.toLocaleString('en-US') : String(amount)
  const mark = currency === 'USD' || String(currency || '').includes('美元') ? '$' : '¥'
  return `${mark} ${num}`
}

const QUALITY_UNITS: Record<string, string> = {
  cu: '%',
  ag: 'g/t',
  au: 'g/t',
  as: '%',
  pb: '%',
  cd: '%',
  f: '%',
  hg: '%',
}

/** 去掉小数末尾多余的 0，如 7595.000 → 7595、11979.140 → 11979.14 */
export function trimZeros(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '—' || raw === '-') return ''
  const cleaned = raw.replace(/\s*(%|g\/t|吨|t)\s*$/i, '').trim()
  if (!cleaned) return ''
  if (!cleaned.includes('.')) return cleaned
  return cleaned.replace(/0+$/, '').replace(/\.$/, '')
}

export function tonText(value: unknown) {
  const num = trimZeros(value)
  return num ? `${num} 吨` : '—'
}

function formatQualityValue(value: unknown) {
  return trimZeros(value)
}

export function qualityLine(row: Record<string, unknown>) {
  const keys = ['cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg']
  const text = keys
    .map((key) => {
      const value = formatQualityValue(row[key])
      if (!value) return ''
      return `${key.toUpperCase()}${value}${QUALITY_UNITS[key] || '%'}`
    })
    .filter(Boolean)
    .join(',')
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
