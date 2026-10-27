import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { areaPoints, brief, clockBound, idOf, nested, num, stamp, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { dictOf, labelOf } from '@/controller/shared/dict'
import { areaCodeValue, areaNameValue, areaRows, findArea, findMerchant, merchantRows } from '@/controller/shared/catalog'
import type { ProductionOrderBo, ProductionOrderVo } from '@/typings/openapi'

/** 生产单 Vo + 运行时扩展 */
type ProductionRow = ProductionOrderVo & Row

/** 从明细嵌套出库单取报关单号。 */
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

function feedEntry(
  detail: Row,
  order: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
  merchants: Map<string, string>,
  feedDry: number,
) {
  const receipt = nested(detail, 'receiptOrder')
  const inventory = nested(detail, 'inventory')
  const item = nested(detail, 'item')
  const area = nested(detail, 'area') || (inventory ? nested(inventory, 'area') : undefined)
  const ship = text(receipt?.shipName)
  const voyage = text(receipt?.voyage || receipt?.voyageNo)
  return {
    inventoryId: text(detail.inventoryId || inventory?.id),
    customsNo: text(receipt?.recordNo || detail.recordNo || detail.batchNo || inventory?.batchNo),
    consignor: lineConsignor(detail, order, merchants),
    cargoType: labelOf(categories, item?.itemCategory ?? detail.itemCategory ?? inventory?.itemCategory),
    material: text(item?.itemName || detail.itemName || detail.materialName || inventory?.itemName),
    voyage: [ship, voyage].filter(Boolean).join(' / '),
    blNo: text(receipt?.waybillNo),
    originCountry: text(receipt?.originCountry || receipt?.country || detail.originCountry),
    wet: num(detail.wetWeight ?? receipt?.wetWeight) ?? 0,
    dry: feedDry,
    feedDry,
    stack: text(area?.areaCode || area?.areaName || detail.areaCode),
    areaLabel: labelOf(areaNames, area?.areaIdentification),
    outCustomsNo: shipmentNo(detail),
  }
}

/** 投入原料取 productionOrderItems；明细 dryWeight 为投入重量。 */
function productionLines(
  row: Row,
  categories: { label: string; value: string }[],
  areaNames: { label: string; value: string }[],
  merchants: Map<string, string>,
) {
  const details = Array.isArray(row.productionOrderDetails) ? row.productionOrderDetails as Row[] : []
  const items = Array.isArray(row.productionOrderItems) ? row.productionOrderItems as Row[] : []
  const feedItems = items.filter((entry) => (
    text(entry.inventoryId)
    || nested(entry, 'inventory')
    || nested(entry, 'receiptOrder')
    || nested(entry, 'item')
    || text(entry.materialName || entry.itemName || entry.recordNo)
  ))
  const source = feedItems.length ? feedItems : details
  return source.map((entry, index) => {
    const matched = details.find((detail) => {
      const a = text(detail.inventoryId)
      const b = text(entry.inventoryId || nested(entry, 'inventory')?.id)
      return a && b && a === b
    }) || details[index]
    const feedDry = num(matched?.dryWeight ?? entry.dryWeight ?? entry.weight) ?? 0
    return feedEntry(entry, row, categories, areaNames, merchants, feedDry)
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
  const inputDry = num(row.dryWeight)
  const finished = asFinish || num(row.productionOrderStatus) === 1 || (text(row.targetAreaId) !== '' && weighed != null && weighed > 0)
  const docType = finished ? '完工入库' : kind === 1 ? '加工过程' : '投料出库'
  const customs = [...new Set(lines.map((line) => line.customsNo).filter(Boolean))]
  const stacks = [...new Set(lines.map((line) => line.stack).filter(Boolean))]
  const outNos = [...new Set(lines.map((line) => line.outCustomsNo).filter(Boolean))]
  const targetAreas = Array.isArray(row.productionOrderAreas) ? row.productionOrderAreas as Row[] : []
  const targetStackCodes = targetAreas.map((entry) => {
    const target = nested(entry, 'area')
    return text(target?.areaCode || target?.areaName || entry.areaCode || entry.areaName || entry.stackCode)
  }).filter(Boolean)
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
    inputDry: inputDry ?? lines.reduce((sum, line) => sum + (num(line.feedDry) ?? 0), 0),
    outputDry: weighed ?? '',
    product: text(item?.itemName),
    stackCode: [...new Set(targetStackCodes)].join(' / ') || text(area?.areaCode || area?.areaName || nested(row, 'targetArea')?.areaCode || nested(row, 'targetArea')?.areaName),
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
  const batch = text(query.batchNo).trim() || text(query.keyword).trim()
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
  const result = await ruoyiGet<ProductionOrderVo>('/wms/productionOrder/list', pageParams(query, { ...filters }))
  if (!result.ok) return fail(brief(result.message))
  const list = result.rows.map((row) => productionDoc(row as Row, categories, areaNames, merchants, kind === 2))
  return pageOf(result, list, query)
}

async function productionDetail(id: string) {
  if (!id) return fail('缺少生产单号')
  const [{ categories, areaNames }, merchants] = await Promise.all([productionDicts(), merchantNameMap()])
  const [result, areas] = await Promise.all([
    ruoyiGet<ProductionOrderVo, ProductionOrderVo>(`/wms/productionOrder/${encodeURIComponent(id)}`),
    areaRows(),
  ])
  if (!result.ok) return fail(brief(result.message))
  const row = result.data && typeof result.data === 'object' ? result.data as ProductionRow : result.rows[0] as ProductionRow | undefined
  if (!row) return fail('生产单不存在')
  const areaId = text(row.targetAreaId)
  if (!nested(row, 'area') && areaId) {
    const area = areas.find((item) => text(item.id) === areaId)
    if (area) row.area = area
  }
  if (Array.isArray(row.productionOrderAreas)) {
    row.productionOrderAreas = row.productionOrderAreas.map((entry) => {
      if (nested(entry, 'area')) return entry
      const area = areas.find((item) => text(item.id) === text(entry.areaId))
      return area ? { ...entry, area } : entry
    })
  }
  const doc = productionDoc(row as Row, categories, areaNames, merchants, num(row.productionOrderStatus) === 1)
  return ok({ list: [doc], prodBatch: text(row.batchNo) })
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
  const existing = await ruoyiGet<ProductionOrderVo>('/wms/productionOrder/listNoPage', { batchNo })
  if (!existing.ok) return brief(existing.message)
  const rows = existing.rows.filter((row) => text(row.batchNo) === batchNo)
  const known = new Set<string>()
  for (const row of rows) {
    const id = text(row.consignorId || nested(row, 'consignor')?.id)
    const name = text(nested(row, 'consignor')?.merchantName || (row as Row).consignorName)
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
  const payload: Row = { batchNo, consignorId: ids[0], productionOrderDetails: details }
  const result = await ruoyiSend('POST', '/wms/productionOrder', payload)
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
  const picks = Array.isArray(body.productionOrderAreas) ? body.productionOrderAreas as Row[] : []
  if (!picks.length) return fail('请选择一个或多个待检区堆位')
  const [detail, areaNames, stacks] = await Promise.all([
    ruoyiGet<ProductionOrderVo, ProductionOrderVo>(`/wms/productionOrder/${encodeURIComponent(id)}`),
    dictOf('wms_area_identification'),
    areaRows(),
  ])

  const order = (detail.ok && detail.data && typeof detail.data === 'object' ? detail.data as Row : null)
    || (detail.ok ? detail.rows[0] : undefined)

  const batchNo = text(body.prodBatch || body.batchNo || order?.batchNo).trim()
  if (!batchNo) return fail('缺少生产批次')

  const productionOrderAreas: Row[] = []
  let allocatedWeight = 0
  for (const pick of picks) {
    const stackCode = text(pick.stackCode)
    const area = stacks.find((row) => (
      (text(pick.areaId) && text(row.id) === text(pick.areaId))
      || (stackCode && (areaCodeValue(row) === stackCode || areaNameValue(row) === stackCode))
    )) || await findArea(pick.areaId || stackCode)
    if (!area) return fail(`待检区堆位 ${stackCode || text(pick.areaId)} 不存在`)

    const areaLabel = labelOf(areaNames, area.areaIdentification) || text(area.areaIdentification)
    if (areaLabel && areaLabel !== '待检区' && !areaLabel.includes('待检')) {
      return fail(`堆位 ${stackCode || areaCodeValue(area)} 不属于待检区`)
    }
    const warehouseId = idOf(pick.warehouseId)
      ?? idOf(area.warehouseId)
      ?? idOf(nested(area, 'warehouse')?.id)
    if (warehouseId == null) {
      return fail(`堆位 ${stackCode || areaCodeValue(area)} 缺少所属仓库`)
    }
    const dryWeight = num(pick.dryWeight)
    if (dryWeight == null || dryWeight <= 0) {
      return fail(`请填写堆位 ${stackCode || areaCodeValue(area)} 的入库干吨`)
    }
    const cells = areaPoints(pick.areas ?? pick.cells)
    if (!cells.length) {
      return fail(`请为堆位 ${stackCode || areaCodeValue(area)} 框选存放格子`)
    }
    allocatedWeight += dryWeight
    productionOrderAreas.push({
      areaId: idOf(area.id),
      warehouseId,
      dryWeight,
      areas: cells,
    })
  }
  if (Math.abs(allocatedWeight - weight) >= 0.011) {
    return fail(`各堆位干吨合计需等于产量 ${weight} 吨`)
  }

  // 同一待检区允许不同生产批次并存，不校验堆位上是否已有其它批次
  const payload: Row = {
    id: idOf(id),
    batchNo,
    type: 2,
    productionWeight: weight,
    productionOrderAreas,
  }

  const consignorId = idOf(body.consignorId || order?.consignorId)
  if (consignorId != null) payload.consignorId = consignorId
  const processName = text(body.process || body.processName || order?.processName).trim()
  if (processName) payload.processName = processName
  const productionType = num(body.productionType ?? order?.productionType)
  if (productionType != null) payload.productionType = productionType
  const itemId = idOf(body.itemId || order?.itemId)
  if (itemId != null) payload.itemId = itemId
  if (order?.startTime) payload.startTime = order.startTime
  if (order?.endTime) payload.endTime = order.endTime
  if (order?.workOrderNo) payload.workOrderNo = order.workOrderNo
  if (order?.productionOrderNo) payload.productionOrderNo = order.productionOrderNo

  const rawDetails = Array.isArray(body.productionOrderDetails)
    ? body.productionOrderDetails as Row[]
    : Array.isArray(order?.productionOrderDetails)
      ? order.productionOrderDetails as Row[]
      : []
  const details = rawDetails.map((line) => ({
    inventoryId: idOf(line.inventoryId),
    dryWeight: num(line.dryWeight ?? line.feedDry),
    wetWeight: num(line.wetWeight ?? line.wet),
  })).filter((item) => item.inventoryId != null)
  if (details.length) payload.productionOrderDetails = details

  const result = await ruoyiSend('PUT', '/wms/productionOrder', payload)
  return result.ok ? ok(true, '已完工入库') : fail(brief(result.message))
}

export const productionRoutes: Route[] = [
  { method: 'GET', match: '/production', handle: ({ query }) => listProduction(query) },
  { method: 'POST', match: '/production', handle: ({ body }) => createProductionFeed(body) },
  { method: 'POST', match: /^\/production\/([^/]+)\/process$/, handle: ({ params, body }) => pushProduction(params[0], body) },
  { method: 'POST', match: /^\/production\/([^/]+)\/finish$/, handle: ({ params, body }) => finishProduction(params[0], body) },
  { method: 'GET', match: /^\/production\/([^/]+)$/, handle: ({ params }) => productionDetail(params[0]) },
]
