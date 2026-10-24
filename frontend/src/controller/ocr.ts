import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { blWeightOf, elementFields, idOf, resultObject, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import type { OcrLogBo, OcrLogVo } from '@/typings/openapi'

/** OCR 单据类型编码 */
const OCR_TYPE: Record<string, number> = { 入库报关单: 0, 出库报关单: 1, 重量单: 2, 品质单: 3, 品质证书: 3 }
/** OCR 单据类型标签 */
const OCR_TYPE_LABEL = ['入库报关单', '出库报关单', '重量单', '品质单']
/** OCR 状态编码 → 标签 */
const OCR_STATUS: Record<number, string> = { 0: '待修正', 2: '已回填', 3: '已归档' }

/** 从识别结果中提取金额明细行。 */
function ocrAmountLines(result: Row) {
  const raw = result.amountLines ?? result.items ?? result.goods ?? result.details
  if (!Array.isArray(raw)) return [] as Row[]
  return raw.filter((item) => item && typeof item === 'object') as Row[]
}

/** 将 OCR 日志 Vo 映射为任务列表行。 */
function ocrRow(row: OcrLogVo | Row) {
  const bag = row as Row
  const result = resultObject(bag)
    const type = Number(bag.ocrLogType)
  const status = Number(bag.ocrLogStatus)
  const consumer = text(result.consumer || result.消费使用单位 || result.consignee || result.merchantName)
  return {
    id: text(bag.id),
    time: text(bag.createTime).replace('T', ' ').slice(0, 16),
    docType: OCR_TYPE_LABEL[type] || text(bag.ocrLogType),
    fileName: text(bag.sourceUrl || bag.orderNo),
    /** 海关编号（原报关单号） */
    customsNo: text(result.customsNo || result.recordNo || result.customsCode || bag.orderNo),
    checklistNo: text(result.verificationCode || result.checklistNo),
    /** 消费使用单位：出库委托方 / 流向企业均回填此值 */
    consumer,
    consignee: consumer,
    shipName: text(result.shipName),
    blNo: text(result.waybillNo || result.blNo),
    blWeight: blWeightOf(result),
    amount: result.payableAmount ?? result.amount ?? '',
    currency: text(result.currency),
    wet: result.wetWeight ?? result.wet ?? '',
    dry: result.dryWeight ?? result.dry ?? '',
    grossWeight: result.grossWeight ?? result.gross ?? '',
    netWeight: result.netWeight ?? result.net ?? '',
    moisture: result.moistureContent ?? result.moisture ?? '',
    amountLines: ocrAmountLines(result),
    confidence: '—',
    status: OCR_STATUS[status] || text(bag.ocrLogStatus),
    ocrLogType: bag.ocrLogType,
    orderId: bag.orderId,
    orderNo: bag.orderNo,
    qualityNo: text(result.qualityNo || result.certificateNo),
    timeText: text(result.time || result.arrivalDate || result.recordTime),
    ...elementFields(result),
  }
}
/** 生成写死识别用的时间戳片段。 */
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

/** 生成写死识别用的随机吨数。 */
function ocrWeight() {
  return Math.floor(1000 + Math.random() * 9000)
}

/** 按单据类型返回写死的识别样例。 */
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
      consumer: '华东冶炼冶炼一分厂',
      consignee: '华东冶炼冶炼一分厂',
      grossWeight: wet,
      netWeight: dry,
      amountLines: [],
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

/** 本地写死识别（不调远端 OCR 引擎）。 */
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

/** 修正 OCR 结果并回填/归档。 */
async function correctOcr(id: string, body: Row) {
  const detail = await ruoyiGet<OcrLogVo, OcrLogVo>(`/wms/ocr/${id}`)
  const current = detail.ok ? (detail.data || {}) as OcrLogVo & Row : {} as OcrLogVo & Row
  const payload: Partial<OcrLogBo> = {
    id: idOf(id) as OcrLogBo['id'],
    ocrLogType: Number(body.ocrLogType ?? current.ocrLogType) as OcrLogBo['ocrLogType'],
    orderId: body.archiveOnly ? 0 : Number(body.orderId ?? current.orderId ?? 0),
    orderNo: text(body.customsNo || body.orderNo || current.orderNo),
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
  }
  const result = await ruoyiSend('PUT', '/wms/ocr', payload)
  return result.ok ? ok(true, '修正已提交并回填') : fail(result.message)
}

export { OCR_TYPE, OCR_TYPE_LABEL, OCR_STATUS, ocrRow }

/** OCR 任务路由表 */
export const ocrRoutes: Route[] = [
  { method: 'GET', match: '/ocr/tasks', handle: async ({ query }) => {
    if (text(query.docType) === '提单') return fail('后端暂不支持提单识别')
    const statusCode = Object.entries(OCR_STATUS).find(([, label]) => label === text(query.status))?.[0]
    const keyword = text(query.keyword).trim()
    const result = await ruoyiGet<OcrLogVo>('/wms/ocr/list', pageParams(query, {
      ocrLogType: query.docType ? OCR_TYPE[text(query.docType)] : undefined,
      ocrLogStatus: statusCode != null ? Number(statusCode) : undefined,
      orderNo: keyword || undefined,
      ocrLogNo: keyword || undefined,
    }))
    if (!result.ok) return fail(result.message)
    return pageOf(result, result.rows.map(ocrRow), query)
  } },
  { method: 'POST', match: '/ocr/recognize', handle: ({ body }) => recognize(body) },
  { method: 'PUT', match: /^\/ocr\/tasks\/([^/]+)$/, handle: ({ params, body }) => correctOcr(params[0], body) },
]
