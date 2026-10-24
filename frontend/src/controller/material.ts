import type { Route } from '@/api-map/types'
import { clearSessionList, loadSessionList, SESSION_LIST, type CacheRow } from '@/api/catalogCache'
import { fail, ok, toCsv } from '@/api/result'
import { isMediaPath, mediaUrl } from '@/api/media'
import { ruoyiBlob, ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, byOrderNum, idOf, num, orderNumOf, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { dictOf, dictValue, labelOf } from '@/controller/shared/dict'
import { clearItemCache, itemCatalogRows, loadHouses } from '@/controller/shared/catalog'
import { inventoryLot } from '@/controller/inventory'
import type { InventoryVo, ItemBo, ItemVo, MineralSourceFilingBo, MineralSourceFilingVo } from '@/typings/openapi'

/** 矿源备案 Vo 上偶发的扩展字段（运行时有、契约未列全）。 */
type FilingVo = MineralSourceFilingVo & {
  mineralSource?: string
  harmfulElementContent?: string
  harmfulContent?: string
}

/** 将物料 Vo 映射为列表行。 */
function itemRow(row: ItemVo | Row, categories: { label: string; value: string }[]) {
  const bag = row as Row
  const cargoType = labelOf(categories, bag.itemCategory) || text(bag.itemCategory)
  /** 丰联现把 mineralSource 用作矿区。 */
  const mineArea = text(bag.mineralSource ?? bag.mineArea ?? bag.mineralArea)
  return {
    id: text(bag.id),
    code: text(bag.itemCode),
    name: text(bag.itemName),
    cargoType,
    source: mineArea,
    mineArea,
    originCountry: text(bag.originCountry),
    orderNum: orderNumOf(bag.orderNum),
  }
}

/** 分页查询物料档案。 */
async function listItems(query: Query) {
  const keyword = text(query.keyword).trim()
  const cargoType = text(query.cargoType).trim()
  const [categories, itemCategory] = await Promise.all([
    dictOf('wms_item_category'),
    cargoType ? dictValue('wms_item_category', cargoType) : Promise.resolve(undefined),
  ])
  const result = await ruoyiGet<ItemVo>('/wms/item/list', pageParams(query, {
    mineralSource: keyword || undefined,
    itemCategory: itemCategory || undefined,
  }))
  return pageOf(result, byOrderNum(result.rows.map((row) => itemRow(row, categories))), query)
}

/** 删除物料档案。 */
async function removeItem(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/item/${id}`)
  if (!result.ok) return fail(result.message)
  clearItemCache()
  return ok(true, '已删除')
}

/** 新建或更新物料档案。 */
async function saveItem(id: string | undefined, body: Row) {
  const mineArea = text(body.mineArea).trim()
  const name = text(body.name).trim() || mineArea
  const cargoType = text(body.cargoType).trim()
  if (!mineArea) return fail('请填写矿区')
  if (!cargoType) return fail('请选择矿种类型')
  const payload: Partial<ItemBo> = {
    itemName: name,
    itemCategory: await dictValue('wms_item_category', cargoType),
    mineralSource: mineArea,
    originCountry: text(body.originCountry).trim(),
    orderNum: orderNumOf(body.orderNum) ?? 0,
  }
  if (id) payload.id = idOf(id) as ItemBo['id']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/item', payload)
  if (!result.ok) return fail(result.message)
  clearItemCache()
  return ok(true, '已保存')
}

/** 导出物料档案 CSV。 */
async function exportItems(query: Query) {
  const listed = await listItems({ ...query, page: 1, pageSize: 500 })
  if (!listed.success || !listed.data) return fail(listed.message || '导出失败')
  const data = listed.data as { list?: Row[] }
  const rows = data.list || []
  const day = new Date().toISOString().slice(0, 10)
  return ok({
    filename: `物料档案_${day}.csv`,
    content: toCsv([
      { key: 'mineArea', label: '矿区' },
      { key: 'cargoType', label: '矿种类型' },
      { key: 'originCountry', label: '原产国' },
      { key: 'orderNum', label: '排序' },
    ], byOrderNum(rows)),
  })
}

/** 矿源备案状态兜底选项 */
const FILING_STATUS = [
  { label: '有效', value: '1' },
  { label: '即将用尽', value: '2' },
  { label: '已用尽', value: '3' },
]

/** 截取日期到 YYYY-MM-DD。 */
function dayOnly(value: unknown) {
  const raw = text(value).trim()
  return raw ? raw.slice(0, 10) : ''
}

/** 将用量数值格式化为百分比文案。 */
function usageText(value: unknown) {
  const raw = text(value).trim()
  if (!raw) return '0.00%'
  if (raw.includes('%')) return raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : raw
}

/** 读取矿源备案状态字典（无则用兜底）。 */
async function filingStatusOptions() {
  const listed = await dictOf('wms_filing_status')
  return listed.length ? listed : FILING_STATUS
}

/** 将状态标签或编码转为字典值。 */
async function filingStatusCode(label: unknown) {
  const raw = text(label)
  if (!raw) return undefined
  const hit = (await filingStatusOptions()).find((item) => item.label === raw || item.value === raw)
  return hit ? hit.value : raw
}

/** 由前端筛选条件组装矿源备案查询参数。 */
async function filingQuery(query: Query) {
  return {
    mineralSource: text(query.source).trim() || undefined,
    recordNumber: text(query.keyword).trim() || undefined,
    category: text(query.sourceKind).trim() || undefined,
    status: await filingStatusCode(query.status),
    startTime: query.from ? dayOnly(query.from) : undefined,
    endTime: query.to ? dayOnly(query.to) : undefined,
  }
}

/** 将矿源备案 Vo 映射为列表行。 */
function filingRow(
  row: FilingVo,
  sources: { label: string; value: string }[],
  kinds: { label: string; value: string }[],
  statuses: { label: string; value: string }[],
) {
  const fileUrl = text(row.fileUrl)
  const qty = num(row.filingsNum) ?? 0
  const used = num(row.verifiedTonnage) ?? 0
  const remain = num(row.remainingTonnage)
  return {
    id: text(row.id),
    source: labelOf(sources, row.mineralSource),
    sourceKind: labelOf(kinds, row.category),
    originCountry: text(row.originCountry),
    code: text(row.recordNumber),
    filingDate: dayOnly(row.recordTime),
    harmfulContent: text(row.hazardousElementsRemark ?? row.harmfulElementContent ?? row.harmfulContent),
    status: labelOf(statuses, row.status) || '有效',
    qty,
    usedQty: used,
    remain: remain ?? Math.max(0, Math.round((qty - used) * 100) / 100),
    usage: usageText(row.dosage),
    prodBatches: text(row.batchNumber) || '—',
    attachment: fileUrl,
    attachmentUrl: isMediaPath(fileUrl) ? mediaUrl(fileUrl) : '',
    attachmentText: fileUrl ? '1 个' : '—',
  }
}

/** 批量映射矿源备案行并补物料展示名。 */
async function filingRows(rows: FilingVo[]) {
  const [sources, kinds, statuses, categories, items] = await Promise.all([
    dictOf('wms_mineral_source'),
    dictOf('wms_mineral_type'),
    filingStatusOptions(),
    dictOf('wms_item_category'),
    itemCatalogRows(),
  ])
  const materials = items.map((row) => itemRow(row, categories))
  return rows.map((row) => {
    const mapped = filingRow(row, sources, kinds, statuses)
    const itemId = text(row.itemId)
    const itemName = text(row.itemName)
    const hit = itemId
      ? materials.find((item) => String(item.id) === itemId)
      : materials.find((item) => {
          if (mapped.originCountry && item.originCountry && mapped.originCountry !== item.originCountry) return false
          return Boolean(mapped.source) && (item.mineArea === mapped.source || item.source === mapped.source || item.name === mapped.source)
        })
    return {
      ...mapped,
      materialId: hit ? String(hit.id) : itemId,
      materialName: hit ? text(hit.name) : (itemName || text(mapped.source) || '—'),
    }
  })
}

/** 清除矿源备案会话缓存。 */
function clearFilingCache() {
  clearSessionList(SESSION_LIST.filing)
}

/** 拉取矿源备案目录（会话缓存）。 */
async function filingCatalog() {
  const listed = await loadSessionList(SESSION_LIST.filing, SESSION_LIST.filing, async () => {
    const result = await ruoyiGet<MineralSourceFilingVo>('/wms/mineralSourceFiling/list', { pageNum: 1, pageSize: 500 })
    return { ok: result.ok, rows: result.ok ? result.rows as CacheRow[] : [] }
  })
  return listed.rows as FilingVo[]
}

/** 是否可用本地缓存目录代替远端筛选查询。 */
function filingCatalogQuery(query: Query, filters: Query) {
  return Number(query.pageSize || 10) >= 500
    && !filters.mineralSource
    && !filters.recordNumber
    && !filters.category
    && !filters.status
    && !filters.startTime
    && !filters.endTime
}

/** 分页查询矿源备案。 */
async function listFilings(query: Query) {
  const filters = await filingQuery(query)
  if (filingCatalogQuery(query, filters)) {
    const rows = await filingCatalog()
    const page = Number(query.page || 1)
    const pageSize = Number(query.pageSize || 500)
    const start = (page - 1) * pageSize
    return ok({
      list: await filingRows(rows.slice(start, start + pageSize)),
      total: rows.length,
      page,
      pageSize,
    })
  }
  const result = await ruoyiGet<MineralSourceFilingVo>('/wms/mineralSourceFiling/list', pageParams(query, filters))
  return pageOf(result, await filingRows(result.rows as FilingVo[]), query)
}

/** 入库预约：按物料拉取可用矿源备案（listNoPage + itemId）。 */
async function listFilingsByItem(itemId: string) {
  const id = text(itemId).trim()
  if (!id) return fail('缺少物料 id')
  const result = await ruoyiGet<MineralSourceFilingVo>('/wms/mineralSourceFiling/listNoPage', { itemId: idOf(id) ?? id })
  if (!result.ok) return fail(result.message || '矿源备案查询失败')
  const raw = Array.isArray(result.data) ? result.data as FilingVo[] : result.rows as FilingVo[]
  return ok(await filingRows(raw))
}

/** 校验矿源备案附件类型（图片或 PDF）。 */
function filingFileOk(file: Blob, name: string) {
  const type = file.type || ''
  const lower = name.toLowerCase()
  return type.startsWith('image/') || type === 'application/pdf' || lower.endsWith('.pdf') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)
}

/** 从上传接口 data/message 中解析附件路径。 */
function filingUploadPath(data: unknown) {
  const raw = typeof data === 'string'
    ? data.trim()
    : data && typeof data === 'object'
      ? text((data as Row).fileUrl || (data as Row).url || (data as Row).path || (data as Row).fileName).trim()
      : ''
  if (!raw || raw === 'ok' || raw === '操作成功') return ''
  return raw.startsWith('/') || /^https?:/i.test(raw) || /\.[a-z0-9]{2,5}$/i.test(raw) ? raw : ''
}

/** 上传矿源备案附件并返回路径。 */
async function uploadFilingFile(file: Blob) {
  const name = file instanceof File && file.name ? file.name : 'filing.png'
  if (!filingFileOk(file, name)) return fail('附件仅支持图片或 PDF')
  const form = new FormData()
  form.append('file', file, name)
  const result = await ruoyiSend('POST', '/wms/mineralSourceFiling', form)
  if (!result.ok) return fail(result.message || '附件上传失败')
  const path = filingUploadPath(result.data) || filingUploadPath(result.message)
  if (!path) return fail('附件上传未返回路径')
  return ok(path)
}

/** 新建或更新矿源备案。 */
async function saveFiling(id: string | undefined, body: Row) {
  const materialId = text(body.materialId).trim()
  if (!materialId) return fail('请选择物料')
  const [categories, items] = await Promise.all([
    dictOf('wms_item_category'),
    itemCatalogRows(),
  ])
  const material = items.map((row) => itemRow(row, categories)).find((item) => String(item.id) === materialId)
  if (!material) return fail('所选物料不存在，请先在物料档案维护')
  const source = text(material.mineArea || material.source || material.name).trim()
  const originCountry = text(material.originCountry).trim()
  const sourceKind = text(material.cargoType).trim()
  const code = text(body.code).trim()
  const filingDate = dayOnly(body.filingDate)
  const qty = num(body.qty)
  if (!source || !originCountry) return fail('所选物料缺少矿区或原产国，请先在物料档案补全')
  if (!code) return fail('请填写矿源备案编号')
  if (!id && (qty == null || qty <= 0)) return fail('请填写备案数量')
  if (qty != null && qty <= 0) return fail('备案数量须大于 0')
  let fileUrl = text(body.attachment).trim()
  const file = body.__file
  if (file instanceof Blob) {
    const uploaded = await uploadFilingFile(file)
    if (!uploaded.success || !uploaded.data) return fail(uploaded.message || '附件上传失败')
    fileUrl = uploaded.data
  }
  const payload: Partial<MineralSourceFilingBo> & { mineralSource?: string; originCountry?: string } = {
    itemId: (idOf(materialId) ?? materialId) as MineralSourceFilingBo['itemId'],
    mineralSource: source,
    originCountry,
    recordNumber: code,
    hazardousElementsRemark: text(body.harmfulContent).trim(),
  }
  if (sourceKind) payload.category = sourceKind
  if (filingDate) payload.recordTime = filingDate
  if (qty != null) payload.filingsNum = qty
  if (id) payload.id = (idOf(id) ?? id) as MineralSourceFilingBo['id']
  if (fileUrl || id) payload.fileUrl = fileUrl
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/mineralSourceFiling', payload)
  if (!result.ok) return fail(result.message)
  clearFilingCache()
  return ok(true, id ? '已保存' : '备案已创建')
}

/** 导出矿源备案（优先服务端 blob）。 */
async function exportFilings(query: Query) {
  const filters = await filingQuery(query)
  try {
    const response = await ruoyiBlob('/wms/mineralSourceFiling/export', filters)
    const blob = response.data
    const type = blob.type || ''
    if (type.includes('json') || type.includes('text')) {
      const raw = await blob.text()
      try {
        const body = JSON.parse(raw) as { code?: number; msg?: string }
        if (body.code != null && body.code !== 200 && body.code !== 0) return fail(body.msg || '导出失败')
      } catch {
        return ok({ filename: `矿源备案_${new Date().toISOString().slice(0, 10)}.csv`, content: raw })
      }
    }
    const day = new Date().toISOString().slice(0, 10)
    return ok({ filename: `矿源备案_${day}.xlsx`, blob })
  } catch {
    return fail('导出失败')
  }
}

/** 将库存票货行压成矿源备案关联列表行。 */
function filingLotRow(row: Row) {
  return {
    customsNo: text(row.customsNo || row.recordNo),
    prodBatch: text(row.batchNo) || '—',
    consignor: text(row.consignor),
    material: text(row.material),
    cargoType: text(row.cargoType),
    stack: text(row.stackText),
    wet: row.wet ?? '',
    dry: row.dry ?? '',
    inAt: text(row.inDate),
    status: text(row.status),
  }
}

/** 按矿源备案号查询关联票货。 */
async function filingLots(code: string) {
  const recordNumber = text(code).trim()
  if (!recordNumber) return fail('缺少矿源备案号')
  const [result, categories, houses, translates] = await Promise.all([
    ruoyiGet<InventoryVo>('/wms/inventory/listNoPage', { recordNumber }),
    dictOf('wms_item_category'),
    loadHouses(),
    dictOf('wms_translate_type'),
  ])
  if (!result.ok) return fail(brief(result.message) || '票货查询失败')
  const raw = Array.isArray(result.data) ? result.data as InventoryVo[] : result.rows
  const rows = raw.map((row) => inventoryLot(row as Row, categories, houses, translates))
  return ok(rows.map(filingLotRow))
}

/** 导出矿源备案关联票货 CSV。 */
async function exportFilingLots(code: string) {
  const listed = await filingLots(code)
  if (!listed.success || !Array.isArray(listed.data)) return fail(listed.message || '票货查询失败')
  return ok({
    filename: `矿源备案票货_${code}.csv`,
    content: toCsv([
      { key: 'customsNo', label: '报关单号' },
      { key: 'prodBatch', label: '生产批次号' },
      { key: 'consignor', label: '委托方' },
      { key: 'material', label: '物料' },
      { key: 'cargoType', label: '货物类型' },
      { key: 'stack', label: '堆位' },
      { key: 'wet', label: '湿重' },
      { key: 'dry', label: '干重(DMT)' },
      { key: 'inAt', label: '入库时间' },
      { key: 'status', label: '状态' },
    ], listed.data),
  })
}

export { itemRow, uploadFilingFile }

/** 物料与矿源备案路由表 */
export const materialRoutes: Route[] = [
  { method: 'GET', match: '/materials/export', handle: ({ query }) => exportItems(query) },
  { method: 'GET', match: '/materials', handle: ({ query }) => listItems(query) },
  { method: 'POST', match: '/materials', handle: ({ body }) => saveItem(undefined, body) },
  { method: 'PUT', match: /^\/materials\/([^/]+)$/, handle: ({ params, body }) => saveItem(params[0], body) },
  { method: 'DELETE', match: /^\/materials\/([^/]+)$/, handle: ({ params }) => removeItem(params[0]) },
  { method: 'GET', match: '/material-sources/filings/export', handle: ({ query }) => exportFilings(query) },
  { method: 'GET', match: '/material-sources/filings/by-item', handle: ({ query }) => listFilingsByItem(text(query.itemId)) },
  { method: 'GET', match: '/material-sources/filings', handle: ({ query }) => listFilings(query) },
  { method: 'POST', match: '/material-sources/filings', handle: ({ body }) => saveFiling(undefined, body) },
  { method: 'GET', match: /^\/material-sources\/filings\/([^/]+)\/lots\/export$/, handle: ({ params }) => exportFilingLots(params[0]) },
  { method: 'GET', match: /^\/material-sources\/filings\/([^/]+)\/lots$/, handle: ({ params }) => filingLots(params[0]) },
  { method: 'PUT', match: /^\/material-sources\/filings\/([^/]+)$/, handle: ({ params, body }) => saveFiling(params[0], body) },
]
