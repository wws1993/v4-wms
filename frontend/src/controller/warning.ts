import type { Route } from '@/api-map/types'
import { fail } from '@/api/result'
import { ruoyiGet } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import type { WarningRecordVo } from '@/typings/openapi'

/** 预警类型标签 → 编码 */
const WARNING_TYPE: Record<string, number> = { 库容: 1, 库龄: 2, 码头超期: 3, 备案用量: 4 }
/** 预警类型编码 → 标签 */
const WARNING_TYPE_LABEL = ['', '库容', '库龄', '码头超期', '备案用量']
/** 预警级别标签 → 编码 */
const WARNING_LEVEL: Record<string, number> = { 低: 1, 中: 2, 高: 3 }
/** 预警级别编码 → 标签 */
const WARNING_LEVEL_LABEL = ['', '低', '中', '高']

/** 将预警记录 Vo 映射为列表行。 */
function warningRow(row: WarningRecordVo | Row) {
  const bag = row as WarningRecordVo
  const type = Number(bag.warningType)
  const level = Number(bag.warningLevel)
  return {
    id: text(bag.id),
    time: text(bag.warningDate).replace('T', ' ').slice(0, 10),
    type: WARNING_TYPE_LABEL[type] || text(bag.warningType),
    level: WARNING_LEVEL_LABEL[level] || text(bag.warningLevel),
    target: text(bag.targetName),
    detail: text(bag.warningDesc),
    status: text(bag.status),
  }
}

/** 分页查询预警记录。 */
async function listWarningRecords(query: Query) {
  const result = await ruoyiGet<WarningRecordVo>('/wms/warningRecord/list', pageParams(query, {
    warningType: query.type ? WARNING_TYPE[text(query.type)] : undefined,
    warningLevel: query.level ? WARNING_LEVEL[text(query.level)] : undefined,
    keyword: text(query.keyword).trim() || undefined,
    startDate: query.from || undefined,
    endDate: query.to || undefined,
  }))
  if (!result.ok) return fail(result.message)
  return pageOf(result, result.rows.map(warningRow), query)
}

/** 预警记录路由表 */
export const warningRoutes: Route[] = [
  { method: 'GET', match: '/warning-records', handle: ({ query }) => listWarningRecords(query) },
]
