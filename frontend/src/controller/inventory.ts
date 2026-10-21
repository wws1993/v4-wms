import type { Route } from '@/api-map/types'
import type { CargoLot } from '@/plan/model'
import { fail, ok } from '@/api/result'
import { mediaUrl } from '@/api/media'
import { ruoyiBlob, ruoyiGet, type RuoyiResult } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import {
  brief, cellsText, clockBound, elementFields, elementListOf, hourText, idOf, inDayRange,
  nested, num, objectRows, resultObject, stamp, text,
} from '@/controller/shared/coerce'
import { pageParams } from '@/controller/shared/page'
import { codeFromDict, dictOf, dictValue, labelOf } from '@/controller/shared/dict'
import {
  areaLabelHit, areaLabelText, areaRows, findArea, findItem, findMerchant, loadHouses, warehouseRows,
} from '@/controller/shared/catalog'
import { filingNoOf, shipModeOf } from '@/controller/inbound'
import { OCR_STATUS, OCR_TYPE_LABEL } from '@/controller/ocr'

function inventoryLot(
  row: Row,
  categories: { label: string; value: string }[],
  kinds: { label: string; value: string }[],
  houses: Row[],
  translates: { label: string; value: string }[] = [],
): Row {
  const consignor = nested(row, 'consignor')
  const area = nested(row, 'area')
  const item = nested(row, 'item')
  const receipt = nested(row, 'receiptOrder') || nested(row, 'receipt')
  const warehouseId = text(row.warehouseId || area?.warehouseId)
  const house = houses.find((entry) => text(entry.id) === warehouseId)
  const recordNo = text(receipt?.recordNo || row.recordNo)
  const batchNo = text(row.batchNo || recordNo || row.orderNo || row.id)
  const remain = num(row.remainQuantity ?? row.quantity ?? receipt?.dryWeight)
  const cargoType = labelOf(categories, item?.itemCategory ?? row.itemCategory) || text(row.cargoType)
  const kind = labelOf(kinds, item?.type ?? row.itemType)
  const finished = cargoType === '混成品' || kind === '成品'
  const mineArea = text(item?.mineralSource ?? item?.mineArea ?? row.mineralSource ?? row.mineArea)
  const quality = elementFields(receipt || row)
  return {
    id: text(row.id),
    inventoryId: text(row.id),
    orderId: text(row.orderId || receipt?.id),
    batchNo,
    batchKind: finished || /^FL-/.test(batchNo) ? '生产批次号' : '报关单号',
    consignor: text(consignor?.merchantName || row.consignorName),
    consignorId: text(row.consignorId || consignor?.id),
    itemId: text(row.itemId || item?.id),
    material: text(item?.itemName || row.itemName),
    mineArea,
    cargoType,
    shipMode: shipModeOf(receipt || row, translates),
    filingNo: filingNoOf(row) || filingNoOf(receipt),
    warehouse: text(house?.warehouseName || house?.warehouseCode || warehouseId),
    warehouseId,
    stackText: text(area?.areaCode || area?.areaName || row.areaCode),
    areaId: text(row.areaId || area?.id),
    areaLabel: text(area?.areaIdentification || row.areaIdentification),
    wet: receipt?.wetWeight ?? row.wetWeight ?? '',
    dry: receipt?.dryWeight ?? row.dryWeight ?? remain ?? '',
    remain: remain ?? '',
    originCountry: finished ? '—' : text(row.country || row.originCountry || receipt?.originCountry || receipt?.country),
    book: text(nested(row, 'accountBook')?.accountCode || row.accountCode || receipt?.accountCode),
    status: remain === 0 ? '已出库' : '在库',
    inDate: hourText(row.inboundTime || row.createTime || receipt?.arrivalDate),
    skuId: row.skuId,
    shipName: text(receipt?.shipName || row.shipName),
    blNo: text(receipt?.waybillNo || row.waybillNo),
    customsNo: recordNo,
    cu: quality.cu || row.cu || '',
    ag: quality.ag || row.ag || '',
    au: quality.au || row.au || '',
    as: quality.as || row.as || '',
    pb: quality.pb || row.pb || '',
    cd: quality.cd || row.cd || '',
    f: quality.f || row.f || '',
    hg: quality.hg || row.hg || '',
  }
}

async function enrichLot(row: Row) {
  if (!row.orderId || row.customsNo) return row
  const detail = await ruoyiGet(`/wms/receiptOrder/${row.orderId}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return row
  const receipt = detail.data as Row
  const recordNo = text(receipt.recordNo)
  const batchNo = recordNo || text(row.batchNo)
  return {
    ...row,
    customsNo: recordNo,
    batchNo,
    batchKind: /^FL-/.test(batchNo) ? '生产批次号' : '报关单号',
    blNo: text(receipt.waybillNo || row.blNo),
    wet: receipt.wetWeight ?? row.wet,
    dry: receipt.dryWeight ?? row.dry,
    shipName: text(receipt.shipName || row.shipName),
    inDate: row.inDate || stamp(receipt.arrivalDate, 13),
  }
}

function hourText(value: unknown) {
  const raw = stamp(value, 13)
  return raw.length >= 13 ? `${raw}时` : raw
}

function clockBound(value: unknown, end: boolean) {
  const raw = text(value).replace('T', ' ').trim()
  if (!raw) return ''
  if (raw.length >= 19) return raw.slice(0, 19)
  if (raw.length >= 13) return `${raw.slice(0, 13)}:${end ? '59:59' : '00:00'}`
  const day = raw.slice(0, 10)
  return day ? `${day} ${end ? '23:59:59' : '00:00:00'}` : ''
}

function monthBounds() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return { from: `${month}-01 00:00:00`, to: `${month}-${String(last).padStart(2, '0')} 23:59:59` }
}

function inventoryPage(query: Query, list: Row[], total: number, message = 'ok') {
  return ok({
    list,
    total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  }, message)
}

function homeSource(result: RuoyiResult) {
  if (result.rows.length) return result.rows
  const data = result.data
  if (Array.isArray(data)) return objectRows(data)
  if (!data || typeof data !== 'object') return []
  const bag = data as Row
  for (const key of ['list', 'rows', 'records', 'areas', 'inventories', 'items', 'areaList']) {
    const nestedRows = objectRows(bag[key])
    if (nestedRows.length) return nestedRows
  }
  for (const value of Object.values(bag)) {
    const nestedRows = objectRows(value)
    if (nestedRows.some((item) => item.areaId != null || item.areaItems || item.consignorName)) return nestedRows
  }
  if (bag.areaId != null || bag.areaItems || bag.consignorName) return [bag]
  return []
}

function homeLot(
  row: Row,
  areas: Row[],
  houses: Row[],
  categories: { label: string; value: string }[],
): CargoLot | null {
  const area = nested(row, 'area')
  const consignor = nested(row, 'consignor')
  const areaId = text(row.areaId || area?.id)
  const known = areas.find((item) => text(item.id) === areaId)
  const code = text(known?.areaCode || known?.areaName || area?.areaCode || area?.areaName || row.areaCode)
  if (!areaId && !code) return null
  const warehouseId = text(row.warehouseId || known?.warehouseId || area?.warehouseId)
  const house = houses.find((item) => text(item.id) === warehouseId)
  const cells = cellsText(row).split(',').filter(Boolean)
  const dry = num(row.dryWeight ?? row.quantity ?? row.remainQuantity) ?? 0
  const cargoType = labelOf(categories, row.itemCategory) || text(row.cargoType) || text(row.itemCategory)
  return {
    stackText: code,
    warehouse: text(house?.warehouseCode || house?.warehouseName || warehouseId),
    consignor: text(row.consignorName || consignor?.merchantName || row.merchantName),
    cargoType,
    wet: dry,
    status: '在库',
    areaId: areaId || undefined,
    cells: cells.length ? cells : undefined,
  }
}

async function inventoryHome() {
  const [result, areas, houses, categories] = await Promise.all([
    ruoyiGet('/wms/inventory/home'),
    areaRows(),
    warehouseRows(),
    dictOf('wms_item_category'),
  ])
  if (!result.ok) return fail(brief(result.message))
  const lots = homeSource(result).map((row) => homeLot(row, areas, houses, categories)).filter((lot): lot is CargoLot => Boolean(lot))
  return ok(lots)
}
async function listInventory(query: Query) {
  const materialKey = text(query.materialId || query.mineArea).trim()
  const [categories, kinds, houses, translates, areaNames, consignor, area, item, itemCategory, shippingMethodId] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_item_type'),
    loadHouses(),
    dictOf('wms_translate_type'),
    dictOf('wms_area_identification'),
    query.consignor ? findMerchant(query.consignor) : Promise.resolve(undefined),
    query.stack ? findArea(query.stack) : Promise.resolve(undefined),
    materialKey ? findItem(materialKey) : Promise.resolve(undefined),
    query.cargoType ? dictValue('wms_item_category', query.cargoType) : Promise.resolve(undefined),
    query.shipMode ? codeFromDict('wms_translate_type', query.shipMode) : Promise.resolve(undefined),
  ])
  if (query.consignor && !consignor) return inventoryPage(query, [], 0)
  if (materialKey && !item) return inventoryPage(query, [], 0)
  const house = query.warehouse
    ? houses.find((entry) => [entry.id, entry.warehouseCode, entry.warehouseName].some((value) => text(value) === text(query.warehouse)))
    : undefined
  if (query.warehouse && !house) return inventoryPage(query, [], 0)
  const span = query.timeMode === 'month'
    ? monthBounds()
    : { from: clockBound(query.from, false), to: clockBound(query.to, true) }
  const filters: Query = {
    consignorId: consignor ? idOf(consignor.id) : undefined,
    areaId: area ? idOf(area.id) : undefined,
    areaCode: area ? undefined : text(query.stack) || undefined,
    warehouseId: house ? idOf(house.id) : undefined,
    recordNo: query.keyword || undefined,
    itemId: item ? idOf(item.id) ?? text(item.id) : undefined,
    itemCategory,
    shippingMethodId: shippingMethodId == null ? undefined : shippingMethodId,
    recordNumber: query.filingNo || undefined,
    ...(span.from || span.to ? { params: { beginTime: span.from || undefined, endTime: span.to || undefined } } : {}),
  }
  let note = ''
  let result = await ruoyiGet('/wms/inventory/list', pageParams(query, filters))
  if (result.ok && query.keyword && result.total === 0) {
    const retry = await ruoyiGet('/wms/inventory/list', pageParams(query, { ...filters, recordNo: undefined, batchNo: query.keyword }))
    if (retry.ok) result = retry
  }
  if (!result.ok && (span.from || span.to)) {
    const rest = { ...filters }
    delete rest.params
    const retry = await ruoyiGet('/wms/inventory/list', pageParams(query, rest))
    if (!retry.ok) return fail(brief(retry.message))
    result = retry
    note = '库存列表暂不支持起止时间，已按其它条件查询'
  }
  if (!result.ok) return fail(brief(result.message))
  let rows = await Promise.all(result.rows.map((row) => {
    const lot = inventoryLot(row, categories, kinds, houses, translates)
    lot.areaLabel = areaLabelText(lot.areaLabel, areaNames)
    return enrichLot(lot)
  }))
  const seen = new Set<string>()
  rows = rows.filter((row) => {
    const id = text(row.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  const whole = rows.length >= result.total
  const shipLabel = text(query.shipMode)
  const areaWant = text(query.areaLabel)
  rows = rows.filter((row) => {
    if (query.status && row.status !== query.status) return false
    if (shipLabel && text(row.shipMode) && text(row.shipMode) !== shipLabel) return false
    if (areaWant && !areaLabelHit(row, areaWant, areaNames)) return false
    if (!whole) return true
    if (query.cargoType && row.cargoType !== query.cargoType) return false
    if (materialKey) {
      const hit = text(row.itemId) === text(item?.id) || text(row.material) === text(item?.itemName) || text(row.mineArea) === text(item?.mineralSource || item?.itemName)
      if (!hit && (row.itemId || row.material || row.mineArea)) return false
    }
    // 已用 recordNumber 交给后端筛选；行上若未解析出 filingNo 则不再误杀
    if (query.filingNo) {
      const no = text(row.filingNo)
      if (no && !no.includes(text(query.filingNo))) return false
    }
    if (query.warehouse && row.warehouse !== query.warehouse) return false
    if (query.keyword && !`${row.batchNo}${row.customsNo}${row.stackText}`.includes(text(query.keyword))) return false
    if ((span.from || span.to) && !inDayRange(row.inDate, span.from, span.to)) return false
    return true
  })
  const total = whole || areaWant ? rows.length : result.total
  return inventoryPage(query, rows, total, note || result.message)
}

async function locateInventory(batchNo: string) {
  const listed = await ruoyiGet('/wms/inventory/list', { pageNum: 1, pageSize: 500 })
  if (!listed.ok) return undefined
  const direct = listed.rows.find((row) => [row.id, row.orderNo, row.recordNo, row.batchNo].some((value) => text(value) === batchNo))
  if (direct) return direct
  for (const row of listed.rows.slice(0, 40)) {
    const orderId = text(row.orderId)
    if (!orderId) continue
    const detail = await ruoyiGet(`/wms/receiptOrder/${orderId}`)
    const receipt = detail.ok && detail.data && typeof detail.data === 'object' ? detail.data as Row : undefined
    if (receipt && [receipt.recordNo, receipt.waybillNo, receipt.receiptOrderNo].some((value) => text(value) === batchNo)) return row
  }
  return undefined
}

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]).trim()
    if (value && value !== 'null' && value !== 'undefined') return value
  }
  return ''
}

function shotFrom(row: Row) {
  const source = text(row.sourceUrl).trim()
  const name = source.split('?')[0].split('/').filter(Boolean).pop() || text(row.ocrLogNo)
  return { image: mediaUrl(source), name, result: resultObject(row), no: text(row.ocrLogNo) }
}

async function ocrShot(id: unknown) {
  const key = text(id).trim()
  if (!key || key === '0') return undefined
  const detail = await ruoyiGet(`/wms/ocr/${encodeURIComponent(key)}`)
  if (!detail.ok || !detail.data || typeof detail.data !== 'object') return undefined
  return shotFrom(detail.data as Row)
}

async function ocrRows(orderId: string, orderNo: string) {
  if (!orderId && !orderNo) return [] as Row[]
  const query: Query = { pageNum: 1, pageSize: 50 }
  if (orderId) query.orderId = orderId
  else query.orderNo = orderNo
  const listed = await ruoyiGet('/wms/ocr/list', query)
  return listed.ok ? listed.rows : []
}

const QUALITY_ALIAS: Record<string, string[]> = {
  cu: ['cu', 'Cu', 'CU', '铜'],
  ag: ['ag', 'Ag', 'AG', '银'],
  au: ['au', 'Au', 'AU', '金'],
  as: ['as', 'As', 'AS', '砷'],
  pb: ['pb', 'Pb', 'PB', '铅'],
  cd: ['cd', 'Cd', 'CD', '镉'],
  f: ['f', 'F', '氟'],
  hg: ['hg', 'Hg', 'HG', '汞'],
}

function qualityValues(result: Row, receipt?: Row) {
  const bag: Row = { ...result }
  const nested = result.elements
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) Object.assign(bag, nested as Row)
  const out: Record<string, string> = {}
  for (const [key, aliases] of Object.entries(QUALITY_ALIAS)) out[key] = pick(bag, aliases)
  for (const item of elementListOf(receipt)) {
    if (!item || typeof item !== 'object') continue
    const el = item as Row
    const code = text(el.elementCode || el.elementName).trim().toLowerCase()
    const name = text(el.elementName).trim()
    const match = Object.entries(QUALITY_ALIAS).find(([, aliases]) => aliases.some((alias) => alias.toLowerCase() === code || alias === name))
    if (match && !out[match[0]]) out[match[0]] = text(el.elementValue)
  }
  return out
}

async function attachLotDocs(row: Row): Promise<Row> {
  const finished = row.cargoType === '混成品' || row.batchKind === '生产批次号'
  const orderId = text(row.orderId)
  let receipt: Row | undefined
  if (orderId) {
    const detail = await ruoyiGet(`/wms/receiptOrder/${orderId}`)
    if (detail.ok && detail.data && typeof detail.data === 'object') receipt = detail.data as Row
  }
  const [inboundShot, outboundShot, weightShot, qualityShot, listed] = await Promise.all([
    ocrShot(receipt?.orcId ?? receipt?.orcLogId),
    ocrShot(receipt?.outOrcId ?? receipt?.outOcrId),
    ocrShot(receipt?.weightOrcId ?? receipt?.weightOcrId),
    ocrShot(receipt?.elementsOrcId ?? receipt?.elementsOcrId),
    ocrRows(orderId, text(row.customsNo || row.batchNo)),
  ])
  let inboundDoc = inboundShot
  let outboundDoc = outboundShot
  let weight = weightShot
  let quality = qualityShot
  for (const item of listed) {
    const type = Number(item.ocrLogType)
    const next = shotFrom(item)
    if (!next.image) continue
    if (type === 0 && !inboundDoc?.image) inboundDoc = next
    if (type === 1 && !outboundDoc?.image) outboundDoc = next
    if (type === 2 && !weight?.image) weight = next
    if (type === 3 && !quality?.image) quality = next
  }
  const customs = finished ? (outboundDoc || inboundDoc) : (inboundDoc || outboundDoc)
  const customsResult = inboundDoc?.result || {}
  const outboundResult = outboundDoc?.result || {}
  const weightResult = weight?.result || {}
  const elements = qualityValues(quality?.result || {}, receipt)
  const empty = { image: '', name: '' }
  const shot = (item?: { image: string; name: string }) => (item?.image ? { image: item.image, name: item.name } : empty)
  return {
    ...row,
    checklistNo: pick(customsResult, ['verificationCode', 'checklistNo']) || text(receipt?.verificationCode || row.checklistNo),
    declareDate: pick(customsResult, ['declarationDate', 'declareDate']),
    wet: text(row.wet).trim() || pick(weightResult, ['wetWeight', 'wet']) || text(receipt?.wetWeight),
    dry: text(row.dry).trim() || pick(weightResult, ['dryWeight', 'dry']) || text(receipt?.dryWeight),
    moisture: text(row.moisture).trim() || pick(weightResult, ['moistureContent', 'moisture']) || text(receipt?.moistureContent),
    filingNo: text(row.filingNo).trim() || filingNoOf(receipt),
    originCountry: text(row.originCountry).trim() || text(receipt?.originCountry || receipt?.country),
    shipName: text(row.shipName) || pick(customsResult, ['shipName']) || text(receipt?.shipName),
    blNo: text(row.blNo) || pick(customsResult, ['waybillNo', 'blNo']) || text(receipt?.waybillNo),
    outCustomsNo: pick(outboundResult, ['recordNo', 'customsNo']) || text(row.outCustomsNo),
    outChecklistNo: pick(outboundResult, ['verificationCode', 'checklistNo']),
    flowTo: pick(outboundResult, ['flowTo', 'consignee', 'merchantName']) || pick(customsResult, ['flowTo', 'consignee', 'merchantName']),
    weightNo: text(weight?.no || pick(weightResult, ['certificateNo', 'docNo'])),
    qualityNo: text(quality?.no || pick(quality?.result || {}, ['certificateNo', 'docNo'])),
    cu: elements.cu || row.cu,
    ag: elements.ag || row.ag,
    au: elements.au || row.au,
    as: elements.as || row.as,
    pb: elements.pb || row.pb,
    cd: elements.cd || row.cd,
    f: elements.f || row.f,
    hg: elements.hg || row.hg,
    docs: {
      customs: shot(customs),
      inbound: shot(inboundDoc),
      outbound: shot(outboundDoc),
      weight: shot(weight),
      quality: shot(quality),
    },
    ocrRecords: listed.map((item) => {
      const type = Number(item.ocrLogType)
      const next = shotFrom(item)
      const status = Number(item.ocrLogStatus)
      return {
        id: text(item.id),
        docType: OCR_TYPE_LABEL[type] || text(item.ocrLogType),
        fileName: next.name,
        customsNo: pick(next.result, ['recordNo', 'customsNo']) || text(row.customsNo || row.batchNo),
        checklistNo: pick(next.result, ['verificationCode', 'checklistNo']),
        status: OCR_STATUS[status] || text(item.ocrLogStatus),
        time: text(item.createTime).replace('T', ' ').slice(0, 16),
        orderId: text(item.orderId || orderId),
      }
    }),
  }
}

function wantsDocs(value: unknown) {
  const flag = text(value).trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

/** 库存台账业务类型：1 入库 2 移库 3 出库 */
const LEDGER_ACTION: Record<number, string> = { 1: '入库', 2: '移库', 3: '出库' }

function ledgerAction(row: Row) {
  const kind = num(row.inventoryType)
  if (kind != null && LEDGER_ACTION[kind]) return LEDGER_ACTION[kind]
  const source = num(row.type)
  if (source === 2) return '生产'
  if (source === 1) return '入库'
  return text(row.orderNo) || '其它'
}

function ledgerAreaCode(row: Row, areas: Row[], idKey: string, objectKey: string) {
  const object = nested(row, objectKey)
  if (object) return text(object.areaCode || object.areaName)
  const raw = row[objectKey]
  const id = text(row[idKey] || (typeof raw === 'number' || typeof raw === 'string' ? raw : ''))
  if (!id) return ''
  const known = areas.find((item) => text(item.id) === id)
  return text(known?.areaCode || known?.areaName)
}

function ledgerStack(row: Row, areas: Row[]) {
  const code = ledgerAreaCode(row, areas, 'areaId', 'area') || text(row.areaCode)
  const old = ledgerAreaCode(row, areas, 'oldAreaId', 'oldArea')
  if (code && old && code !== old) return `${old}→${code}`
  return code || old
}

function ledgerConsignee(row: Row) {
  const company = nested(row, 'receivingCompany')
  return text(company?.merchantName || row.receivingCompanyName || row.merchantName)
}

function mapLedgerRow(row: Row, areas: Row[]) {
  return {
    time: hourText(row.oprDate || row.createTime),
    action: ledgerAction(row),
    wet: row.wetWeight ?? '',
    dry: row.dryWeight ?? '',
    stack: ledgerStack(row, areas),
    consignee: ledgerConsignee(row),
    orderNo: text(row.orderNo),
  }
}

function ledgerFilter(raw: Row): Query | null {
  const inventoryId = idOf(raw.id || raw.inventoryId)
  const receipt = nested(raw, 'receiptOrder') || nested(raw, 'receipt')
  const recordNo = text(raw.recordNo || receipt?.recordNo || raw.customsNo)
  const batchNo = text(raw.batchNo)
  const query: Query = {}
  if (inventoryId != null) query.inventoryId = inventoryId
  else if (recordNo) query.recordNo = recordNo
  else if (batchNo) query.batchNo = batchNo
  else return null
  return query
}

/** 库存台账：/wms/inventoryDetail/listNoPage */
async function inventoryLedger(raw: Row) {
  const query = ledgerFilter(raw)
  if (!query) return [] as Row[]
  const [result, areas] = await Promise.all([
    ruoyiGet('/wms/inventoryDetail/listNoPage', query),
    areaRows(),
  ])
  if (!result.ok) return [] as Row[]
  const rows = Array.isArray(result.data) ? result.data as Row[] : result.rows
  return rows.map((row) => mapLedgerRow(row, areas))
}

/** 库存台账导出：/wms/inventoryDetail/export */
async function exportInventoryLedger(query: Query) {
  let filters: Query | null = null
  const inventoryId = idOf(query.inventoryId)
  const recordNo = text(query.recordNo || query.customsNo)
  const batchNo = text(query.batchNo || query.keyword)
  if (inventoryId != null) filters = { inventoryId }
  else if (recordNo) filters = { recordNo }
  else if (batchNo) {
    const raw = await locateInventory(batchNo)
    if (!raw) return fail('批次不存在')
    filters = ledgerFilter(raw)
  }
  if (!filters) return fail('请指定库存或批次')
  const label = batchNo || recordNo || text(filters.inventoryId) || '台账'
  try {
    const response = await ruoyiBlob('/wms/inventoryDetail/export', filters)
    const blob = response.data
    const type = blob.type || ''
    if (type.includes('json') || type.includes('text')) {
      const raw = await blob.text()
      try {
        const body = JSON.parse(raw) as { code?: number; msg?: string }
        if (body.code != null && body.code !== 200 && body.code !== 0) return fail(body.msg || '导出失败')
      } catch {
        return ok({ filename: `重量台账_${label}.csv`, content: raw })
      }
    }
    return ok({ filename: `重量台账_${label}.xlsx`, blob })
  } catch {
    return fail('导出失败')
  }
}

async function inventoryBatch(batchNo: string, query: Query = {}) {
  const raw = await locateInventory(batchNo)
  if (!raw) return fail('批次不存在')
  const [categories, kinds, houses, ledger] = await Promise.all([
    dictOf('wms_item_category'),
    dictOf('wms_item_type'),
    loadHouses(),
    inventoryLedger(raw),
  ])
  const enriched = await enrichLot(inventoryLot(raw, categories, kinds, houses))
  const row = wantsDocs(query.docs) ? await attachLotDocs(enriched) : enriched
  return ok({ ...row, ledger, products: [] })
}

export { inventoryLot, enrichLot, locateInventory, inventoryHome, homeLot, homeSource }

export const inventoryRoutes: Route[] = [
  { method: 'GET', match: '/inventory/home', handle: () => inventoryHome() },
  { method: 'GET', match: '/inventory', handle: ({ query }) => listInventory(query) },
  { method: 'GET', match: '/inventory/ledger/export', handle: ({ query }) => exportInventoryLedger(query) },
  { method: 'GET', match: /^\/inventory\/batches\/([^/]+)$/, handle: ({ params, query }) => inventoryBatch(params[0], query) },
]
