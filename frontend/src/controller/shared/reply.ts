import { ok } from '@/api/result'
import { text } from './coerce'
import type { Row } from './types'

export function statusReply(saved: { success: boolean; message: string; data: unknown }, status: unknown) {
  if (!saved.success) return saved
  return ok(true, text(status) === '停用' ? '已停用' : '已启用')
}

export function savedId(result: { data: unknown }) {
  const data = result.data
  if (typeof data === 'string' || typeof data === 'number') {
    const id = text(data).trim()
    if (id && id !== 'true' && id !== 'false') return id
  }
  if (data && typeof data === 'object') {
    const row = data as Row
    const id = text(row.id)
    if (id && id !== '[object Object]') return id
  }
  return ''
}
