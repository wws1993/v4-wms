import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { blWeightOf, elementFields, idOf, resultObject, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'

const OCR_TYPE: Record<string, number> = { 入库报关单: 0, 出库报关单: 1, 重量单: 2, 品质单: 3, 品质证书: 3 }
const OCR_TYPE_LABEL = ['入库报关单', '出库报关单', '重量单', '品质单']
const OCR_STATUS: Record<number, string> = { 0: '待修正', 2: '已回填', 3: '已归档' }

function ocrRow(row: Row) {
  const result = resultObject(row)
  const type = Number(row.ocrLogType)
  const status = Number(row.ocrLogStatus)
  return {
    id: text(row.id),
    time: text(row.createTime).replace('T', ' ').slice(0, 16),
    docType: OCR_TYPE_LABEL[type] || text(row.ocrLogType),
    fileName: text(row.sourceUrl || row.orderNo),
    customsNo: text(result.recordNo || result.customsNo || row.orderNo),
    checklistNo: text(result.verificationCode || result.checklistNo),
    consignee: text(result.consignee || result.merchantName),
    shipName: text(result.shipName),
    blNo: text(result.waybillNo || result.blNo),
    blWeight: blWeightOf(result),
    amount: result.payableAmount ?? result.amount ?? '',
    currency: text(result.currency),
    wet: result.wetWeight ?? result.wet ?? '',
    dry: result.dryWeight ?? result.dry ?? '',
    moisture: result.moistureContent ?? result.moisture ?? '',
    confidence: '—',
    status: OCR_STATUS[status] || text(row.ocrLogStatus),
    ocrLogType: row.ocrLogType,
    orderId: row.orderId,
    orderNo: row.orderNo,
    qualityNo: text(result.qualityNo || result.certificateNo),
    timeText: text(result.time || result.arrivalDate || result.recordTime),
    ...elementFields(result),
  }
}
function ocrStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    stamp: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    day: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    clock: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    dateText: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
}

function ocrWeight() {
  return Math.floor(1000 + Math.random() * 9000)
}

function ocrFixed(docType: string): Row | undefined {
  const { stamp, day, clock, dateText } = ocrStamp()
  const wet = ocrWeight()
  const dry = Math.max(1000, Math.min(9999, Math.round(wet * 0.9)))
  const samples: Record<string, Row> = {
    入库报关单: {
      id: `9${stamp}`,
      docType: '入库报关单',
      shipName: '海豚号',
      blNo: `BL${stamp}`,
      blWeight: wet,
      customsNo: `BG${stamp}`,
      checklistNo: `HZ${stamp}`,
      amount: 218000,
      currency: '2',
      timeText: dateText,
    },
    提单: {
      id: `9${stamp}`,
      docType: '提单',
      shipName: '海豚号',
      blNo: `BL${stamp}`,
      blWeight: wet,
      customsNo: `BG${stamp}`,
      checklistNo: `HZ${stamp}`,
      amount: 218000,
      currency: '2',
      timeText: dateText,
    },
    出库报关单: {
      id: `8${stamp}`,
      docType: '出库报关单',
      customsNo: `BGCK${stamp}`,
      checklistNo: `HZCK${stamp}`,
      consignee: '华东冶炼股份公司',
      consumer: '华东冶炼冶炼一分厂',
      wet,
      amount: 218000,
      currency: 'USD',
    },
    重量单: {
      id: `7${stamp}`,
      docType: '重量单',
      wet,
      dry,
      moisture: '10%',
    },
    品质单: {
      id: `6${stamp}`,
      docType: '品质单',
      qualityNo: `QA-${day}-${clock}`,
      moisture: '10%',
      cu: '22.5',
      ag: '45',
      au: '0.8',
      as: '0.12',
      pb: '0.05',
      cd: '0.01',
      f: '0.02',
      hg: '0.001',
    },
  }
  return samples[docType] || (docType === '品质证书' ? samples['品质单'] : undefined)
}

async function recognize(body: Row) {
  const docType = text(body.docType)
  const sample = ocrFixed(docType)
  if (!sample) return fail('当前写死识别仅支持入库报关单、出库报关单、提单、重量单、品质单')
  return ok({
    ...sample,
    fileName: text(body.fileName) || `${docType}.pdf`,
    status: '待修正',
  }, '识别完成，可手工修正')
}

async function correctOcr(id: string, body: Row) {
  const detail = await ruoyiGet(`/wms/ocr/${id}`)
  const current = detail.ok ? (detail.data || {}) as Row : {}
  const result = await ruoyiSend('PUT', '/wms/ocr', {
    id: idOf(id),
    ocrLogType: body.ocrLogType ?? current.ocrLogType,
    orderId: body.archiveOnly ? 0 : (body.orderId ?? current.orderId ?? 0),
    orderNo: body.customsNo || body.orderNo || current.orderNo,
    ocrLogStatus: body.archiveOnly ? 3 : 2,
    result: {
      ...resultObject(current),
      customsNo: body.customsNo,
      recordNo: body.customsNo,
      checklistNo: body.checklistNo,
      verificationCode: body.checklistNo,
      consignee: body.consignee,
      waybillNo: body.blNo,
      blNo: body.blNo,
      waybillWeight: body.blWeight,
      blWeight: body.blWeight,
    },
  })
  return result.ok ? ok(true, '修正已提交并回填') : fail(result.message)
}

export { OCR_TYPE, OCR_TYPE_LABEL, OCR_STATUS, ocrRow }

export const ocrRoutes: Route[] = [
  { method: 'GET', match: '/ocr/tasks', handle: async ({ query }) => {
    if (text(query.docType) === '提单') return fail('后端暂不支持提单识别')
    const statusCode = Object.entries(OCR_STATUS).find(([, label]) => label === text(query.status))?.[0]
    const keyword = text(query.keyword)
    const listQuery = keyword ? { ...query, page: 1, pageSize: 500 } : query
    const result = await ruoyiGet('/wms/ocr/list', pageParams(listQuery, {
      ocrLogType: query.docType ? OCR_TYPE[text(query.docType)] : undefined,
      ocrLogStatus: statusCode != null ? Number(statusCode) : undefined,
    }))
    if (!result.ok) return fail(result.message)
    const rows = result.rows.map(ocrRow).filter((row) => {
      if (!keyword) return true
      return `${row.customsNo}${row.fileName}${row.docType}${row.id}${row.orderNo || ''}`.includes(keyword)
    })
    if (keyword) {
      const page = Number(query.page || 1)
      const pageSize = Number(query.pageSize || 10)
      const start = (page - 1) * pageSize
      return ok({ list: rows.slice(start, start + pageSize), total: rows.length, page, pageSize })
    }
    return pageOf(result, rows, query)
  } },
  { method: 'POST', match: '/ocr/recognize', handle: ({ body }) => recognize(body) },
  { method: 'PUT', match: /^\/ocr\/tasks\/([^/]+)$/, handle: ({ params, body }) => correctOcr(params[0], body) },
]
