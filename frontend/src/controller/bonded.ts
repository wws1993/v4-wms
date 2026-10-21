import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { idOf, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { catalog, findBook } from '@/controller/shared/catalog'

function bookRow(row: Row) {
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
  }
}
function openBook(row: Row) {
  const status = text(row.filingStatus)
  return status === '在用' || status === '新账' || status === '有效'
}

async function saveBook(id: string | undefined, body: Row) {
  const warn = text(body.warnDate)
  if (!id) {
    if (!text(body.code) || !text(body.name)) return fail('请填写账册编号与名称')
    const listed = await catalog('/wms/accountBook/listNoPage')
    if (!listed.ok) return fail(listed.message)
    const linked = listed.rows.find(openBook)
    if (linked && !warn) return fail('衔接旧账册须填写旧账预警日期')
    const payload: Row = {
      accountCode: body.code,
      accountName: body.name,
      operatingUnit: '',
      filingStatus: '在用',
      oldAccountId: linked ? idOf(linked.id) : undefined,
      earlyWarningTime: warn || undefined,
      beginEarlyWarningTime: warn || undefined,
    }
    const result = await ruoyiSend('POST', '/wms/accountBook', payload)
    if (!result.ok) return fail(result.message)
    if (linked) {
      const stopped = await ruoyiSend('PUT', '/wms/accountBook', {
        id: idOf(linked.id),
        accountCode: linked.accountCode,
        accountName: linked.accountName,
        operatingUnit: linked.operatingUnit,
        goodsValue: linked.goodsValue,
        customsDeclarationNumber: linked.customsDeclarationNumber,
        filingStatus: '停用',
        oldAccountId: linked.oldAccountId,
        earlyWarningTime: linked.earlyWarningTime,
      })
      if (!stopped.ok) return fail(stopped.message)
      return ok(true, `账册已备案，${text(linked.accountCode)} 已停用`)
    }
    return ok(true, '账册已备案')
  }
  const current = await findBook(id)
  if (!current) return fail('账册不存在')
  const payload: Row = {
    id: idOf(id),
    accountCode: current.accountCode,
    accountName: body.name,
    operatingUnit: current.operatingUnit,
    goodsValue: current.goodsValue,
    customsDeclarationNumber: current.customsDeclarationNumber,
    filingStatus: current.filingStatus,
    oldAccountId: current.oldAccountId,
    earlyWarningTime: warn || current.earlyWarningTime || undefined,
  }
  const result = await ruoyiSend('PUT', '/wms/accountBook', payload)
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

const bondedLotsUnavailable: Route['handle'] = async () => fail('后端未提供账册票矿接口')

export const bondedRoutes: Route[] = [
  { method: 'GET', match: /^\/bonded-books\/[^/]+\/lots/, handle: bondedLotsUnavailable },
  { method: 'POST', match: /^\/bonded-books\/[^/]+\/lots/, handle: bondedLotsUnavailable },
  { method: 'PUT', match: /^\/bonded-books\/[^/]+\/lots/, handle: bondedLotsUnavailable },
  { method: 'DELETE', match: /^\/bonded-books\/[^/]+\/lots/, handle: bondedLotsUnavailable },
  { method: 'GET', match: '/bonded-books', handle: async ({ query }) => {
    const result = await ruoyiGet('/wms/accountBook/list', pageParams(query, {
      accountName: query.keyword || undefined,
      beginEarlyWarningTime: query.from || undefined,
      endEarlyWarningTime: query.to || undefined,
    }))
    return pageOf(result, result.rows.map(bookRow), query)
  } },
  { method: 'POST', match: '/bonded-books', handle: ({ body }) => saveBook(undefined, body) },
  { method: 'PUT', match: /^\/bonded-books\/([^/]+)$/, handle: ({ params, body }) => saveBook(params[0], body) },
]
