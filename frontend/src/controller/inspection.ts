import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { mediaUrl, isMediaPath } from '@/api/media'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, idOf, nested, num, stamp, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { dictOf, labelOf } from '@/controller/shared/dict'
import { areaCodeValue, areaNameValue, areaRows, findMerchant } from '@/controller/shared/catalog'
import type {
  ProductionOrderInspectionBo,
  ProductionOrderInspectionVo,
  ProductionOrderVo,
} from '@/typings/openapi'

/** 查验 Vo + 运行时扩展 */
type InspectionRow = ProductionOrderInspectionVo & Row

/** 将附件路径压成展示文案。 */
function fileLabel(path: string) {
  if (!path) return '—'
  const names = path.split(/[、,]/).map((item) => item.trim().split(/[\\/]/).pop() || item.trim()).filter(Boolean)
  return names.join('、') || '—'
}

function filePaths(value: unknown) {
  return text(value).split(/[、,]/).map((item) => item.trim()).filter(Boolean)
}

function orderArea(row: Row) {
  return nested(row, 'area') || nested(row, 'targetArea')
}

function orderCustoms(order: Row) {
  const details = Array.isArray(order.productionOrderDetails) ? order.productionOrderDetails as Row[] : []
  return [...new Set(details.map((detail) => {
    const receipt = nested(detail, 'receiptOrder')
    return text(receipt?.recordNo || detail.recordNo)
  }).filter(Boolean))].join('、')
}

/** 将查验 Vo 映射为列表行。 */
function inspectView(row: InspectionRow | Row, orders: Map<string, Row>, areaNames: { label: string; value: string }[]) {
  const orderId = text(row.productionOrderId)
  const order = orders.get(orderId) || nested(row, 'productionOrder') || {}
  const area = orderArea(order)
  const consignor = nested(order, 'consignor')
  const attachment = text(row.fileUrl)
  const paths = filePaths(attachment)
  const areaRaw = text(area?.areaIdentification || order.areaIdentification)
  return {
    id: text(row.id),
    productionOrderId: orderId,
    prodBatch: text(order.batchNo || row.batchNo),
    orderNo: text(order.productionOrderNo || order.finishOrderNo || order.workOrderNo || orderId),
    consignor: text(consignor?.merchantName || order.consignorName || row.consignor),
    stackCode: text(area?.areaCode || area?.areaName || order.stackCode),
    areaLabel: labelOf(areaNames, areaRaw) || areaRaw || '—',
    outputDry: order.productionWeight ?? row.productionWeight ?? '',
    customsNos: text(row.customsNos || order.customsNos) || orderCustoms(order),
    remark: text(row.remark),
    time: stamp(row.createTime || row.updateTime, 16) || '—',
    attachment: fileLabel(attachment),
    attachmentUrl: paths[0] && isMediaPath(paths[0]) ? mediaUrl(paths[0]) : '',
    attachmentUrls: paths.map((item) => mediaUrl(item)),
    attachmentNames: paths.map((item) => item.split(/[\\/]/).pop() || item),
    fileUrl: attachment,
  }
}

async function loadOrders(ids: string[]) {
  const map = new Map<string, Row>()
  const unique = [...new Set(ids.filter(Boolean))]
  await Promise.all(unique.map(async (id) => {
    const detail = await ruoyiGet<ProductionOrderVo, ProductionOrderVo>(`/wms/productionOrder/${encodeURIComponent(id)}`)
    if (!detail.ok) return
    const row = (detail.data && typeof detail.data === 'object' ? detail.data as Row : detail.rows[0])
    if (row) map.set(id, row)
  }))
  return map
}

async function listInspections(query: Query) {
  const areaNames = await dictOf('wms_area_identification')
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters: Query = {}
  if (consignor) filters.consignorId = idOf(consignor.id)
  const batch = text(query.keyword || query.batchNo).trim()
  if (batch) filters.batchNo = batch
  if (query.productionOrderId) filters.productionOrderId = idOf(query.productionOrderId) ?? text(query.productionOrderId)
  const result = await ruoyiGet<ProductionOrderInspectionVo>('/wms/productionOrderInspection/list', pageParams(query, filters))
  if (!result.ok) return fail(brief(result.message))
  const orderIds = result.rows.map((row) => text(row.productionOrderId || nested(row, 'productionOrder')?.id))
  const orders = await loadOrders(orderIds)
  const list = result.rows.map((row) => inspectView(row, orders, areaNames))
  return pageOf(result, list, query)
}

async function getInspection(id: string) {
  if (!id) return fail('缺少送检单号')
  const areaNames = await dictOf('wms_area_identification')
  const result = await ruoyiGet<ProductionOrderInspectionVo, ProductionOrderInspectionVo>(`/wms/productionOrderInspection/${encodeURIComponent(id)}`)
  if (!result.ok) return fail(brief(result.message))
  const row = (result.data && typeof result.data === 'object' ? result.data as Row : result.rows[0])
  if (!row) return fail('送检记录不存在')
  const orders = await loadOrders([text(row.productionOrderId)])
  return ok(inspectView(row, orders, areaNames))
}

async function resolveProductionOrderId(body: Row) {
  const direct = text(body.productionOrderId).trim()
  if (direct) return direct
  const batchNo = text(body.prodBatch || body.batchNo).trim()
  if (!batchNo) return ''
  const listed = await ruoyiGet<ProductionOrderVo>('/wms/productionOrder/listNoPage', { batchNo })
  if (!listed.ok) return ''
  const hit = listed.rows.find((row) => {
    if (text(row.batchNo) !== batchNo) return false
    const weighed = num(row.productionWeight)
    return text(row.targetAreaId) !== '' || (weighed != null && weighed > 0) || num(row.productionOrderStatus) === 1
  })
  return text(hit?.id)
}

async function saveInspection(id: string | undefined, body: Row) {
  const productionOrderId = await resolveProductionOrderId(body)
  if (!productionOrderId) return fail('请选择待检区票货')
  const uploads = Array.isArray(body.__files) ? body.__files.filter((file): file is File => file instanceof File) : []
  const single = body.__file instanceof File ? [body.__file] : []
  const files = uploads.length ? uploads : single
  const remark = text(body.remark).trim()
  const fileUrl = text(body.fileUrl || body.attachment).trim()

  if (files.length) {
    const form = new FormData()
    if (id) form.append('id', text(idOf(id) ?? id))
    form.append('productionOrderId', text(idOf(productionOrderId) ?? productionOrderId))
    if (remark) form.append('remark', remark)
    for (const file of files) form.append('file', file, file.name || 'attachment')
    const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/productionOrderInspection', form)
    return result.ok ? ok(true, id ? '已保存' : '送检已完成') : fail(brief(result.message))
  }

  if (!id && !fileUrl) return fail('请上传附件')
  const payload: Row = {
    productionOrderId: idOf(productionOrderId) ?? productionOrderId,
    remark,
  }
  if (id) payload.id = idOf(id) ?? id
  if (fileUrl) payload.fileUrl = fileUrl
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/productionOrderInspection', payload)
  return result.ok ? ok(true, id ? '已保存' : '送检已完成') : fail(brief(result.message))
}

/** 待检区可选票货：完工入库且目标堆位仍在待检区 */
async function listInspectLots(query: Query) {
  const areaNames = await dictOf('wms_area_identification')
  const areas = await areaRows()
  const result = await ruoyiGet<ProductionOrderVo>('/wms/productionOrder/list', pageParams(query, {
    type: 2,
    batchNo: text(query.keyword || query.batchNo).trim() || undefined,
  }))
  if (!result.ok) return fail(brief(result.message))
  const list = result.rows.map((row) => {
    const area = orderArea(row)
    const areaId = text(row.targetAreaId || area?.id)
    const stack = areas.find((item) => text(item.id) === areaId)
      || areas.find((item) => areaCodeValue(item) === text(area?.areaCode) || areaNameValue(item) === text(area?.areaName))
    const areaRaw = text(stack?.areaIdentification || area?.areaIdentification)
    const areaLabel = labelOf(areaNames, areaRaw) || areaRaw
    const details = Array.isArray(row.productionOrderDetails) ? row.productionOrderDetails as Row[] : []
    const customs = [...new Set(details.map((detail) => {
      const receipt = nested(detail, 'receiptOrder')
      return text(receipt?.recordNo || detail.recordNo)
    }).filter(Boolean))]
    const consignor = nested(row, 'consignor')
    return {
      id: text(row.id),
      productionOrderId: text(row.id),
      orderNo: text(row.productionOrderNo || row.finishOrderNo || row.workOrderNo || row.id),
      prodBatch: text(row.batchNo),
      consignor: text(consignor?.merchantName || row.consignorName),
      stackCode: text(stack ? (areaCodeValue(stack) || areaNameValue(stack)) : (area?.areaCode || area?.areaName)),
      areaLabel,
      outputDry: row.productionWeight ?? '',
      customsNos: customs.join('、'),
      time: stamp(row.updateTime || row.createTime, 16),
    }
  }).filter((row) => {
    const label = text(row.areaLabel)
    return label === '待检区' || label.includes('待检')
  })
  return ok({
    list,
    total: list.length,
    page: 1,
    pageSize: list.length || Number(query.pageSize || 10),
  })
}

export const inspectionRoutes: Route[] = [
  { method: 'GET', match: '/production/inspections/lots', handle: ({ query }) => listInspectLots(query) },
  { method: 'GET', match: '/production/inspections', handle: ({ query }) => listInspections(query) },
  { method: 'GET', match: /^\/production\/inspections\/([^/]+)$/, handle: ({ params }) => getInspection(params[0]) },
  { method: 'POST', match: '/production/inspections', handle: ({ body }) => saveInspection(undefined, body) },
  { method: 'PUT', match: /^\/production\/inspections\/([^/]+)$/, handle: ({ params, body }) => saveInspection(params[0], body) },
]
