export function ok<T>(data: T, message = 'ok') {
  return { success: true as const, data, message }
}

export function fail(message: string) {
  return { success: false as const, data: null, message }
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const head = columns.map((col) => csvCell(col.label)).join(',')
  const body = rows.map((row) => columns.map((col) => csvCell(row[col.key])).join(',')).join('\n')
  return `${head}\n${body}`
}

export function downloadBlob(filename: string, blob: Blob) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' })
  downloadBlob(filename, blob)
}
