import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import type { AccountBookBo, AccountBookVo } from '@/typings/openapi'

/** 将账册 Vo 映射为列表行。 */
function bookRow(row: AccountBookVo) {
  const warn = text(row.earlyWarningTime)
  return {
    id: text(row.id),
    code: text(row.accountCode),
    name: text(row.accountName),
    operator: text(row.operatingUnit),
    value: row.goodsValue,
    customsNo: text(row.customsDeclarationNumber),
    status: text(row.filingStatus),
    prevBook: text(row.oldAccountName),
    prevBookId: row.oldAccountId,
    warnDate: warn ? warn.slice(0, 10) : '',
    remark: text(row.remark),
  }
}

/** 新建保税账册。 */
async function createBook(body: Row) {
  const code = text(body.code)
  const name = text(body.name)
  if (!code || !name) return fail('请填写账册编号与名称')
  const warn = text(body.warnDate)
  const payload: Partial<AccountBookBo> & { earlyWarningTime?: string } = {
    accountCode: code,
    accountName: name,
    operatingUnit: text(body.operator),
    filingStatus: text(body.status) || '在用',
    customsDeclarationNumber: text(body.customsNo) || undefined,
    remark: text(body.remark) || undefined,
  }
  if (body.value !== '' && body.value != null) payload.goodsValue = Number(body.value)
  if (warn) {
    payload.earlyWarningTime = warn
    payload.beginEarlyWarningTime = warn
  }
  const result = await ruoyiSend('POST', '/wms/accountBook', payload)
  return result.ok ? ok(true, '账册已新建') : fail(result.message)
}

/** 保税账册路由表 */
export const bondedRoutes: Route[] = [
  { method: 'GET', match: '/bonded-books', handle: async ({ query }) => {
    const result = await ruoyiGet<AccountBookVo>('/wms/accountBook/list', pageParams(query, {
      accountCode: query.code || undefined,
      accountName: query.name || query.keyword || undefined,
      customsDeclarationNumber: query.customsNo || undefined,
      filingStatus: query.status || undefined,
      beginEarlyWarningTime: query.from || undefined,
      endEarlyWarningTime: query.to || undefined,
    }))
    return pageOf(result, result.rows.map(bookRow), query)
  } },
  { method: 'POST', match: '/bonded-books', handle: ({ body }) => createBook(body) },
]
