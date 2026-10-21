import { fail, ok } from '@/api/result'
import type { RuoyiResult } from '@/api/ruoyi'
import { text } from './coerce'
import type { Query, Row } from './types'

export function pageParams(query: Query, extra: Query = {}) {
  const params: Query = { pageNum: query.page || 1, pageSize: query.pageSize || 10, ...extra }
  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] == null) delete params[key]
  })
  return params
}

export function range(query: Query) {
  const params: Query = {}
  if (query.from) params.beginTime = `${text(query.from).slice(0, 10)} 00:00:00`
  if (query.to) params.endTime = `${text(query.to).slice(0, 10)} 23:59:59`
  return Object.keys(params).length ? { params } : {}
}

export function pageOf(result: RuoyiResult, list: Row[], query: Query) {
  if (!result.ok) return fail(result.message)
  return ok({ list, total: result.total, page: Number(query.page || 1), pageSize: Number(query.pageSize || 10) }, result.message)
}
