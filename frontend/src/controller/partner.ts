import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { isMediaPath, mediaUrl } from '@/api/media'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { flagLabel, flagStatus, idOf, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { codeOf, merchantTypes, labelOf } from '@/controller/shared/dict'
import { clearMerchantCache, merchantRows } from '@/controller/shared/catalog'
import { statusReply } from '@/controller/shared/reply'
import { SOURCE_LABEL } from '@/controller/shared/constants'
import { uploadFilingFile } from '@/controller/material'
import type { MerchantBo, MerchantVo } from '@/typings/openapi'

/** 往来单位 Vo 上偶发的扩展字段。 */
type MerchantRow = MerchantVo & { source?: number | string }

/** 将往来单位 Vo 映射为列表行。 */
function merchantRow(row: MerchantRow, types: { label: string; value: string }[]) {
  const source = Number(row.source)
  const fileUrl = text(row.fileUrl)
  return {
    id: text(row.id),
    code: text(row.merchantCode),
    name: text(row.merchantName),
    role: labelOf(types, row.merchantType),
    phone: text(row.mobile),
    credentialStatus: text(row.credentialStatus),
    status: flagLabel(row.status),
    source: SOURCE_LABEL[source] || text(row.source),
    attachment: fileUrl,
    attachmentUrl: isMediaPath(fileUrl) ? mediaUrl(fileUrl) : '',
    attachmentText: fileUrl ? '1 个' : '—',
  }
}

/** 删除往来单位。 */
async function removeMerchant(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/merchant/${id}`)
  if (result.ok) clearMerchantCache()
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

/** 新建或更新往来单位。 */
async function saveMerchant(id: string | undefined, body: Row) {
  const types = await merchantTypes()
  const merchantType = codeOf(types, body.role)
  if (merchantType == null) return fail('请选择往来单位角色')
  let fileUrl = text(body.attachment).trim()
  const file = body.__file
  if (file instanceof Blob) {
    const uploaded = await uploadFilingFile(file)
    if (!uploaded.success || !uploaded.data) return fail(uploaded.message || '附件上传失败')
    fileUrl = uploaded.data
  }
  const payload: Partial<MerchantBo> = {
    merchantCode: text(body.code),
    merchantName: text(body.name),
    merchantType: Number(merchantType),
    mobile: text(body.phone) || '',
    credentialStatus: text(body.credentialStatus),
    status: flagStatus(body.status || '启用'),
    source: SOURCE_LABEL.indexOf(text(body.source)) >= 0 ? SOURCE_LABEL.indexOf(text(body.source)) : 0,
  }
  if (id) payload.id = idOf(id) as MerchantBo['id']
  if (fileUrl || id) payload.fileUrl = fileUrl
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/merchant', payload)
  if (result.ok) clearMerchantCache()
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

/** 往来单位路由表 */
export const partnerRoutes: Route[] = [
  { method: 'GET', match: '/partners/consignors', handle: async () => {
    const types = await merchantTypes()
    const consignor = types.find((item) => item.label === '委托方')
    const list = await merchantRows()
    if (!list.ok) return fail('往来单位读取失败')
    const names = list.rows
      .filter((row) => !consignor || text(row.merchantType) === consignor.value)
      .map((row) => text(row.merchantName))
      .filter(Boolean)
    return ok(names)
  } },
  { method: 'GET', match: '/partners', handle: async ({ query }) => {
    const types = await merchantTypes()
    const merchantType = query.role ? codeOf(types, query.role) : undefined
    const result = await ruoyiGet<MerchantVo>('/wms/merchant/list', pageParams(query, {
      merchantName: query.keyword || undefined,
      merchantType,
    }))
    return pageOf(result, result.rows.map((row) => merchantRow(row as MerchantRow, types)), query)
  } },
  { method: 'POST', match: '/partners', handle: ({ body }) => saveMerchant(undefined, body) },
  { method: 'PUT', match: /^\/partners\/([^/]+)\/status$/, handle: async ({ params, body: payload }) => {
    const saved = await saveMerchant(params[0], payload)
    return statusReply(saved, payload.status)
  } },
  { method: 'PUT', match: /^\/partners\/([^/]+)$/, handle: ({ params, body }) => saveMerchant(params[0], body) },
  { method: 'DELETE', match: /^\/partners\/([^/]+)$/, handle: ({ params }) => removeMerchant(params[0]) },
]
