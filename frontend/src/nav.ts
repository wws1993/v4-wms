import type { RoleKey } from '@/types'

export interface NavItem {
  id: string
  title: string
  path: string
  group: string
  icon: string
  roles: RoleKey[]
}

const master: RoleKey[] = ['admin', 'customs']
const ops: RoleKey[] = ['admin', 'warehouse', 'customs']
const prod: RoleKey[] = ['admin', 'customs']

export const NAV: NavItem[] = [
  { id: 'dashboard', title: '概览', path: '/dashboard', group: '概览', icon: 'Odometer', roles: ops },
  { id: 'warehouses', title: '仓位管理', path: '/warehouses', group: '基础数据', icon: 'OfficeBuilding', roles: master },
  { id: 'stacks', title: '堆位管理', path: '/stacks', group: '基础数据', icon: 'Grid', roles: master },
  { id: 'materials', title: '物料档案', path: '/materials', group: '基础数据', icon: 'Files', roles: master },
  { id: 'partners', title: '往来主体', path: '/partners', group: '基础数据', icon: 'User', roles: master },
  { id: 'inbound', title: '入库管理', path: '/inbound', group: '仓储作业', icon: 'Download', roles: ops },
  { id: 'transfer', title: '库内移库', path: '/transfer', group: '仓储作业', icon: 'Sort', roles: ops },
  { id: 'inventory', title: '库存查询', path: '/inventory', group: '仓储作业', icon: 'Search', roles: ops },
  { id: 'stocktake', title: '盘点管理', path: '/stocktake', group: '仓储作业', icon: 'Finished', roles: ops },
  { id: 'alerts', title: '库存预警', path: '/alerts', group: '仓储作业', icon: 'Warning', roles: ops },
  { id: 'outbound', title: '出库管理', path: '/outbound', group: '仓储作业', icon: 'Upload', roles: ops },
  { id: 'production', title: '生产加工', path: '/production', group: '仓储作业', icon: 'SetUp', roles: ops },
  { id: 'customs', title: '关务保税', path: '/customs', group: '生产与关务', icon: 'Medal', roles: prod },
  { id: 'ocr', title: 'OCR识别', path: '/ocr', group: '生产与关务', icon: 'Document', roles: prod },
  { id: 'bonded', title: '保税账册', path: '/ledger/bonded', group: '账务', icon: 'Notebook', roles: master },
  { id: 'ledgerMonthly', title: '月度账册', path: '/ledger/monthly', group: '账务', icon: 'Calendar', roles: master },
  { id: 'settings', title: '系统设置', path: '/settings', group: '系统', icon: 'Setting', roles: master },
  { id: 'dicts', title: '字典管理', path: '/dicts', group: '系统', icon: 'Collection', roles: prod },
  { id: 'alertLogs', title: '预警日志', path: '/alert-logs', group: '系统', icon: 'Warning', roles: prod },
  { id: 'audit', title: '操作日志', path: '/audit', group: '系统', icon: 'Tickets', roles: prod },
]

const frontendOnly = new Set(['bonded', 'ledgerMonthly', 'production', 'alertLogs', 'dicts'])

export function pageIdsFor(user: { roleKey: RoleKey; pages: string[] } | null | undefined) {
  const pages = new Set(user?.pages || [])
  if (!user) return pages
  for (const item of NAV) {
    if (frontendOnly.has(item.id) && item.roles.includes(user.roleKey)) pages.add(item.id)
  }
  return pages
}

export const NAV_GROUPS = ['概览', '基础数据', '仓储作业', '账务', '系统']

export function pagesFor(role: RoleKey): string[] {
  return NAV.filter((item) => item.roles.includes(role)).map((item) => item.id)
}
