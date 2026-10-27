import type { Route } from '@/api-map/types'
import { menuSeed } from '@/system/menuSeed'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { SysMenuBo, SysMenuVo } from '@/typings/openapi'
import type { Row } from '@/controller/shared/types'
import { idOf, num, text } from '@/controller/shared/coerce'

/** 菜单状态展示标签。 */
function menuStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '0' || raw === '正常') return '正常'
  if (raw === '1' || raw === '停用') return '停用'
  return raw || '正常'
}

function roleStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1' || raw === '正常' || raw === '启用') return '启用'
  if (raw === '0' || raw === '停用') return '停用'
  return raw || '启用'
}

function menuStatusCode(value: unknown) {
  return text(value) === '停用' || text(value) === '1' ? '1' : '0'
}

function visibleLabel(value: unknown) {
  const raw = text(value)
  if (raw === '0' || raw === '隐藏') return '隐藏'
  return '显示'
}

function visibleCode(value: unknown) {
  return text(value) === '隐藏' || text(value) === '0' ? '0' : '1'
}

function isRootParent(value: unknown) {
  const raw = text(value)
  return !raw || raw === '0'
}

function flattenMenuRows(rows: Row[]) {
  const out: Row[] = []
  const seen = new Set<string>()
  const walk = (list: Row[]) => {
    list.forEach((row) => {
      const id = text(row.menuId)
      if (id && seen.has(id)) return
      if (id) seen.add(id)
      out.push(row)
      if (Array.isArray(row.children)) walk(row.children as Row[])
    })
  }
  walk(rows)
  return out
}

interface MenuNode {
  id: string
  parentId: string
  name: string
  menuType: string
  orderNum: number
  path: string
  perms: string
  icon: string
  visible: string
  status: string
  children?: MenuNode[]
}

function menuNode(row: Row): MenuNode {
  return {
    id: text(row.menuId),
    parentId: isRootParent(row.parentId) ? '0' : text(row.parentId),
    name: text(row.menuName),
    menuType: text(row.menuType || 'C'),
    orderNum: Number(row.orderNum ?? 0),
    path: text(row.path),
    perms: text(row.perms),
    icon: text(row.icon),
    visible: visibleLabel(row.visible),
    status: menuStatusLabel(row.status),
  }
}

function menuTree(rows: Row[]) {
  const byId = new Map<string, MenuNode>()
  flattenMenuRows(rows).forEach((row) => {
    const node = menuNode(row)
    if (node.id) byId.set(node.id, node)
  })
  const roots: MenuNode[] = []
  byId.forEach((node) => {
    const parent = node.parentId !== '0' ? byId.get(node.parentId) : undefined
    if (parent) {
      parent.children = parent.children || []
      parent.children.push(node)
    } else roots.push(node)
  })
  const sort = (list: MenuNode[]) => {
    list.sort((left, right) => left.orderNum - right.orderNum || left.name.localeCompare(right.name, 'zh'))
    list.forEach((node) => {
      if (node.children?.length) sort(node.children)
      else delete node.children
    })
  }
  sort(roots)
  return roots
}

function roleRecord(row: Row) {
  return {
    id: text(row.roleId),
    name: text(row.roleName),
    key: text(row.roleKey),
    sort: Number(row.roleSort ?? 0),
    status: roleStatusLabel(row.status),
    remark: text(row.remark),
    dataScope: text(row.dataScope || '1'),
    admin: row.admin === true,
  }
}

async function loadMenuRows() {
  const result = await ruoyiGet<SysMenuVo>('/system/menu/list')
  if (!result.ok) return { ok: false as const, message: result.message, rows: [] as Row[] }
  const rows = result.rows.length ? result.rows.map((row) => row as Row) : (Array.isArray(result.data) ? result.data as Row[] : [])
  return { ok: true as const, message: result.message, rows: flattenMenuRows(rows) }
}

function menuPayload(body: Row, id?: string): { payload: Row } | { message: string } {
  const name = text(body.name).trim()
  const menuType = text(body.menuType || 'C')
  if (!name) return { message: '请填写菜单名称' }
  if (name.length > 50) return { message: '菜单名称不能超过 50 个字' }
  if (!['M', 'C', 'F'].includes(menuType)) return { message: '菜单类型不正确' }
  const sort = num(body.orderNum)
  if (sort == null) return { message: '请填写显示顺序' }
  const perms = text(body.perms).trim()
  if (perms && !/^([A-Za-z0-9_]+:){2}[A-Za-z0-9_]+$/.test(perms)) return { message: '权限标识格式为 模块:资源:操作' }
  const path = text(body.path).trim()
  if (path.length > 200) return { message: '路由地址不能超过 200 个字符' }
  const component = text(body.component).trim() || (menuType === 'C' && path ? `${path}/index` : '')
  if (component.length > 200) return { message: '组件路径不能超过 200 个字符' }
  const payload: Omit<Partial<SysMenuBo>, 'menuId' | 'parentId'> & { menuId?: number | string; parentId: number | string } & Row = {
    parentId: idOf(body.parentId) ?? 0,
    menuName: name,
    orderNum: Math.trunc(sort),
    path,
    component: menuType === 'M' ? '' : component,
    isFrame: '1',
    isCache: '1',
    menuType,
    visible: visibleCode(body.visible || '显示'),
    status: menuStatusCode(body.status || '正常'),
    perms,
    icon: text(body.icon).trim() || '#',
  }
  if (id) payload.menuId = idOf(id)
  return { payload }
}

async function saveMenu(id: string | undefined, body: Row) {
  const built = menuPayload(body, id)
  if (!('payload' in built)) return fail(built.message)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/menu', built.payload)
  return result.ok ? ok(true, id ? '菜单已保存' : '菜单已创建') : fail(result.message)
}

async function initMenus() {
  let loaded = await loadMenuRows()
  if (!loaded.ok) return fail(loaded.message)
  let created = 0
  for (const group of menuSeed()) {
    if (loaded.rows.some((row) => text(row.menuName) === group.name && isRootParent(row.parentId))) continue
    const built = menuPayload({
      name: group.name,
      menuType: 'M',
      orderNum: group.orderNum,
      path: group.path,
      icon: group.icon,
      parentId: 0,
      visible: '显示',
      status: '正常',
    })
    if (!('payload' in built)) return fail(built.message)
    const result = await ruoyiSend('POST', '/system/menu', built.payload)
    if (!result.ok) return fail(result.message)
    created += 1
  }
  loaded = await loadMenuRows()
  if (!loaded.ok) return fail(loaded.message)
  for (const group of menuSeed()) {
    const parent = loaded.rows.find((row) => text(row.menuName) === group.name && isRootParent(row.parentId))
    if (!parent) return fail(`没有找到目录「${group.name}」`)
    for (const child of group.children) {
      const exists = loaded.rows.some((row) => text(row.menuName) === child.name && text(row.parentId) === text(parent.menuId))
      if (exists) continue
      const built = menuPayload({
        name: child.name,
        menuType: 'C',
        orderNum: child.orderNum,
        path: child.path,
        perms: child.perms,
        component: child.component,
        icon: child.icon,
        parentId: parent.menuId,
        visible: '显示',
        status: '正常',
      })
      if (!('payload' in built)) return fail(built.message)
      const result = await ruoyiSend('POST', '/system/menu', built.payload)
      if (!result.ok) return fail(result.message)
      created += 1
      loaded = await loadMenuRows()
      if (!loaded.ok) return fail(loaded.message)
    }
  }
  return ok({ created }, created ? `已新增 ${created} 个菜单` : '这些菜单已经存在')
}

function firstPermissionMenu(nodes: MenuNode[]): MenuNode | undefined {
  for (const node of nodes) {
    if (node.menuType === 'C') return node
    if (node.menuType !== 'M') continue
    const direct = (node.children || []).find((child) => child.menuType === 'C')
    if (direct) return direct
    for (const child of node.children || []) {
      if (child.menuType !== 'M') continue
      const nested = (child.children || []).find((item) => item.menuType === 'C')
      if (nested) return nested
    }
  }
  return undefined
}

async function settingsMenuIds() {
  const loaded = await loadMenuRows()
  if (!loaded.ok) return { message: loaded.message }
  const menu = firstPermissionMenu(menuTree(loaded.rows))
  if (!menu) return { message: '还没有可绑定的菜单' }
  const ids: unknown[] = []
  const seen = new Set<string>()
  let cursor: Row | undefined = loaded.rows.find((row) => text(row.menuId) === menu.id)
  while (cursor) {
    const currentId = text(cursor.menuId)
    if (!currentId || seen.has(currentId)) break
    seen.add(currentId)
    ids.push(cursor.menuId)
    const parentId = text(cursor.parentId)
    if (!parentId || parentId === '0') break
    cursor = loaded.rows.find((row) => text(row.menuId) === parentId)
  }
  return { ids }
}

export { loadMenuRows, menuTree, settingsMenuIds, flattenMenuRows }

/** 菜单管理路由表 */
export const menuRoutes: Route[] = [
  { method: 'GET', match: '/system/menus', handle: async () => {
    const loaded = await loadMenuRows()
    return loaded.ok ? ok(menuTree(loaded.rows)) : fail(loaded.message)
  } },
  { method: 'POST', match: '/system/menus/init', handle: () => initMenus() },
  { method: 'POST', match: '/system/menus', handle: ({ body }) => saveMenu(undefined, body) },
  { method: 'PUT', match: /^\/system\/menus\/([^/]+)$/, handle: ({ params, body }) => saveMenu(params[0], body) },
  { method: 'DELETE', match: /^\/system\/menus\/([^/]+)$/, handle: async ({ params }) => {
    const result = await ruoyiSend('DELETE', `/system/menu/${params[0]}`)
    return result.ok ? ok(true, '已删除') : fail(result.message)
  } },
]
