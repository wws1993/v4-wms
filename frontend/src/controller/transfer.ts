import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, cellsBody, hourText, idOf, nested, num, text } from '@/controller/shared/coerce'
import { pageParams, range } from '@/controller/shared/page'
import { dictOf, labelOf } from '@/controller/shared/dict'
import { areaRows, findArea, findMerchant } from '@/controller/shared/catalog'
import { locateInventory } from '@/controller/inventory'
import type { MovementOrderBo, MovementOrderVo } from '@/typings/openapi'

/** 移库单 Vo + 运行时扩展 */
type MovementRow = MovementOrderVo & Row

/** 生成移库单号。 */
function movementOrderNo(seq = 0) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return seq > 0 ? `YK${stamp}${String(seq).padStart(3, '0')}` : `YK${stamp}`
}

/** 拆分日期时间字符串为 date / hour。 */
function clockParts(value: unknown) {
  const raw = text(value).trim()
  if (!raw) return { date: undefined as string | undefined, hour: undefined as string | undefined }
  const [date, clock] = raw.split(' ')
  const hour = (clock || '00').slice(0, 2).padStart(2, '0')
  if (!date) return { date: undefined, hour: undefined }
  return { date, hour: `${hour}:00:00` }
}

/** 场景文案转移库类型编码。 */
function movementTypeOf(scene: string) {
  if (scene === '拆票移位') return 1
  if (scene === '批量移位' || scene === '批量移库') return 2
  return 0
}

/** 组装移库 Bo 请求体。 */
async function buildMovementBo(body: Row, seq = 0): Promise<{ ok: true; data: Partial<MovementOrderBo> & Row; orderNo: string } | { ok: false; message: string; batchNo: string }> {
  const batchNo = text(body.batchNo)
  const source = await locateInventory(text(body.inventoryId) || batchNo)
  if (!source) return { ok: false, message: '未找到在库批次', batchNo }
  const target = await findArea(body.areaId) || await findArea(body.toStack)
  if (!target) return { ok: false, message: '目标堆位不存在', batchNo }
  const sourceWarehouseId = idOf(source.warehouseId)
  const targetWarehouseId = idOf(target.warehouseId)
  if (sourceWarehouseId == null) return { ok: false, message: '源仓库不能为空', batchNo }
  if (targetWarehouseId == null) return { ok: false, message: '目标堆位没有所属仓库', batchNo }
  const scene = text(body.scene) || '整票移位'
  const partial = scene === '拆票移位'
  const qty = partial
    ? num(body.weight)
    : (num(body.weight) ?? num(source.dryWeight) ?? num(source.quantity) ?? num(source.remainQuantity))
  if (!(qty && qty > 0)) return { ok: false, message: partial ? '请填写移库重量' : '该票没有可移重量', batchNo }
  const orderNo = movementOrderNo(seq)
  const from = clockParts(body.timeFrom)
  const to = clockParts(body.timeTo)
  const areas = cellsBody(body.cells)
  return {
    ok: true,
    orderNo,
    data: {
      movementOrderNo: orderNo,
      movementType: movementTypeOf(scene),
      inventoryId: idOf(source.id),
      sourceWarehouseId,
      sourceAreaId: idOf(source.areaId),
      targetWarehouseId,
      targetAreaId: idOf(target.id),
      quantity: qty,
      totalQuantity: qty,
      remark: scene,
      ...(areas.length ? { areas } : {}),
      ...(from.date ? { startDate: from.date, startHour: from.hour } : {}),
      ...(to.date ? { endDate: to.date, endHour: to.hour } : {}),
    },
  }
}

/** 创建单条移库单。 */
async function createMovement(body: Row) {
  const built = await buildMovementBo(body)
  if (!built.ok) return fail(built.message)
  const result = await ruoyiSend('POST', '/wms/movementOrder', built.data)
  if (!result.ok) return fail(brief(result.message))
  return ok({ orderNo: built.orderNo, id: text((result.data as Row | undefined)?.id || result.data) }, '移库单已生成')
}

/** 批量创建移库单。 */
async function createMovements(body: Row) {
  const rawItems: Row[] = Array.isArray(body.items) ? body.items as Row[]
    : Array.isArray(body.list) ? body.list as Row[]
      : (Array.isArray(body.batchNos) ? body.batchNos.map((batchNo) => ({ ...body, batchNo: String(batchNo) })) : [])
  if (!rawItems.length) return fail('请勾选矿批次')
  const sharedFrom = text(body.startDate)
    ? { date: text(body.startDate), hour: text(body.startHour) || '08:00:00' }
    : clockParts(body.timeFrom)
  const sharedTo = text(body.endDate)
    ? { date: text(body.endDate), hour: text(body.endHour) || '12:00:00' }
    : clockParts(body.timeTo)
  const sharedTimeFrom = sharedFrom.date ? `${sharedFrom.date} ${(sharedFrom.hour || '08:00:00').slice(0, 2)}` : ''
  const sharedTimeTo = sharedTo.date ? `${sharedTo.date} ${(sharedTo.hour || '12:00:00').slice(0, 2)}` : ''
  const list: Row[] = []
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index]
    if (!text(item.toStack) && !text(item.areaId)) return fail(`${text(item.batchNo) || '所选批次'}：请选择目标堆位`)
    const built = await buildMovementBo({
      ...item,
      timeFrom: text(item.timeFrom) || sharedTimeFrom || undefined,
      timeTo: text(item.timeTo) || sharedTimeTo || undefined,
    }, index + 1)
    if (!built.ok) return fail(`${built.batchNo || '所选批次'}：${built.message}`)
    list.push(built.data)
  }
  const result = await ruoyiSend('POST', '/wms/movementOrder/batch', {
    list,
    ...(sharedFrom.date ? { startDate: sharedFrom.date, startHour: sharedFrom.hour } : {}),
    ...(sharedTo.date ? { endDate: sharedTo.date, endHour: sharedTo.hour } : {}),
  })
  if (!result.ok) return fail(brief(result.message))
  return ok({ count: list.length }, `已生成 ${list.length} 条移库单`)
}

/** 分页查询移库单。 */
async function listMovements(query: Query) {
  const [statuses, categories, areas, consignor] = await Promise.all([
    dictOf('wms_movement_status'),
    dictOf('wms_item_category'),
    areaRows(),
    query.consignor ? findMerchant(query.consignor) : Promise.resolve(undefined),
  ])
  const result = await ruoyiGet<MovementOrderVo>('/wms/movementOrder/list', pageParams(query, {
    consignorId: consignor ? idOf(consignor.id) : undefined,
    movementOrderNo: text(query.keyword).trim() || undefined,
    remark: text(query.scene).trim() || undefined,
    ...range(query),
  }))
  if (!result.ok) return fail(brief(result.message))
  const rows = result.rows.map((row) => movementView(row as MovementRow, areas, statuses, categories))
  return ok({
    list: rows,
    total: result.total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 10),
  })
}

/** 将移库单 Vo 映射为列表行。 */
function movementView(
  row: MovementRow | Row,
  areas: Row[],
  statuses: { label: string; value: string }[],
  categories: { label: string; value: string }[],
): Row {
  const sourceArea = nested(row, 'sourceArea')
  const targetArea = nested(row, 'targetArea')
  const sourceId = text(row.sourceAreaId || sourceArea?.id)
  const targetId = text(row.targetAreaId || targetArea?.id)
  const orderNo = text(row.movementOrderNo)
  const source = areas.find((area) => text(area.id) === sourceId)
  const target = areas.find((area) => text(area.id) === targetId)
  const detail = Array.isArray(row.details) ? row.details[0] as Row : undefined
  const item = nested(row, 'item') || (detail ? nested(detail, 'item') : undefined)
  const consignor = nested(row, 'consignor')
  const time = movementHour(row.startDate, row.startHour, row.createTime)
  const end = movementHour(row.endDate, row.endHour, row.updateTime) || time
  return {
    id: text(row.id),
    orderNo: orderNo || text(row.id),
    scene: text(row.remark) || '整票移位',
    weight: row.totalQuantity ?? row.quantity ?? detail?.quantity ?? '',
    status: labelOf(statuses, row.movementOrderStatus) || '已移库',
    consignor: text(consignor?.merchantName || row.consignorName),
    inventoryId: text(row.inventoryId),
    customsNo: text(row.recordNo || detail?.recordNo),
    prodBatch: text(row.batchNo || row.batch_no || detail?.batchNo),
    material: text(item?.itemName || row.itemName),
    cargoType: labelOf(categories, item?.itemCategory ?? row.itemCategory ?? detail?.itemCategory)
      || text(item?.itemCategory || row.cargoType || row.itemCategory || detail?.itemCategory),
    fromStack: text(sourceArea?.areaCode || sourceArea?.areaName || source?.areaCode || source?.areaName || sourceId),
    toStack: text(targetArea?.areaCode || targetArea?.areaName || target?.areaCode || target?.areaName || targetId),
    timeFrom: time,
    timeTo: end,
  }
}

/** 移库时间只到小时。优先用开始/结束的日期和小时，没有时再从完整时间里取到时。 */
function movementHour(date: unknown, hour: unknown, fallback: unknown) {
  const day = text(date).replace('T', ' ').slice(0, 10)
  const clock = text(hour).trim()
  const mark = clock.slice(0, 2)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}$/.test(mark)) return `${day} ${mark}时`
  return hourText(fallback)
}

/** 移库单路由表 */
export const transferRoutes: Route[] = [
  { method: 'GET', match: '/transfers', handle: ({ query }) => listMovements(query) },
  { method: 'POST', match: '/transfers', handle: ({ body }) => createMovement(body) },
  { method: 'POST', match: '/transfers/batch', handle: ({ body }) => createMovements(body) },
]
