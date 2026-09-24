import type { RoleKey } from '@/types'
import { db, nextId, type Row } from './db'
import { daysBefore, fail, filled, inRange, includes, nowText, ok, pageOf, toCsv } from './util'

type Query = Record<string, unknown>

interface Ctx {
  params: Record<string, string>
  query: Query
  body: Record<string, unknown>
}

function operator() {
  try {
    const user = JSON.parse(sessionStorage.getItem('wms_auth') || 'null') as { name?: string; roleKey?: string } | null
    return { name: user?.name || '系统管理员', customs: user?.roleKey === 'customs' ? '是' : '否' }
  } catch {
    return { name: '系统管理员', customs: '否' }
  }
}

function audit(partial: Record<string, unknown>) {
  const who = operator()
  db.audits.unshift({
    id: nextId('log'),
    time: nowText(),
    operator: who.name,
    ip: '127.0.0.1',
    customsAccount: who.customs,
    ...partial,
  })
}

function findIndex(list: Row[], id: string) {
  return list.findIndex((row) => row.id === id)
}

function syncWarehouse(code: string) {
  const house = db.warehouses.find((row) => row.code === code)
  if (!house) return
  const stacks = db.stacks.filter((row) => row.warehouse === code)
  house.stackCount = stacks.length
}

function buildAlerts() {
  const params = db.params
  const list: Row[] = []
  db.warehouses.forEach((house) => {
    if (Number(house.rate) >= params.capacityWarn) {
      list.push({
        id: `cap-${house.id}`,
        type: '库容',
        target: String(house.code),
        detail: `${house.code}占用${house.rate}%，已达 ${params.capacityWarn}% 阈值`,
        time: nowText().slice(0, 10),
        link: '/warehouses',
      })
    }
  })
  db.inventory.forEach((row) => {
    if (row.status !== '在库' || row.cargoType === '混成品') return
    const age = daysBefore(String(row.inDate))
    if (age >= params.ageWarn) {
      list.push({
        id: `age-${row.id}`,
        type: '库龄',
        target: String(row.batchNo),
        detail: `${row.batchNo} 原料在库 ${age} 天，超过 ${params.ageWarn} 天`,
        time: String(row.inDate),
        link: '/inventory',
      })
    }
    if (row.warehouse === '码头仓库' && age >= params.dockDays) {
      list.push({
        id: `dock-${row.id}`,
        type: '码头超期',
        target: String(row.batchNo),
        detail: `码头仓库 ${row.batchNo} 已存放 ${age} 天，超过 ${params.dockDays} 天`,
        time: String(row.inDate),
        link: '/inventory',
      })
    }
  })
  db.filings.forEach((row) => {
    if (Number(row.usage) >= params.filingUsageWarn) {
      list.push({
        id: `filing-${row.id}`,
        type: '备案用量',
        target: String(row.code),
        detail: `${row.source} 备案用量 ${row.usage}%，达到 ${params.filingUsageWarn}%`,
        time: String(row.filingDate),
        link: '/materials',
      })
    }
  })
  return list
}

const routes: { method: string; regex: RegExp; keys: string[]; fn: (ctx: Ctx) => ReturnType<typeof ok> | ReturnType<typeof fail> }[] = []

function route(method: string, pattern: string, fn: (ctx: Ctx) => ReturnType<typeof ok> | ReturnType<typeof fail>) {
  const keys: string[] = []
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_m, key) => {
    keys.push(key)
    return '([^/]+)'
  }) + '$')
  routes.push({ method, regex, keys, fn })
}

route('POST', '/auth/login', ({ body }) => {
  const user = db.users.find((item) => item.username === body.username && item.password === body.password && item.status === '启用')
  if (!user) return fail('账号或密码不正确')
  const roleKey = user.roleKey
  return ok({
    id: user.id,
    username: user.username,
    name: user.name,
    roleKey,
    roleName: user.roleName,
    pages: db.rolePerms[roleKey].slice(),
  }, '登录成功')
})

route('POST', '/auth/logout', () => ok(true, '已退出'))

route('GET', '/auth/users', ({ query }) => ok(pageOf(db.users.map(({ password: _password, ...rest }) => rest), query, (row) => {
  return includes(row.username, query.keyword) || includes(row.name, query.keyword)
})))

route('POST', '/auth/users', ({ body }) => {
  if (db.users.some((item) => item.username === body.username)) return fail('账号已存在')
  const roleKey = String(body.roleKey || 'warehouse') as RoleKey
  const roleName = roleKey === 'admin' ? '系统管理员' : roleKey === 'customs' ? '关务员' : '仓管员'
  const row: Row = { id: nextId('u'), username: body.username, password: body.password || '123456', name: body.name, roleKey, roleName, phone: body.phone || '', status: body.status || '启用' }
  db.users.unshift(row as (typeof db.users)[number])
  audit({ module: '系统设置', action: '注册账号', bizNo: row.username, before: '—', after: roleName })
  const { password: _password, ...safe } = row
  return ok(safe, '账号已创建')
})

route('PUT', '/auth/users/:id', ({ params, body }) => {
  const index = findIndex(db.users, params.id)
  if (index < 0) return fail('账号不存在')
  const prev = { ...db.users[index] }
  Object.assign(db.users[index], body, { id: prev.id, username: prev.username, password: prev.password })
  audit({ module: '系统设置', action: '修改账号', bizNo: prev.username, before: String(prev.status), after: String(db.users[index].status) })
  return ok(true, '已保存')
})

route('GET', '/roles/permissions', () => ok(db.rolePerms))

route('PUT', '/roles/:id/permissions', ({ params, body }) => {
  const role = params.id as RoleKey
  if (!db.rolePerms[role]) return fail('角色不存在')
  db.rolePerms[role] = Array.isArray(body.pages) ? body.pages.map(String) : []
  audit({ module: '系统设置', action: '调整权限', bizNo: role, before: '菜单权限', after: db.rolePerms[role].join('、') })
  return ok(db.rolePerms[role], '权限已保存')
})

route('GET', '/settings/params', () => ok({ ...db.params }))

route('PUT', '/settings/params', ({ body }) => {
  const before = JSON.stringify(db.params)
  db.params = {
    capacityWarn: Number(body.capacityWarn ?? db.params.capacityWarn),
    ageWarn: Number(body.ageWarn ?? db.params.ageWarn),
    dockDays: Number(body.dockDays ?? db.params.dockDays),
    filingUsageWarn: Number(body.filingUsageWarn ?? db.params.filingUsageWarn),
    qualities: String(body.qualities ?? db.params.qualities),
  }
  audit({ module: '系统设置', action: '修改参数', bizNo: 'params', before, after: JSON.stringify(db.params) })
  return ok(db.params, '参数已保存')
})

route('GET', '/warehouses/stacks', ({ query }) => ok(pageOf(db.stacks, query, (row) => {
  if (filled(query.warehouse) && row.warehouse !== query.warehouse) return false
  if (filled(query.areaLabel) && row.areaLabel !== query.areaLabel) return false
  return includes(row.code, query.keyword)
})))

route('POST', '/warehouses/stacks', ({ body }) => {
  const row: Row = { id: nextId('s'), code: body.code, warehouse: body.warehouse, areaLabel: body.areaLabel, grid: '—', capacity: Number(body.capacity || 0), status: body.status || '启用' }
  db.stacks.unshift(row)
  syncWarehouse(String(row.warehouse))
  audit({ module: '堆位管理', action: '新建堆位', bizNo: row.code, before: '—', after: String(row.areaLabel) })
  return ok(row, '堆位已创建')
})

route('PUT', '/warehouses/stacks/:id', ({ params, body }) => {
  const index = findIndex(db.stacks, params.id)
  if (index < 0) return fail('堆位不存在')
  const prev = { ...db.stacks[index] }
  const { grid: _grid, ...rest } = body
  Object.assign(db.stacks[index], rest, { id: prev.id, grid: prev.grid })
  if (prev.areaLabel !== db.stacks[index].areaLabel) {
    audit({ module: '堆位管理', action: '片区标识变更', bizNo: prev.code, before: String(prev.areaLabel), after: String(db.stacks[index].areaLabel) })
  }
  syncWarehouse(String(prev.warehouse))
  syncWarehouse(String(db.stacks[index].warehouse))
  return ok(db.stacks[index], '已保存')
})

route('GET', '/warehouses', ({ query }) => ok(pageOf(db.warehouses, query, (row) => {
  if (filled(query.status) && row.status !== query.status) return false
  return includes(row.code, query.keyword)
})))

route('POST', '/warehouses', ({ body }) => {
  if (db.warehouses.some((row) => row.code === body.code)) return fail('仓库编号已存在')
  const row: Row = { id: nextId('wh'), code: body.code, capacity: Number(body.capacity || 0), area: Number(body.area || 0), stackCount: 0, used: 0, rate: 0, status: body.status || '启用' }
  db.warehouses.unshift(row)
  audit({ module: '仓位管理', action: '新建仓库', bizNo: row.code, before: '—', after: `库容 ${row.capacity} / 面积 ${row.area}` })
  return ok(row, '仓库已创建')
})

route('PUT', '/warehouses/:id', ({ params, body }) => {
  const index = findIndex(db.warehouses, params.id)
  if (index < 0) return fail('仓库不存在')
  const prev = db.warehouses[index]
  prev.capacity = Number(body.capacity ?? prev.capacity)
  prev.area = Number(body.area ?? prev.area)
  prev.status = body.status ?? prev.status
  prev.rate = prev.capacity ? Math.round((Number(prev.used) / Number(prev.capacity)) * 100) : 0
  audit({ module: '仓位管理', action: '编辑仓库', bizNo: prev.code, before: '档案', after: `面积 ${prev.area}㎡（不参与占用）` })
  return ok(prev, '已保存')
})

route('GET', '/materials/export', () => ok({
  filename: '物料档案.csv',
  content: toCsv([
    { key: 'code', label: '编码' },
    { key: 'name', label: '名称' },
    { key: 'cargoType', label: '货物类型' },
    { key: 'kind', label: '类型' },
    { key: 'source', label: '矿源' },
  ], db.materials),
}, '导出成功'))

route('GET', '/materials', ({ query }) => ok(pageOf(db.materials, query, (row) => includes(`${row.code}${row.name}`, query.keyword) && (!filled(query.kind) || row.kind === query.kind))))

route('POST', '/materials', ({ body }) => {
  const row: Row = { id: nextId('m'), code: body.code, name: body.name, cargoType: body.cargoType, kind: body.kind, source: body.kind === '原料' && body.cargoType === '报备矿' ? body.source : '' }
  db.materials.unshift(row)
  audit({ module: '物料档案', action: '新建物料', bizNo: row.code, before: '—', after: `${row.kind}/${row.cargoType}` })
  return ok(row, '物料已创建')
})

route('PUT', '/materials/:id', ({ params, body }) => {
  const index = findIndex(db.materials, params.id)
  if (index < 0) return fail('物料不存在')
  const prev = { ...db.materials[index] }
  Object.assign(db.materials[index], body, { id: prev.id })
  if (db.materials[index].kind !== '原料' || db.materials[index].cargoType !== '报备矿') db.materials[index].source = ''
  audit({ module: '物料档案', action: '编辑物料', bizNo: prev.code, before: String(prev.name), after: String(db.materials[index].name) })
  return ok(db.materials[index], '已保存')
})

route('GET', '/material-sources/filings/export', () => ok({
  filename: '矿源备案.csv',
  content: toCsv([
    { key: 'code', label: '备案编号' },
    { key: 'source', label: '矿源' },
    { key: 'originCountry', label: '原产国' },
    { key: 'qty', label: '备案数量' },
    { key: 'remain', label: '剩余' },
    { key: 'usage', label: '用量%' },
    { key: 'prodBatches', label: '生产批次号' },
  ], db.filings),
}))

route('GET', '/material-sources/filings/:code/lots/export', ({ params }) => ok({
  filename: `${params.code}-票货.csv`,
  content: toCsv([
    { key: 'customsNo', label: '报关单号' },
    { key: 'prodBatch', label: '生产批次号' },
    { key: 'consignor', label: '委托方' },
    { key: 'wet', label: '湿吨' },
    { key: 'dry', label: '干吨' },
    { key: 'stack', label: '堆位' },
    { key: 'status', label: '状态' },
  ], db.filingLots[params.code] || []),
}))

route('GET', '/material-sources/filings/:code/lots', ({ params }) => ok(db.filingLots[params.code] || []))

route('GET', '/material-sources/filings', ({ query }) => ok(pageOf(db.filings, query, (row) => {
  if (filled(query.source) && row.source !== query.source) return false
  if (filled(query.status) && row.status !== query.status) return false
  if (!includes(row.code, query.keyword)) return false
  return inRange(String(row.filingDate), query.from, query.to)
})))

route('POST', '/material-sources/filings', ({ body }) => {
  const qty = Number(body.qty || 0)
  const row: Row = { id: nextId('f'), code: body.code, source: body.source, originCountry: body.originCountry, qty, usedQty: 0, remain: qty, usage: 0, status: body.status || '有效', filingDate: body.filingDate, prodBatches: body.prodBatches || '', attachment: body.attachment || '' }
  db.filings.unshift(row)
  db.filingLots[String(row.code)] = []
  audit({ module: '矿源备案', action: '新建备案', bizNo: row.code, before: '—', after: String(row.source) })
  return ok(row, '备案已创建')
})

route('GET', '/partners/consignors', () => ok(db.partners.filter((row) => row.role === '委托方').map((row) => row.name)))

route('GET', '/partners', ({ query }) => ok(pageOf(db.partners, query, (row) => {
  if (filled(query.role) && row.role !== query.role) return false
  return includes(`${row.code}${row.name}`, query.keyword)
})))

route('POST', '/partners', ({ body }) => {
  if (body.role === '流向企业') return fail('流向企业由出库报关单自动写入')
  const row: Row = { id: nextId('p'), code: body.code, name: body.name, role: body.role, phone: body.phone || '', status: body.status || '启用', source: '手工维护' }
  db.partners.unshift(row)
  audit({ module: '往来主体', action: '新建', bizNo: row.code, before: '—', after: String(row.name) })
  return ok(row, '已创建')
})

route('PUT', '/partners/:id', ({ params, body }) => {
  const index = findIndex(db.partners, params.id)
  if (index < 0) return fail('主体不存在')
  if (db.partners[index].source === '出库识别') return fail('出库识别的流向企业不能手工改档')
  const prev = { ...db.partners[index] }
  Object.assign(db.partners[index], body, { id: prev.id, source: prev.source })
  audit({ module: '往来主体', action: '编辑', bizNo: prev.code, before: String(prev.name), after: String(db.partners[index].name) })
  return ok(db.partners[index], '已保存')
})

route('GET', '/bonded-books/:code/lots/export', ({ params }) => ok({
  filename: `${params.code}-票矿.csv`,
  content: toCsv([
    { key: 'direction', label: '方向' },
    { key: 'customsNo', label: '报关单号' },
    { key: 'blNo', label: '提单号' },
    { key: 'wet', label: '湿吨' },
    { key: 'dry', label: '干吨' },
    { key: 'consignor', label: '委托方' },
    { key: 'time', label: '时间' },
  ], db.bookLots[params.code] || []),
}))

route('GET', '/bonded-books/:code/lots', ({ params }) => ok(db.bookLots[params.code] || []))

route('GET', '/bonded-books', ({ query }) => ok(pageOf(db.books, query, (row) => {
  if (!includes(`${row.code}${row.name}${row.customsNo}`, query.keyword)) return false
  return inRange(String(row.warnDate), query.from, query.to)
})))

route('POST', '/bonded-books', ({ body }) => {
  if (body.status === '新账' && !filled(body.warnDate)) return fail('新账衔接旧账须填写旧账预警日期')
  const row: Row = { id: nextId('b'), code: body.code, name: body.name, operator: body.operator, value: Number(body.value || 0), customsNo: body.customsNo, status: body.status, prevBook: body.prevBook || '', warnDate: body.warnDate || '' }
  db.books.unshift(row)
  db.bookLots[String(row.code)] = []
  audit({ module: '保税账册', action: '新建账册', bizNo: row.code, before: '—', after: String(row.status) })
  return ok(row, '账册已创建')
})

route('PUT', '/bonded-books/:id', ({ params, body }) => {
  const index = findIndex(db.books, params.id)
  if (index < 0) return fail('账册不存在')
  if (db.books[index].status === '旧账' && body.status !== '旧账') return fail('旧账只出不进，不能改回新账')
  const prev = { ...db.books[index] }
  Object.assign(db.books[index], body, { id: prev.id, code: prev.code })
  audit({ module: '保税账册', action: '编辑账册', bizNo: prev.code, before: String(prev.warnDate), after: String(db.books[index].warnDate) })
  return ok(db.books[index], '已保存')
})

route('GET', '/floor-plans', () => ok(db.floorPlan))

route('PUT', '/floor-plans', ({ body }) => {
  db.floorPlan = {
    id: 'park',
    gridCols: Number(body.gridCols || 40),
    gridRows: Number(body.gridRows || 24),
    items: Array.isArray(body.items) ? body.items : [],
  }
  audit({ module: '平面图设置', action: '保存平面图', bizNo: 'park', before: '—', after: `${db.floorPlan.items.length} 个图块` })
  return ok({ id: 'park' }, '平面图已保存')
})

route('GET', '/dashboard/cockpit', () => ok({
  kpi: { rawWet: 12680, rawDry: 11412, fgWet: 3412, fgDry: 3500, inboundToday: 12, outboundToday: 33, pendingQc: 3, alerts: 3 },
  production: { batchNo: 'FL-232134', total: 2134, date: '2026-03-09', eta: '2026-03-09' },
  logs: [
    { type: '生产', text: 'FL-20260803·3票报关单投料200干吨', time: '2026-08-03 13:00' },
    { type: '称重', text: 'RK-20260801-015·湿 800/干720', time: '2026-08-03 14:00' },
    { type: '上架', text: '4#A1·生产批次FL-20260803上架，片区标识:待检区', time: '2026-08-03 16:00' },
    { type: '完工', text: 'WG-20260803-01·成品180干吨入库', time: '2026-08-03 17:00' },
    { type: '入仓', text: 'RK-20260803-002·物料620湿吨·2仓', time: '2026-08-03 18:00' },
    { type: '出仓', text: 'CK-20260803-008·成品 95干吨·华南冶炼', time: '2026-08-03 19:00' },
  ],
  yards: [
    { id: '1', name: '1#', warehouse: '1仓', x: 2, y: 16, w: 30, h: 72, stacks: [
      { code: 'A1', owner: '五矿有色', cargoType: '达标矿', tons: 820, rate: 94, areaLabel: '原料区', batchNo: '5301202600001234' },
      { code: 'A2', owner: '五矿有色', cargoType: '报备矿', tons: 640, rate: 48, areaLabel: '原料区', batchNo: '' },
    ] },
    { id: '2', name: '2#', warehouse: '2仓', x: 34, y: 16, w: 30, h: 72, stacks: [
      { code: 'A1', owner: '广西金川', cargoType: '报备矿', tons: 860, rate: 71, areaLabel: '原料区', batchNo: '5301202600002234' },
      { code: 'B1', owner: '广西南国', cargoType: '达标矿', tons: 420, rate: 33, areaLabel: '原料区', batchNo: '' },
    ] },
    { id: '4', name: '4#', warehouse: '4仓', x: 66, y: 8, w: 32, h: 36, stacks: [
      { code: 'A1', owner: '五矿有色', cargoType: '混成品', tons: 180, rate: 40, areaLabel: '待检区', batchNo: 'FL-20260803' },
      { code: 'B1', owner: '广西南国', cargoType: '达标矿', tons: 540, rate: 55, areaLabel: '原料区', batchNo: '5301202600003234' },
    ] },
    { id: '5', name: '5#', warehouse: '5仓', x: 66, y: 50, w: 15, h: 38, stacks: [
      { code: 'A1', owner: '广西金川', cargoType: '混成品', tons: 140, rate: 36, areaLabel: '成品区', batchNo: 'FL-20260718' },
    ] },
    { id: '6', name: '6#', warehouse: '6仓', x: 83, y: 50, w: 15, h: 38, stacks: [
      { code: 'A1', owner: '', cargoType: '', tons: 0, rate: 0, areaLabel: '原料区', batchNo: '', reserved: true },
    ] },
  ],
  trend: [
    { day: '08/08', inWet: 176, outWet: 25 },
    { day: '08/09', inWet: 50, outWet: 126 },
    { day: '08/10', inWet: 73, outWet: 90 },
    { day: '08/11', inWet: 52, outWet: 120 },
    { day: '08/12', inWet: 101, outWet: 54 },
    { day: '08/13', inWet: 82, outWet: 132 },
  ],
  usage: [
    { name: '1仓', rate: 50 },
    { name: '2仓', rate: 71 },
    { name: '3仓', rate: 84 },
    { name: '4仓', rate: 67 },
    { name: '5仓', rate: 78 },
    { name: '6仓', rate: 46 },
    { name: '码头仓库', rate: 46 },
  ],
  warnings: [0, 1, 2, 3].map((id) => ({
    id,
    title: '库容占用达阈值',
    detail: '1#A1占用94%，建议移库疏导',
    time: '08:00',
    link: '/alerts',
    tone: ['red', 'orange', 'yellow', 'orange'][id],
  })),
}))

route('GET', '/inbound', ({ query }) => ok(pageOf(db.inbound, query, (row) => {
  if (filled(query.shipMode) && row.shipMode !== query.shipMode) return false
  if (filled(query.oreType) && !includes(row.oreType, query.oreType)) return false
  if (filled(query.status) && row.status !== query.status) return false
  return inRange(String(row.time), query.from, query.to)
})))

route('POST', '/inbound', ({ body }) => {
  const row: Row = {
    id: nextId('in'),
    shipName: body.shipName, voyage: body.voyage || '', blNo: body.blNo, customsNo: body.customsNo,
    checklistNo: body.checklistNo, amount: Number(body.amount || 0), oreType: body.oreType || '铜精矿',
    shipMode: body.shipMode, containerCount: body.shipMode === '集装箱' ? Number(body.containerCount || 0) : 0,
    consignor: body.consignor, stackCode: body.stackCode, cells: body.cells || '', status: body.status || '待收货',
    time: body.time || nowText(), as: '', pb: '', cd: '', f: '', hg: '',
  }
  db.inbound.unshift(row)
  audit({ module: '入库管理', action: '新建预约', bizNo: row.customsNo, before: '—', after: String(row.stackCode) })
  return ok(row, '入库单已创建')
})

route('PUT', '/inbound/:id', ({ params, body }) => {
  const index = findIndex(db.inbound, params.id)
  if (index < 0) return fail('入库单不存在')
  const prev = { ...db.inbound[index] }
  const keep = { as: prev.as, pb: prev.pb, cd: prev.cd, f: prev.f, hg: prev.hg }
  Object.assign(db.inbound[index], body, { id: prev.id }, keep)
  audit({ module: '入库管理', action: '编辑入库', bizNo: prev.customsNo, before: String(prev.status), after: String(db.inbound[index].status) })
  return ok(db.inbound[index], '已保存')
})

route('GET', '/transfers', ({ query }) => ok(pageOf(db.transfers, query, (row) => {
  if (filled(query.consignor) && row.consignor !== query.consignor) return false
  return inRange(String(row.timeFrom), query.from, query.to)
})))

route('POST', '/transfers', ({ body }) => {
  const lotRow = db.inventory.find((row) => row.batchNo === body.batchNo && row.status === '在库')
  if (!lotRow) return fail('未找到在库批次')
  const row: Row = {
    id: nextId('mv'),
    consignor: lotRow.consignor, customsNo: lotRow.batchKind === '报关单号' ? lotRow.batchNo : '',
    prodBatch: lotRow.batchKind === '生产批次号' ? lotRow.batchNo : '',
    material: lotRow.material, shipName: body.shipName || '—', containerCount: Number(body.containerCount || 0),
    fromStack: lotRow.stackText, toStack: body.toStack, timeFrom: body.timeFrom, timeTo: body.timeTo,
  }
  db.transfers.unshift(row)
  lotRow.stackText = body.toStack
  const target = db.stacks.find((stack) => stack.code === body.toStack)
  if (target) {
    lotRow.warehouse = target.warehouse
    lotRow.areaLabel = target.areaLabel
  }
  audit({ module: '库内移库', action: '移库', bizNo: String(body.batchNo), before: String(row.fromStack), after: String(row.toStack) })
  return ok(row, '移库单已生成')
})

route('POST', '/transfers/batch', ({ body }) => {
  const ids = Array.isArray(body.batchNos) ? body.batchNos.map(String) : []
  if (!ids.length) return fail('请勾选矿批次')
  if (!filled(body.toStack)) return fail('请选择目标堆位')
  const created: Row[] = []
  ids.forEach((batchNo) => {
    const lotRow = db.inventory.find((row) => row.batchNo === batchNo && row.status === '在库')
    if (!lotRow || lotRow.stackText === body.toStack) return
    const row: Row = {
      id: nextId('mv'),
      consignor: lotRow.consignor,
      customsNo: lotRow.batchKind === '报关单号' ? lotRow.batchNo : '',
      prodBatch: lotRow.batchKind === '生产批次号' ? lotRow.batchNo : '',
      material: lotRow.material, shipName: '—', containerCount: 0,
      fromStack: lotRow.stackText, toStack: body.toStack, timeFrom: body.timeFrom, timeTo: body.timeTo,
    }
    db.transfers.unshift(row)
    lotRow.stackText = body.toStack
    const target = db.stacks.find((stack) => stack.code === body.toStack)
    if (target) {
      lotRow.warehouse = target.warehouse
      lotRow.areaLabel = target.areaLabel
    }
    created.push(row)
  })
  audit({ module: '库内移库', action: '批量移库', bizNo: ids.join('、'), before: `${ids.length} 票`, after: `${created.length} 条移库单` })
  return ok({ count: created.length }, `已生成 ${created.length} 条移库单`)
})

route('GET', '/inventory/batches/:batchNo/ledger', ({ params }) => ok(db.ledgers[params.batchNo] || []))

route('GET', '/inventory/batches/:batchNo', ({ params }) => {
  const row = db.inventory.find((item) => item.batchNo === params.batchNo)
  if (!row) return fail('批次不存在')
  return ok({ ...row, ledger: db.ledgers[params.batchNo] || [], products: db.products[params.batchNo] || [] })
})

route('GET', '/inventory', ({ query }) => ok(pageOf(db.inventory, query, (row) => {
  if (filled(query.consignor) && row.consignor !== query.consignor) return false
  if (filled(query.warehouse) && row.warehouse !== query.warehouse) return false
  if (filled(query.areaLabel) && row.areaLabel !== query.areaLabel) return false
  if (filled(query.cargoType) && row.cargoType !== query.cargoType) return false
  if (filled(query.status) && row.status !== query.status) return false
  if (!includes(`${row.batchNo}${row.stackText}`, query.keyword)) return false
  if (query.timeMode === 'month') {
    const month = nowText().slice(0, 7)
    return String(row.inDate).slice(0, 7) === month
  }
  return inRange(String(row.inDate), query.from, query.to)
})))

route('GET', '/inventory/alerts', ({ query }) => ok(pageOf(buildAlerts(), query, (row) => !filled(query.type) || row.type === query.type)))

route('GET', '/stocktakes/onhand-export', ({ query }) => {
  const month = String(query.month || nowText().slice(0, 7))
  const rows = db.inventory.filter((row) => row.status === '在库').map((row) => ({
    consignor: row.consignor, wet: row.wet, dry: row.dry, stack: row.stackText, cargoType: row.cargoType, blNo: '—', customsNo: row.batchKind === '报关单号' ? row.batchNo : '',
  }))
  return ok({ filename: `${month}-在库.csv`, content: toCsv([
    { key: 'consignor', label: '委托方' }, { key: 'wet', label: '湿重' }, { key: 'dry', label: '干重' },
    { key: 'stack', label: '堆位' }, { key: 'cargoType', label: '货物类型' }, { key: 'blNo', label: '提单号' }, { key: 'customsNo', label: '报关单号' },
  ], rows) })
})

route('GET', '/stocktakes', ({ query }) => ok(pageOf(db.stocktakes, query, (row) => !filled(query.month) || row.month === query.month)))

route('POST', '/stocktakes', ({ body }) => {
  const warehouses = Array.isArray(body.warehouses) ? body.warehouses.join('、') : body.warehouses
  const stacks = Array.isArray(body.stacks) ? body.stacks.join('、') : body.stacks
  const row: Row = { id: nextId('st'), month: body.month || nowText().slice(0, 7), warehouses, stacks, attachment: body.attachment || '', operator: operator().name, time: nowText(), remark: body.remark || '' }
  db.stocktakes.unshift(row)
  audit({ module: '盘点管理', action: '新建盘点', bizNo: row.id, before: '—', after: '仅归档，不回写库存' })
  return ok(row, '盘点单已归档')
})

route('GET', '/production/:prodBatchNo', ({ params }) => {
  const row = db.production.find((item) => item.prodBatch === params.prodBatchNo || item.id === params.prodBatchNo)
  if (!row) return fail('生产批次不存在')
  return ok(row)
})

route('POST', '/production/:id/complete', ({ params, body }) => {
  const row = db.production.find((item) => item.id === params.id)
  if (!row) return fail('记录不存在')
  const stack = db.stacks.find((item) => item.code === body.stackCode)
  if (!stack || stack.areaLabel !== '待检区') return fail('完工入库只允许进入待检区')
  row.stage = '待检'
  row.stackCode = stack.code
  audit({ module: '生产/完工', action: '完工入库', bizNo: row.prodBatch, before: '加工中', after: `待检区 ${stack.code}` })
  return ok(row, '已入待检区')
})

route('POST', '/production/:id/inspect', ({ params }) => {
  const row = db.production.find((item) => item.id === params.id)
  if (!row) return fail('记录不存在')
  const stack = db.stacks.find((item) => item.code === row.stackCode)
  if (stack && stack.areaLabel === '待检区') stack.areaLabel = '成品区'
  const inv = db.inventory.find((item) => item.batchNo === row.prodBatch)
  if (inv) inv.areaLabel = '成品区'
  row.stage = '成品'
  audit({ module: '生产/完工', action: '查验完成', bizNo: row.prodBatch, before: '待检区', after: '成品区' })
  return ok(row, '片区标识已改为成品区')
})

route('GET', '/production', ({ query }) => ok(pageOf(db.production, query, (row) => {
  if (filled(query.consignor) && row.consignor !== query.consignor) return false
  return inRange(String(row.time), query.from, query.to)
})))

route('POST', '/production', ({ body }) => {
  const customsNos = Array.isArray(body.customsNos) ? body.customsNos.join('、') : body.customsNos
  const row: Row = {
    id: nextId('pr'), prodBatch: body.prodBatch, consignor: body.consignor, stage: '投料', customsNos,
    outCustomsNo: body.outCustomsNo || '', cargoType: body.cargoType, wet: Number(body.wet || 0), time: body.time || nowText(),
    material: body.material || '铜精矿', voyage: body.voyage || '', blNo: body.blNo || '', originCountry: body.originCountry || '',
    process: body.process || '混矿', stackCode: '',
  }
  db.production.unshift(row)
  audit({ module: '生产/完工', action: '投料', bizNo: row.prodBatch, before: '—', after: String(customsNos) })
  return ok(row, '投料已登记')
})

route('POST', '/outbound/:id/approve', ({ params }) => {
  const row = db.outbound.find((item) => item.id === params.id)
  if (!row) return fail('出库单不存在')
  row.status = '已审核'
  audit({ module: '出库管理', action: '审核', bizNo: row.customsNo, before: '待审核', after: '已审核' })
  return ok(row, '已审核')
})

route('GET', '/outbound', ({ query }) => ok(pageOf(db.outbound, query, (row) => {
  if (filled(query.status) && row.status !== query.status) return false
  return inRange(String(row.time), query.from, query.to)
})))

route('POST', '/outbound', ({ body }) => {
  const row: Row = {
    id: nextId('ob'), customsNo: body.customsNo, checklistNo: body.checklistNo, consignee: body.consignee,
    consumer: body.consumer, wet: Number(body.wet || 0), amount: Number(body.amount || 0), time: body.time || nowText(),
    status: '待审核', remark: body.remark || '', batchNo: body.batchNo || '',
  }
  db.outbound.unshift(row)
  if (row.consignee && !db.partners.some((item) => item.name === row.consignee)) {
    db.partners.unshift({ id: nextId('p'), code: nextId('LX'), name: row.consignee, role: '流向企业', phone: '', status: '启用', source: '出库识别' })
  }
  audit({ module: '出库管理', action: '创建出库', bizNo: row.customsNo, before: '—', after: `流向企业 ${row.consignee}` })
  return ok(row, '出库单已创建')
})

route('PUT', '/outbound/:id', ({ params, body }) => {
  const index = findIndex(db.outbound, params.id)
  if (index < 0) return fail('出库单不存在')
  const prev = { ...db.outbound[index] }
  Object.assign(db.outbound[index], body, { id: prev.id, status: prev.status })
  audit({ module: '出库管理', action: '修正出库字段', bizNo: prev.customsNo, before: `${prev.consignee}/${prev.wet}`, after: `${db.outbound[index].consignee}/${db.outbound[index].wet}` })
  return ok(db.outbound[index], '已保存并留痕')
})

route('POST', '/customs/declarations', () => ok({ accepted: false }, '联网申报端口已预留，待后端联调'))

route('POST', '/customs/bonded-books/write-off', () => ok({ accepted: false }, '电子账册核销端口已预留，待后端联调'))

route('GET', '/customs/reconcile/:id/details', ({ params }) => ok(db.reconcileDetails[params.id] || []))

route('GET', '/customs/reconcile', ({ query }) => ok(pageOf(db.reconciles, query, (row) => !filled(query.status) || row.status === query.status)))

route('POST', '/ocr/recognize', ({ body }) => {
  const row: Row = {
    id: nextId('ocr'), docType: body.docType || '入库报关单', fileName: body.fileName || '未命名.pdf',
    customsNo: body.customsNo || '5301202600007001', checklistNo: body.checklistNo || 'QD7001',
    consignee: body.consignee || '', confidence: '93%', status: '待修正', time: nowText(),
  }
  db.ocrTasks.unshift(row)
  audit({ module: 'OCR识别', action: '识别回填', bizNo: row.customsNo, before: '—', after: String(row.fileName) })
  return ok(row, '识别完成，可手工修正')
})

route('GET', '/ocr/tasks', ({ query }) => ok(pageOf(db.ocrTasks, query, (row) => !filled(query.docType) || row.docType === query.docType)))

route('PUT', '/ocr/tasks/:id', ({ params, body }) => {
  const index = findIndex(db.ocrTasks, params.id)
  if (index < 0) return fail('识别任务不存在')
  const prev = { ...db.ocrTasks[index] }
  Object.assign(db.ocrTasks[index], body, { id: prev.id, status: '已修正' })
  audit({ module: 'OCR识别', action: '手工修正', bizNo: prev.customsNo, before: String(prev.customsNo), after: String(db.ocrTasks[index].customsNo) })
  return ok(db.ocrTasks[index], '修正已写入日志')
})

route('GET', '/audit-logs/:id', ({ params }) => {
  const row = db.audits.find((item) => item.id === params.id)
  return row ? ok(row) : fail('日志不存在')
})

route('GET', '/audit-logs', ({ query }) => ok(pageOf(db.audits, query, (row) => {
  if (filled(query.module) && row.module !== query.module) return false
  if (!includes(`${row.operator}${row.bizNo}`, query.keyword)) return false
  return inRange(String(row.time), query.from, query.to)
})))

export function handleMock(method: string, url: string, body?: unknown, params?: Query) {
  const path = url.split('?')[0]
  const query = { ...(params || {}) }
  for (const item of routes) {
    if (item.method !== method.toUpperCase()) continue
    const matched = item.regex.exec(path)
    if (!matched) continue
    const pathParams: Record<string, string> = {}
    item.keys.forEach((key, index) => {
      pathParams[key] = decodeURIComponent(matched[index + 1])
    })
    return item.fn({ params: pathParams, query, body: (body || {}) as Record<string, unknown> })
  }
  return fail(`接口未预留：${method.toUpperCase()} ${path}`)
}
