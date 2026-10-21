import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, clockBound, idOf, nested, num, stamp, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { dictOf, labelOf } from '@/controller/shared/dict'
import { areaCodeValue, areaNameValue, areaRows, findMerchant, merchantRows } from '@/controller/shared/catalog'

function shipmentNo(detail: Row) {
  const shipment = nested(detail, 'shipmentOrder')
  if (!shipment) return ''
  return text(shipment.recordNo || shipment.customsNo || shipment.orderNo || shipment.shipmentOrderNo)
}

function merchantLabel(row: Row | undefined) {
  if (!row) return ''
  const linked = nested(row, 'consignor')
  return text(linked?.merchantName || row.merchantName || row.consignorName)
}

async function merchantNameMap() {
  const list = await merchantRows()
  const map = new Map<string, string>()
  if (!list.ok) return map
  for (const row of list.rows) {
    const id = text(row.id)
    const name = text(row.merchantName)
    if (id && name) map.set(id, name)
  }
  return map
}

function namedMerchant(id: unknown, names: Map<string, string>) {
  return names.get(text(id)) || ''
}

function lineConsignor(detail: Row, order: Row, names: Map<string, string>) {
  const inventory = nested(detail, 'inventory')
  const receipt = nested(detail, 'receiptOrder')
  return merchantLabel(order)
    || merchantLabel(detail)
    || merchantLabel(inventory)
    || merchantLabel(receipt)
    || namedMerchant(detail.consignorId, names)
    || namedMerchant(inventory?.consignorId, names)
    || namedMerchant(receipt?.consignorId, names)
    || namedMerchant(order.consignorId, names)
}

function productionLines(
  row: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
  merchants: Map<string, string>,
) {
  const details = Array.isArray(row.productionOrderDetails) ? row.productionOrderDetails as Row[] : []
  return details.filter((detail) => num(detail.direction) !== 1).map((detail) => {
    const receipt = nested(detail, 'receiptOrder')
    const item = nested(detail, 'item')
    const area = nested(detail, 'area')
    const ship = text(receipt?.shipName)
    const voyage = text(receipt?.voyage || receipt?.voyageNo)
    return {
      inventoryId: text(detail.inventoryId),
      customsNo: text(receipt?.recordNo || detail.batchNo),
      consignor: lineConsignor(detail, row, merchants),
      cargoType: labelOf(categories, item?.itemCategory ?? detail.itemCategory),
      material: text(item?.itemName || detail.itemName),
      voyage: [ship, voyage].filter(Boolean).join(' / '),
      blNo: text(receipt?.waybillNo),
      originCountry: text(receipt?.originCountry || receipt?.country),
      wet: num(detail.wetWeight ?? receipt?.wetWeight) ?? 0,
      dry: num(receipt?.dryWeight ?? detail.dryWeight) ?? 0,
      feedDry: num(detail.dryWeight) ?? 0,
      stack: text(area?.areaCode || area?.areaName),
      areaLabel: labelOf(areaNames, area?.areaIdentification),
      outCustomsNo: shipmentNo(detail),
    }
  })
}

function productionDoc(
  row: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
  merchants: Map<string, string>,
  asFinish: boolean,
) {
  const lines = productionLines(row, categories, areaNames, merchants)
  const consignorNames = [...new Set(lines.map((line) => line.consignor).filter(Boolean))]
  const area = nested(row, 'area')
  const item = nested(row, 'item')
  const kind = num(row.productionType)
  const weighed = num(row.productionWeight)
  const finished = asFinish || num(row.productionOrderStatus) === 1 || (text(row.targetAreaId) !== '' && weighed != null && weighed > 0)
  const docType = finished ? '完工入库' : kind === 1 ? '加工过程' : '投料出库'
  const customs = [...new Set(lines.map((line) => line.customsNo).filter(Boolean))]
  const stacks = [...new Set(lines.map((line) => line.stack).filter(Boolean))]
  const outNos = [...new Set(lines.map((line) => line.outCustomsNo).filter(Boolean))]
  return {
    id: text(row.id),
    orderNo: text(row.productionOrderNo || row.workOrderNo || row.id),
    docType,
    finished,
    stage: finished ? '完工' : kind === 1 ? '加工' : '投料',
    consignor: consignorNames.join('、') || merchantLabel(row) || namedMerchant(row.consignorId, merchants),
    consignorId: text(row.consignorId || nested(row, 'consignor')?.id),
    prodBatch: text(row.batchNo),
    workOrder: text(row.workOrderNo),
    process: text(row.processName),
    time: stamp(row.startTime || row.createTime, 16),
    timeTo: stamp(row.endTime, 16),
    remark: text(row.remark),
    feedLines: lines,
    customsNos: customs.join('、'),
    outCustomsNo: outNos.join('、'),
    sourceStacks: stacks.join(' / '),
    outputDry: row.productionWeight ?? '',
    product: text(item?.itemName),
    stackCode: text(area?.areaCode || area?.areaName),
    areaLabel: labelOf(areaNames, area?.areaIdentification),
    warehouseId: text(row.targetWarehouseId || area?.warehouseId),
    areaId: text(row.targetAreaId || area?.id),
  }
}

async function productionDicts() {
  const [categories, areaNames] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_area_identification'),
  ])
  return { categories, areaNames }
}

function productionFilters(query: Query, consignorId: unknown) {
  const filters: Query = {}
  if (consignorId != null) filters.consignorId = consignorId
  const batch = text(query.batchNo).trim()
  if (batch) filters.batchNo = batch
  if (query.from) filters.startTime = clockBound(query.from, false)
  if (query.to) filters.endTime = clockBound(query.to, true)
  return filters
}

function productionKind(query: Query) {
  const asked = text(query.type || query.docType)
  if (asked === '2' || asked === '完工入库') return 2
  return 1
}

async function listProduction(query: Query) {
  const [{ categories, areaNames }, merchants] = await Promise.all([productionDicts(), merchantNameMap()])
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters = productionFilters(query, consignor ? idOf(consignor.id) : undefined)
  const kind = productionKind(query)
  const result = await ruoyiGet('/wms/productionOrder/list', pageParams(query, { ...filters, type: kind }))
  if (!result.ok) return fail(brief(result.message))
  const word = text(query.keyword).trim()
  const list = result.rows.map((row) => productionDoc(row, categories, areaNames, merchants, kind === 2)).filter((row) => {
    if (!word) return true
    const lines = Array.isArray(row.feedLines) ? row.feedLines as Row[] : []
    return `${row.id}${row.orderNo}${row.prodBatch}${row.customsNos}${row.outCustomsNo}${lines.map((line) => line.customsNo).join('')}`.includes(word)
  })
  if (word) return ok({ list, total: list.length, page: 1, pageSize: list.length || Number(query.pageSize || 10) })
  return pageOf(result, list, query)
}

async function productionBatch(batchNo: string) {
  const [{ categories, areaNames }, merchants] = await Promise.all([productionDicts(), merchantNameMap()])
  const result = await ruoyiGet('/wms/productionOrder/listNoPage', { batchNo })
  if (!result.ok) return fail(result.message)
  const list = result.rows.map((row) => productionDoc(row, categories, areaNames, merchants, num(row.productionOrderStatus) === 1))
  return ok({ list, prodBatch: batchNo })
}

async function joinedConsignorId(lines: Row[], fallback: unknown) {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown) => {
    const raw = text(value).trim()
    if (!raw || seen.has(raw)) return
    seen.add(raw)
    ids.push(raw)
  }
  for (const line of lines) {
    if (text(line.consignorId)) push(line.consignorId)
    else if (text(line.consignor)) {
      const merchant = await findMerchant(line.consignor)
      if (merchant) push(merchant.id)
    }
  }
  if (!ids.length) text(fallback).split(/[,、]/).forEach(push)
  return ids.join(',')
}

const CONSIGNOR_MARKS = ['五矿', '金川', '南国']

function consignorToken(id: string, name: string) {
  const mark = CONSIGNOR_MARKS.find((item) => name.includes(item))
  return mark || id || name
}

async function batchConsignorClash(batchNo: string, consignorId: string, lines: Row[]) {
  const existing = await ruoyiGet('/wms/productionOrder/listNoPage', { batchNo })
  if (!existing.ok) return brief(existing.message)
  const rows = existing.rows.filter((row) => text(row.batchNo) === batchNo)
  const known = new Set<string>()
  for (const row of rows) {
    const id = text(row.consignorId || nested(row, 'consignor')?.id)
    const name = text(nested(row, 'consignor')?.merchantName || row.consignorName)
    const token = consignorToken(id, name)
    if (token) known.add(token)
  }
  const incoming = new Set(lines.map((line) => consignorToken(text(line.consignorId), text(line.consignor))).filter(Boolean))
  if (consignorId && !incoming.size) incoming.add(consignorId)
  const tokens = new Set([...known, ...incoming])
  if (tokens.size > 1) return '同一生产批次不能添加不同委托方的原料'
  return ''
}

async function createProductionFeed(body: Row) {
  const batchNo = text(body.prodBatch || body.batchNo).trim()
  const lines = Array.isArray(body.feedLines) ? body.feedLines as Row[] : []
  if (!batchNo) return fail('请填写生产批次')
  const details = lines.map((line) => ({
    inventoryId: idOf(line.inventoryId),
    dryWeight: num(line.feedDry),
  })).filter((item) => item.inventoryId != null && item.dryWeight != null)
  if (!details.length) return fail('请勾选报关单')
  const consignorId = await joinedConsignorId(lines, body.consignorId)
  if (!consignorId) return fail('请选择委托方')
  const ids = consignorId.split(',').filter(Boolean)
  const tokens = new Set(lines.map((line) => consignorToken(text(line.consignorId), text(line.consignor))).filter(Boolean))
  if (!tokens.size) ids.forEach((id) => tokens.add(id))
  if (tokens.size > 1) return fail('同一生产批次不能添加不同委托方的原料')
  const clash = await batchConsignorClash(batchNo, ids[0], lines)
  if (clash) return fail(clash)
  const result = await ruoyiSend('POST', '/wms/productionOrder', { batchNo, consignorId: ids[0], productionOrderDetails: details })
  return result.ok ? ok(result.data, '投料已登记') : fail(brief(result.message))
}

async function pushProduction(id: string, body: Row) {
  const processName = text(body.process || body.processName).trim()
  if (!id) return fail('请选择投料单')
  if (!processName) return fail('请填写工序')
  const payload: Row = { id: idOf(id), processName }
  const startTime = body.time || body.startTime ? clockBound(body.time || body.startTime, false) : ''
  const endTime = body.timeTo || body.endTime ? clockBound(body.timeTo || body.endTime, true) : ''
  if (startTime) payload.startTime = startTime
  if (endTime) payload.endTime = endTime
  const remark = text(body.remark).trim()
  if (remark) payload.remark = remark
  const result = await ruoyiSend('POST', '/wms/productionOrder/push', payload)
  return result.ok ? ok(result.data, '加工已登记') : fail(brief(result.message))
}

async function finishProduction(id: string, body: Row) {
  const weight = num(body.outputDry ?? body.productionWeight)
  if (!(weight != null && weight > 0)) return fail('请填写产量')
  if (!id) return fail('请选择生产单')
  let areaId = text(body.areaId)
  let warehouseId = text(body.warehouseId)
  if (!areaId || !warehouseId) {
    const areas = await areaRows()
    const code = text(body.stackCode)
    const area = areas.find((row) => text(row.id) === areaId || areaCodeValue(row) === code || areaNameValue(row) === code)
    if (area) {
      areaId = areaId || text(area.id)
      warehouseId = warehouseId || text(area.warehouseId || nested(area, 'warehouse')?.id)
    }
  }
  if (!areaId) return fail('请选择待检区堆位')
  const payload: Row = {
    id: idOf(id),
    productionWeight: weight,
    targetAreaId: idOf(areaId),
  }
  if (warehouseId) payload.targetWarehouseId = idOf(warehouseId)
  const result = await ruoyiSend('PUT', '/wms/productionOrder', payload)
  return result.ok ? ok(true, '已完工入库') : fail(brief(result.message))
}

export const productionRoutes: Route[] = [
  { method: 'GET', match: '/production', handle: ({ query }) => listProduction(query) },
  { method: 'POST', match: '/production', handle: ({ body }) => createProductionFeed(body) },
  { method: 'POST', match: /^\/production\/([^/]+)\/process$/, handle: ({ params, body }) => pushProduction(params[0], body) },
  { method: 'POST', match: /^\/production\/([^/]+)\/finish$/, handle: ({ params, body }) => finishProduction(params[0], body) },
  { method: 'GET', match: /^\/production\/([^/]+)$/, handle: ({ params }) => productionBatch(params[0]) },
]
