import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, idOf, nested, num, stamp, text } from '@/controller/shared/coerce'
import { pageParams, range } from '@/controller/shared/page'
import { clearDirectory } from '@/controller/shared/directory'
import { codeFromDict, dictOf, labelOf } from '@/controller/shared/dict'
import {
  findMerchant, merchantRows,
} from '@/controller/shared/catalog'
import type { MerchantVo, ShipmentOrderBo, ShipmentOrderVo } from '@/typings/openapi'

/** 出库单 Vo + 运行时扩展字段 */
type ShipmentRow = ShipmentOrderVo & Row

function shipmentId(value: unknown) {
  const id = idOf(value)
  return typeof id === 'number' ? id : undefined
}

/** 从备注中解析打包的元数据。 */
function parseShipmentRemark(remark: unknown) {
  const raw = text(remark)
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/s)
  const bag: Row = { checklistNo: '', consumer: '', consignor: '', currency: '', batchNo: '', remark: raw }
  if (!match) return bag
  for (const part of match[1].split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    const key = part.slice(0, at).trim()
    const value = part.slice(at + 1).trim()
    if (key === '核注') bag.checklistNo = value
    else if (key === '消费') bag.consumer = value
    else if (key === '委托') bag.consignor = value
    else if (key === '币制') bag.currency = value
    else if (key === '批次') bag.batchNo = value
  }
  bag.remark = match[2].trim()
  return bag
}

/** 将出库单 Vo 映射为前端展示行。 */
function shipmentView(
  row: ShipmentRow | Row,
  statuses: { label: string; value: string }[],
  types: { label: string; value: string }[],
  merchants: MerchantVo[],
): Row {
  const merchant = nested(row, 'merchant') || nested(row, 'consignee')
  const merchantId = text(row.consignorId || merchant?.id)
  const merchantName = text(
    row.consignorName
    || nested(row, 'consignor')?.merchantName
    || merchant?.merchantName
    || merchants.find((item) => text(item.id) === merchantId)?.merchantName
    || row.merchantName,
  )
  const meta = parseShipmentRemark(row.remark)
  const detailRows = Array.isArray(row.shipmentOrderDetails) ? row.shipmentOrderDetails as Row[] : []
  const detailAmount = detailRows.reduce((sum, detail) => sum + (num(detail.totalPrice) ?? 0), 0)
  return {
    id: text(row.id),
    orderNo: text(row.shipmentOrderNo || row.id),
    recordNo: text(row.recordNo || row.customsNo),
    checklistNo: text(row.verificationCode || row.checklistNo || meta.checklistNo),
    ebookNo: text(row.ebookNo),
    consignor: merchantName || text(meta.consignor),
    receivingCompany: text(row.receivingCompany || row.receivingCompanyName),
    consumer: text(row.consumer || row.consumerName || meta.consumer),
    batchNo: text(row.batchNo || meta.batchNo),
    shipmentWeight: row.shipmentWeight ?? '',
    amount: row.recordAmount ?? (detailRows.length ? detailAmount : ''),
    remark: text(meta.remark),
    planShipmentTime: stamp(row.planShipmentTime, 16),
    time: stamp(row.planShipmentTime || row.createTime, 16),
    finishedAt: stamp(row.shipmentTime, 16),
    status: labelOf(statuses, row.shipmentOrderStatus) || text(row.shipmentOrderStatus),
    shipmentType: labelOf(types, row.shipmentOrderType) || text(row.shipmentOrderType),
  }
}

/** 分页查询出库单。 */
async function listShipments(query: Query) {
  const [statuses, types, merchants] = await Promise.all([
    dictOf('wms_shipment_status'),
    dictOf('wms_shipment_type'),
    merchantRows(),
  ])
  const merchant = query.consignor
    ? await findMerchant(query.consignor)
    : undefined
  const statusCode = query.status ? await codeFromDict('wms_shipment_status', query.status) : undefined
  const typeCode = query.shipmentType ? await codeFromDict('wms_shipment_type', query.shipmentType) : undefined
  const hasRange = Boolean(query.from || query.to)
  const recordNo = text(query.recordNo || query.customsNo).trim()
  const batchNo = text(query.batchNo).trim()
  const word = text(query.keyword).trim()
  const ask = (withRange: boolean) => ruoyiGet<ShipmentOrderVo>('/wms/shipmentOrder/list', pageParams(query, {
    shipmentOrderStatus: statusCode,
    shipmentOrderType: typeCode,
    consignorId: merchant ? idOf(merchant.id) : undefined,
    recordNo: recordNo || (!batchNo ? word || undefined : undefined),
    batchNo: batchNo || undefined,
    ...(withRange ? range(query) : {}),
  }))
  let useRange = hasRange
  let result = await ask(useRange)
  let note = ''
  if (!result.ok && useRange) {
    useRange = false
    result = await ask(false)
    if (result.ok) note = '出库列表暂不支持起止日期，已按其它条件查询'
  }
  if (!result.ok) return fail(brief(result.message))
  const rows = result.rows.map((row) => shipmentView(row as ShipmentRow, statuses, types, merchants.rows))
  return ok({
    list: rows,
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, note || result.message)
}

/** 按 id 查询出库单详情。 */
async function getShipment(id: string) {
  const [detail, statuses, types, merchants] = await Promise.all([
    ruoyiGet<ShipmentOrderVo, ShipmentOrderVo>(`/wms/shipmentOrder/${encodeURIComponent(id)}`),
    dictOf('wms_shipment_status'),
    dictOf('wms_shipment_type'),
    merchantRows(),
  ])
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(brief(detail.message) || '出库单不存在')
  return ok(shipmentView(detail.data as ShipmentRow, statuses, types, merchants.rows))
}

/** 创建出库单。 */
async function createShipment(body: Row) {
  const result = await ruoyiSend('POST', '/wms/shipmentOrder', body)
  if (result.ok) {
    clearDirectory('inventories')
    clearDirectory('inventoryDetails')
  }
  return result.ok ? ok(result.data, '出库单已创建') : fail(brief(result.message))
}

/** 更新出库单。 */
async function updateShipment(id: string, body: Row) {
  const detail = await ruoyiGet<ShipmentOrderVo, ShipmentOrderVo>(`/wms/shipmentOrder/${encodeURIComponent(id)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(brief(detail.message) || '出库单不存在')
  const current = detail.data as ShipmentRow
  const shipmentNumericId = shipmentId(id)
  const consignorId = shipmentId(body.consignorId || current.consignorId)
  const inventoryId = shipmentId(body.inventoryId || (current as Row).inventoryId)
  if (shipmentNumericId == null || consignorId == null || inventoryId == null) return fail('出库单缺少有效的编号信息')
  const payload: Partial<ShipmentOrderBo> & Row = {
    id: shipmentNumericId,
    shipmentOrderNo: text(body.orderNo || current.shipmentOrderNo),
    consignorId,
    receivingCompany: text(body.receivingCompany || current.receivingCompany),
    consumer: text(body.consumer || current.consumer || current.consumerName),
    inventoryId,
    recordNo: text(body.recordNo || current.recordNo),
    ebookNo: text(body.ebookNo || current.ebookNo),
    verificationCode: text(body.verificationCode || current.verificationCode),
    batchNo: text(body.batchNo || current.batchNo),
    shipmentWeight: num(body.shipmentWeight) ?? current.shipmentWeight,
    shipmentOrderDetails: body.shipmentOrderDetails || (current as Row).shipmentOrderDetails,
    planShipmentTime: text(body.planShipmentTime || current.planShipmentTime),
    remark: text(body.remark ?? current.remark),
  }
  const result = await ruoyiSend('PUT', '/wms/shipmentOrder', payload)
  if (result.ok) {
    clearDirectory('inventories')
    clearDirectory('inventoryDetails')
  }
  return result.ok ? ok(true, '出库单已更新') : fail(brief(result.message))
}

/** 完成出库。 */
async function completeShipment(id: string) {
  const detail = await ruoyiGet<ShipmentOrderVo, ShipmentOrderVo>(`/wms/shipmentOrder/${encodeURIComponent(id)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(brief(detail.message) || '出库单不存在')
  const current = detail.data as ShipmentRow
  const shipmentNumericId = shipmentId(id)
  const consignorId = shipmentId(current.consignorId)
  const inventoryId = shipmentId((current as Row).inventoryId)
  if (shipmentNumericId == null || consignorId == null || inventoryId == null) return fail('出库单缺少有效的编号信息')
  const payload: Partial<ShipmentOrderBo> & Row = {
    id: shipmentNumericId,
    shipmentOrderNo: text(current.shipmentOrderNo),
    consignorId,
    receivingCompany: text(current.receivingCompany),
    consumer: text(current.consumer || current.consumerName),
    inventoryId,
    recordNo: text(current.recordNo),
    ebookNo: text(current.ebookNo),
    verificationCode: text(current.verificationCode),
    batchNo: text(current.batchNo),
    shipmentWeight: num(current.shipmentWeight),
    shipmentOrderDetails: (current as Row).shipmentOrderDetails,
    planShipmentTime: text(current.planShipmentTime),
    remark: current.remark,
  }
  const result = await ruoyiSend('PUT', '/wms/shipmentOrder/shipment', payload)
  if (result.ok) {
    clearDirectory('inventories')
    clearDirectory('inventoryDetails')
  }
  return result.ok ? ok(true, '出库已完成') : fail(brief(result.message))
}

/** 审核出库（后端无独立审核接口）。 */
async function approveShipment(_id: string) {
  return fail('后端出库单无单独审核，未出库请直接出库完成')
}

/** 出库单路由表 */
export const outboundRoutes: Route[] = [
  { method: 'GET', match: '/outbound', handle: ({ query }) => listShipments(query) },
  { method: 'POST', match: '/outbound', handle: ({ body }) => createShipment(body) },
  { method: 'POST', match: /^\/outbound\/([^/]+)\/approve$/, handle: ({ params }) => approveShipment(params[0]) },
  { method: 'POST', match: /^\/outbound\/([^/]+)\/complete$/, handle: ({ params }) => completeShipment(params[0]) },
  { method: 'GET', match: /^\/outbound\/([^/]+)$/, handle: ({ params }) => getShipment(params[0]) },
  { method: 'PUT', match: /^\/outbound\/([^/]+)$/, handle: ({ params, body }) => updateShipment(params[0], body) },
]
