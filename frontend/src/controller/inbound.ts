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

function materialName(row: Row, items: Row[]) {
  const embedded = row.item as Row | undefined
  const named = text(embedded?.itemName || row.itemName)
  if (named) return named
  const id = text(row.itemId || embedded?.id)
  const hit = items.find((item) => text(item.id) === id)
  return text(hit?.itemName)
}

function filingNoOf(row?: Row | null) {
  if (!row) return ''
  const direct = text(row.filingNo).trim()
  if (direct) return direct
  const filings = row.mineralSourceFiling
  if (Array.isArray(filings) && filings[0]) return text((filings[0] as Row).recordNumber)
  if (filings && typeof filings === 'object') return text((filings as Row).recordNumber)
  return ''
}

function shipModeOf(row: Row, translates: { label: string; value: string }[]) {
  const method = nested(row, 'shippingMethod')
  const code = text(method?.id ?? (typeof row.shippingMethod === 'object' ? row.shippingMethodId : row.shippingMethod))
  return labelOf(translates, code)
}

function receiptRow(row: Row, minerals: { label: string; value: string }[], statuses: { label: string; value: string }[], currencies: { label: string; value: string }[], categories: { label: string; value: string }[], translates: { label: string; value: string }[], items: Row[] = []) {
  const method = nested(row, 'shippingMethod')
  const consignor = row.consignor as Row | undefined
  const area = row.area as Row | undefined
  const item = row.item as Row | undefined
  return {
    id: text(row.id),
    orderNo: text(row.receiptOrderNo),
    time: text(row.arrivalDate || row.createTime).replace('T', ' ').slice(0, 16),
    operateTime: text(row.updateTime || row.createTime).replace('T', ' ').slice(0, 19),
    customsNo: text(row.recordNo),
    blNo: text(row.waybillNo),
    blWeight: row.ladingWeight ?? row.waybillWeight ?? row.blWeight ?? '',
    shipName: text(row.shipName),
    oreType: labelOf(minerals, row.mineralType) || text(row.mineralType),
    shipMode: shipModeOf(row, translates),
    containerCount: method?.areaNumber ?? '',
    consignor: text(consignor?.merchantName || row.consignorId),
    material: materialName(row, items),
    cargoType: labelOf(categories, item?.itemCategory) || text(item?.itemCategory),
    filingNo: filingNoOf(row),
    stackCode: text(area?.areaCode || area?.areaName),
    cells: cellsText(row),
    amount: row.payableAmount,
    currency: currencyMark(currencies, row.currency),
    checklistNo: text(row.verificationCode),
    status: labelOf(statuses, row.receiptOrderStatus) || text(row.receiptOrderStatus),
    orcId: row.orcLogId,
    wet: row.wetWeight ?? '',
    dry: row.dryWeight ?? '',
    moisture: row.moistureContent ?? '',
    weightOrcId: text(row.weightOrcId),
    elementsOrcId: text(row.elementsOrcId),
    shippingMethodId: text(row.shippingMethodId || method?.id || (typeof row.shippingMethod === 'object' ? '' : row.shippingMethod)),
    remark: text(row.remark),
    ...elementFields(row),
  }
}
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
  const ask = (extra: Query, withRange: boolean) => ruoyiGet('/wms/receiptOrder/list', pageParams(query, {
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
    list: result.rows.map((row) => receiptRow(row, minerals, statuses, currencies, categories, translates, items.rows)),
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, note || result.message)
}

async function getReceipt(id: string) {
  const [detail, minerals, statuses, currencies, categories, translates, items] = await Promise.all([
    ruoyiGet(`/wms/receiptOrder/${encodeURIComponent(id)}`),
    dictOf('wms_mineral_type'),
    dictOf('wms_receipt_status'),
    dictOf('wms_currency_type'),
    dictOf('wms_item_category'),
    dictOf('wms_translate_type'),
    itemCatalog(),
  ])
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return fail(detail.message || '入库单不存在')
  return ok(receiptRow(detail.data as Row, minerals, statuses, currencies, categories, translates, items.rows))
}

async function createReceipt(body: Row) {
  const orcId = idOf(body.orcId)
  if (orcId == null) return fail('请先完成入库报关单识别，并填写 OCR 任务编号')
  const consignor = await findMerchant(body.consignor)
  const area = await findArea(body.areaId) || await findArea(body.stackCode)
  const item = await findItem(body.material)
  const shippingMethodId = await codeFromDict('wms_translate_type', body.shipMode)
  const mineralType = await codeFromDict('wms_mineral_type', body.oreType || '精铜矿')
  const shipName = text(body.shipName).trim()

  if (!consignor) return fail('委托方在往来单位中不存在')
  if (!area) {
    const known = (await areaRows()).map((row) => areaCodeValue(row) || areaNameValue(row)).filter(Boolean)
    const hint = known.length ? `，档案中有 ${known.slice(0, 8).join('、')}` : '，没有读到堆位档案'
    return fail(`预定堆位 ${text(body.stackCode) || text(body.areaId)} 不存在${hint}`)
  }
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
  const payload: Row = {
    orcId,
    consignorId: idOf(consignor.id),
    waybillNo: body.blNo,
    verificationCode: body.checklistNo,
    recordNo: body.customsNo,
    currency: currencyValue(currencies, body.currency),
    payableAmount: amount,
    itemId: idOf(item.id),
    areaId: idOf(area.id),
    mineralType,
    shippingMethodId,
    arrivalDate: arrivalOf(body.time),
    entityId: owner ? idOf(owner.id) : undefined,
    ebookId: book ? idOf(book.id) : undefined,
    areas: cellsBody(body.cells),
    shipName,
  }
  if (blWeight != null) payload.ladingWeight = blWeight
  const result = await ruoyiSend('POST', '/wms/receiptOrder', payload)
  return result.ok ? ok(result.data, '入库预约已创建') : fail(result.message)
}

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

async function receiveReceipt(id: string, body: Row) {
  const detail = await ruoyiGet(`/wms/receiptOrder/${id}`)
  if (!detail.ok) return fail(detail.message)
  const row = (detail.data || {}) as Row
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
  const book = body.bondedBook ? await findBook(body.bondedBook) : undefined
  const itemType = num(body.category ? await codeFromDict('wms_item_type', body.category) : row.receiptType)
  const ebookId = book ? idOf(book.id) : idOf(row.ebookId)
  const elements = harmfulElements(body)
  const mineralType = num(row.mineralType)
  const payload: Row = {
    id: idOf(id),
    receiptOrdeCode: orderNo,
    shippingMethodId,
    wetWeight: wet,
    dryWeight: dry,
    moistureContent: moisture,
  }
  if (mineralType != null) payload.mineralType = mineralType
  if (itemType != null) payload.itemType = itemType
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

export const inboundRoutes: Route[] = [
  { method: 'GET', match: '/inbound', handle: ({ query }) => listReceipts(query) },
  { method: 'POST', match: '/inbound', handle: ({ body }) => createReceipt(body) },
  { method: 'GET', match: /^\/inbound\/([^/]+)$/, handle: ({ params }) => getReceipt(params[0]) },
  { method: 'PUT', match: /^\/inbound\/([^/]+)$/, handle: ({ params, body }) => receiveReceipt(params[0], body) },
]
