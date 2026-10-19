export function mediaUrl(source: unknown) {
  const value = source == null ? '' : String(source).trim()
  if (!value) return ''
  if (/^(https?:|blob:|data:)/i.test(value)) return value
  if (value.startsWith('/api/')) return value
  return `/api${value.startsWith('/') ? value : `/${value}`}`
}

export function isMediaPath(source: unknown) {
  const value = source == null ? '' : String(source).trim()
  return value.startsWith('/') || /^https?:/i.test(value)
}
