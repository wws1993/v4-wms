import type { Route } from '@/api-map/types'
import { pageIdsFromTitles, pagesFor } from '@/nav'
import type { RoleKey } from '@/types'
import { clearSessionList, loadSessionList, SESSION_LIST, type CacheRow } from '@/api/catalogCache'
import { fail, ok } from '@/api/result'
import { passwordIssue } from '@/security/policy'
import { ruoyiGet, ruoyiSend, writeToken, type RuoyiBody } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { idOf, text, userStatusCode, userStatusLabel } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import type { LoginBody, SysRoleVo, SysUserBo, SysUserVo } from '@/typings/openapi'

/** 角色关键字匹配表 */
const ROLE_WORDS: Record<RoleKey, string[]> = {
  admin: ['admin', 'administrator', '系统管理员', '管理员'],
  warehouse: ['warehouse', '仓管员', '仓管'],
  customs: ['customs', '关务员', '关务'],
}

/** 角色展示名 */
const ROLE_LABEL: Record<RoleKey, string> = {
  admin: '系统管理员',
  warehouse: '仓管员',
  customs: '关务员',
}

/** 从角色键/名称文案推断 RoleKey。 */
function roleOf(blob: string): RoleKey | '' {
  const lower = blob.toLowerCase()
  const keys = Object.keys(ROLE_WORDS) as RoleKey[]
  return keys.find((key) => ROLE_WORDS[key].some((word) => lower.includes(word.toLowerCase()))) || ''
}

/** 从 getRouters 树提取前端页面 id。 */
function pagesFromRouters(nodes: unknown) {
  const titles: string[] = []
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    list.forEach((node) => {
      const row = node as Row
      if (row.hidden === true) return
      const meta = row.meta as Row | undefined
      if (meta?.title) titles.push(text(meta.title))
      if (row.name) titles.push(text(row.name))
      if (row.path) titles.push(text(row.path))
      walk(row.children)
    })
  }
  walk(nodes)
  return pageIdsFromTitles(titles)
}

/** 清除角色选项会话缓存。 */
export function clearRoleCache() {
  clearSessionList(SESSION_LIST.role)
}

/** 拉取角色下拉选项（带缓存）。 */
async function roles() {
  const listed = await loadSessionList(SESSION_LIST.role, SESSION_LIST.role, async () => {
    const result = await ruoyiGet<SysRoleVo>('/system/role/optionselect')
    const rows = result.ok ? (Array.isArray(result.data) ? result.data as CacheRow[] : result.rows as CacheRow[]) : []
    return { ok: result.ok, rows }
  })
  return listed.rows as SysRoleVo[]
}

/** 按前端 RoleKey 反查角色 id。 */
async function roleIdFor(key: string) {
  const list = await roles()
  const found = list.find((row) => roleOf(`${row.roleKey || ''} ${row.roleName || ''}`) === key)
  return idOf(found?.roleId)
}

/** 将用户 Vo 映射为账号列表行。 */
function userRow(row: SysUserVo | Row) {
  const roleBlob = `${text(row.roleKey)} ${(Array.isArray(row.roles) ? row.roles as Row[] : []).map((item) => `${item.roleKey || ''} ${item.roleName || ''}`).join(' ')}`
  const roleKey = roleOf(roleBlob) || 'warehouse'
  const roleRows = Array.isArray(row.roles) ? row.roles as Row[] : []
  const named = roleRows.map((item) => text(item.roleName)).find(Boolean)
  const roleId = text(row.roleId || roleRows[0]?.roleId || (Array.isArray(row.roleIds) ? row.roleIds[0] : ''))
  return {
    id: text(row.userId ?? row.id),
    username: text(row.userName),
    name: text(row.nickName),
    roleKey,
    roleId,
    roleName: named || ROLE_LABEL[roleKey],
    phone: text(row.phonenumber),
    status: userStatusLabel(row.status),
  }
}

/** 从登录响应体解析 token。 */
function tokenOf(raw: RuoyiBody) {
  const data = raw.data && typeof raw.data === 'object' ? raw.data as Row : {}
  return text(raw.token || data.token || data.access_token)
}

/** 账号密码登录并拉取用户信息与菜单。 */
async function login(body: Row) {
  const payload: LoginBody = {
    username: text(body.username),
    password: text(body.password),
    code: text(body.code) || '',
    uuid: text(body.uuid) || '',
  }
  const result = await ruoyiSend('POST', '/login', payload)
  if (!result.ok) return fail(result.message)
  const token = tokenOf(result.raw)
  if (!token) return fail('登录成功但未返回令牌')
  writeToken(token)
  const info = await ruoyiGet('/getInfo')
  if (!info.ok) {
    writeToken('')
    return fail(info.message)
  }
  const packet = (info.data && typeof info.data === 'object' ? info.data : info.raw) as Row
  const user = (packet.user && typeof packet.user === 'object' ? packet.user : packet) as Row
  const roleBlob = `${text(user.userName)} ${JSON.stringify(packet.roles || user.roles || '')}`
  const roleKey = roleOf(roleBlob) || (user.admin ? 'admin' : 'warehouse')
  const routers = await ruoyiGet('/getRouters')
  const routerData = Array.isArray(routers.data) ? routers.data : routers.rows
  return ok({
    id: text(user.userId || user.id),
    username: text(user.userName || body.username),
    name: text(user.nickName || user.userName || body.username),
    roleKey,
    roleName: ROLE_LABEL[roleKey],
    pages: pagesFromRouters(routerData),
  }, '登录成功')
}

/** 拉取登录验证码。 */
async function captcha() {
  const result = await ruoyiGet('/captchaImage')
  if (!result.ok) return fail(result.message)
  const data = (result.data && typeof result.data === 'object' ? result.data : result.raw) as Row
  const img = text(data.img || result.raw.img)
  return ok({
    uuid: text(data.uuid || result.raw.uuid),
    enabled: data.captchaEnabled !== false && result.raw.captchaEnabled !== false,
    img: img ? (img.startsWith('data:') ? img : `data:image/gif;base64,${img}`) : '',
  })
}

/** 分页查询系统用户。 */
async function users(query: Query) {
  const result = await ruoyiGet<SysUserVo>('/system/user/list', pageParams(query, { userName: query.keyword || undefined }))
  const list = result.rows.map(userRow)
  for (const row of list) {
    if (row.roleId || !row.roleKey) continue
    const matched = await roleIdFor(row.roleKey)
    if (matched) row.roleId = text(matched)
  }
  return pageOf(result, list, query)
}

/** 新建或更新系统用户。 */
async function saveUser(id: string | undefined, body: Row) {
  const explicitRole = text(body.roleId).trim()
  const roleKey = text(body.roleKey || 'warehouse')
  const matchedRole = explicitRole ? idOf(explicitRole) : await roleIdFor(roleKey)
  if (!matchedRole) {
    return fail(explicitRole ? '没有找到对应角色' : `丰联后台没有与「${ROLE_LABEL[roleKey as RoleKey] || roleKey}」对应的角色`)
  }
  const payload: Partial<SysUserBo> = {
    userName: text(body.username),
    nickName: text(body.name),
    phonenumber: text(body.phone) || '',
    status: userStatusCode(body.status || '启用'),
    roleIds: [matchedRole as number],
  }
  if (!id) {
    const password = text(body.password)
    if (!password) return fail('请填写密码')
    const issue = passwordIssue(password)
    if (issue) return fail(issue)
    payload.password = password
  }
  if (id) payload.userId = idOf(id) as SysUserBo['userId']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/user', payload)
  if (!result.ok) return fail(result.message)
  return ok(true, id ? '已保存' : '账号已创建')
}

/** 启用或停用系统用户。 */
async function setUserStatus(id: string, body: Row) {
  const status = text(body.status)
  if (status !== '启用' && status !== '停用') return fail('状态只能是启用或停用')
  const result = await ruoyiSend('PUT', '/system/user/changeStatus', {
    userId: idOf(id),
    status: userStatusCode(status),
  })
  return result.ok ? ok(true, status === '停用' ? '已停用' : '已启用') : fail(result.message)
}

export { ROLE_LABEL, ROLE_WORDS, roleOf, roles, roleIdFor }

/** 认证与账号路由表 */
export const authRoutes: Route[] = [
  { method: 'POST', match: '/auth/login', handle: ({ body }) => login(body) },
  { method: 'GET', match: '/auth/captcha', handle: () => captcha() },
  { method: 'POST', match: '/auth/logout', handle: async () => {
    const result = await ruoyiSend('POST', '/logout')
    writeToken('')
    return result.ok ? ok(true, '已退出') : ok(true, '已退出')
  } },
  { method: 'POST', match: '/auth/password', handle: async ({ body: payload }) => {
    const oldPassword = text(payload.oldPassword)
    const newPassword = text(payload.newPassword)
    if (!oldPassword || !newPassword) return fail('请填写原密码和新密码')
    if (oldPassword === newPassword) return fail('新密码不能与原密码相同')
    const issue = passwordIssue(newPassword)
    if (issue) return fail(issue)
    const result = await ruoyiSend('PUT', '/system/user/profile/updatePwd', undefined, { oldPassword, newPassword })
    return result.ok ? ok(true, '密码已更新') : fail(result.message)
  } },
  { method: 'GET', match: '/auth/users', handle: ({ query }) => users(query) },
  { method: 'POST', match: '/auth/users', handle: ({ body }) => saveUser(undefined, body) },
  { method: 'PUT', match: /^\/auth\/users\/([^/]+)\/status$/, handle: ({ params, body }) => setUserStatus(params[0], body) },
  { method: 'PUT', match: /^\/auth\/users\/([^/]+)$/, handle: ({ params, body }) => saveUser(params[0], body) },
  { method: 'GET', match: '/roles/permissions', handle: async () => ok({ admin: pagesFor('admin'), warehouse: pagesFor('warehouse'), customs: pagesFor('customs') }) },
  { method: 'PUT', match: /^\/roles\/[^/]+\/permissions$/, handle: async () => fail('请在系统设置的角色管理中保存菜单') },
]
