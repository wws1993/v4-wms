import { NAV, NAV_GROUPS } from '@/nav'

export interface SeedMenu {
  name: string
  path: string
  icon: string
  orderNum: number
  perms: string
  component: string
}

export interface SeedGroup {
  name: string
  path: string
  icon: string
  orderNum: number
  children: SeedMenu[]
}

const GROUP_META: Record<string, { path: string; icon: string }> = {
  概览: { path: 'overview', icon: 'Odometer' },
  基础数据: { path: 'master', icon: 'Grid' },
  仓储作业: { path: 'ops', icon: 'Download' },
  生产与关务: { path: 'customs', icon: 'Document' },
  账务: { path: 'ledger', icon: 'Notebook' },
  系统: { path: 'system', icon: 'Setting' },
}

export function menuSeed(): SeedGroup[] {
  return NAV_GROUPS.map((group, index) => {
    const meta = GROUP_META[group] || { path: `group${index + 1}`, icon: 'Menu' }
    return {
      name: group,
      path: meta.path,
      icon: meta.icon,
      orderNum: index + 1,
      children: NAV.filter((item) => item.group === group).map((item, childIndex) => ({
        name: item.title,
        path: item.path.replace(/^\//, ''),
        icon: item.icon,
        orderNum: childIndex + 1,
        perms: `wms:${item.id}:list`,
        component: `${item.id}/index`,
      })),
    }
  })
}
