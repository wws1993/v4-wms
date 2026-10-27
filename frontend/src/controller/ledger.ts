import type { Route } from '@/api-map/types'
import { ruoyiGet } from '@/api/ruoyi'
import { pageOf, pageParams } from '@/controller/shared/page'
import type { Query } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'

interface MonthAccountVo {
  orderId?: number | string
  receiptDate?: string
  recordNo?: string
  dryWeight?: number | string
  consumeDryWeight?: number | string
  clearanceStatus?: number | string
}

function monthAccountRow(row: MonthAccountVo) {
  const status = text(row.clearanceStatus)
  return {
    id: text(row.orderId),
    orderId: text(row.orderId),
    month: text(row.receiptDate),
    customsNo: text(row.recordNo),
    inboundTons: row.dryWeight ?? '',
    monthConsume: row.consumeDryWeight ?? '',
    monthlyStatus: status === '1' ? '已出清' : status === '0' ? '未出清' : status,
  }
}

function monthlyList(query: Query) {
  return ruoyiGet<MonthAccountVo>('/wms/monthAccount/list', pageParams(query, {
    month: query.month || undefined,
    clearanceStatus: query.clearanceStatus || undefined,
    searchValue: query.searchValue || undefined,
  })).then((result) => pageOf(result, result.rows.map(monthAccountRow), query))
}

export const ledgerRoutes: Route[] = [
  { method: 'GET', match: '/ledger/monthly', handle: ({ query }) => monthlyList(query) },
]
