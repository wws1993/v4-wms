import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, idOf, nested, num, stamp, text } from '@/controller/shared/coerce'
import { pageParams, range } from '@/controller/shared/page'
import { codeFromDict, codeOf, dictOf, labelOf, merchantTypes } from '@/controller/shared/dict'
import {
  clearMerchantCache, findArea, findMerchant, merchantRows,
} from '@/controller/shared/catalog'
import { locateInventory } from '@/controller/inventory'
import type { MerchantBo, MerchantVo, ShipmentOrderBo, ShipmentOrderVo } from '@/typings/openapi'

/** 出库单 Vo + 运行时扩展字段 */
type ShipmentRow = ShipmentOrderVo & Row

/** 生成出库单号。 */
function shipmentOrderNo(seq = 0) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return seq > 0 ? `CK${stamp}${String(seq).padStart(3, '0')}` : `CK${stamp}`
}

/** 将核注/消费等元数据打包进备注。 */
function packShipmentRemark(body: Row) {
  const meta: string[] = []
  if (text(body.checklistNo)) meta.push(`核注=${text(body.checklistNo)}`)
  if (text(body.consumer)) meta.push(`消费=${text(body.consumer)}`)
  if (text(body.consignor)) meta.push(`委托=${text(body.consignor)}`)
  if (text(body.currency)) meta.push(`币制=${text(body.currency)}`)
  if (text(body.batchNo)) meta.push(`批次=${text(body.batchNo)}`)
  const note = text(body.remark).trim()
  const head = meta.length ? `[${meta.join(';')}]` : ''
  return [head, note].filter(Boolean).join(' ')
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

/** 确保流向企业存在，不存在则自动建档。 */
async function ensureFlowMerchant(name: unknown) {
  const raw = text(name).trim()
  if (!raw) return undefined
  const found = await findMerchant(raw)
  if (found) return found
  const types = await merchantTypes()
  const merchantType = codeOf(types, '流向企业')
  if (merchantType == null) return undefined
  const payload: Partial<MerchantBo> = {
    merchantCode: `FL${Date.now()}`,
    merchantName: raw,
    merchantType: Number(merchantType),
    mobile: '',
    status: '0',
    source: 2,
  }
  const result = await ruoyiSend('POST', '/wms/merchant', payload)
  if (!result.ok) return undefined
  clearMerchantCache()
  return findMerchant(raw)
}

/** 将出库单 Vo 映射为前端展示行。 */
function shipmentView(
  row: ShipmentRow | Row,
  statuses: { label: string; value: string }[],
  types: { label: string; value: string }[],
  merchants: MerchantVo[],
): Row {
  const merchant = nested(row, 'merchant') || nested(row, 'consignee')
  const merchantId = text(row.merchantId || merchant?.id)
  const merchantName = text(
    merchant?.merchantName
    || merchants.find((item) => text(item.id) === merchantId)?.merchantName
    || row.merchantName,
  )
  const meta = parseShipmentRemark(row.remark)
  const customsNo = text(row.recordNo || row.customsNo)
  return {
    id: text(row.id),
    orderNo: text(row.shipmentOrderNo || row.id),
    customsNo,
    checklistNo: text(meta.checklistNo || row.verificationCode || row.checklistNo),
    consignee: merchantName,
    consumer: text(meta.consumer),
    consignor: text(meta.consignor),
    currency: text(meta.currency || row.currency || 'USD'),
    batchNo: text(meta.batchNo || row.batchNo),
    wet: row.totalQuantity ?? row.quantity ?? '',
    amount: row.receivableAmount ?? row.amount ?? '',
    remark: text(meta.remark),
    time: stamp(row.createTime || row.updateTime, 16),
    finishedAt: Number(row.shipmentOrderStatus) === 1 ? stamp(row.updateTime, 16) : '',
    status: labelOf(statuses, row.shipmentOrderStatus) || text(row.shipmentOrderStatus),
    shipmentType: labelOf(types, row.shipmentOrderType) || text(row.shipmentOrderType),
    warehouseId: text(row.warehouseId),
    areaId: text(row.areaId),
  }
}

/** 分页查询出库单。 */
async function listShipments(query: Query) {
  const [statuses, types, merchants] = await Promise.all([
    dictOf('wms_shipment_status'),
    dictOf('wms_shipment_type'),
    merchantRows(),
  ])
  const merchant = query.consignee || query.consignor
    ? await findMerchant(query.consignee || query.consignor)
    : undefined
  const statusCode = query.status ? await codeFromDict('wms_shipment_status', query.status) : undefined
  const typeCode = query.shipmentType ? await codeFromDict('wms_shipment_type', query.shipmentType) : undefined
  const hasRange = Boolean(query.from || query.to)
  const word = text(query.keyword).trim()
  const ask = (withRange: boolean) => ruoyiGet<ShipmentOrderVo>('/wms/shipmentOrder/list', pageParams(query, {
    shipmentOrderStatus: statusCode,
    shipmentOrderType: typeCode,
    merchantId: merchant ? idOf(merchant.id) : undefined,
    orderNo: word || undefined,
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

/** 根据库存 id / 批次定位出库票货。 */
async function pickedLot(body: Row) {
  const inventoryId = text(body.inventoryId).trim()
  const batchNo = text(body.batchNo).trim()
  const stock = inventoryId
    ? await locateInventory(inventoryId) || (batchNo ? await locateInventory(batchNo) : undefined)
    : (batchNo ? await locateInventory(batchNo) : undefined)
  if (!stock) return { ok: false as const, message: '请选择在库票货' }
  const area = nested(stock, 'area') || (await findArea(stock.areaId || stock.areaCode))
  return { ok: true as const, stock, area }
}

/** 创建出库单。 */
async function createShipment(body: Row) {
  const consigneeName = text(body.consignee).trim()
  if (!consigneeName) return fail('请填写流向企业')
  const customsNo = text(body.customsNo).trim()
  if (!customsNo) return fail('请填写出库报关单号')
  const wet = num(body.wet)
  if (wet == null || wet <= 0) return fail('请填写出库重量')
  const amount = num(body.amount)
  if (amount == null) return fail('请填写报关单金额')
  const picked = await pickedLot(body)
  if (!picked.ok) return fail(picked.message)
  const merchant = await ensureFlowMerchant(consigneeName)
  if (!merchant) return fail('流向企业建档失败，请先在往来单位维护')
  const typeCode = await codeFromDict('wms_shipment_type', body.shipmentType || '销售出库')
  if (typeCode == null) return fail('出库类型需与后端字典编码一致')
  const stock = picked.stock
  const area = picked.area || (body.areaId || body.stackCode ? await findArea(body.areaId || body.stackCode) : undefined)
  const orderNo = text(body.orderNo).trim() || shipmentOrderNo()
  const payload: Partial<ShipmentOrderBo> & Row = {
    shipmentOrderNo: orderNo,
    shipmentOrderType: typeCode,
    orderNo: customsNo,
    merchantId: idOf(merchant.id),
    receivableAmount: amount,
    totalQuantity: wet,
    remark: packShipmentRemark(body),
  }
  const orcId = idOf(body.orcId)
  if (orcId != null) payload.orcId = orcId
  const warehouseId = idOf(stock?.warehouseId || body.warehouseId || area?.warehouseId)
  const areaId = idOf(stock?.areaId || body.areaId || area?.id)
  if (warehouseId != null) payload.warehouseId = warehouseId
  if (areaId != null) payload.areaId = areaId
  const result = await ruoyiSend('POST', '/wms/shipmentOrder', payload)
  return result.ok ? ok(result.data, '出库单已创建') : fail(brief(result.message))
}

/** 更新出库单。 */
async function updateShipment(id: string, body: Row) {
  const detail = await ruoyiGet<ShipmentOrderVo, ShipmentOrderVo>(`/wms/shipmentOrder/${encodeURIComponent(id)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(brief(detail.message) || '出库单不存在')
  const current = detail.data as ShipmentRow
  const consigneeName = text(body.consignee).trim()
  const merchant = consigneeName
    ? await ensureFlowMerchant(consigneeName)
    : undefined
  const typeCode = body.shipmentType
    ? await codeFromDict('wms_shipment_type', body.shipmentType)
    : num(current.shipmentOrderType)
  const payload: Partial<ShipmentOrderBo> & Row = {
    id: idOf(id) as ShipmentOrderBo['id'],
    shipmentOrderNo: text(body.orderNo || current.shipmentOrderNo),
    shipmentOrderType: typeCode,
    orderNo: text(body.customsNo || current.orderNo),
    merchantId: merchant ? idOf(merchant.id) : idOf(current.merchantId),
    receivableAmount: num(body.amount) ?? current.receivableAmount,
    totalQuantity: num(body.wet) ?? current.totalQuantity,
    remark: body.checklistNo != null || body.consumer != null || body.consignor != null || body.remark != null
      ? packShipmentRemark({ ...parseShipmentRemark(current.remark), ...body })
      : current.remark,
    warehouseId: idOf(body.warehouseId || current.warehouseId),
    areaId: idOf(body.areaId || current.areaId),
  }
  const result = await ruoyiSend('PUT', '/wms/shipmentOrder', payload)
  return result.ok ? ok(true, '出库单已更新') : fail(brief(result.message))
}

/** 完成出库。 */
async function completeShipment(id: string) {
  const detail = await ruoyiGet<ShipmentOrderVo, ShipmentOrderVo>(`/wms/shipmentOrder/${encodeURIComponent(id)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(brief(detail.message) || '出库单不存在')
  const current = detail.data as ShipmentRow
  const payload: Partial<ShipmentOrderBo> & Row = {
    id: idOf(id) as ShipmentOrderBo['id'],
    shipmentOrderNo: text(current.shipmentOrderNo),
    shipmentOrderType: num(current.shipmentOrderType),
    orderNo: text(current.orderNo),
    merchantId: idOf(current.merchantId),
    receivableAmount: current.receivableAmount,
    totalQuantity: current.totalQuantity,
    remark: current.remark,
    warehouseId: idOf(current.warehouseId),
    areaId: idOf(current.areaId),
  }
  const result = await ruoyiSend('PUT', '/wms/shipmentOrder/shipment', payload)
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
