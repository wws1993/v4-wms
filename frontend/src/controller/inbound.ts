import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import {
  arrivalOf, cellsBody, cellsText, elementFields,
  idOf, nested, num, text,
} from '@/controller/shared/coerce'
import { pageParams, range } from '@/controller/shared/page'
import { codeFromDict, currencyMark, currencyValue, dictOf, labelOf } from '@/controller/shared/dict'
import {
  areaCodeValue, areaNameValue, areaRows, findArea, findBook, findItem, findMerchant, itemCatalog,
} from '@/controller/shared/catalog'
import type {
  ItemVo,
  ReceiptOrderAreaBo,
  ReceiptOrderAreaVo,
  ReceiptOrderBo,
  ReceiptOrderVo,
} from '@/typings/openapi'

/** 入库单 Vo + 运行时偶发扩展字段 */
type ReceiptRow = ReceiptOrderVo & Row & {
  area?: Row
  shippingMethodId?: unknown
  waybillWeight?: unknown
  blWeight?: unknown
  filingNo?: unknown
  orcLogId?: unknown
  remark?: string
  areaId?: unknown
  areaCode?: unknown
}

/** 解析入库单上的物料展示名。 */
function materialName(row: ReceiptRow | Row, items: ItemVo[] | Row[]) {
  const bag = row as Row
  const embedded = bag.item as Row | undefined
  const named = text(embedded?.itemName || bag.itemName)
  if (named) return named
  const id = text(bag.itemId || embedded?.id)
  const hit = items.find((item) => text(item.id) === id)
  return text(hit?.itemName)
}

/** 从入库单或嵌套矿源备案取备案号。 */
function filingNoOf(row?: ReceiptRow | Row | null) {
  if (!row) return ''
  const bag = row as Row
  const direct = text(bag.filingNo).trim()
  if (direct) return direct
  const filings = bag.mineralSourceFiling
  if (Array.isArray(filings) && filings[0]) return text((filings[0] as Row).recordNumber)
  if (filings && typeof filings === 'object') return text((filings as Row).recordNumber)
  return ''
}

/** 将货运方式编码转为字典标签。 */
function shipModeOf(row: ReceiptRow | Row, translates: { label: string; value: string }[]) {
  const bag = row as Row
  const method = nested(bag, 'shippingMethod')
  const code = text(method?.id ?? (typeof bag.shippingMethod === 'object' ? bag.shippingMethodId : bag.shippingMethod))
  return labelOf(translates, code)
}

/** 吨数展示文案（最多三位小数）。 */
function tonLabel(value: unknown) {
  const parsed = num(value)
  if (parsed == null) return ''
  const rounded = Math.round(parsed * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/** 从入库堆位明细行提取堆位选择。 */
function stackPickFromArea(row: ReceiptOrderAreaVo | Row) {
  const area = nested(row, 'area')
  const cells = cellsText({
    areas: row.areas,
    areaItems: row.areaItems ?? area?.areaItems,
    area,
  })
  return {
    stackCode: text(row.areaName || area?.areaCode || area?.areaName || row.areaCode),
    areaId: text(row.areaId || area?.id),
    warehouseId: text(row.warehouseId || area?.warehouseId),
    cells,
    wet: row.wetWeight ?? '',
    dry: row.dryWeight ?? '',
  }
}

/** 汇总入库单上的堆位选择列表。 */
function stackPicksOf(row: ReceiptRow | Row) {
  const bag = row as Row
  const list = Array.isArray(bag.receiptOrderAreas) ? bag.receiptOrderAreas as (ReceiptOrderAreaVo | Row)[] : []
  const picks = list.map(stackPickFromArea).filter((item) => item.areaId || item.stackCode)
  if (picks.length) return picks
  const area = nested(bag, 'area')
  const code = text(area?.areaCode || area?.areaName || bag.areaCode)
  const areaId = text(bag.areaId || area?.id)
  if (!code && !areaId) return []
  return [{
    stackCode: code,
    areaId,
    warehouseId: text(bag.warehouseId || area?.warehouseId),
    cells: cellsText(bag),
    wet: bag.wetWeight ?? '',
    dry: bag.dryWeight ?? '',
  }]
}

/** 列表堆位列：如 4#D1(1000吨)/4#D2(400吨)（优先干重，无干重则用湿重） */
function stackTextOf(picks: { stackCode: string; wet?: unknown; dry?: unknown }[]) {
  if (!picks.length) return ''
  return picks.map((pick) => {
    const code = text(pick.stackCode) || '—'
    const weight = tonLabel(pick.dry) || tonLabel(pick.wet)
    return weight ? `${code}(${weight}吨)` : code
  }).join('/')
}

/** 将入库单 Vo 映射为前端列表/详情行。 */
function receiptRow(row: ReceiptRow | Row, minerals: { label: string; value: string }[], statuses: { label: string; value: string }[], currencies: { label: string; value: string }[], categories: { label: string; value: string }[], translates: { label: string; value: string }[], items: ItemVo[] | Row[] = []) {
  const bag = row as ReceiptRow
  const method = nested(bag, 'shippingMethod')
  const consignor = bag.consignor as Row | undefined
  const area = bag.area as Row | undefined
  const item = bag.item as Row | undefined
  const stackPicks = stackPicksOf(bag)
  const lead = stackPicks[0]
  return {
    id: text(bag.id),
    orderNo: text(bag.receiptOrderNo),
    time: text(bag.arrivalDate || bag.createTime).replace('T', ' ').slice(0, 16),
    operateTime: text(bag.updateTime || bag.createTime).replace('T', ' ').slice(0, 19),
    customsNo: text(bag.recordNo),
    blNo: text(bag.waybillNo),
    blWeight: bag.ladingWeight ?? bag.waybillWeight ?? bag.blWeight ?? '',
    shipName: text(bag.shipName),
    oreType: labelOf(minerals, bag.mineralType) || text(bag.mineralType),
    shipMode: shipModeOf(bag, translates),
    containerCount: method?.areaNumber ?? '',
    consignor: text(consignor?.merchantName || bag.consignorId),
    material: materialName(bag, items),
    cargoType: labelOf(categories, item?.itemCategory) || text(item?.itemCategory),
    filingNo: filingNoOf(bag),
    stackCode: lead?.stackCode || text(area?.areaCode || area?.areaName),
    stackText: stackTextOf(stackPicks) || lead?.stackCode || text(area?.areaCode || area?.areaName),
    areaId: lead?.areaId || text(bag.areaId || area?.id),
    cells: lead?.cells || cellsText(bag),
    stackPicks,
    amount: bag.payableAmount,
    currency: currencyMark(currencies, bag.currency),
    checklistNo: text(bag.verificationCode),
    status: labelOf(statuses, bag.receiptOrderStatus) || text(bag.receiptOrderStatus),
    orcId: bag.orcLogId,
    wet: bag.wetWeight ?? '',
    dry: bag.dryWeight ?? '',
    moisture: bag.moistureContent ?? '',
    weightOrcId: text(bag.weightOrcId),
    elementsOrcId: text(bag.elementsOrcId),
    shippingMethodId: text(bag.shippingMethodId || method?.id || (typeof bag.shippingMethod === 'object' ? '' : bag.shippingMethod)),
    remark: text(bag.remark),
    ...elementFields(bag),
  }
}

/** 分页查询入库单。 */
async function listReceipts(query: Query) {
  const minerals = await dictOf('wms_mineral_type')
  const statuses = await dictOf('wms_receipt_status')
  const currencies = await dictOf('wms_currency_type')
  const categories = await dictOf('wms_item_category')
  const translates = await dictOf('wms_translate_type')
  const items = await itemCatalog()
  const consignor = query.consignor ? await findMerchant(query.consignor) : undefined
  const filters: Query = {
    shippingMethodId: query.shipMode ? await codeFromDict('wms_translate_type', query.shipMode) ?? undefined : undefined,
    mineralType: query.oreType ? await codeFromDict('wms_mineral_type', query.oreType) : undefined,
    receiptOrderStatus: query.status ? await codeFromDict('wms_receipt_status', query.status) : undefined,
    consignorId: consignor ? idOf(consignor.id) : undefined,
  }
  const hasRange = Boolean(query.from || query.to)
  const word = text(query.keyword).trim()
  const ask = (extra: Query, withRange: boolean) => ruoyiGet<ReceiptOrderVo>('/wms/receiptOrder/list', pageParams(query, {
    ...filters,
    ...extra,
    ...(withRange ? range(query) : {}),
  }))
  let useRange = hasRange
  let result = await ask(word ? { recordNo: word } : {}, useRange)
  let note = ''
  if (!result.ok && useRange) {
    useRange = false
    result = await ask(word ? { recordNo: word } : {}, false)
    if (result.ok) note = '入库列表暂不支持起止日期，已按其它条件查询'
  }
  if (result.ok && word && result.total === 0) result = await ask({ waybillNo: word }, useRange)
  if (!result.ok) return fail(result.message)
  return ok({
    list: result.rows.map((row) => receiptRow(row as ReceiptRow, minerals, statuses, currencies, categories, translates, items.rows)),
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, note || result.message)
}

/** 按 id 查询入库单详情。 */
async function getReceipt(id: string) {
  const [detail, minerals, statuses, currencies, categories, translates, items] = await Promise.all([
    ruoyiGet<ReceiptOrderVo, ReceiptOrderVo>(`/wms/receiptOrder/${encodeURIComponent(id)}`),
    dictOf('wms_mineral_type'),
    dictOf('wms_receipt_status'),
    dictOf('wms_currency_type'),
    dictOf('wms_item_category'),
    dictOf('wms_translate_type'),
    itemCatalog(),
  ])
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(detail.message || '入库单不存在')
  return ok(receiptRow(detail.data as ReceiptRow, minerals, statuses, currencies, categories, translates, items.rows))
}

/** 从表单提取堆位选择行。 */
async function stackPickRows(body: Row) {
  const listed = Array.isArray(body.stackPicks) ? body.stackPicks as Row[] : []
  if (listed.length) return listed.filter((row) => text(row.stackCode) || text(row.areaId))
  if (text(body.stackCode) || text(body.areaId)) {
    return [{ stackCode: body.stackCode, areaId: body.areaId, cells: body.cells }]
  }
  return []
}

/** 将表单堆位选择转为 ReceiptOrderAreaBo 列表。 */
async function receiptOrderAreasOf(body: Row) {
  const picks = await stackPickRows(body)
  if (!picks.length) return fail('请选择预定堆位')
  const known = (await areaRows()).map((row) => areaCodeValue(row) || areaNameValue(row)).filter(Boolean)
  const hint = known.length ? `，档案中有 ${known.slice(0, 8).join('、')}` : '，没有读到堆位档案'
  const areas: Partial<ReceiptOrderAreaBo>[] = []
  for (const pick of picks) {
    const area = await findArea(pick.areaId) || await findArea(pick.stackCode)
    if (!area) {
      return fail(`预定堆位 ${text(pick.stackCode) || text(pick.areaId)} 不存在${hint}`)
    }
    const warehouseId = idOf(area.warehouseId) ?? idOf(nested(area, 'warehouse')?.id)
    if (warehouseId == null) {
      return fail(`堆位 ${text(pick.stackCode) || areaCodeValue(area) || text(area.id)} 缺少所属仓库`)
    }
    const cells = cellsBody(pick.cells)
    const row: Partial<ReceiptOrderAreaBo> & { areas?: unknown } = {
      areaId: idOf(area.id) as ReceiptOrderAreaBo['areaId'],
      warehouseId: warehouseId as ReceiptOrderAreaBo['warehouseId'],
    }
    if (cells.length) row.areas = cells
    areas.push(row)
  }
  return ok(areas)
}

/** 创建入库预约。 */
async function createReceipt(body: Row) {
  const orcId = idOf(body.orcId)
  if (orcId == null) return fail('请先完成入库报关单识别，并填写 OCR 任务编号')
  const consignor = await findMerchant(body.consignor)
  const item = await findItem(body.material)
  const shippingMethodId = await codeFromDict('wms_translate_type', body.shipMode)
  const mineralType = await codeFromDict('wms_mineral_type', body.oreType || '精铜矿')
  const shipName = text(body.shipName).trim()

  if (!consignor) return fail('委托方在往来单位中不存在')
  const areaResult = await receiptOrderAreasOf(body)
  if (!areaResult.success) return fail(areaResult.message)
  if (!item) return fail('请选择物料')
  if (shippingMethodId == null) return fail('货运方式需与后端字典编码一致')
  if (mineralType == null) return fail('矿种需与后端字典编码一致')
  if (!shipName) return fail('请填写船名')
  const amount = num(body.amount)
  if (amount == null) return fail('请填写订单金额')
  const owner = body.logisticsOwner ? await findMerchant(body.logisticsOwner) : undefined
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const currencies = await dictOf('wms_currency_type')
  const blWeight = num(body.blWeight)
  const payload: Partial<ReceiptOrderBo> & { entityId?: unknown; ebookId?: unknown; shipName?: string } = {
    orcId: orcId as ReceiptOrderBo['orcId'],
    consignorId: idOf(consignor.id) as ReceiptOrderBo['consignorId'],
    waybillNo: text(body.blNo),
    verificationCode: text(body.checklistNo),
    recordNo: text(body.customsNo),
    currency: currencyValue(currencies, body.currency),
    payableAmount: amount,
    itemId: idOf(item.id) as ReceiptOrderBo['itemId'],
    mineralType: Number(mineralType) as ReceiptOrderBo['mineralType'],
    shippingMethodId: Number(shippingMethodId) as ReceiptOrderBo['shippingMethodId'],
    arrivalDate: arrivalOf(body.time),
    entityId: owner ? idOf(owner.id) : undefined,
    ebookId: book ? idOf(book.id) : undefined,
    receiptOrderAreas: areaResult.data as ReceiptOrderAreaBo[],
    shipName,
  }
  if (blWeight != null) payload.ladingWeight = blWeight
  const result = await ruoyiSend('POST', '/wms/receiptOrder', payload)
  return result.ok ? ok(result.data, '入库预约已创建') : fail(result.message)
}

/** 品质元素表单键与元素编码对照 */
const QUALITY_ELEMENTS: Array<[string, string]> = [
  ['cu', 'Cu'],
  ['ag', 'Ag'],
  ['au', 'Au'],
  ['as', 'As'],
  ['pb', 'Pb'],
  ['cd', 'Cd'],
  ['f', 'F'],
  ['hg', 'Hg'],
]

/** 从表单收集有害/品质元素列表。 */
function harmfulElements(body: Row) {
  if (Array.isArray(body.elements) && body.elements.length) {
    return (body.elements as Row[]).flatMap((item) => {
      const code = text(item.elementCode || item.elementName).trim()
      const value = num(text(item.elementValue).replace(/\s*(%|g\/t)\s*$/i, ''))
      return !code || value == null ? [] : [{ elementCode: code, elementValue: value }]
    })
  }
  return QUALITY_ELEMENTS.flatMap(([key, code]) => {
    const value = num(text(body[key]).replace(/\s*(%|g\/t)\s*$/i, ''))
    return value == null ? [] : [{ elementCode: code, elementValue: value }]
  })
}

/** 到货收货：组装带湿干重的堆位明细。 */
async function receiveAreasOf(body: Row, detail: ReceiptRow | Row) {
  const picks = Array.isArray(body.stackPicks) ? body.stackPicks as Row[] : []
  const source = picks.length ? picks : stackPicksOf(detail)
  if (!source.length) return fail('入库单缺少预定堆位，无法分配重量')
  const areas: Array<Partial<ReceiptOrderAreaBo> & { areas?: unknown; wetWeight?: number; dryWeight?: number }> = []
  for (const pick of source) {
    const area = await findArea(pick.areaId) || await findArea(pick.stackCode)
    if (!area) {
      return fail(`堆位 ${text(pick.stackCode) || text(pick.areaId)} 不存在`)
    }
    const warehouseId = idOf(pick.warehouseId)
      ?? idOf(area.warehouseId)
      ?? idOf(nested(area, 'warehouse')?.id)
    if (warehouseId == null) {
      return fail(`堆位 ${text(pick.stackCode) || areaCodeValue(area) || text(area.id)} 缺少所属仓库`)
    }
    const wetWeight = num(pick.wet ?? pick.wetWeight)
    const dryWeight = num(pick.dry ?? pick.dryWeight)
    if (wetWeight == null || dryWeight == null) {
      return fail(`请为堆位 ${text(pick.stackCode) || areaCodeValue(area)} 填写湿重和干重`)
    }
    const cells = cellsBody(pick.cells)
    const row: Partial<ReceiptOrderAreaBo> & { areas?: unknown; wetWeight?: number; dryWeight?: number } = {
      areaId: idOf(area.id) as ReceiptOrderAreaBo['areaId'],
      warehouseId: warehouseId as ReceiptOrderAreaBo['warehouseId'],
      wetWeight,
      dryWeight,
    }
    if (cells.length) row.areas = cells
    areas.push(row)
  }
  return ok(areas)
}

/** 提交到货收货（更新入库单重量与堆位）。 */
async function receiveReceipt(id: string, body: Row) {
  const detail = await ruoyiGet<ReceiptOrderVo, ReceiptOrderVo>(`/wms/receiptOrder/${id}`)
  if (!detail.ok) return fail(detail.message)
  const row = (detail.data || {}) as ReceiptRow
  const wet = num(body.wetWeight)
  const dry = num(body.dryWeight)
  const moisture = num(body.moistureContent)
  if (wet == null || dry == null || moisture == null) return fail('到货收货需填写湿重、干重和水分。预约单不支持修改，请删除后重建。')
  const orderNo = text(row.receiptOrderNo || body.orderNo)
  if (!orderNo) return fail('未找到入库单号')
  const method = nested(row, 'shippingMethod')
  const shippingMethodId = idOf(row.shippingMethodId)
    ?? idOf(method?.id)
    ?? idOf(typeof row.shippingMethod === 'object' ? undefined : row.shippingMethod)
    ?? idOf(body.shipMode ? await codeFromDict('wms_translate_type', body.shipMode) : undefined)
  if (shippingMethodId == null) return fail('装运方式不能为空')
  const areaResult = await receiveAreasOf(body, row)
  if (!areaResult.success) return fail(areaResult.message)
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const category = text(body.category) || '原料'
  const itemType = category === '成品' ? 2 : 1
  const ebookId = book ? idOf(book.id) : idOf(row.ebookId)
  const elements = harmfulElements(body)
  const mineralType = num(row.mineralType)
  const payload: Partial<ReceiptOrderBo> & Row = {
    id: idOf(id) as ReceiptOrderBo['id'],
    receiptOrdeCode: orderNo,
    shippingMethodId: shippingMethodId as ReceiptOrderBo['shippingMethodId'],
    wetWeight: wet,
    dryWeight: dry,
    moistureContent: moisture,
    receiptOrderAreas: areaResult.data as ReceiptOrderAreaBo[],
    itemType,
  }
  if (mineralType != null) payload.mineralType = mineralType
  if (ebookId != null) payload.ebookId = ebookId
  const remark = text(body.remark).trim()
  if (remark) payload.remark = remark
  const weightOrcId = idOf(body.weightOrcId)
  const elementsOrcId = idOf(body.elementsOrcId)
  if (weightOrcId != null) payload.weightOrcId = weightOrcId
  if (elementsOrcId != null) payload.elementsOrcId = elementsOrcId
  if (elements.length) payload.elements = elements
  const result = await ruoyiSend('PUT', '/wms/receiptOrder', payload)
  return result.ok ? ok(true, '到货收货已提交') : fail(result.message)
}

export { filingNoOf, materialName, shipModeOf, receiptRow }

/** 入库单路由表 */
export const inboundRoutes: Route[] = [
  { method: 'GET', match: '/inbound', handle: ({ query }) => listReceipts(query) },
  { method: 'POST', match: '/inbound', handle: ({ body }) => createReceipt(body) },
  { method: 'GET', match: /^\/inbound\/([^/]+)$/, handle: ({ params }) => getReceipt(params[0]) },
  { method: 'PUT', match: /^\/inbound\/([^/]+)$/, handle: ({ params, body }) => receiveReceipt(params[0], body) },
]
