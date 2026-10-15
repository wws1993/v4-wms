export const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))

export const OCR_BL = {
  shipName: '海洋之星', blNo: 'BL20260801001', customsNo: 'BG20260801088', checklistNo: 'HZ20260801012',
  amount: 1280000, currency: 'USD', time: '2026-08-05', material: '铜精矿',
}
export const OCR_CUSTOMS = {
  shipName: '海豚号', blNo: 'BL20260804002', customsNo: 'BG20260804088', checklistNo: 'HZ20260804012',
  amount: 218000, currency: 'USD', time: '2026-08-06', material: '铜精矿',
}
export const OCR_WEIGHT = { wet: 820, dry: 738, moisture: 10 }
export const OCR_QUALITY = {
  qualityNo: 'QA-20260803-001', moisture: 10,
  cu: '22.5%', ag: '45 g/t', au: '0.8 g/t', as: '0.12%', pb: '0.05%', cd: '0.01%', f: '0.02%', hg: '0.001%',
}
export const OCR_OUT = {
  customsNo: 'BGCK2026080301', checklistNo: 'HZCK2026080301', consignee: '华东冶炼股份公司',
  consumer: '华东冶炼冶炼一分厂', wet: 100, amount: 218000, currency: 'USD', batchNo: 'FL-20260803',
}

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
