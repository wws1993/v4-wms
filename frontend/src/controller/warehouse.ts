import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { byOrderNum, flagLabel, flagStatus, idOf, num, orderNumOf, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { dictOf, dictValue } from '@/controller/shared/dict'
import {
  areaLabelText,
  clearAreaCache,
  clearWarehouseCache,
  findWarehouseId,
  warehouseRows,
} from '@/controller/shared/catalog'
import { savedId, statusReply } from '@/controller/shared/reply'
import { gridsFromPlan } from '@/controller/floor'
import { readDirectory } from '@/controller/shared/directory'
import type { AreaBo, AreaVo, WarehouseBo, WarehouseVo } from '@/typings/openapi'

/** 将仓库 Vo 映射为列表行。 */
function warehouseRow(row: WarehouseVo) {
  const occupy = text(row.occupy)
  const matched = occupy.match(/(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)/)
  return {
    id: text(row.id),
    code: text(row.warehouseCode || row.warehouseName),
    orderNum: orderNumOf(row.orderNum),
    capacity: row.storageCapacity,
    area: row.area,
    stackCount: row.areaNum ?? 0,
    used: matched ? Number(matched[1]) : undefined,
    rate: matched ? Number(matched[2]) : num(occupy.replace('%', '')),
    occupyText: matched ? '' : occupy,
    status: flagLabel(row.status),
  }
}

/** 将堆位 Vo 映射为列表行。 */
function stackRow(row: AreaVo) {
  const house = row.warehouse
  const warehouseId = text(row.warehouseId || house?.id)
  return {
    id: text(row.id),
    code: text(row.areaCode || row.areaName),
    orderNum: orderNumOf(row.orderNum),
    warehouse: text(house?.warehouseCode || house?.warehouseName || warehouseId),
    warehouseId,
    areaLabel: text(row.areaIdentification),
    grid: '',
    capacity: row.inventoryCapacity,
    status: flagLabel(row.status),
  }
}

/** 删除仓库。 */
async function removeWarehouse(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/warehouse/${id}`)
  if (result.ok) {
    clearWarehouseCache()
    clearAreaCache()
  }
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

/** 删除堆位。 */
async function removeStack(id: string) {
  const result = await ruoyiSend('DELETE', `/wms/area/${id}`)
  if (result.ok) clearAreaCache()
  return result.ok ? ok(true, '已删除') : fail(result.message)
}

/** 新建或更新仓库。 */
async function saveWarehouse(id: string | undefined, body: Row) {
  const code = text(body.code)
  const payload: Partial<WarehouseBo> = {
    warehouseCode: code,
    warehouseName: code,
    storageCapacity: num(body.capacity),
    area: num(body.area),
    status: flagStatus(body.status),
  }
  const orderNum = orderNumOf(body.orderNum)
  if (orderNum != null) payload.orderNum = orderNum
  if (id) payload.id = idOf(id) as WarehouseBo['id']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/warehouse', payload)
  if (result.ok) {
    clearWarehouseCache()
    clearAreaCache()
  }
  return result.ok ? ok({ id: savedId(result) }, '已保存') : fail(result.message)
}

/** 新建或更新堆位。 */
async function saveStack(id: string | undefined, body: Row) {
  const given = text(body.warehouseId).trim()
  const warehouseId = given ? idOf(given) : await findWarehouseId(body.warehouse)
  if (!warehouseId) return fail('请选择已存在的仓库')
  const code = text(body.code)
  const payload: Partial<AreaBo> = {
    areaCode: code,
    areaName: code,
    warehouseId: warehouseId as AreaBo['warehouseId'],
    inventoryCapacity: num(body.capacity) as AreaBo['inventoryCapacity'],
    areaIdentification: text(body.areaLabel) || undefined,
    orderNum: orderNumOf(body.orderNum) ?? 0,
  }
  const status = text(body.status)
  if (status) payload.status = flagStatus(status)
  else if (!id) payload.status = '0'
  if (id) payload.id = idOf(id) as AreaBo['id']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/wms/area', payload)
  if (result.ok) clearAreaCache()
  return result.ok ? ok({ id: savedId(result) }, '已保存') : fail(result.message)
}

/** 仓库与堆位路由表 */
export const warehouseRoutes: Route[] = [
  { method: 'GET', match: '/warehouses/catalog', handle: async () => {
    const rows = byOrderNum((await warehouseRows()).map(warehouseRow))
    return ok({ list: rows, total: rows.length, page: 1, pageSize: rows.length || 1 })
  } },
  { method: 'GET', match: '/warehouses/stacks/catalog', handle: async () => {
    const listed = await readDirectory<AreaVo>('areas')
    if (!listed.ok) return fail('堆位目录读取失败')
    const [houses, grids, areaNames] = await Promise.all([
      warehouseRows(),
      gridsFromPlan(),
      dictOf('wms_area_identification'),
    ])
    const rows = byOrderNum(listed.rows.map(stackRow).map((row) => {
      const house = !row.warehouse || /^\d+$/.test(row.warehouse)
        ? houses.find((item) => text(item.id) === text(row.warehouseId))
        : undefined
      const grid = grids.get(row.id) || grids.get(row.code)
      return {
        ...row,
        areaLabel: areaLabelText(row.areaLabel, areaNames),
        warehouse: house ? text(house.warehouseCode || house.warehouseName || row.warehouse) : row.warehouse,
        grid: grid?.grid || row.grid,
        gridCols: grid?.gridCols,
        gridRows: grid?.gridRows,
      }
    }))
    return ok(rows)
  } },
  { method: 'GET', match: '/warehouses', handle: async ({ query }) => {
    const result = await ruoyiGet<WarehouseVo>('/wms/warehouse/list', pageParams(query, {
      warehouseCode: query.keyword || undefined,
      status: query.status ? flagStatus(query.status) : undefined,
    }))
    return pageOf(result, byOrderNum(result.rows.map(warehouseRow)), query)
  } },
  { method: 'POST', match: '/warehouses', handle: ({ body }) => saveWarehouse(undefined, body) },
  { method: 'PUT', match: /^\/warehouses\/([^/]+)\/status$/, handle: async ({ params, body: payload }) => {
    const saved = await saveWarehouse(params[0], payload)
    return statusReply(saved, payload.status)
  } },
  { method: 'PUT', match: /^\/warehouses\/([^/]+)$/, handle: ({ params, body }) => saveWarehouse(params[0], body) },
  { method: 'DELETE', match: /^\/warehouses\/([^/]+)$/, handle: ({ params }) => removeWarehouse(params[0]) },
  { method: 'GET', match: '/warehouses/stacks', handle: async ({ query }) => {
    const keyword = text(query.keyword).trim()
    const areaLabel = text(query.areaLabel).trim()
    const [warehouseIdValue, areaIdentification] = await Promise.all([
      query.warehouse ? findWarehouseId(query.warehouse) : Promise.resolve(undefined),
      areaLabel ? dictValue('wms_area_identification', areaLabel) : Promise.resolve(undefined),
    ])
    const result = await ruoyiGet<AreaVo>('/wms/area/list', pageParams(query, {
      warehouseId: warehouseIdValue ?? undefined,
      areaCode: keyword || undefined,
      areaIdentification: areaIdentification || undefined,
    }))
    if (!result.ok) return fail(result.message)
    const [houses, grids, areaNames] = await Promise.all([
      warehouseRows(),
      gridsFromPlan(),
      dictOf('wms_area_identification'),
    ])
    const rows = byOrderNum(result.rows.map(stackRow).map((row) => {
      const house = !row.warehouse || /^\d+$/.test(row.warehouse)
        ? houses.find((item) => text(item.id) === text(row.warehouseId))
        : undefined
      const grid = grids.get(row.id) || grids.get(row.code)
      return {
        ...row,
        areaLabel: areaLabelText(row.areaLabel, areaNames),
        warehouse: house ? text(house.warehouseCode || house.warehouseName || row.warehouse) : row.warehouse,
        grid: grid?.grid || row.grid,
        gridCols: grid?.gridCols,
        gridRows: grid?.gridRows,
      }
    }))
    return pageOf(result, rows, query)
  } },
  { method: 'POST', match: '/warehouses/stacks', handle: ({ body }) => saveStack(undefined, body) },
  { method: 'PUT', match: /^\/warehouses\/stacks\/([^/]+)\/status$/, handle: async ({ params, body: payload }) => {
    const saved = await saveStack(params[0], payload)
    return statusReply(saved, payload.status)
  } },
  { method: 'POST', match: /^\/warehouses\/stacks\/([^/]+)\/inspect$/, handle: async () => fail('后端未提供查验完成接口') },
  { method: 'PUT', match: /^\/warehouses\/stacks\/([^/]+)$/, handle: ({ params, body }) => saveStack(params[0], body) },
  { method: 'DELETE', match: /^\/warehouses\/stacks\/([^/]+)$/, handle: ({ params }) => removeStack(params[0]) },
]
