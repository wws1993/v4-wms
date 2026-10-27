<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { inboundApi, inventoryApi, outboundApi, productionApi, transferApi } from '@/api'
import ImageViewer from './ImageViewer.vue'
import { dash, tonText } from '../views/ops/samples'
import { downloadBlob, downloadText } from '@/api/result'

/** 通用行数据 */
type Row = Record<string, unknown>

/** 品质元素字段 */
const QUALITY = [
  ['cu', '铜 Cu'],
  ['ag', '银 Ag'],
  ['au', '金 Au'],
  ['as', '砷 As'],
  ['pb', '铅 Pb'],
  ['cd', '镉 Cd'],
  ['f', '氟 F'],
  ['hg', '汞 Hg'],
] as const

/** 侧栏页 id */
type PageId =
  | 'basic'
  | 'inbound'
  | 'transfer'
  | 'production'
  | 'inspect'
  | 'inCustoms'
  | 'outCustoms'
  | 'weight'
  | 'quality'

/** 侧栏项 */
type PageItem = { id: PageId; label: string }

/** 原料侧栏顺序 */
const RAW_PAGES: PageItem[] = [
  { id: 'basic', label: '基础信息' },
  { id: 'inbound', label: '收货记录' },
  { id: 'transfer', label: '移库记录' },
  { id: 'production', label: '投料记录' },
  { id: 'inCustoms', label: '入场报关单' },
  { id: 'weight', label: '重量证书' },
  { id: 'quality', label: '品质证书' },
]

/** 成品侧栏顺序 */
const FINISHED_PAGES: PageItem[] = [
  { id: 'basic', label: '基础信息' },
  { id: 'production', label: '生产记录' },
  { id: 'transfer', label: '移库记录' },
  { id: 'inspect', label: '送检记录' },
  { id: 'outCustoms', label: '出库记录' },
]

const props = defineProps<{
  modelValue: boolean
  ledger?: boolean
  lot?: Row | null
  loading?: boolean
  /** 打开时落到哪一页：基础信息、生产记录、入场报关单等。 */
  focus?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  'update:ledger': [boolean]
  openBatch: [batchNo: string, focus?: string]
}>()

/** 当前侧栏页 */
const page = ref<PageId>('basic')
/** 追溯列表加载中 */
const traceLoading = ref(false)
/** 入场记录行 */
const inboundRows = ref<Row[]>([])
/** 生产记录行 */
const productionRows = ref<Row[]>([])
/** 出库记录行（供出场报关单选用） */
const outboundRows = ref<Row[]>([])
/** 移库记录行 */
const transferRows = ref<Row[]>([])
/** 送检记录行 */
const inspectRows = ref<Row[]>([])
/** 入场报关单选中项 */
const inboundPick = ref('')
/** 出场报关单选中项 */
const outboundPick = ref('')
/** 已加载的数据源戳记 */
const loaded = ref<Partial<Record<'inbound' | 'production' | 'outbound' | 'transfer' | 'inspect', string>>>({})
/** 进行中的数据源戳记 */
const inflight = ref<Partial<Record<'inbound' | 'production' | 'outbound' | 'transfer' | 'inspect', string>>>({})
/** 单据详情补丁 */
const docPatch = ref<Row | null>(null)
/** 已拉取 docs 的批次号 */
const docsStamp = ref('')
/** 列表请求序号 */
let listTicket = 0
/** 单据请求序号 */
let docsTicket = 0
/** 进行中请求计数 */
let busy = 0

/** 当前展示票货（含 docs 补丁） */
const current = computed(() => {
  const lot = props.lot
  if (!lot) return null
  const patch = docPatch.value
  if (!patch || clean(patch.batchNo) !== clean(lot.batchNo)) return lot
  return { ...lot, ...patch }
})

/** 成品优先按库存来源和批次字段识别，兼容缺少 batchKind 的调用方。 */
const finished = computed(() => {
  const lot = current.value
  if (!lot) return false
  const cargoType = clean(lot.cargoType || lot.itemCategory)
  return lot.batchKind === '生产批次号'
    || Number(lot.type) === 2
    || cargoType === '混成品'
    || cargoType === '成品'
    || Boolean(clean(lot.batchNo))
})

/** 当前货种可见侧栏 */
const pages = computed(() => (finished.value ? FINISHED_PAGES : RAW_PAGES))

/** 关联成品列表 */
const products = computed(() => (Array.isArray(current.value?.products) ? current.value.products : []) as Row[])
/** 台账行 */
const ledgerRows = computed(() => (Array.isArray(current.value?.ledger) ? current.value.ledger : []) as Row[])
const loadedLedger = ref<{ key: string; rows: Row[] } | null>(null)
const visibleLedgerRows = computed(() => {
  const key = clean(current.value?.inventoryId || current.value?.batchNo || current.value?.customsNo || current.value?.id)
  return loadedLedger.value?.key === key ? loadedLedger.value.rows : ledgerRows.value
})

/** 当前页标题 */
const pageLabel = computed(() => pages.value.find((item) => item.id === page.value)?.label || '记录')
/** 面板是否加载中 */
const paneLoading = computed(() => Boolean(props.loading) || traceLoading.value)

/** 各页条数徽标 */
const counts = computed<Partial<Record<PageId, number>>>(() => {
  const ready = loaded.value
  return {
    inbound: ready.inbound ? inboundRows.value.length : undefined,
    production: ready.production ? productionRows.value.length : undefined,
    transfer: ready.transfer ? transferRows.value.length : undefined,
    inspect: ready.inspect ? inspectRows.value.length : undefined,
  }
})

/** 基础信息流程芯片 */
const flowItems = computed(() => {
  if (finished.value) {
    return [
      { id: 'inbound' as PageId, label: '入场', count: counts.value.inbound },
      { id: 'transfer' as PageId, label: '移库', count: counts.value.transfer },
      { id: 'production' as PageId, label: '生产', count: counts.value.production },
      { id: 'inspect' as PageId, label: '送检', count: counts.value.inspect },
    ]
  }
  return [
    { id: 'inbound' as PageId, label: '入场', count: counts.value.inbound },
    { id: 'transfer' as PageId, label: '移库', count: counts.value.transfer },
    { id: 'production' as PageId, label: '生产', count: counts.value.production },
  ]
})

/** 当前选中的入场行 */
const pickedInbound = computed(() => inboundRows.value.find((row) => String(row.customsNo || row.id) === inboundPick.value) || inboundRows.value[0])
/** 当前选中的出库行 */
const pickedOutbound = computed(() => outboundRows.value.find((row) => String(row.customsNo || row.id) === outboundPick.value) || outboundRows.value[0])

watch(() => props.modelValue, (open) => {
  if (!open) {
    resetTrace()
    return
  }
  // 无论从哪点进来，一律先落基础信息
  page.value = 'basic'
})

watch(() => clean(props.lot?.batchNo), (batch, prev) => {
  if (!props.modelValue || !batch || batch === prev) return
  // 弹窗内切到其它票货时，同样回到基础信息
  page.value = 'basic'
})

watch(() => [props.modelValue, page.value, clean(props.lot?.batchNo), finished.value] as const, ([open, name]) => {
  if (!open) return
  if (!pages.value.some((item) => item.id === name)) {
    page.value = 'basic'
    return
  }
  if (needsDocs(name)) void loadDocs()
  void loadPage(name)
})

/** 判断 focus 是否为可见页 */
function isPage(value: unknown): value is PageId {
  return pages.value.some((item) => item.id === value)
}

/** 将 focus 解析为可见页，非法则回退基础信息 */
function resolvePage(value: unknown): PageId {
  return isPage(value) ? value : 'basic'
}

/** 清洗展示文本 */
function clean(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text || text === '—' || text === '-' || text === 'null' || text === 'undefined') return ''
  return text
}

/** 吨位文案 */
function ton(value: unknown) {
  const raw = dash(value)
  return raw === '—' || String(raw).includes('吨') ? raw : `${raw} 吨`
}

/** 水分文案 */
function moistureText(value: unknown) {
  const raw = dash(value)
  return raw === '—' || String(raw).includes('%') ? raw : `${raw}%`
}

/** 文本是否命中任一关键字 */
function mentions(text: string, keys: string[]) {
  return keys.some((key) => key && text.includes(key))
}

/** 按键去重 */
function unique(rows: Row[], keyOf: (row: Row) => string) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = keyOf(row)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 解包分页列表 */
async function rowsOf(task: Promise<{ success: boolean; data: { list: Row[] } | null }>) {
  const res = await task
  return res.success && res.data ? res.data.list : []
}

/** 生产行展示映射 */
function presentProduction(row: Row): Row {
  const lines = Array.isArray(row.feedLines) ? row.feedLines as Row[] : []
  const customs = lines.map((line) => clean(line.customsNo)).filter(Boolean)
  const dry = lines.reduce((sum, line) => sum + Number(line.feedDry || 0), 0)
  let note = clean(row.remark)
  if (row.docType === '投料出库' && dry) note = `投料 ${dry} 干吨`
  if (row.docType === '加工过程') note = [clean(row.process), clean(row.timeTo) ? `至 ${clean(row.timeTo)}` : ''].filter(Boolean).join(' ')
  if (row.docType === '完工入库') note = [clean(row.product), clean(row.outputDry) ? `${row.outputDry} 干吨` : '', clean(row.stackCode)].filter(Boolean).join(' · ')
  return {
    id: row.id,
    docType: row.docType || '生产',
    prodBatch: row.prodBatch,
    customs: customs.length > 1 ? `${customs[0]} 等 ${customs.length} 票` : (customs[0] || clean(row.customsNos) || '—'),
    customsNo: customs[0] || '',
    note: note || '—',
    time: row.time,
  }
}

/** 追溯数据源 */
type TraceSource = 'inbound' | 'production' | 'outbound' | 'transfer' | 'inspect'

/** 重置追溯缓存 */
function resetTrace() {
  listTicket += 1
  docsTicket += 1
  inboundRows.value = []
  productionRows.value = []
  outboundRows.value = []
  transferRows.value = []
  inspectRows.value = []
  loaded.value = {}
  inflight.value = {}
  docPatch.value = null
  docsStamp.value = ''
}

/** 开始追溯加载 */
function beginTrace() {
  busy += 1
  traceLoading.value = true
}

/** 结束追溯加载 */
function endTrace() {
  busy = Math.max(0, busy - 1)
  if (!busy) traceLoading.value = false
}

/** 页面映射到数据源 */
function sourceOf(id: PageId): TraceSource | '' {
  if (id === 'inbound' || id === 'inCustoms') return 'inbound'
  if (id === 'production') return 'production'
  if (id === 'outCustoms') return 'outbound'
  if (id === 'transfer') return 'transfer'
  if (id === 'inspect') return 'inspect'
  return ''
}

/** 是否需要拉单据图片 */
function needsDocs(id: PageId) {
  return id === 'inCustoms' || id === 'outCustoms' || id === 'weight' || id === 'quality'
}

/** 匹配关键字集合 */
function seedKeys() {
  const lot = current.value
  if (!lot) return [] as string[]
  const fromProd = productionRows.value.flatMap((row) => [row.prodBatch, row.customsNo].map(clean))
  return [...new Set([lot.batchNo, lot.customsNo, lot.outCustomsNo, lot.blNo, ...fromProd].map(clean).filter(Boolean))]
}

/** 拉取单据附件与补丁字段 */
async function loadDocs() {
  const lot = props.lot
  const batchNo = clean(lot?.batchNo)
  if (!batchNo || docsStamp.value === batchNo) return
  const mine = ++docsTicket
  beginTrace()
  try {
    const res = await inventoryApi.detail(batchNo, { docs: 1 })
    if (mine !== docsTicket) return
    if (!res.success || !res.data) return
    const data = res.data as Row
    docPatch.value = data
    docsStamp.value = batchNo
  } finally {
    endTrace()
  }
}

/** 票货上已带齐入场摘要时，直接用本行，不再打 receiptOrder/list。 */
function inboundSeed(lot: Row): Row | null {
  const customsNo = clean(lot.customsNo || lot.recordNo)
  if (!customsNo) return null
  const rich = clean(lot.orderNo) || clean(lot.shipName) || clean(lot.time) || clean(lot.inDate) || lot.wet != null && lot.wet !== ''
  if (!rich) return null
  return {
    id: lot.orderId || lot.id,
    orderNo: lot.orderNo,
    customsNo,
    consignor: lot.consignor,
    shipName: lot.shipName,
    blNo: lot.blNo,
    stackCode: lot.stackCode || lot.stackText,
    wet: lot.wet,
    dry: lot.dry,
    status: lot.status,
    time: lot.time || lot.inDate,
    loadWeight: lot.blWeight ?? lot.loadWeight,
    checklistNo: lot.checklistNo,
    material: lot.material,
  }
}

/** 按页加载追溯数据 */
async function loadPage(id: PageId) {
  const source = sourceOf(id)
  const lot = props.lot
  if (!source || !lot) return
  const stamp = `${clean(lot.batchNo)}|${clean(lot.customsNo)}|${source}`
  if (loaded.value[source] === stamp || inflight.value[source] === stamp) return
  inflight.value = { ...inflight.value, [source]: stamp }
  const mine = ++listTicket
  beginTrace()
  try {
    const keys = seedKeys()
    if (source === 'inbound') {
      let inbound: Row[] = []
      const seeded = inboundSeed(lot)
      if (seeded && keys.every((key) => mentions(`${seeded.customsNo}${seeded.blNo}${seeded.orderNo}${seeded.id}${lot.batchNo}`, [key]))) {
        inbound = [seeded]
      } else {
        const listed = await rowsOf(inboundApi.list({ page: 1, pageSize: 50, keyword: keys[0] || undefined }))
        if (mine !== listTicket) return
        inbound = listed.filter((row) => mentions(`${row.customsNo || ''}${row.blNo || ''}${row.orderNo || ''}`, keys))
        const missing = keys.filter((key) => /^\d{10,}$/.test(key) && !inbound.some((row) => clean(row.customsNo) === key)).slice(0, 6)
        if (missing.length) {
          const extra = await Promise.all(missing.map((key) => rowsOf(inboundApi.list({ keyword: key, page: 1, pageSize: 20 }))))
          if (mine !== listTicket) return
          inbound = unique([...inbound, ...extra.flat()], (row) => clean(row.id || row.customsNo))
        }
      }
      inboundRows.value = inbound
      if (!inbound.some((row) => clean(row.customsNo || row.id) === inboundPick.value)) inboundPick.value = clean(inbound[0]?.customsNo || inbound[0]?.id)
    } else if (source === 'production') {
      const listed = await rowsOf(productionApi.list({ page: 1, pageSize: 200 }))
      if (mine !== listTicket) return
      productionRows.value = listed.filter((row) => {
        const lines = Array.isArray(row.feedLines) ? row.feedLines as Row[] : []
        const text = [row.id, row.prodBatch, row.customsNos, row.outCustomsNo, ...lines.map((line) => line.customsNo)].map((item) => clean(item)).join(' ')
        return mentions(text, keys)
      }).map(presentProduction)
    } else if (source === 'outbound') {
      const listed = await rowsOf(outboundApi.list({ page: 1, pageSize: 200 }))
      if (mine !== listTicket) return
      const outbound = listed.filter((row) => mentions(`${row.customsNo || ''}${row.batchNo || ''}${row.orderNo || ''}${row.checklistNo || ''}`, keys))
      outboundRows.value = outbound
      if (!outbound.some((row) => clean(row.customsNo || row.id) === outboundPick.value)) outboundPick.value = clean(outbound[0]?.customsNo || outbound[0]?.id)
    } else if (source === 'transfer') {
      const listed = await rowsOf(transferApi.list({ page: 1, pageSize: 200 }))
      if (mine !== listTicket) return
      transferRows.value = listed.filter((row) => {
        const id = clean(row.inventoryId)
        if (id && (id === clean(lot.inventoryId) || id === clean(lot.id))) return true
        return mentions(`${row.customsNo || ''}${row.prodBatch || ''}${row.orderNo || ''}`, keys)
      })
    } else if (source === 'inspect') {
      const batchNo = clean(lot.batchNo)
      const listed = await rowsOf(productionApi.inspections({ page: 1, pageSize: 50, batchNo: batchNo || undefined, keyword: batchNo || undefined }))
      if (mine !== listTicket) return
      inspectRows.value = listed.filter((row) => {
        if (!batchNo) return true
        return clean(row.prodBatch) === batchNo || mentions(`${row.prodBatch || ''}${row.orderNo || ''}${row.customsNos || ''}`, [batchNo])
      })
    }
    if (mine === listTicket) loaded.value = { ...loaded.value, [source]: stamp }
  } finally {
    if (inflight.value[source] === stamp) {
      const next = { ...inflight.value }
      delete next[source]
      inflight.value = next
    }
    endTrace()
  }
}

/** 取单据图片 */
function shotOf(key: string) {
  const docs = current.value?.docs
  if (!docs || typeof docs !== 'object') return { image: '', name: '' }
  const item = (docs as Row)[key]
  if (!item || typeof item !== 'object') return { image: '', name: '' }
  const shot = item as Row
  return { image: String(shot.image || ''), name: String(shot.name || '') }
}

/** 入场报关单图片 */
const inboundShot = computed(() => {
  const inbound = shotOf('inbound')
  return inbound.image ? inbound : (finished.value ? { image: '', name: '' } : shotOf('customs'))
})
/** 出场报关单图片 */
const outboundShot = computed(() => {
  const outbound = shotOf('outbound')
  return outbound.image ? outbound : (finished.value ? shotOf('customs') : { image: '', name: '' })
})
/** 重量证书图片 */
const weightShot = computed(() => shotOf('weight'))
/** 品质证书图片 */
const qualityShot = computed(() => shotOf('quality'))

/** 基础信息字段 */
const basicFields = computed(() => {
  const row = current.value
  if (!row) return []
  if (finished.value) {
    return [
      { label: '委托方', value: dash(row.consignor) },
      { label: '物料', value: dash(row.material) },
      { label: '货物类型', value: dash(row.cargoType) },
      { label: '状态', value: dash(row.status) },
      { label: '生产批次', value: dash(row.batchNo) },
      { label: '出库报关单', value: dash(row.outCustomsNo || outboundRows.value[0]?.customsNo) },
      { label: '核注清单', value: dash(row.checklistNo || row.outChecklistNo) },
      // { label: '保税账册', value: dash(row.book) },
      { label: '仓库', value: dash(row.warehouse) },
      { label: '堆位', value: row.status === '已出库' ? '—' : dash(row.stackText) },
      { label: '片区标识', value: dash(row.areaLabel) },
      { label: '干重', value: ton(row.dry) },
    ]
  }
  return [
    { label: '委托方', value: dash(row.consignor) },
    { label: '物料', value: dash(row.material) },
    { label: '货物类型', value: dash(row.cargoType) },
    { label: '状态', value: dash(row.status) },
    { label: '报关单号', value: dash(row.customsNo || row.recordNo) },
    { label: '生产批次', value: dash(row.batchNo) },
    { label: '核注清单', value: dash(row.checklistNo) },
    { label: '提单号', value: dash(row.blNo) },
    { label: '船名', value: dash(row.shipName) },
    { label: '原产国', value: dash(row.originCountry) },
    { label: '矿源备案号', value: dash(row.filingNo) },
    // { label: '保税账册', value: dash(row.book) },
    { label: '仓库', value: dash(row.warehouse) },
    { label: '堆位', value: row.status === '已出库' ? '—' : dash(row.stackText) },
    { label: '片区标识', value: dash(row.areaLabel) },
    { label: '湿重', value: ton(row.wet) },
    { label: '干重', value: ton(row.dry) },
    { label: '水分', value: moistureText(row.moisture) },
    { label: '入库时间', value: dash(row.inDate) },
  ]
})

/** 入场报关单字段 */
const inboundFields = computed(() => {
  const row = current.value
  const hit = pickedInbound.value
  if (!row) return []
  return [
    { label: '报关单号', value: dash(hit?.customsNo || row.customsNo || row.recordNo) },
    { label: '核注清单', value: dash(hit?.checklistNo || row.checklistNo) },
    { label: '提单号', value: dash(hit?.blNo || row.blNo) },
    { label: '船名', value: dash(hit?.shipName || row.shipName) },
    { label: '境内收货人', value: dash(hit?.consignor || row.consignor) },
    { label: '原产国', value: dash(row.originCountry) },
    { label: '商品项', value: dash(hit?.material || row.material) },
    { label: '矿源备案号', value: dash(row.filingNo) },
    { label: '申报日期', value: dash(row.declareDate) },
    { label: '堆位', value: dash(hit?.stackCode || row.stackText) },
  ]
})

/** 出场报关单字段 */
const outboundFields = computed(() => {
  const row = current.value
  const hit = pickedOutbound.value
  if (!row) return []
  return [
    { label: '出库报关单号', value: dash(hit?.customsNo || row.outCustomsNo) },
    { label: '核注清单', value: dash(hit?.checklistNo || row.outChecklistNo) },
    { label: '流向企业', value: dash(hit?.consignee || row.flowTo) },
    { label: '消费使用单位', value: dash(hit?.consumer) },
    { label: '生产批次', value: dash(hit?.batchNo || row.batchNo) },
    { label: '出库重量', value: ton(hit?.wet) },
    { label: '出库单号', value: dash(hit?.orderNo || hit?.id) },
    { label: '状态', value: dash(hit?.status) },
  ]
})

/** 重量证书字段 */
const weightFields = computed(() => {
  const row = current.value
  if (!row) return []
  return [
    { label: '证书编号', value: dash(row.weightNo) },
    { label: '湿重', value: ton(row.wet) },
    { label: '干重', value: ton(row.dry) },
    { label: '水分', value: moistureText(row.moisture) },
  ]
})

/** 品质证书元信息 */
const qualityMeta = computed(() => {
  const row = current.value
  if (!row) return []
  return [
    { label: '证书编号', value: dash(row.qualityNo) },
    { label: '物料', value: dash(row.material) },
  ]
})

/** 关闭详情 */
function close() {
  emit('update:modelValue', false)
}

/** 打开台账 */
const loadingLedger = ref(false)

async function openLedger() {
  const lot = current.value
  if (!lot) return
  const batchNo = clean(lot.batchNo || lot.customsNo || lot.id)
  const key = clean(lot.inventoryId || lot.batchNo || lot.customsNo || lot.id)
  if (!Array.isArray(lot.ledger) && loadedLedger.value?.key !== key) {
    loadingLedger.value = true
    const inventoryId = clean(lot.inventoryId)
    const res = inventoryId
      ? await inventoryApi.itemDetail(inventoryId, { ledger: 1 })
      : await inventoryApi.detail(batchNo, { ledger: 1 })
    loadingLedger.value = false
    if (!res.success || !res.data) {
      ElMessage.error(res.message || '加载台账失败')
      return
    }
    loadedLedger.value = {
      key,
      rows: Array.isArray(res.data.ledger) ? res.data.ledger as Row[] : [],
    }
  }
  emit('update:modelValue', false)
  emit('update:ledger', true)
}

/** 是否正在导出台账 */
const exportingLedger = ref(false)

/** 导出台账文件 */
async function exportLedger() {
  const lot = current.value
  if (!lot) return
  exportingLedger.value = true
  const res = await inventoryApi.exportLedger({
    inventoryId: lot.inventoryId || lot.id,
    batchNo: lot.batchNo,
    recordNo: lot.customsNo || lot.recordNo,
  })
  exportingLedger.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '导出失败')
    return
  }
  if (res.data.blob) downloadBlob(res.data.filename, res.data.blob)
  else if (res.data.content != null) downloadText(res.data.filename, res.data.content)
  else ElMessage.error('导出失败')
}

/** 跳转报关单相关页或其它批次 */
function openCustoms(value: unknown) {
  const text = clean(value)
  if (!text) return
  const row = current.value
  if (row && (text === clean(row.batchNo) || text === clean(row.customsNo))) {
    page.value = finished.value ? resolvePage('outCustoms') : resolvePage('inCustoms')
    return
  }
  emit('openBatch', text, 'basic')
}

/** 跳转生产批次 */
function openProd(value: unknown) {
  const text = clean(value)
  if (!text) return
  if (text === clean(current.value?.batchNo)) {
    page.value = 'production'
    return
  }
  emit('openBatch', text, 'basic')
}

/** 关联成品产量 */
function productOutput(row: Row) {
  return dash(row.yieldDry ?? row.output)
}
/** 关联成品在库 */
function productStock(row: Row) {
  if (row.stock != null && row.stock !== '') return dash(row.stock)
  return Array.isArray(row.inventory) ? String(row.inventory.length) : '—'
}
/** 关联成品已出库 */
function productOut(row: Row) {
  if (row.outbound != null && row.outbound !== '' && !Array.isArray(row.outbound)) return dash(row.outbound)
  return Array.isArray(row.outbound) ? String(row.outbound.length) : '—'
}

/** 送检附件列表 */
function inspectImages(row: Row) {
  const urls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls as string[] : []
  const names = Array.isArray(row.attachmentNames) ? row.attachmentNames as string[] : []
  if (urls.length) {
    return urls.map((url, index) => ({ url, name: names[index] || `附件${index + 1}` }))
  }
  const single = clean(row.attachmentUrl)
  return single ? [{ url: single, name: clean(row.attachment) || '附件' }] : []
}
</script>

<template>
  <el-dialog :model-value="modelValue" class="ticket-detail" :title="finished ? '混成品详情' : '原料详情'" width="1280px" align-center @close="close">
    <div v-if="current" class="ticket">
      <div class="stats" :class="{ 'is-finished': finished }">
        <div class="stat">
          <span>委托方</span>
          <strong>{{ dash(current.consignor) }}</strong>
          <em>{{ dash(current.material) }}</em>
        </div>
        <div v-if="!finished" class="stat">
          <span>矿源备案号</span>
          <strong>{{ dash(current.filingNo) }}</strong>
          <em>原料</em>
        </div>
        <div class="stat">
          <span>生产批次</span>
          <strong>{{ dash(finished ? current.batchNo : productionRows[0]?.prodBatch) }}</strong>
          <em>{{ dash(current.cargoType) }}</em>
        </div>
        <div class="stat">
          <span>{{ finished ? '干重' : '湿重 / 干重' }}</span>
          <strong>{{ finished ? dash(current.dry) : `${dash(current.wet)} / ${dash(current.dry)}` }}</strong>
          <em>吨 · {{ current.status === '已出库' ? '—' : dash(current.stackText) }}</em>
        </div>
      </div>
      <div class="layout">
        <nav class="side">
          <button v-for="item in pages" :key="item.id" type="button" :class="{ active: page === item.id }" @click="page = item.id">
            {{ item.label }}
          </button>
        </nav>
        <section class="pane">
          <div v-if="paneLoading" class="pane-load" role="status" :aria-label="`${pageLabel}加载中`">
            <span class="corner tl" />
            <span class="corner br" />
            <div class="radar" aria-hidden="true">
              <div class="ring" />
              <div class="sweep" />
              <div class="core" />
            </div>
            <strong>{{ pageLabel }}加载中</strong>
          </div>
          <template v-if="page === 'basic'">
            <dl class="fields cols">
              <div v-for="item in basicFields" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </template>

          <template v-else-if="page === 'inbound'">
            <el-table :data="inboundRows" border empty-text="暂无收货记录">
              <el-table-column prop="status" label="状态" width="100" />
              <el-table-column prop="shipName" label="船名" width="110" />
              <el-table-column prop="blNo" label="提运单号" width="200" />
              <el-table-column prop="loadWeight" label="提货重量" width="200" />
              <el-table-column label="堆位" width="100"><template #default="{ row }">{{ dash(row.stackCode) }}</template></el-table-column>
              <el-table-column label="湿重/干重" width="200"><template #default="{ row }">{{ dash(row.wet) }} / {{ dash(row.dry) }}</template></el-table-column>
              <el-table-column prop="time" label="收货时间" min-width="240" />
            </el-table>
          </template>

          <template v-else-if="page === 'transfer'">
            <el-table :data="transferRows" border empty-text="暂无移库记录">
              <el-table-column prop="orderNo" label="移库单号" min-width="150" />
              <el-table-column prop="scene" label="场景" width="110" />
              <el-table-column label="报关单号" min-width="150">
                <template #default="{ row }">
                  <el-button v-if="clean(row.customsNo)" link type="primary" @click="openCustoms(row.customsNo)">{{ dash(row.customsNo) }}</el-button>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="生产批次" min-width="130">
                <template #default="{ row }">
                  <el-button v-if="clean(row.prodBatch)" link type="primary" @click="openProd(row.prodBatch)">{{ dash(row.prodBatch) }}</el-button>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column prop="fromStack" label="原堆位" width="100" />
              <el-table-column prop="toStack" label="目标堆位" width="100" />
              <el-table-column prop="weight" label="重量" width="80" />
              <el-table-column label="时间" min-width="180"><template #default="{ row }">{{ dash(row.timeFrom) }} 至 {{ dash(row.timeTo) }}</template></el-table-column>
            </el-table>
          </template>

          <template v-else-if="page === 'production'">
            <el-table :data="productionRows" border :empty-text="finished ? '暂无生产记录' : '暂无投料记录'">
              <el-table-column prop="docType" label="类型" width="100" />
              <el-table-column prop="id" label="单号" min-width="140" />
              <el-table-column label="生产批次" min-width="130">
                <template #default="{ row }">
                  <el-button v-if="clean(row.prodBatch)" link type="primary" @click="openProd(row.prodBatch)">{{ dash(row.prodBatch) }}</el-button>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="报关单号" min-width="170">
                <template #default="{ row }">
                  <el-button v-if="row.customsNo" link type="primary" @click="openCustoms(row.customsNo)">{{ row.customs }}</el-button>
                  <span v-else>{{ dash(row.customs) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="note" label="记录" min-width="180" />
              <el-table-column prop="time" label="时间" min-width="150" />
            </el-table>
            <h4 v-if="products.length">关联成品</h4>
            <el-table v-if="products.length" :data="products" border>
              <el-table-column label="生产批次" min-width="140">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openProd(row.prodBatch)">{{ dash(row.prodBatch) }}</el-button>
                </template>
              </el-table-column>
              <el-table-column label="产量" width="100"><template #default="{ row }">{{ productOutput(row) }}</template></el-table-column>
              <el-table-column label="在库" width="100"><template #default="{ row }">{{ productStock(row) }}</template></el-table-column>
              <el-table-column label="已出库" width="100"><template #default="{ row }">{{ productOut(row) }}</template></el-table-column>
              <el-table-column prop="material" label="物料" min-width="100" />
              <el-table-column prop="stack" label="堆位" width="100" />
            </el-table>
          </template>

          <template v-else-if="page === 'inspect'">
            <el-table :data="inspectRows" border empty-text="暂无送检记录">
              <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
              <el-table-column prop="orderNo" label="完工单号" min-width="140" />
              <el-table-column prop="consignor" label="委托方" width="120" />
              <el-table-column label="关联报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNos) }}</template></el-table-column>
              <el-table-column prop="stackCode" label="堆位" width="100" />
              <el-table-column label="产量(干吨)" width="110"><template #default="{ row }">{{ dash(row.outputDry) }}</template></el-table-column>
              <el-table-column prop="time" label="送检时间" min-width="150" />
              <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
              <el-table-column label="附件" min-width="160">
                <template #default="{ row }">
                  <div class="attach-links">
                    <ImageViewer
                      v-for="(item, index) in inspectImages(row)"
                      :key="item.url"
                      variant="link"
                      :label="inspectImages(row).length > 1 ? `查看附件${index + 1}` : '查看附件'"
                      :src="item.url"
                      :name="item.name"
                      title="送检附件"
                    />
                    <span v-if="!inspectImages(row).length">{{ row.attachment || '—' }}</span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <template v-else-if="page === 'inCustoms'">
            <div v-if="inboundRows.length > 1" class="pick">
              <span>报关单</span>
              <el-select v-model="inboundPick" style="width: 240px">
                <el-option v-for="row in inboundRows" :key="String(row.id || row.customsNo)" :label="dash(row.customsNo)" :value="String(row.customsNo || row.id)" />
              </el-select>
            </div>
            <div class="doc">
              <ImageViewer
                :src="inboundShot.image"
                :name="inboundShot.name"
                title="海关进口货物报关单"
                :lines="inboundFields.slice(0, 3).map((item) => `${item.label}：${item.value}`)"
              />
              <div>
                <p class="doc-label">入场报关单</p>
                <dl class="fields">
                  <div v-for="item in inboundFields" :key="item.label">
                    <dt>{{ item.label }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </template>

          <template v-else-if="page === 'outCustoms'">
            <div v-if="outboundRows.length > 1" class="pick">
              <span>出库报关单</span>
              <el-select v-model="outboundPick" style="width: 240px">
                <el-option v-for="row in outboundRows" :key="String(row.id || row.customsNo)" :label="dash(row.customsNo)" :value="String(row.customsNo || row.id)" />
              </el-select>
            </div>
            <div class="doc">
              <ImageViewer
                :src="outboundShot.image"
                :name="outboundShot.name"
                :title="outboundFields[0]?.value && outboundFields[0].value !== '—' ? '海关出口货物报关单' : '出库报关单（尚未出库）'"
                :lines="outboundFields.slice(0, 3).map((item) => `${item.label}：${item.value}`)"
              />
              <div>
                <p class="doc-label">出库报关信息</p>
                <dl class="fields">
                  <div v-for="item in outboundFields" :key="item.label">
                    <dt>{{ item.label }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </template>

          <template v-else-if="page === 'weight'">
            <div class="doc">
              <ImageViewer
                :src="weightShot.image"
                :name="weightShot.name"
                title="重量证书"
                :lines="[`编号 ${dash(current.weightNo)}`, `湿重 ${ton(current.wet)} · 干重 ${ton(current.dry)}`]"
              />
              <div>
                <p class="doc-label">重量证书</p>
                <dl class="fields">
                  <div v-for="item in weightFields" :key="item.label">
                    <dt>{{ item.label }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </template>

          <template v-else-if="page === 'quality'">
            <div class="doc">
              <ImageViewer
                :src="qualityShot.image"
                :name="qualityShot.name"
                title="品质检验证书"
                :lines="[`编号 ${dash(current.qualityNo)}`, '本票参数随上架记入']"
              />
              <div>
                <p class="doc-label">品质证书</p>
                <dl class="fields">
                  <div v-for="item in qualityMeta" :key="item.label">
                    <dt>{{ item.label }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
                <div class="elements">
                  <label v-for="[key, label] in QUALITY" :key="key">
                    <span>{{ label }}</span>
                    <input :value="dash(current[key])" readonly />
                  </label>
                </div>
              </div>
            </div>
          </template>
        </section>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button type="primary" :loading="loadingLedger" @click="openLedger">查看台账</el-button>
    </template>
  </el-dialog>

  <el-dialog :model-value="ledger" :title="`重量台账 · ${dash(current?.batchNo)}`" width="860px" align-center @close="emit('update:ledger', false)">
    <el-table :data="visibleLedgerRows" border empty-text="暂无台账">
      <el-table-column label="时间" min-width="150"><template #default="{ row }">{{ dash(row.time) }}</template></el-table-column>
      <el-table-column label="业务类型" width="110"><template #default="{ row }">{{ dash(row.action) }}</template></el-table-column>
      <el-table-column label="流向企业" min-width="120"><template #default="{ row }">{{ dash(row.consignee) }}</template></el-table-column>
      <el-table-column label="堆位" width="100"><template #default="{ row }">{{ dash(row.stack) }}</template></el-table-column>
      <el-table-column label="湿重" width="180"><template #default="{ row }">{{ tonText(row.wet) }}</template></el-table-column>
      <el-table-column label="干重" width="180"><template #default="{ row }">{{ tonText(row.dry) }}</template></el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="emit('update:ledger', false)">关闭</el-button>
      <el-button type="primary" :loading="exportingLedger" @click="exportLedger">导出台账</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}
.stats.is-finished { grid-template-columns: repeat(3, 1fr); }
.stat {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.stat span, .stat em { display: block; color: var(--el-text-color-secondary); font-size: 12px; font-style: normal; }
.stat strong { display: block; margin: 6px 0 4px; font-size: 16px; color: var(--el-color-primary); word-break: break-all; }
.layout { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 16px; min-height: 420px; min-width: 0; max-width: 100%; }
.pane { position: relative; min-width: 0; max-width: 100%; }
.pane-load {
  position: absolute;
  inset: 0;
  z-index: 4;
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
}
.pane-load .corner {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid var(--el-color-primary);
  opacity: 0.32;
}
.pane-load .tl { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
.pane-load .br { right: 10px; bottom: 10px; border-left: 0; border-top: 0; }
.radar {
  position: relative;
  width: 280px;
  width: min(72cqmin, 360px);
  aspect-ratio: 1;
  border-radius: 50%;
  opacity: 0.32;
  background: radial-gradient(circle, color-mix(in srgb, var(--el-color-primary) 34%, transparent) 0 4.5%, transparent 5.5%);
}
.ring,
.sweep,
.core { position: absolute; border-radius: 50%; }
.ring {
  inset: 0;
  border: 3px solid color-mix(in srgb, var(--el-color-primary) 24%, transparent);
  border-top-color: var(--el-color-primary);
  animation: ticketSpin 1.1s linear infinite;
}
.sweep {
  inset: 12%;
  background: conic-gradient(from 0deg, transparent 0 68%, color-mix(in srgb, var(--el-color-primary) 62%, #fff) 90%, transparent 100%);
  animation: ticketSpin 1.8s linear infinite;
}
.core {
  inset: 42%;
  background: var(--el-color-primary);
  animation: ticketPulse 1.2s ease-in-out infinite;
}
.pane-load strong {
  position: relative;
  z-index: 1;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--el-text-color-primary);
}
@keyframes ticketSpin { to { transform: rotate(360deg); } }
@keyframes ticketPulse {
  0%, 100% { opacity: 0.5; transform: scale(0.82); }
  50% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .ring,
  .sweep,
  .core { animation: none; }
}
.pane :deep(.el-table) { width: 100%; max-width: 100%; }
.side { display: flex; flex-direction: column; gap: 4px; }
.side button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
}
.side button.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.pick { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: var(--el-text-color-secondary); }
.flow { display: grid; gap: 10px; margin-bottom: 14px; }
.flow button {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  text-align: left;
}
.flow b { display: block; font-size: 20px; color: var(--el-color-primary); }
.flow span { color: var(--el-text-color-secondary); font-size: 12px; }
.doc { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.doc-label { margin: 0 0 8px; color: var(--el-text-color-secondary); }
.fields { margin: 0; }
.fields div { display: grid; grid-template-columns: 96px 1fr; gap: 8px; margin-bottom: 8px; }
.fields.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
.fields dt { color: var(--el-text-color-secondary); }
.fields dd { margin: 0; font-weight: 600; word-break: break-all; }
.elements { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin-top: 8px; }
.elements label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--el-text-color-secondary); }
.elements input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
}
.attach-links { display: flex; flex-wrap: wrap; gap: 6px 10px; }
h4 { margin: 16px 0 8px; font-size: 14px; }
@media (max-width: 800px) {
  .stats, .layout, .doc, .fields.cols, .elements, .flow { grid-template-columns: 1fr; }
  .stats.is-finished { grid-template-columns: 1fr; }
}
</style>

<style>
.ticket-detail.el-dialog { max-width: calc(100vw - 48px); }
.ticket-detail .el-dialog__body { overflow-x: hidden; }
</style>
