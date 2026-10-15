import { nextId, type Row } from './db'

export interface LedgerRecord {
  kind: '存储' | '加工' | '出库'
  action: string
  tons: number
  time: string
  refNo: string
}

/** 对接期内投产达到入库吨数，计入本期；否则计入下期。 */
export function bondedPlace(inboundTons: number, consumeTons: number) {
  return consumeTons >= inboundTons && inboundTons > 0 ? '本期账册' : '下期账册'
}

function recordsFor(month: string, customsNo: string, inboundTons: number, consumeTons: number): LedgerRecord[] {
  const day = `${month}-02 09:00`
  const usedAt = `${month}-18 14:00`
  const rows: LedgerRecord[] = [
    { kind: '存储', action: '入库', tons: inboundTons, time: day, refNo: customsNo },
  ]
  if (consumeTons > 0) {
    rows.push({ kind: '加工', action: '投产', tons: consumeTons, time: usedAt, refNo: customsNo })
    rows.push({ kind: '出库', action: '原料出库耗用', tons: consumeTons, time: usedAt, refNo: customsNo })
  }
  return rows
}

function ticket(id: string, month: string, seq: string, customsNo: string, inboundTons: number, consumeTons: number): Row {
  return {
    id,
    month,
    seq,
    customsNo,
    inboundTons,
    consumeTons,
    place: bondedPlace(inboundTons, consumeTons),
    records: recordsFor(month, customsNo, inboundTons, consumeTons),
  }
}

export function seedLedgerTickets(): Row[] {
  return [
    ticket('lg1', '2026-08', '第一票', '5301202600080001', 3000, 3000),
    ticket('lg2', '2026-08', '第二票', '5301202600080002', 3000, 1000),
    ticket('lg3', '2026-08', '第三票', '5301202600080003', 3000, 0),
  ]
}

export function buildLedgerTicket(body: Record<string, unknown>): { row?: Row; message?: string } {
  const month = String(body.month || '').trim()
  const seq = String(body.seq || '').trim()
  const customsNo = String(body.customsNo || '').trim()
  const inboundTons = Number(body.inboundTons)
  const consumeTons = Number(body.consumeTons)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { message: '账期请按 2026-08 填写' }
  if (!seq) return { message: '请填写票次' }
  if (!customsNo) return { message: '请填写报关单号' }
  if (!Number.isFinite(inboundTons) || inboundTons <= 0) return { message: '入库吨数须大于 0' }
  if (!Number.isFinite(consumeTons) || consumeTons < 0) return { message: '投产吨数不能为负' }
  return { row: ticket(nextId('lg'), month, seq, customsNo, inboundTons, consumeTons) }
}

/** 当月有耗用即全额出清，之后月份不再出现；未耗用的票继续留在后续月份。 */
export function monthlyTickets(tickets: Row[], month: string): Row[] {
  return tickets.flatMap((row): Row[] => {
    const inboundMonth = String(row.month || '')
    if (!inboundMonth || inboundMonth > month) return []
    const consumeTons = Number(row.consumeTons || 0)
    const cleared = consumeTons > 0
    if (cleared && inboundMonth < month) return []
    const inMonth = inboundMonth === month
    const monthlyStatus = inMonth && cleared ? '已出清' : '未出清'
    return [{
      ...row,
      reportMonth: month,
      monthConsume: inMonth ? consumeTons : 0,
      monthlyStatus,
      nextStock: monthlyStatus === '已出清' ? '不再纳入' : '纳入库存',
    }]
  })
}
