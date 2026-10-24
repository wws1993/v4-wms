import type { Route } from '@/api-map/types'
import { presentAudit } from '@/audit/present'
import { fail, ok } from '@/api/result'
import { ruoyiGet } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'
import { pageOf, pageParams, range } from '@/controller/shared/page'
import { OPER_ACTION } from '@/controller/shared/constants'
import type { SysOperLogVo } from '@/typings/openapi'

/** 拆分「变更前→变更后」文案。 */
function splitChange(content: string) {
  const arrow = content.split('→')
  if (arrow.length < 2) return { before: '—', after: content || '—' }
  return { before: arrow[0].trim() || '—', after: arrow.slice(1).join('→').trim() || '—' }
}

/** 将操作日志 Vo 映射为审计展示行。 */
function auditRow(row: SysOperLogVo | Row) {
  const change = splitChange(text(row.operContent))
  const action = text(row.businessCategory) || OPER_ACTION[Number(row.businessType)] || '—'
  const failed = Number(row.status) === 0
  return presentAudit({
    id: text(row.operId),
    time: text(row.operTime).replace('T', ' ').slice(0, 16),
    operator: text(row.operName),
    module: text(row.title),
    action,
    bizNo: text(row.businessNo),
    customsAccount: text(row.title).includes('关务') ? '是' : '否',
    ip: text(row.operIp),
    before: change.before,
    after: change.after,
    content: text(row.operContent),
    detail: text(row.operDetail),
    result: failed ? `异常${text(row.errorMsg) ? `；${text(row.errorMsg)}` : ''}` : '成功',
  })
}

/** 审计日志路由表 */
export const auditRoutes: Route[] = [
  { method: 'GET', match: '/audit-logs', handle: async ({ query }) => {
    const result = await ruoyiGet<SysOperLogVo>('/monitor/operlog/list', pageParams(query, {
      title: query.module || undefined,
      operName: query.operator || query.keyword || undefined,
      businessNo: query.bizNo || undefined,
      ...range(query),
    }))
    if (!result.ok) return fail(result.message)
    const rows = result.rows.map(auditRow)
    return pageOf(result, rows, query)
  } },
  { method: 'GET', match: /^\/audit-logs\/([^/]+)$/, handle: async ({ params }) => {
    const result = await ruoyiGet<SysOperLogVo>('/monitor/operlog/list', { pageNum: 1, pageSize: 1, operId: params[0] })
    if (!result.ok) return fail(result.message)
    const row = result.rows[0]
    return row ? ok(auditRow(row)) : fail('日志不存在')
  } },
]
