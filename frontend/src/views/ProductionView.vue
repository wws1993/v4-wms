<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inventoryApi, partnerApi, productionApi, warehouseApi } from '@/api'
import ImageUpload from '@/components/ImageUpload.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import StackGridPicker from '@/components/StackGridPicker.vue'
import type { StackPick } from '@/components/YardPlanMap.vue'
import { usePageTab } from '@/hooks/pageTab'
import { dash } from './ops/samples'

type Line = {
  inventoryId: string
  customsNo: string
  consignor: string
  consignorId: string
  cargoType: string
  material: string
  voyage: string
  blNo: string
  originCountry: string
  wet: number
  dry: number
  feedDry: number
  stack: string
  areaLabel: string
  outCustomsNo: string
}

type Doc = Record<string, unknown>

const route = useRoute()
const tab = usePageTab('feed', ['feed', 'inspect'])
const filters = reactive({ consignor: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const docs = ref<Doc[]>([])
const productionTotal = ref(0)
const stacks = ref<Doc[]>([])
const feedLots = ref<Doc[]>([])
const feedTotal = ref(0)
const feedPage = ref(1)
const feedPageSize = ref(10)
const opsPage = ref(1)
const opsPageSize = ref(10)
const feedLoading = ref(false)
const feedQueried = ref(false)
const feedCountries = ref<string[]>([])
const feedCargoTypes = ref<string[]>([])
const lotCache = ref<Record<string, Doc>>({})
const loading = ref(false)
const feedOpen = ref(false)
const processOpen = ref(false)
const finishOpen = ref(false)
const detailOpen = ref(false)
const ledgerOpen = ref(false)
const ledgerDate = ref('')
const detailBatch = ref('')
const feed = reactive({ prodBatch: '', keyword: '', cargoType: '', country: '', stack: '' })
const feedPicked = ref<Record<string, string>>({})
const process = reactive({ id: '', orderNo: '', locked: false, consignor: '', prodBatch: '', process: '混矿筛分', from: '', to: '', remark: '' })
const finish = reactive({
  id: '',
  orderNo: '',
  locked: false,
  consignor: '',
  prodBatch: '',
  outputDry: '',
  stackCode: '',
  areaId: '',
  cells: '',
  picks: [] as StackPick[],
})
const inspectRows = ref<Doc[]>([])
const inspectTotal = ref(0)
const inspectPage = ref(1)
const inspectPageSize = ref(10)
const inspectLoading = ref(false)
const inspectOpen = ref(false)
const inspectSaving = ref(false)
const inspectLots = ref<Doc[]>([])
const inspectLotsLoading = ref(false)
const inspectLotKeyword = ref('')
const inspectFiles = ref<File[]>([])
const inspectForm = reactive({
  id: '',
  productionOrderId: '',
  prodBatch: '',
  orderNo: '',
  consignor: '',
  stackCode: '',
  customsNos: '',
  outputDry: '',
  remark: '',
  fileUrl: '',
  attachmentUrls: [] as string[],
  attachmentNames: [] as string[],
})

function linesOf(row: Doc): Line[] {
  if (!Array.isArray(row.feedLines)) return []
  return row.feedLines as Line[]
}

function amountOf(line: { feedDry?: number; dry?: number }) {
  return Number(line.feedDry ?? line.dry ?? 0)
}

function num(value: unknown) {
  const n = Number(value || 0)
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function clock(value: unknown) {
  return String(value || '').slice(11, 16)
}

function customsText(lines: Line[]) {
  if (!lines.length) return '—'
  if (lines.length === 1) return lines[0].customsNo
  return `${lines[0].customsNo} 等 ${lines.length} 票`
}

function stackText(lines: Line[]) {
  const names = [...new Set(lines.map((line) => line.stack).filter(Boolean))]
  return names.join(' / ') || '—'
}

function lotKey(row: Doc) {
  return String(row.inventoryId || row.id || row.batchNo)
}

function availableOf(row: Doc) {
  const remain = Number(row.remain)
  if (!Number.isFinite(remain)) return 0
  return Math.max(0, Math.round(remain * 1000) / 1000)
}

const pickedLots = computed(() => Object.keys(feedPicked.value).map((key) => lotCache.value[key]).filter((row): row is Doc => Boolean(row)))
const feedConsignors = computed(() => [...new Set(pickedLots.value.map((row) => String(row.consignor || '')).filter(Boolean))])
const feedConsignorText = computed(() => {
  if (feedConsignors.value.length) return feedConsignors.value.join('、')
  return batchParty(feed.prodBatch).names.join('、')
})

function matchesKeyword(row: Doc) {
  const word = filters.keyword.trim()
  if (!word) return true
  const lines = linesOf(row)
  return `${row.orderNo || ''}${row.id || ''}${row.prodBatch || ''}${row.customsNos || ''}${row.outCustomsNo || ''}${lines.map((line) => line.customsNo).join('')}`.includes(word)
}

function batchLines(batch: string) {
  const lines: Line[] = []
  const seen = new Set<string>()
  for (const row of docs.value) {
    if (row.prodBatch !== batch) continue
    for (const line of linesOf(row)) {
      const key = line.inventoryId || line.customsNo
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      lines.push(line)
    }
  }
  return lines
}

function linesOfOrder(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  const own = linesOf(doc || {})
  if (own.length) return own
  return batchLines(String(doc?.prodBatch || ''))
}

function finishOf(batch: string) {
  return docs.value.find((row) => row.docType === '完工入库' && row.prodBatch === batch)
}

const feedOrders = computed(() => docs.value.filter((row) => row.docType === '投料出库' && !row.finished))
const openOrders = computed(() => docs.value.filter((row) => (row.docType === '投料出库' || row.docType === '加工过程') && !row.finished))

const flatOps = computed<Doc[]>(() => {
  return docs.value.map((row) => {
    const lines = linesOf(row).length ? linesOf(row) : batchLines(String(row.prodBatch))
    const feedDry = row.inputDry ?? lines.reduce((sum, line) => sum + amountOf(line), 0)
    const kinds = [...new Set(lines.map((line) => line.cargoType).filter(Boolean))]
    const base = {
      ...row,
      lead: true,
      customs: customsText(lines),
      outCustoms: row.outCustomsNo || '—',
    }

    if (row.docType === '加工过程') {
      return {
        ...base,
        type: '加工过程',
        canProcess: false,
        canFinish: !row.finished,
        kind: row.process,
        qty: `加工时间：${clock(row.time)}–${clock(row.timeTo)}`,
        stack: stackText(lines),
      }
    }
    if (row.docType === '投料出库') {
      return {
        ...base,
        type: '投料出库',
        canProcess: !row.finished,
        canFinish: false,
        kind: kinds.join('、') || '—',
        qty: lines.length ? `投入 ${num(feedDry)} 干吨` : '—',
        stack: stackText(lines),
      }
    }
    return {
      ...base,
      type: '完工入库',
      canProcess: false,
      canFinish: false,
      kind: row.product || row.process || '成品',
      qty: row.outputDry != null && row.outputDry !== '' ? `产出 ${num(row.outputDry)} 干吨` : '—',
      stack: row.stackCode || stackText(lines),
    }
  })
})

const opsRows = computed(() => flatOps.value.filter((row) => {
  if (filters.consignor && row.consignor !== filters.consignor) return false
  if (!matchesKeyword(row)) return false
  const day = String(row.time || '').slice(0, 10)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  return true
}))

watch(() => [filters.keyword, filters.consignor, filters.from, filters.to], () => {
  opsPage.value = 1
})

const finishRows = computed(() => docs.value.filter((row) => row.docType === '完工入库' && matchesKeyword(row)))
const detailLines = computed(() => batchLines(detailBatch.value))
const detailFinish = computed(() => finishOf(detailBatch.value))
const processLines = computed(() => linesOfOrder(process.id))
const finishLines = computed(() => linesOfOrder(finish.id))
const finishCustoms = computed(() => customsText(finishLines.value))
const finishAllocatedDry = computed(() => finish.picks.reduce((sum, pick) => {
  const weight = Number(pick.dryWeight)
  return sum + (Number.isFinite(weight) ? weight : 0)
}, 0))
let productionLoadSequence = 0

const ledgerRows = computed(() => {
  const map = new Map<string, { date: string; consume: number; output: number; orders: Set<string> }>()
  for (const row of docs.value) {
    const date = String(row.time || '').slice(0, 10) || '—'
    const item = map.get(date) || { date, consume: 0, output: 0, orders: new Set<string>() }
    if (row.docType === '投料出库' || (row.docType === '加工过程' && !docs.value.some((other) => other.docType === '投料出库' && other.prodBatch === row.prodBatch))) {
      item.consume += linesOf(row).reduce((sum, line) => sum + amountOf(line), 0)
      if (row.workOrder) item.orders.add(String(row.workOrder))
    }
    if (row.docType === '加工过程' && row.workOrder) item.orders.add(String(row.workOrder))
    if (row.docType === '完工入库') item.output += Number(row.outputDry || 0)
    map.set(date, item)
  }
  return [...map.values()].map((item) => ({ date: item.date, consume: item.consume, output: item.output, orders: item.orders.size }))
})

const ledgerDetails = computed(() => flatOps.value.filter((row) => String(row.time || '').slice(0, 10) === ledgerDate.value))

function outCustoms(line: Line) {
  if (line.outCustomsNo) return line.outCustomsNo
  const doc = docs.value.find((row) => row.docType === '投料出库' && row.prodBatch === detailBatch.value && linesOf(row).some((item) => item.customsNo === line.customsNo))
  return String(doc?.outCustomsNo || '—')
}

function areaOf(code: unknown, fallback: unknown) {
  const stack = stacks.value.find((item) => item.code === code)
  return String(stack?.areaLabel || fallback || '—')
}

function cargoTag(type: unknown) {
  return type === '报备矿' ? 'warning' : 'success'
}

function areaTag(area: unknown) {
  if (area === '待检区') return 'warning'
  if (area === '成品区') return 'success'
  return 'primary'
}

function feedOver(key: string, row: Doc) {
  const amount = Number(feedPicked.value[key] || 0)
  return feedPicked.value[key] != null && (!(amount > 0) || amount > availableOf(row))
}

function orderLabel(row: Doc) {
  return `${row.orderNo || row.id} · ${row.prodBatch || ''}`
}

async function load() {
  const sequence = ++productionLoadSequence
  loading.value = true
  const res = await productionApi.list({
    page: opsPage.value,
    pageSize: opsPageSize.value,
    batchNo: filters.keyword.trim() || undefined,
    consignor: filters.consignor || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  })
  if (sequence !== productionLoadSequence) return false
  loading.value = false
  if (!res.success || !res.data) {
    if (!res.success) ElMessage.error(res.message)
    return false
  }
  docs.value = res.data.list
  productionTotal.value = Number(res.data.total || 0)
  return true
}

function applyKeyword() {
  if (route.name !== 'production') return false
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (filters.keyword === keyword) return false
  filters.keyword = keyword
  return true
}

watch(() => route.query.keyword, () => {
  applyKeyword()
})

watch(tab, (name, previous) => {
  if (!previous || name === previous) return
  if (name === 'inspect') {
    loadInspections()
    return
  }
  opsPage.value = 1
  load()
})

watch(() => feed.prodBatch, (batch) => {
  if (!feedOpen.value || !batch) return
  const locked = batchParty(batch)
  if (!locked.tokens.length && !locked.names.length) return
  const next = { ...feedPicked.value }
  let removed = 0
  for (const key of Object.keys(next)) {
    const row = lotCache.value[key]
    if (row && partyClash(row, locked)) {
      delete next[key]
      removed += 1
    }
  }
  if (!removed) return
  feedPicked.value = next
  if (mixedParty(locked)) {
    ElMessage.warning(`生产批次 ${batch} 已有不同委托方，已取消本次勾选`)
    return
  }
  ElMessage.warning(`生产批次 ${batch} 的委托方是 ${locked.names[0] || locked.tokens[0]}，已取消其他委托方的原料`)
})

onActivated(() => {
  applyKeyword()
})

onMounted(async () => {
  const [who, stackRes, categoryRes] = await Promise.all([
    partnerApi.consignors(),
    warehouseApi.stackCatalog(),
    dictApi.labels('wms_item_category'),
  ])
  if (who.success && Array.isArray(who.data) && who.data.length) consignors.value = who.data
  if (stackRes.success && Array.isArray(stackRes.data)) stacks.value = stackRes.data
  if (categoryRes.success && Array.isArray(categoryRes.data)) {
    feedCargoTypes.value = categoryRes.data.filter((item) => item !== '混成品' && item !== '成品')
  }
  if (tab.value === 'inspect') await loadInspections()
  else await load()
  if (!consignors.value.length) {
    consignors.value = [...new Set(docs.value.map((row) => String(row.consignor || '')).filter(Boolean))]
  }
})

async function loadInspections() {
  inspectLoading.value = true
  const res = await productionApi.inspections({
    page: inspectPage.value,
    pageSize: inspectPageSize.value,
    keyword: filters.keyword || undefined,
    consignor: filters.consignor || undefined,
  })
  inspectLoading.value = false
  if (!res.success || !res.data) {
    inspectRows.value = []
    inspectTotal.value = 0
    if (!res.success) ElMessage.error(res.message || '加载送检记录失败')
    return false
  }
  inspectRows.value = res.data.list
  inspectTotal.value = res.data.total
  return true
}

function inspectImages(row: Doc) {
  const urls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls.map(String).filter(Boolean) : []
  const names = Array.isArray(row.attachmentNames) ? row.attachmentNames.map(String) : []
  return urls.map((url, index) => ({ url, name: names[index] || '' }))
}

function resetInspectForm() {
  inspectForm.id = ''
  inspectForm.productionOrderId = ''
  inspectForm.prodBatch = ''
  inspectForm.orderNo = ''
  inspectForm.consignor = ''
  inspectForm.stackCode = ''
  inspectForm.customsNos = ''
  inspectForm.outputDry = ''
  inspectForm.remark = ''
  inspectForm.fileUrl = ''
  inspectForm.attachmentUrls = []
  inspectForm.attachmentNames = []
  inspectFiles.value = []
  inspectLotKeyword.value = ''
  inspectLots.value = []
}

async function loadInspectLots() {
  inspectLotsLoading.value = true
  const res = await productionApi.inspectLots({
    keyword: inspectLotKeyword.value.trim() || undefined,
    page: 1,
  })
  inspectLotsLoading.value = false
  if (!res.success || !res.data) {
    inspectLots.value = []
    if (!res.success) ElMessage.error(res.message || '加载待检票货失败')
    return
  }
  inspectLots.value = res.data.list
}

function pickInspectLot(row: Doc) {
  if (inspectForm.id) return
  inspectForm.productionOrderId = String(row.productionOrderId || row.id || '')
  inspectForm.prodBatch = String(row.prodBatch || '')
  inspectForm.orderNo = String(row.orderNo || '')
  inspectForm.consignor = String(row.consignor || '')
  inspectForm.stackCode = String(row.stackCode || '')
  inspectForm.customsNos = String(row.customsNos || '')
  inspectForm.outputDry = String(row.outputDry ?? '')
}

async function openInspectCreate() {
  resetInspectForm()
  inspectOpen.value = true
  await loadInspectLots()
}

async function openInspectEdit(row: Doc) {
  resetInspectForm()
  inspectForm.id = String(row.id || '')
  inspectForm.productionOrderId = String(row.productionOrderId || '')
  inspectForm.prodBatch = String(row.prodBatch || '')
  inspectForm.orderNo = String(row.orderNo || '')
  inspectForm.consignor = String(row.consignor || '')
  inspectForm.stackCode = String(row.stackCode || '')
  inspectForm.customsNos = String(row.customsNos || '')
  inspectForm.outputDry = String(row.outputDry ?? '')
  inspectForm.remark = String(row.remark || '')
  inspectForm.fileUrl = String(row.fileUrl || '')
  inspectForm.attachmentUrls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls.map(String) : []
  inspectForm.attachmentNames = Array.isArray(row.attachmentNames) ? row.attachmentNames.map(String) : []
  inspectOpen.value = true
  if (!inspectForm.prodBatch && inspectForm.id) {
    const res = await productionApi.getInspection(inspectForm.id)
    if (res.success && res.data) {
      const detail = res.data
      inspectForm.productionOrderId = String(detail.productionOrderId || inspectForm.productionOrderId)
      inspectForm.prodBatch = String(detail.prodBatch || '')
      inspectForm.orderNo = String(detail.orderNo || '')
      inspectForm.consignor = String(detail.consignor || '')
      inspectForm.stackCode = String(detail.stackCode || '')
      inspectForm.customsNos = String(detail.customsNos || '')
      inspectForm.outputDry = String(detail.outputDry ?? '')
      inspectForm.remark = String(detail.remark || '')
      inspectForm.fileUrl = String(detail.fileUrl || '')
      inspectForm.attachmentUrls = Array.isArray(detail.attachmentUrls) ? detail.attachmentUrls.map(String) : []
      inspectForm.attachmentNames = Array.isArray(detail.attachmentNames) ? detail.attachmentNames.map(String) : []
    }
  }
}

async function saveInspect() {
  if (!inspectForm.productionOrderId) {
    ElMessage.warning('请选择待检区票货')
    return
  }
  if (!inspectForm.id && !inspectFiles.value.length && !inspectForm.fileUrl) {
    ElMessage.warning('请上传附件')
    return
  }
  inspectSaving.value = true
  const body = {
    productionOrderId: inspectForm.productionOrderId,
    prodBatch: inspectForm.prodBatch,
    remark: inspectForm.remark,
    fileUrl: inspectForm.fileUrl,
    __files: inspectFiles.value,
  }
  const res = inspectForm.id
    ? await productionApi.updateInspection(inspectForm.id, body)
    : await productionApi.createInspection(body)
  inspectSaving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || (inspectForm.id ? '已保存' : '送检已完成'))
  inspectOpen.value = false
  loadInspections()
}

async function search() {
  if (filters.from && filters.to && filters.from > filters.to) {
    ElMessage.warning('开始日期不能晚于结束日期')
    return
  }
  if (tab.value === 'inspect') {
    inspectPage.value = 1
    const done = await loadInspections()
    if (!done) return
    ElMessage.success(inspectTotal.value ? `已查询，共 ${inspectTotal.value} 条` : '该条件下暂无送检记录')
    return
  }
  opsPage.value = 1
  const done = await load()
  if (!done) return
  if (tab.value === 'finish') {
    ElMessage.success(productionTotal.value ? `已查询，共 ${productionTotal.value} 条` : '该条件下暂无完工记录')
    return
  }
  ElMessage.success(productionTotal.value ? `已查询，共 ${productionTotal.value} 条` : '该条件下暂无投料或加工记录')
}

function changeProductionPage(page: number) {
  opsPage.value = page
  load()
}

function changeProductionPageSize(pageSize: number) {
  opsPageSize.value = pageSize
  opsPage.value = 1
  load()
}

type Party = { tokens: string[]; names: string[] }

const PARTY_MARKS = ['五矿', '金川', '南国']

function partyToken(party: { id: string; name: string }) {
  const mark = PARTY_MARKS.find((item) => party.name.includes(item))
  return mark || party.id || party.name
}

function partyOf(entries: { id: string; name: string }[]): Party {
  const tokens = new Set<string>()
  const names = new Set<string>()
  entries.forEach((entry) => {
    const token = partyToken(entry)
    if (token) tokens.add(token)
    if (entry.name) names.add(entry.name)
  })
  return { tokens: [...tokens], names: [...names] }
}

function rowParty(row: { consignor?: unknown; consignorId?: unknown }) {
  return { id: String(row.consignorId || '').trim(), name: String(row.consignor || '').trim() }
}

function batchParty(batch: string): Party {
  if (!batch) return { tokens: [], names: [] }
  const entries: { id: string; name: string }[] = []
  for (const row of docs.value) {
    if (String(row.prodBatch || '') !== batch) continue
    if (row.docType !== '投料出库' && row.docType !== '加工过程' && row.docType !== '完工入库') continue
    entries.push(rowParty(row))
    for (const line of linesOf(row)) entries.push({ id: line.consignorId, name: line.consignor })
  }
  return partyOf(entries)
}

function pickedParty(): Party {
  return partyOf(pickedLots.value.map((row) => rowParty(row)))
}

function mergeParty(left: Party, right: Party): Party {
  return {
    tokens: [...new Set([...left.tokens, ...right.tokens])],
    names: [...new Set([...left.names, ...right.names])],
  }
}

function mixedParty(party: Party) {
  return party.tokens.length > 1
}

function partyClash(row: { consignor?: unknown; consignorId?: unknown }, locked: Party) {
  if (mixedParty(locked)) return '同一生产批次不能添加不同委托方的原料'
  const party = rowParty(row)
  const token = partyToken(party)
  if (!token) return '该原料没有委托方，不能投料'
  if (!locked.tokens.length) return ''
  if (locked.tokens.includes(token)) return ''
  const label = locked.names[0] || locked.tokens[0]
  return `同一生产批次只能投同一委托方（${label}）`
}

function onFeedCheck(row: Doc, on: unknown) {
  const key = lotKey(row)
  const left = availableOf(row)
  if (on && left <= 0) {
    ElMessage.warning(`报关单 ${row.batchNo} 剩余干吨为 0`)
    return
  }
  if (on) {
    const reason = partyClash(row, mergeParty(pickedParty(), batchParty(feed.prodBatch)))
    if (reason) {
      ElMessage.warning(reason)
      return
    }
  }
  lotCache.value = { ...lotCache.value, [key]: row }
  if (on) feedPicked.value = { ...feedPicked.value, [key]: String(left) }
  else {
    const next = { ...feedPicked.value }
    delete next[key]
    feedPicked.value = next
  }
}

function openFeed() {
  Object.assign(feed, { prodBatch: '', keyword: '', cargoType: '', country: '', stack: '' })
  feedPicked.value = {}
  lotCache.value = {}
  feedLots.value = []
  feedTotal.value = 0
  feedPage.value = 1
  feedCountries.value = []
  feedOpen.value = true
  searchLots()
}

function resetFeedFilter() {
  Object.assign(feed, { keyword: '', cargoType: '', country: '', stack: '' })
  if (feedPage.value !== 1) {
    feedPage.value = 1
    return
  }
  searchLots()
}

async function searchLots() {
  feedLoading.value = true
  feedQueried.value = true
  const res = await inventoryApi.list({
    page: feedPage.value,
    pageSize: feedPageSize.value,
    status: '在库',
    keyword: feed.keyword || undefined,
    cargoType: feed.cargoType || undefined,
    originCountry: feed.country || undefined,
    stack: feed.stack || undefined,
  })
  feedLoading.value = false
  if (!res.success || !res.data) {
    feedLots.value = []
    feedTotal.value = 0
    if (!res.success) ElMessage.error(res.message)
    return
  }
  const rows = res.data.list.filter((row) => row.status === '在库' && row.batchKind === '报关单号' && row.cargoType !== '混成品')
  const seen = new Set(feedCountries.value)
  rows.forEach((row) => {
    const name = String(row.originCountry || '')
    if (name && name !== '—') seen.add(name)
    lotCache.value[lotKey(row)] = row
  })
  feedCountries.value = [...seen]
  let total = Number(res.data.total || 0)
  let pageRows = rows
  if (rows.length > feedPageSize.value && rows.length >= total) {
    total = rows.length
    const start = (feedPage.value - 1) * feedPageSize.value
    pageRows = rows.slice(start, start + feedPageSize.value)
  }
  feedLots.value = pageRows
  feedTotal.value = total
}

function queryLots() {
  if (feedPage.value !== 1) {
    feedPage.value = 1
    return
  }
  searchLots()
}

function onFeedPage() {
  if (feedQueried.value) searchLots()
}

function onFeedSize() {
  if (!feedQueried.value) return
  if (feedPage.value !== 1) feedPage.value = 1
  else searchLots()
}

function lotLine(row: Doc, feedDry: number): Line {
  return {
    inventoryId: lotKey(row),
    customsNo: String(row.customsNo || row.recordNo || ''),
    consignor: String(row.consignor || ''),
    consignorId: String(row.consignorId || ''),
    cargoType: String(row.cargoType || ''),
    material: String(row.material || ''),
    voyage: String(row.shipName || ''),
    blNo: String(row.blNo || ''),
    originCountry: String(row.originCountry || ''),
    wet: Number(row.wet || 0),
    dry: Number(row.dry || 0),
    feedDry,
    stack: String(row.stackText || ''),
    areaLabel: String(row.areaLabel || ''),
    outCustomsNo: '',
  }
}

async function saveFeed() {
  const keys = Object.keys(feedPicked.value)
  if (!feed.prodBatch || !keys.length) {
    ElMessage.warning('请填写生产批次，并勾选报关单')
    return
  }
  const lines = keys.map((key) => {
    const lot = lotCache.value[key]
    return lotLine(lot || { batchNo: key, inventoryId: key }, Number(feedPicked.value[key] || 0))
  })
  const over = lines.find((line) => {
    const lot = lotCache.value[line.inventoryId]
    return !(line.feedDry > 0) || !lot || line.feedDry > availableOf(lot)
  })
  if (over) {
    const lot = lotCache.value[over.inventoryId]
    const left = lot ? availableOf(lot) : 0
    ElMessage.warning(over.feedDry > 0 ? `报关单 ${over.customsNo} 本次 ${over.feedDry} 吨，剩余 ${left} 吨` : `报关单 ${over.customsNo} 投料干吨须大于 0`)
    return
  }
  const history = batchParty(feed.prodBatch)
  const clash = lines.map((line) => partyClash(line, mergeParty(pickedParty(), history))).find(Boolean)
    || (mixedParty(history) ? '该生产批次已有不同委托方，不能继续投料' : '')
  if (clash) {
    ElMessage.warning(clash)
    return
  }
  const consignorIds = [...new Set(lines.map((line) => line.consignorId).filter(Boolean))]
  const consignorTokens = new Set(lines.map((line) => partyToken({ id: line.consignorId, name: line.consignor })).filter(Boolean))
  if (consignorTokens.size > 1) {
    ElMessage.warning('同一生产批次不能添加不同委托方的原料')
    return
  }
  const res = await productionApi.create({
    batchNo: feed.prodBatch,
    consignorId: consignorIds[0] || '',
    productionOrderDetails: lines.map((line) => ({
      inventoryId: line.inventoryId,
      dryWeight: line.feedDry,
      wetWeight: line.wet,
    })),
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  feedOpen.value = false
  await load()
}

function fillProcess(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  process.id = id
  process.orderNo = String(doc?.orderNo || '')
  process.consignor = String(doc?.consignor || '')
  process.prodBatch = String(doc?.prodBatch || '')
  process.process = '混矿筛分'
  process.from = ''
  process.to = ''
  process.remark = ''
}

function openProcess(row?: Doc) {
  const target = row?.id ? row : feedOrders.value[0]
  if (!target) {
    ElMessage.warning('没有可登记加工的投料单')
    return
  }
  process.locked = Boolean(row?.id)
  fillProcess(String(target.id))
  processOpen.value = true
}

async function saveProcess() {
  if (!process.id || !process.process) {
    ElMessage.warning('请选择投料单并填写工序')
    return
  }
  if (process.from && process.to && process.from > process.to) {
    ElMessage.warning('开始时间不能晚于结束时间')
    return
  }
  const res = await productionApi.process(process.id, {
    processName: process.process,
    startTime: process.from,
    endTime: process.to,
    remark: process.remark,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  processOpen.value = false
  load()
}

function consignorFromFeed(doc: Doc | undefined) {
  const lines = linesOf(doc || {})
  const names = [...new Set(lines.map((line) => line.consignor).filter(Boolean))]
  if (names.length) return names.join('、')
  const batch = [...new Set(batchLines(String(doc?.prodBatch || '')).map((line) => line.consignor).filter(Boolean))]
  if (batch.length) return batch.join('、')
  return String(doc?.consignor || '')
}

function fillFinish(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  finish.id = id
  finish.orderNo = String(doc?.orderNo || '')
  finish.consignor = consignorFromFeed(doc)
  finish.prodBatch = String(doc?.prodBatch || '')
  finish.outputDry = ''
  finish.stackCode = ''
  finish.areaId = ''
  finish.cells = ''
  finish.picks = []
}

function openFinish(row?: Doc) {
  const target = row?.id ? row : openOrders.value[0]
  if (!target) {
    ElMessage.warning('没有待完工的生产单')
    return
  }
  finish.locked = Boolean(row?.id)
  fillFinish(String(target.id))
  finishOpen.value = true
}

async function saveFinish() {
  const outputDry = Number(finish.outputDry)
  if (!finish.id || !(outputDry > 0)) {
    ElMessage.warning('请选择生产单并填写产量')
    return
  }
  const picks = finish.picks.filter((pick) => pick.areaId || pick.stackCode)
  if (!picks.length) {
    ElMessage.warning('请在待检区地图选择一个或多个堆位')
    return
  }
  const missingCells = picks.find((pick) => !String(pick.cells || '').trim())
  if (missingCells) {
    ElMessage.warning(`请为堆位 ${missingCells.stackCode || missingCells.areaId} 框选存放格子`)
    return
  }
  const invalidWeight = picks.find((pick) => !(Number(pick.dryWeight) > 0))
  if (invalidWeight) {
    ElMessage.warning(`请填写堆位 ${invalidWeight.stackCode || invalidWeight.areaId} 的入库干吨`)
    return
  }
  if (Math.abs(finishAllocatedDry.value - outputDry) >= 0.011) {
    ElMessage.warning(`各堆位干吨合计需等于产量 ${num(outputDry)} 吨`)
    return
  }
  const doc = docs.value.find((row) => String(row.id) === finish.id)
  const res = await productionApi.finish(finish.id, {
    productionWeight: outputDry,
    productionOrderAreas: picks.map((pick) => ({
      areaId: pick.areaId,
      warehouseId: pick.warehouseId,
      areas: pick.cells,
      dryWeight: Number(pick.dryWeight),
    })),
    batchNo: String(finish.prodBatch || doc?.prodBatch || ''),
    consignorId: doc?.consignorId == null ? undefined : String(doc.consignorId),
    processName: doc?.process == null ? undefined : String(doc.process),
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  finishOpen.value = false
  load()
}

function distributeFinishDry() {
  const picks = finish.picks
  const outputDry = Number(finish.outputDry)
  if (!picks.length || !(outputDry > 0)) return
  const share = Math.floor((outputDry / picks.length) * 100) / 100
  picks.forEach((pick, index) => {
    pick.dryWeight = index === picks.length - 1
      ? Number((outputDry - share * (picks.length - 1)).toFixed(2))
      : share
  })
}

async function openDetail(row: Doc) {
  const id = String(row.id || '')
  const name = String(row.prodBatch || '')
  detailBatch.value = name
  detailOpen.value = true
  if (!id) return
  const res = await productionApi.detail(id)
  if (!res.success || !res.data || !Array.isArray(res.data.list) || !res.data.list.length) return
  const extra = (res.data.list as Doc[]).map((row) => {
    if (linesOf(row).length) return row
    const local = docs.value.find((item) => String(item.id) === id)
    if (!local || !linesOf(local).length) return row
    return { ...row, feedLines: local.feedLines, customsNos: local.customsNos, sourceStacks: local.sourceStacks, outCustomsNo: local.outCustomsNo }
  })
  const detailed = extra[0]
  if (!detailed) return
  const existing = docs.value.some((item) => String(item.id) === id)
  docs.value = existing
    ? docs.value.map((item) => String(item.id) === id ? { ...item, ...detailed } : item)
    : [...docs.value, detailed]
}

function openLedger(date: string) {
  ledgerDate.value = date
  ledgerOpen.value = true
}
</script>

<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="投料/加工" name="feed">
        <div class="toolbar">
          <el-button type="primary" @click="openFeed">新建生产批次</el-button>
        </div>
        <el-form :inline="true">
          <el-form-item label="单号">
            <el-input v-model="filters.keyword" clearable placeholder="生产批次 / 报关单" style="width: 180px" />
          </el-form-item>
          <el-form-item label="委托方">
            <el-select v-model="filters.consignor" clearable placeholder="全部" style="width: 140px">
              <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" />
            <span class="sep">至</span>
            <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="search">查询</el-button></el-form-item>
        </el-form>
        <el-table v-loading="loading" :data="opsRows" border stripe>
          <el-table-column label="类型" width="100">
            <template #default="{ row }"><el-tag :type="row.type === '加工过程' ? 'primary' : 'success'" effect="plain">{{ row.type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="orderNo" label="单号" width="150" />
          <el-table-column label="委托方" width="190">
            <template #default="{ row }"><el-tag effect="plain">{{ row.consignor }}</el-tag></template>
          </el-table-column>
          <el-table-column label="生产批次" width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
          <el-table-column label="报关单号" min-width="180"><template #default="{ row }">{{ dash(row.customs) }}</template></el-table-column>
          <el-table-column label="工序" width="130">
            <template #default="{ row }">
              <el-tag v-if="row.type === '投料出库'" :type="cargoTag(row.kind)" effect="plain">{{ row.kind }}</el-tag>
              <el-tag v-else type="info" effect="plain">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="qty" label="工序内容" min-width="140" />
          <el-table-column prop="stack" label="堆放堆位" min-width="140" />
          <el-table-column prop="time" label="时间" min-width="150" />
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button v-if="row.canProcess" link type="primary" @click="openProcess(row)">登记加工</el-button>
              <el-button v-if="row.canFinish" link type="primary" @click="openFinish(row)">完工入库</el-button>
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="opsPage"
            v-model:page-size="opsPageSize"
            :total="productionTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            background
            @current-change="changeProductionPage"
            @size-change="changeProductionPageSize"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="抽样送检" name="inspect">
        <div class="toolbar">
          <el-button type="primary" @click="openInspectCreate">新增送检</el-button>
        </div>
        <el-form :inline="true" @submit.prevent="search">
          <el-form-item label="单号">
            <el-input v-model="filters.keyword" clearable placeholder="生产批次 / 报关单" style="width: 180px" @keyup.enter="search" />
          </el-form-item>
          <el-form-item label="委托方">
            <el-select v-model="filters.consignor" clearable placeholder="全部" style="width: 140px">
              <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>
          <el-form-item><el-button type="primary" @click="search">查询</el-button></el-form-item>
        </el-form>
        <el-table v-loading="inspectLoading" :data="inspectRows" border stripe empty-text="暂无送检记录">
          <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
          <el-table-column prop="orderNo" label="完工单号" min-width="140" />
          <el-table-column prop="consignor" label="委托方" width="120" />
          <el-table-column label="关联报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNos) }}</template></el-table-column>
          <el-table-column prop="stackCode" label="堆位" width="100" />
          <el-table-column label="产量(干吨)" width="110">
            <template #default="{ row }">{{ num(row.outputDry) }}</template>
          </el-table-column>
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
          <el-table-column label="操作" fixed="right" width="80">
            <template #default="{ row }">
              <el-button link type="primary" @click="openInspectEdit(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="inspectPage"
            v-model:page-size="inspectPageSize"
            :total="inspectTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            background
            @current-change="loadInspections"
            @size-change="() => { inspectPage = 1; loadInspections() }"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="feedOpen" title="原料投料出库" width="1280px" align-center>
      <p class="hint">同一生产批次可勾选多个报关单，须为同一委托方。本次干吨不能超过剩余干吨。委托方随勾选票带出。</p>
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="生产批次" required><el-input v-model="feed.prodBatch" clearable placeholder="请填写生产批次" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="feedConsignorText" disabled placeholder="勾选报关单后带出" /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">勾选投料报关单（可多选）</div>
      <el-form :inline="true" @submit.prevent="queryLots">
        <el-form-item label="报关单号"><el-input v-model="feed.keyword" clearable placeholder="报关单号" @keyup.enter="queryLots" /></el-form-item>
        <el-form-item label="货物类型">
          <el-select v-model="feed.cargoType" clearable placeholder="全部货物类型" style="width: 140px">
            <el-option v-for="item in feedCargoTypes" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源国家">
          <el-select v-model="feed.country" clearable filterable allow-create default-first-option placeholder="全部国家" style="width: 140px">
            <el-option v-for="name in feedCountries" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="堆放堆位"><el-input v-model="feed.stack" clearable placeholder="如 1#A1" @keyup.enter="queryLots" /></el-form-item>
        <el-form-item><el-button type="primary" @click="queryLots">查询</el-button></el-form-item>
        <el-form-item><el-button @click="resetFeedFilter">重置</el-button></el-form-item>
      </el-form>
      <el-table v-loading="feedLoading" :data="feedLots" border max-height="360" empty-text="暂无在库报关单">
        <el-table-column label="选择" width="70">
          <template #default="{ row }"><el-checkbox :model-value="feedPicked[lotKey(row)] != null" @change="onFeedCheck(row, $event)" /></template>
        </el-table-column>
        <el-table-column label="报关单号" min-width="160">
          <template #default="{ row }">{{ dash(row.customsNo || row.recordNo) }}</template>
        </el-table-column>
        <el-table-column label="生产批次" min-width="130">
          <template #default="{ row }">{{ dash(row.batchNo) }}</template>
        </el-table-column>
        <el-table-column label="委托方" min-width="120"><template #default="{ row }">{{ row.consignor || '—' }}</template></el-table-column>
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="originCountry" label="来源国家" width="100" />
        <el-table-column prop="stackText" label="堆放堆位" width="100" />
        <el-table-column label="剩余干重(吨)" width="120"><template #default="{ row }">{{ num(availableOf(row)) }}</template></el-table-column>
        <el-table-column label="本次投料干重" width="140">
          <template #default="{ row }"><el-input v-if="feedPicked[lotKey(row)] != null" v-model="feedPicked[lotKey(row)]" size="small" :class="{ over: feedOver(lotKey(row), row) }" /></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="feedPage"
          v-model:page-size="feedPageSize"
          :total="feedTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="onFeedPage"
          @size-change="onFeedSize"
        />
      </div>
      <template #footer>
        <el-button @click="feedOpen = false">取消</el-button>
        <el-button type="primary" @click="saveFeed">确认投料</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="processOpen" title="生产加工过程登记" width="980px" align-center>
      <el-row :gutter="16">
        <el-col v-if="process.locked" :span="12"><el-form-item label="生产单"><el-input :model-value="process.orderNo" readonly /></el-form-item></el-col>
        <el-col v-else :span="12">
          <el-form-item label="生产单" required>
            <el-select v-model="process.id" @change="fillProcess(String($event))">
              <el-option v-for="item in feedOrders" :key="String(item.id)" :label="orderLabel(item)" :value="String(item.id)" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="process.consignor" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="process.prodBatch" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="工序" required><el-input v-model="process.process" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="开始时间"><el-date-picker v-model="process.from" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="结束时间"><el-date-picker v-model="process.to" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">混矿原料信息</div>
      <el-table :data="processLines" border empty-text="该生产单还没有投料">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column label="报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNo) }}</template></el-table-column>
        <el-table-column prop="voyage" label="船名/航次" min-width="140" />
        <el-table-column prop="blNo" label="提单号" width="120" />
        <el-table-column prop="originCountry" label="来源国家" width="90" />
        <el-table-column label="湿重(吨)" width="100"><template #default="{ row }">{{ num(row.wet) }}</template></el-table-column>
        <el-table-column label="干重(吨)" width="100"><template #default="{ row }">{{ num(row.dry) }}</template></el-table-column>
        <el-table-column prop="stack" label="堆放堆位" width="90" />
      </el-table>
      <el-form-item label="备注" class="remark"><el-input v-model="process.remark" type="textarea" :rows="3" /></el-form-item>
      <template #footer>
        <el-button @click="processOpen = false">取消</el-button>
        <el-button type="primary" @click="saveProcess">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="finishOpen" title="成品完工入库" width="1080px" align-center>
      <p class="hint">成品入库至待检区；同一待检区可存放不同生产批次。请框选空闲格，查验完成在堆位管理改为成品区。</p>
      <el-row :gutter="16">
        <el-col v-if="finish.locked" :span="12"><el-form-item label="生产单"><el-input :model-value="finish.orderNo" readonly /></el-form-item></el-col>
        <el-col v-else :span="12">
          <el-form-item label="生产单" required>
            <el-select v-model="finish.id" @change="fillFinish(String($event))">
              <el-option v-for="item in openOrders" :key="String(item.id)" :label="orderLabel(item)" :value="String(item.id)" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="finish.consignor" disabled /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="finish.prodBatch" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="产量(干吨)" required><el-input v-model="finish.outputDry" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="关联报关单号"><el-input :model-value="finishCustoms" readonly /></el-form-item></el-col>
      </el-row>
      <div class="finish-split">
        <div class="map-pane">
          <div class="map-label">成品待检区堆位 <span>* 可多选</span></div>
          <StackGridPicker
            multi
            v-model:stack-code="finish.stackCode"
            v-model:area-id="finish.areaId"
            v-model:cells="finish.cells"
            v-model:picks="finish.picks"
            class="grid-pick"
            :stacks="stacks"
            area-label="待检区"
          />
        </div>
        <div class="alloc-pane">
          <div class="alloc-heading">
            <div class="map-label">堆位干吨分配 <span>*</span></div>
            <el-button size="small" :disabled="!finish.picks.length || !(Number(finish.outputDry) > 0)" @click="distributeFinishDry">平均分配</el-button>
          </div>
          <el-table :data="finish.picks" border size="small" empty-text="请在左侧地图选择待检区堆位">
            <el-table-column prop="stackCode" label="堆位" min-width="90" />
            <el-table-column label="格数" width="60" align="center">
              <template #default="{ row }">{{ String(row.cells || '').split(',').filter(Boolean).length || '—' }}</template>
            </el-table-column>
            <el-table-column label="干吨" min-width="100">
              <template #default="{ row }"><el-input v-model="row.dryWeight" type="number" min="0" step="0.01" placeholder="必填" /></template>
            </el-table-column>
            <el-table-column label="" width="60" align="center">
              <template #default="{ $index }"><el-button link type="danger" @click="finish.picks.splice($index, 1)">移除</el-button></template>
            </el-table-column>
          </el-table>
          <p class="alloc-sum">已分配 {{ num(finishAllocatedDry) }} / {{ num(finish.outputDry) }} 干吨</p>
        </div>
      </div>
      <div class="panel-title">关联报关单矿物</div>
      <el-table :data="finishLines" border empty-text="未匹配到投料报关单">
        <el-table-column label="报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNo) }}</template></el-table-column>
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column label="投料干重(吨)" width="120"><template #default="{ row }">{{ num(row.feedDry) }}</template></el-table-column>
        <el-table-column prop="stack" label="原堆放堆位" width="110" />
        <el-table-column label="片区标识" width="100"><template #default="{ row }"><el-tag :type="areaTag(row.areaLabel)" effect="plain">{{ row.areaLabel }}</el-tag></template></el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="finishOpen = false">取消</el-button>
        <el-button type="primary" @click="saveFinish">完工入库</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" :title="`生产详情 · ${detailBatch}`" width="1100px" align-center>
      <div class="panel-title">投入原料（{{ detailLines.length }} 票）</div>
      <el-table :data="detailLines" border empty-text="该批次还没有投料">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column label="报关单号" min-width="150"><template #default="{ row }">{{ dash(row.customsNo) }}</template></el-table-column>
        <el-table-column label="出库报关单号" min-width="150"><template #default="{ row }">{{ outCustoms(row) }}</template></el-table-column>
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="货物类型" width="90"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="material" label="物料" width="90" />
        <el-table-column prop="voyage" label="船名/航次" min-width="140" />
        <el-table-column prop="blNo" label="提单号" width="110" />
        <el-table-column prop="originCountry" label="来源国家" width="90" />
        <el-table-column label="湿重(吨)" width="90"><template #default="{ row }">{{ num(row.wet) }}</template></el-table-column>
        <el-table-column label="干重(吨)" width="90"><template #default="{ row }">{{ num(row.dry) }}</template></el-table-column>
        <el-table-column prop="stack" label="堆放堆位" width="90" />
        <el-table-column label="片区标识" width="90"><template #default="{ row }"><el-tag :type="areaTag(row.areaLabel)" effect="plain">{{ row.areaLabel }}</el-tag></template></el-table-column>
      </el-table>
      <div class="panel-title">完工入库</div>
      <el-descriptions v-if="detailFinish" :column="2" border>
        <el-descriptions-item label="生产批次">{{ detailFinish.prodBatch }}</el-descriptions-item>
        <el-descriptions-item label="目标堆位">{{ detailFinish.stackCode }} · {{ areaOf(detailFinish.stackCode, detailFinish.areaLabel) }}</el-descriptions-item>
        <el-descriptions-item label="投料消耗">{{ num(detailFinish.inputDry ?? detailLines.reduce((sum, line) => sum + amountOf(line), 0)) }} 干吨（{{ detailLines.length }} 票报关单）</el-descriptions-item>
        <el-descriptions-item label="完工入库">{{ num(detailFinish.outputDry) }} 吨</el-descriptions-item>
      </el-descriptions>
      <p v-else class="hint">尚未完工入库</p>
      <template #footer><el-button @click="detailOpen = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="ledgerOpen" :title="`${ledgerDate} 消耗产出明细`" width="980px" align-center>
      <el-table :data="ledgerDetails" border empty-text="当日没有单据">
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="orderNo" label="单号" width="150" />
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="生产批次" width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
        <el-table-column label="报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customs) }}</template></el-table-column>
        <el-table-column prop="kind" label="货物类型/工序" width="120" />
        <el-table-column prop="qty" label="数量" min-width="140" />
        <el-table-column prop="stack" label="堆放堆位" min-width="120" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="inspectOpen" :title="inspectForm.id ? '编辑抽样送检' : '新增抽样送检'" width="980px" align-center>
      <p class="hint">选择一条待检区票货，上传附件并填写备注后完成。编辑时不可更换票货。</p>
      <template v-if="inspectForm.id">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="inspectForm.prodBatch" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="完工单号"><el-input :model-value="inspectForm.orderNo" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="inspectForm.consignor" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="堆位"><el-input :model-value="inspectForm.stackCode" disabled /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="关联报关单号"><el-input :model-value="inspectForm.customsNos" disabled /></el-form-item></el-col>
        </el-row>
      </template>
      <template v-else>
        <div class="panel-title">选择待检区票货</div>
        <el-form :inline="true" @submit.prevent="loadInspectLots">
          <el-form-item label="关键词">
            <el-input v-model="inspectLotKeyword" clearable placeholder="生产批次 / 报关单 / 堆位" style="width: 220px" @keyup.enter="loadInspectLots" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="loadInspectLots">查询</el-button></el-form-item>
        </el-form>
        <el-table
          v-loading="inspectLotsLoading"
          :data="inspectLots"
          border
          max-height="280"
          highlight-current-row
          empty-text="暂无待检区票货"
          @row-click="pickInspectLot"
        >
          <el-table-column label="选择" width="70">
            <template #default="{ row }">
              <el-radio :model-value="inspectForm.productionOrderId" :value="String(row.productionOrderId || row.id)" @click.stop="pickInspectLot(row)" />
            </template>
          </el-table-column>
          <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
          <el-table-column prop="orderNo" label="完工单号" min-width="140" />
          <el-table-column prop="consignor" label="委托方" width="110" />
          <el-table-column label="关联报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNos) }}</template></el-table-column>
          <el-table-column prop="stackCode" label="堆位" width="100" />
          <el-table-column label="产量(干吨)" width="110">
            <template #default="{ row }">{{ num(row.outputDry) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <el-form-item label="附件" required class="remark">
        <ImageUpload v-model="inspectFiles" multiple :src="inspectForm.attachmentUrls[0]" />
        <div v-if="inspectForm.id && inspectForm.attachmentUrls.length && !inspectFiles.length" class="attach-links">
          <ImageViewer
            v-for="(url, index) in inspectForm.attachmentUrls"
            :key="url"
            variant="link"
            :label="inspectForm.attachmentUrls.length > 1 ? `已有附件${index + 1}` : '已有附件'"
            :src="url"
            :name="inspectForm.attachmentNames[index] || ''"
            title="送检附件"
          />
        </div>
      </el-form-item>
      <el-form-item label="备注" class="remark"><el-input v-model="inspectForm.remark" type="textarea" :rows="3" placeholder="选填" /></el-form-item>
      <template #footer>
        <el-button @click="inspectOpen = false">取消</el-button>
        <el-button type="primary" :loading="inspectSaving" @click="saveInspect">{{ inspectForm.id ? '保存' : '完成' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.hint { color: #5a6a7e; margin: 0 0 12px; }
.grid-pick { height: 360px; }
.finish-split { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr); gap: 16px; align-items: stretch; }
.alloc-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.alloc-heading .map-label { margin: 0; }
.alloc-pane { min-width: 0; }
.alloc-sum { margin: 10px 0 0; color: #5a6a7e; font-size: 13px; }
.sep { margin: 0 8px; color: #5a6a7e; }
.panel-title { margin: 16px 0 8px; font-weight: 600; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.remark { margin-top: 12px; }
.attach-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.over :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset; }
:deep(.el-form-item) { margin-bottom: 12px; }
:deep(.el-dialog .el-select), :deep(.el-dialog .el-input), :deep(.el-dialog .el-date-editor.el-input) { width: 100%; }
@media (max-width: 900px) { .finish-split { grid-template-columns: 1fr; } }
</style>
