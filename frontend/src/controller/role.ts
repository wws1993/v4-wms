import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { idOf, num, text } from '@/controller/shared/coerce'
import { clearRoleCache, roles } from '@/controller/auth'
import { settingsMenuIds } from '@/controller/menu'
import type { SysRoleBo, SysRoleVo } from '@/typings/openapi'

/** 角色状态展示标签。 */
function roleStatusLabel(value: unknown) {
  const raw = text(value)
  if (raw === '1' || raw === '正常' || raw === '启用') return '启用'
  if (raw === '0' || raw === '停用') return '停用'
  return raw || '启用'
}

/** 角色状态写入编码。 */
function roleStatusCode(value: unknown) {
  return text(value) === '停用' || text(value) === '0' ? '0' : '1'
}

/** 将角色 Vo 映射为管理列表行。 */
function roleRecord(row: SysRoleVo | Row) {
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
/** 新建或更新角色。 */
async function saveRole(id: string | undefined, body: Row) {
  const name = text(body.name).trim()
  const key = text(body.key).trim()
  if (!name) return fail('请填写角色名称')
  if (name.length > 30) return fail('角色名称不能超过 30 个字')
  if (!key) return fail('请填写权限字符')
  if (!/^[A-Za-z0-9_]+$/.test(key)) return fail('权限字符只能包含字母、数字和下划线')
  if (key.length > 100) return fail('权限字符不能超过 100 个字符')
  const sort = num(body.sort)
  if (sort == null) return fail('请填写显示顺序')
  const payload: Omit<Partial<SysRoleBo>, 'roleId' | 'menuIds' | 'deptIds'> & {
    roleId?: number | string
    menuIds?: (number | string)[]
    deptIds?: (number | string)[]
  } & Row = {
    roleName: name,
    roleKey: key,
    roleSort: Math.trunc(sort),
    status: roleStatusCode(body.status || '启用'),
    remark: text(body.remark),
    dataScope: text(body.dataScope || '1'),
    menuCheckStrictly: true,
    deptCheckStrictly: true,
  }
  const givenMenus = Array.isArray(body.menuIds) ? body.menuIds as unknown[] : []
  if (givenMenus.length) {
    payload.menuIds = givenMenus.map((item) => idOf(item)).filter((item): item is number | string => item !== undefined)
  } else if (!id) {
    const settings = await settingsMenuIds()
    if ('message' in settings) return fail(settings.message || '菜单读取失败')
    payload.menuIds = settings.ids.map((item) => idOf(item)).filter((item): item is number | string => item !== undefined)
  }
  if (!id) payload.deptIds = []
  if (id) payload.roleId = idOf(id)
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/role', payload)
  if (result.ok) clearRoleCache()
  return result.ok ? ok(true, id ? '角色已保存' : '角色已创建') : fail(result.message)
}

/** 从角色菜单树响应中提取已勾选菜单 id。 */
function checkedMenuIds(data: unknown, raw: Row) {
  const packet = data && typeof data === 'object' ? data as Row : {}
  const list = packet.checkedKeys ?? raw.checkedKeys ?? packet.checked ?? []
  return Array.isArray(list) ? list.map((item) => text(item)).filter(Boolean) : []
}

/** 角色管理路由表 */
export const roleRoutes: Route[] = [
  { method: 'GET', match: '/system/roles/options', handle: async () => {
    const list = await roles()
    return ok(list.map((row) => ({ label: text(row.roleName), value: text(row.roleId) })).filter((item) => item.label && item.value))
  } },
  { method: 'GET', match: '/system/roles', handle: async ({ query }) => {
    const result = await ruoyiGet<SysRoleVo>('/system/role/list', { pageNum: 1, pageSize: 200, roleName: query.keyword || undefined })
    if (!result.ok) return fail(result.message)
    return ok(result.rows.map(roleRecord).filter((row) => row.id))
  } },
  { method: 'POST', match: '/system/roles', handle: ({ body }) => saveRole(undefined, body) },
  { method: 'GET', match: /^\/system\/roles\/([^/]+)\/menus$/, handle: async ({ params }) => {
    const result = await ruoyiGet(`/system/menu/roleMenuTreeselect/${params[0]}`)
    return result.ok ? ok(checkedMenuIds(result.data, result.raw as Row)) : fail(result.message)
  } },
  { method: 'PUT', match: /^\/system\/roles\/([^/]+)$/, handle: ({ params, body }) => saveRole(params[0], body) },
  { method: 'DELETE', match: /^\/system\/roles\/([^/]+)$/, handle: async ({ params }) => {
    const result = await ruoyiSend('DELETE', `/system/role/${params[0]}`)
    if (result.ok) clearRoleCache()
    return result.ok ? ok(true, '已删除') : fail(result.message)
  } },
]
