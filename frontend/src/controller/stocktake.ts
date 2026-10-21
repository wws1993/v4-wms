import type { Route } from '@/api-map/types'
import { fail, ok, toCsv } from '@/api/result'
import { mediaUrl } from '@/api/media'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { brief, dayText, nested, slashDay, text } from '@/controller/shared/coerce'
import { pageParams } from '@/controller/shared/page'
import { areaRows } from '@/controller/shared/catalog'

function fileLabel(path: string) {
  if (!path) return '—'
  const names = path.split(/[、,]/).map((item) => item.trim().split(/[\\/]/).pop() || item.trim()).filter(Boolean)
  return names.join('、') || '—'
}

function checkScope(row: Row, areas: Row[]) {
  const details = Array.isArray(row.details) ? row.details as Row[] : []
  const groups = new Map<string, { name: string; codes: string[]; ids: Set<string> }>()
  const order: string[] = []
  for (const detail of details) {
    const area = nested(detail, 'area')
    const house = nested(area || {}, 'warehouse') || nested(detail, 'warehouse')
    const houseId = text(detail.warehouseId || area?.warehouseId || house?.id)
    const key = houseId || text(house?.warehouseName || house?.warehouseCode)
    if (!key) continue
    if (!groups.has(key)) {
      order.push(key)
      groups.set(key, { name: text(house?.warehouseName || house?.warehouseCode || key), codes: [], ids: new Set() })
    }
    const group = groups.get(key)!
    const named = text(house?.warehouseName || house?.warehouseCode)
    if (named) group.name = named
    const areaId = text(detail.areaId || area?.id)
    if (areaId) group.ids.add(areaId)
    const code = text(area?.areaCode || area?.areaName || detail.areaCode)
    if (code && !group.codes.includes(code)) group.codes.push(code)
  }
  const parts: string[] = []
  for (const key of order) {
    const group = groups.get(key)!
    const owned = areas.filter((area) => text(area.warehouseId || nested(area, 'warehouse')?.id) === key)
    const ownedIds = owned.map((area) => text(area.id)).filter(Boolean)
    const complete = ownedIds.length > 0 && ownedIds.every((id) => group.ids.has(id))
    if (complete) parts.push(group.name)
    else parts.push(...group.codes)
  }
  return parts.filter(Boolean).join(', ') || '—'
}

function checkView(row: Row, areas: Row[]) {
  const attachment = text(row.attachmentPath)
  const paths = attachment.split(/[、,]/).map((item) => item.trim()).filter(Boolean)
  return {
    id: text(row.checkOrderNo || row.id),
    operator: text(row.checkUser || row.createBy) || '—',
    time: slashDay(row.planDate) || slashDay(row.createTime) || '—',
    areaText: checkScope(row, areas),
    attachment: fileLabel(attachment),
    attachmentUrls: paths.map((item) => mediaUrl(item)),
    attachmentNames: paths.map((item) => item.split(/[\\/]/).pop() || item),
    remark: text(row.remark),
  }
}

async function listCheckOrders(query: Query) {
  const day = text(query.date).slice(0, 10)
  const result = await ruoyiGet('/wms/checkOrder/list', pageParams(query, {
    checkOrderNo: query.keyword || undefined,
    checkUser: query.person || undefined,
    planDate: day ? `${day} 00:00:00` : undefined,
  }))
  if (!result.ok) return fail(brief(result.message))
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  let source = result.rows
  let total = result.total
  if (source.length > pageSize) {
    total = Math.max(total, source.length)
    source = source.slice((page - 1) * pageSize, page * pageSize)
  }
  const areas = await areaRows()
  return ok({ list: source.map((row) => checkView(row, areas)), total, page, pageSize }, result.message)
}

async function createCheckOrder(body: Row) {
  const uploads = Array.isArray(body.__files) ? body.__files.filter((file): file is File => file instanceof File) : []
  if (!uploads.length) return fail('请上传附件')
  const areas = Array.isArray(body.areas) ? body.areas as Row[] : []
  const picked = areas.filter((item) => text(item.warehouseId) && text(item.areaId))
  if (!picked.length) return fail('请选择盘点区域')
  const day = dayText(body.date) || new Date().toISOString().slice(0, 10)
  const form = new FormData()
  form.append('planDate', `${day} 00:00:00`)
  const person = text(body.person).trim()
  if (person) form.append('checkUser', person)
  picked.forEach((item, index) => {
    form.append(`details[${index}].warehouseId`, text(item.warehouseId))
    form.append(`details[${index}].areaId`, text(item.areaId))
  })
  for (const file of uploads) form.append('file', file, file.name || 'attachment')
  const result = await ruoyiSend('POST', '/wms/checkOrder', form)
  return result.ok ? ok(true, '盘点记录已提交') : fail(brief(result.message))
}

async function exportCheckOrders(query: Query) {
  const pageSize = 200
  const rows: Row[] = []
  const filters: Query = { ...query }
  delete filters.page
  delete filters.pageSize
  for (let page = 1; page <= 100; page += 1) {
    const listed = await listCheckOrders({ ...filters, page, pageSize })
    if (!listed.success || !listed.data) return fail(listed.message || '导出失败')
    const data = listed.data as { list?: Row[]; total?: number }
    const list = data.list || []
    rows.push(...list)
    const total = Number(data.total || 0)
    if (!list.length || rows.length >= total) break
  }
  const day = new Date().toISOString().slice(0, 10)
  return ok({
    filename: `盘点单_${day}.csv`,
    content: toCsv([
      { key: 'id', label: '盘点单号' },
      { key: 'operator', label: '盘点人' },
      { key: 'time', label: '盘点日期' },
      { key: 'areaText', label: '盘点区域' },
      { key: 'attachment', label: '附件' },
    ], rows.map((row) => ({
      id: row.id,
      operator: row.operator,
      time: row.time,
      areaText: row.areaText,
      attachment: row.attachment,
    }))),
  })
}

export const stocktakeRoutes: Route[] = [
  { method: 'GET', match: '/stocktakes/export', handle: ({ query }) => exportCheckOrders(query) },
  { method: 'GET', match: '/stocktakes', handle: ({ query }) => listCheckOrders(query) },
  { method: 'POST', match: '/stocktakes', handle: ({ body }) => createCheckOrder(body) },
]
