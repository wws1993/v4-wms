import type { Route } from '@/api-map/types'
import { fail } from '@/api/result'
import { ruoyiGet } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'

const WARNING_TYPE: Record<string, number> = { 库容: 1, 库龄: 2, 码头超期: 3, 备案用量: 4 }
const WARNING_TYPE_LABEL = ['', '库容', '库龄', '码头超期', '备案用量']
const WARNING_LEVEL: Record<string, number> = { 低: 1, 中: 2, 高: 3 }
const WARNING_LEVEL_LABEL = ['', '低', '中', '高']

function warningRow(row: Row) {
  const type = Number(row.warningType)
  const level = Number(row.warningLevel)
  return {
    id: text(row.id),
    time: text(row.warningDate).replace('T', ' ').slice(0, 10),
    type: WARNING_TYPE_LABEL[type] || text(row.warningType),
    level: WARNING_LEVEL_LABEL[level] || text(row.warningLevel),
    target: text(row.targetName),
    detail: text(row.warningDesc),
    status: text(row.status),
  }
}

async function listWarningRecords(query: Query) {
  const result = await ruoyiGet('/wms/warningRecord/list', pageParams(query, {
    warningType: query.type ? WARNING_TYPE[text(query.type)] : undefined,
    warningLevel: query.level ? WARNING_LEVEL[text(query.level)] : undefined,
    keyword: text(query.keyword).trim() || undefined,
    startDate: query.from || undefined,
    endDate: query.to || undefined,
  }))
  if (!result.ok) return fail(result.message)
  return pageOf(result, result.rows.map(warningRow), query)
}

export const warningRoutes: Route[] = [
  { method: 'GET', match: '/warning-records', handle: ({ query }) => listWarningRecords(query) },
]
