const BUCKETS: [string, string][] = [
  ['OCR', '出库'],
  ['识别', '出库'],
  ['入库', '入库'],
  ['出库', '出库'],
  ['移库', '移库'],
  ['生产', '生产'],
  ['堆位', '堆位'],
  ['关务', '关务'],
  ['权限', '权限'],
  ['系统设置', '权限'],
  ['仓位', '基础数据'],
  ['物料', '基础数据'],
  ['往来', '基础数据'],
  ['保税', '基础数据'],
  ['账务', '基础数据'],
  ['平面图', '基础数据'],
  ['基础数据', '基础数据'],
]

export function shortModule(name: string) {
  for (const [word, label] of BUCKETS) {
    if (name.includes(word)) return label
  }
  return name || '—'
}

export function presentAudit(row: Record<string, unknown>) {
  const before = String(row.before ?? '—') || '—'
  const after = String(row.after ?? '—') || '—'
  const rawContent = String(row.content || '')
  const content = rawContent && rawContent !== '—'
    ? rawContent
    : before !== '—' && after !== '—'
      ? `${before} → ${after}`
      : after !== '—'
        ? after
        : before
  const module = shortModule(String(row.module || ''))
  const customs = row.customsAccount === '是' || module === '关务'
  const bizNo = String(row.bizNo || '')
  const prodBatch = String(row.prodBatch || (bizNo.startsWith('FL-') ? bizNo : ''))
  const customsNo = String(row.customsNo || (/^\d{8,}$/.test(bizNo) ? bizNo : ''))
  const detail = String(row.detail || '—')
  return {
    ...row,
    module,
    content,
    detail,
    accountType: customs ? '海关专用账号' : '业务账号',
    result: String(row.result || '成功'),
    prodBatch,
    customsNo,
    before,
    after,
    operator: String(row.operator || '—'),
    time: String(row.time || '—'),
    action: String(row.action || '—'),
    bizNo: bizNo || '—',
    ip: String(row.ip || '—'),
  }
}
