import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { areaPoints, brief, cellsBody, hourText, idOf, nested, num, text } from '@/controller/shared/coerce'
import { pageParams, range } from '@/controller/shared/page'
import { clearDirectory } from '@/controller/shared/directory'
import { dictOf, labelOf } from '@/controller/shared/dict'
import { areaRows, findArea, findMerchant } from '@/controller/shared/catalog'
import { locateInventory } from '@/controller/inventory'
import type { AreaVo, MovementOrderBo, MovementOrderVo } from '@/typings/openapi'

/** 移库单 Vo + 运行时扩展 */
type MovementRow = MovementOrderVo & Row
type LongId = number | string
type MovementOrderAreaRequest = {
  areaId: LongId
  warehouseId: LongId
  dryWeight: number
  areas: Row[]
}
type MovementOrderRequest = Omit<Partial<MovementOrderBo>,
  'id' | 'inventoryId' | 'sourceWarehouseId' | 'sourceAreaId' | 'targetWarehouseId' | 'targetAreaId' | 'movementOrderAreas'> & {
  inventoryId: LongId
  sourceWarehouseId: LongId
  sourceAreaId?: LongId
  targetWarehouseId: LongId
  targetAreaId?: LongId
  movementOrderAreas: MovementOrderAreaRequest[]
} & Row

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
async function buildMovementBo(body: Row, seq = 0): Promise<{ ok: true; data: MovementOrderRequest; orderNo: string } | { ok: false; message: string; batchNo: string }> {
  const batchNo = text(body.batchNo)
  const source = await locateInventory(text(body.inventoryId) || batchNo)
  if (!source) return { ok: false, message: '未找到在库批次', batchNo }
  const sourceWarehouseId = idOf(source.warehouseId)
  if (sourceWarehouseId == null) return { ok: false, message: '源仓库不能为空', batchNo }
  const inventoryId = idOf(source.id)
  if (inventoryId == null) return { ok: false, message: '库存 ID 无效', batchNo }
  const sourceAreaId = idOf(source.areaId)
  const scene = text(body.scene) || '整票移位'
  const partial = scene === '拆票移位'
  const qty = partial
    ? num(body.weight)
    : (num(body.weight) ?? num(source.dryWeight) ?? num(source.quantity) ?? num(source.remainQuantity))
  if (!(qty && qty > 0)) return { ok: false, message: partial ? '请填写移库重量' : '该票没有可移重量', batchNo }
  const requestedTargets: Row[] = Array.isArray(body.movementOrderAreas) ? body.movementOrderAreas as Row[] : []
  if (!requestedTargets.length) {
    requestedTargets.push({
      areaId: body.areaId,
      stackCode: body.toStack,
      dryWeight: qty,
      areas: Array.isArray(body.areas) ? body.areas : cellsBody(body.cells),
    })
  }
  const movementOrderAreas: MovementOrderAreaRequest[] = []
  const seenTargets = new Set<string>()
  for (const requested of requestedTargets) {
    const target = await findArea(requested.areaId) || await findArea(requested.stackCode)
    if (!target) return { ok: false, message: `目标堆位 ${text(requested.stackCode || requested.areaId)} 不存在`, batchNo }
    const areaId = idOf(target.id)
    const warehouseId = idOf(target.warehouseId)
    if (areaId == null) return { ok: false, message: `目标堆位 ${text(requested.stackCode)} 缺少有效堆位 ID`, batchNo }
    if (warehouseId == null) return { ok: false, message: `目标堆位 ${text(requested.stackCode)} 没有所属仓库`, batchNo }
    const key = String(areaId)
    if (seenTargets.has(key)) return { ok: false, message: `目标堆位 ${text(requested.stackCode)} 重复`, batchNo }
    seenTargets.add(key)
    const dryWeight = num(requested.dryWeight)
    if (!(dryWeight && dryWeight > 0)) return { ok: false, message: `请填写目标堆位 ${text(requested.stackCode)} 的移入干重`, batchNo }
    const points = Array.isArray(requested.areas) ? areaPoints(requested.areas) : cellsBody(requested.cells)
    const areas = points.map((point) => ({ row: num(point.row), column: num(point.column) }))
    if (!areas.length) return { ok: false, message: `请为目标堆位 ${text(requested.stackCode)} 选择网格`, batchNo }
    movementOrderAreas.push({ areaId, warehouseId, dryWeight, areas })
  }
  const allocatedWeight = movementOrderAreas.reduce((sum, item) => sum + Number(item.dryWeight), 0)
  if (Math.abs(allocatedWeight - qty) > 0.000001) {
    return { ok: false, message: '各目标堆位干重合计必须等于本次移库重量', batchNo }
  }
  const firstTarget = movementOrderAreas[0]
  const targetWarehouseId = idOf(firstTarget.warehouseId)
  const targetAreaId = idOf(firstTarget.areaId)
  if (targetWarehouseId == null || targetAreaId == null) return { ok: false, message: '目标堆位没有有效的仓库和堆位 ID', batchNo }
  const orderNo = movementOrderNo(seq)
  const from = clockParts(body.timeFrom)
  const to = clockParts(body.timeTo)
  const sourceAreas = Array.isArray(body.sourceAreas) ? areaPoints(body.sourceAreas) : cellsBody(body.sourceCells)
  return {
    ok: true,
    orderNo,
    data: {
      movementOrderNo: orderNo,
      movementType: movementTypeOf(scene),
      inventoryId,
      sourceWarehouseId,
      sourceAreaId,
      targetWarehouseId,
      targetAreaId,
      quantity: qty,
      totalQuantity: qty,
      remark: scene,
      movementOrderAreas,
      ...(partial && sourceAreas.length ? { sourceAreas } : {}),
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
  clearDirectory('inventories')
  clearDirectory('inventoryDetails')
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
  clearDirectory('inventories')
  clearDirectory('inventoryDetails')
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
  areas: (AreaVo | Row)[],
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
