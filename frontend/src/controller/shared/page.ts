import { fail, ok } from '@/api/result'
import type { RuoyiResult } from '@/api/ruoyi'
import type { PageQuery } from '@/typings/openapi'
import { text } from './coerce'
import type { Query } from './types'

/**
 * 将前端分页 query 转为若依 pageNum/pageSize，并合并业务筛选项。
 */
export function pageParams(query: Query, extra: Query = {}): PageQuery & Query {
  const params: PageQuery & Query = { pageNum: Number(query.page || 1), pageSize: Number(query.pageSize || 10), ...query, ...extra }

  for (const key in params) {
    if (params[key] === '' || params[key] === null) delete params[key]
  }

  return params
}

/** 从 query.from / query.to 生成 beginTime / endTime（若依 params 嵌套）。 */
export function range(query: Query) {
  const params: Query = {}
  if (query.from) params.beginTime = `${text(query.from).slice(0, 10)} 00:00:00`
  if (query.to) params.endTime = `${text(query.to).slice(0, 10)} 23:59:59`
  return Object.keys(params).length ? { params } : {}
}

/**
 * 将若依分页结果与已映射的列表行包装为前端 PageResult。
 * @typeParam TList 列表行类型（多为 UI 视图行）
 */
export function pageOf<TList>(result: RuoyiResult<unknown>, list: TList[], query: Query) {
  if (!result.ok) return fail(result.message)
  return ok({ list, total: result.total, page: Number(query.page || 1), pageSize: Number(query.pageSize || 10) }, result.message)
}
