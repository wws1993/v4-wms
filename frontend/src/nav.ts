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
  { id: 'dashboard',  title: '概览', path: '/dashboard', group: '概览', icon: 'Odometer', roles: ops },
  // 基础数据
  { id: 'warehouses', title: '仓位管理', path: '/warehouses', group: '基础数据', icon: 'OfficeBuilding', roles: master },
  { id: 'stacks',     title: '堆位管理', path: '/stacks', group: '基础数据', icon: 'Grid', roles: master },
  { id: 'materials',  title: '矿种档案', path: '/materials', group: '基础数据', icon: 'Files', roles: master },
  { id: 'partners',   title: '往来主体', path: '/partners', group: '基础数据', icon: 'User', roles: master },
  // 仓储作业
  { id: 'inbound',    title: '入库管理', path: '/inbound', group: '仓储作业', icon: 'Download', roles: ops },
  { id: 'transfer',   title: '库内移库', path: '/transfer', group: '仓储作业', icon: 'Sort', roles: ops },
  { id: 'inventory',  title: '库存查询', path: '/inventory', group: '仓储作业', icon: 'Search', roles: ops },
  { id: 'stocktake',  title: '盘点管理', path: '/stocktake', group: '仓储作业', icon: 'Finished', roles: ops },
  { id: 'production', title: '生产加工', path: '/production', group: '仓储作业', icon: 'SetUp', roles: ops },
  { id: 'inspection', title: '抽样送检', path: '/inspection', group: '仓储作业', icon: 'Document', roles: ops },
  { id: 'outbound',   title: '出库管理', path: '/outbound', group: '仓储作业', icon: 'Upload', roles: ops },
  // 账务
  { id: 'bonded',     title: '保税账册', path: '/ledger/bonded', group: '账务', icon: 'Notebook', roles: master },
  { id: 'ledgerMonthly', title: '月度账册', path: '/ledger/monthly', group: '账务', icon: 'Calendar', roles: master },
  // 系统
  { id: 'settings', title: '系统设置', path: '/settings', group: '系统', icon: 'Setting', roles: master },
  { id: 'dicts', title: '字典管理', path: '/dicts', group: '系统', icon: 'Collection', roles: prod },
  { id: 'ocr',        title: 'OCR识别', path: '/ocr', group: '系统', icon: 'Document', roles: prod },
  { id: 'warningLogs', title: '预警日志', path: '/warning-logs', group: '系统', icon: 'Bell', roles: prod },
  { id: 'audit', title: '操作日志', path: '/audit', group: '系统', icon: 'Tickets', roles: prod },
]

const MENU_WORDS: { id: string; words: string[] }[] = [
  { id: 'dashboard', words: ['概览', '驾驶舱', '首页'] },
  { id: 'warehouses', words: ['仓位管理', '仓库管理', '仓库'] },
  { id: 'stacks', words: ['堆位', '库区'] },
  { id: 'materials', words: ['矿种', '商品'] },
  { id: 'partners', words: ['往来'] },
  { id: 'bonded', words: ['保税账册', '保税'] },
  { id: 'ledgerMonthly', words: ['月度账册'] },
  { id: 'settings', words: ['系统设置', '参数设置'] },
  { id: 'inbound', words: ['入库'] },
  { id: 'transfer', words: ['移库'] },
  { id: 'inventory', words: ['库存'] },
  { id: 'stocktake', words: ['盘点', '盘库'] },
  { id: 'warningLogs', words: ['预警日志'] },
  { id: 'outbound', words: ['出库'] },
  { id: 'production', words: ['生产加工', '完工'] },
  { id: 'inspection', words: ['抽样送检', '送检'] },
  { id: 'customs', words: ['关务'] },
  { id: 'ocr', words: ['ocr', '识别'] },
  { id: 'audit', words: ['操作日志', '审计'] },
  { id: 'dicts', words: ['字典'] },
]

/** 用菜单名称对应内置页面。一个都对不上时，登录回退为全部页面，避免尚未初始化菜单时侧栏被清空。 */
export function pageIdsFromTitles(titles: string[], unmatched: 'all' | 'dashboard' = 'all') {
  const joined = titles.join(' ').toLowerCase()
  const pages = MENU_WORDS.filter((item) => item.words.some((word) => joined.includes(word.toLowerCase()))).map((item) => item.id)
  if (!pages.length) return unmatched === 'dashboard' ? ['dashboard'] : NAV.map((item) => item.id)
  if (!pages.includes('dashboard')) pages.unshift('dashboard')

  return pages
}

export function pageIdsFor(user: { pages: string[] } | null | undefined) {
  if (!user) return new Set<string>()
  const known = new Set(NAV.map((item) => item.id))
  const allowed = (user.pages || []).filter((id) => known.has(id))
  if (allowed.filter((id) => id !== 'dashboard').length === 0) return known
  return new Set(allowed)
}

export const NAV_GROUPS = ['概览', '基础数据', '仓储作业', '生产与关务', '账务', '系统']

export function pagesFor(_role: RoleKey): string[] {
  return NAV.map((item) => item.id)
}
