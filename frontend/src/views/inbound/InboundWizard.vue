<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { inboundApi, materialApi, ocrApi, settingsApi } from '@/api'
import ImageViewer from '@/components/ImageViewer.vue'
import StackGridPicker from '@/components/StackGridPicker.vue'
import type { StackPick } from '@/components/YardPlanMap.vue'
import { cellKeys, dash } from '../ops/samples'
import { MONEY_ROW } from '@/controller/shared/constants'

type QualityKey = { key: string; symbol: string; name: string; label: string; unit: string; required: boolean }

const QUALITY_UNITS: Record<string, string> = { ag: 'g/t', au: 'g/t' }

const DEFAULT_QUALITY: QualityKey[] = [
  { key: 'cu', symbol: 'Cu', name: '铜', label: '铜（Cu）', unit: '%', required: true },
  { key: 'ag', symbol: 'Ag', name: '银', label: '银（Ag）', unit: 'g/t', required: false },
  { key: 'au', symbol: 'Au', name: '金', label: '金（Au）', unit: 'g/t', required: false },
  { key: 'as', symbol: 'As', name: '砷', label: '砷（As）', unit: '%', required: false },
  { key: 'pb', symbol: 'Pb', name: '铅', label: '铅（Pb）', unit: '%', required: false },
  { key: 'cd', symbol: 'Cd', name: '镉', label: '镉（Cd）', unit: '%', required: false },
  { key: 'f', symbol: 'F', name: '氟', label: '氟（F）', unit: '%', required: false },
  { key: 'hg', symbol: 'Hg', name: '汞', label: '汞（Hg）', unit: '%', required: false },
]

function qualityLabel(name: string, symbol: string) {
  return name ? `${name}（${symbol}）` : symbol
}

function qualityUnit(key: string) {
  return QUALITY_UNITS[key] || '%'
}

const props = defineProps<{
  consignors: string[]
  materials: Record<string, unknown>[]
  stacks: Record<string, unknown>[]
  shipModes: string[]
  oreTypes: string[]
  currencies: { label: string; value: string }[]
  start: number
  seed?: Record<string, unknown> | null
}>()

const emit = defineEmits<{ close: []; done: [] }>()

const receiveMode = props.start >= 2
const saving = ref(false)
const picker = ref<HTMLInputElement>()
const pickKind = ref<'bl' | 'customs' | 'weight' | 'quality'>('customs')
const ocrStatus = ref('上传报关单影像，自动识别并回填下方字段')
const weightStatus = ref('重量单：待上传')
const qualityStatus = ref('品质证书：待上传')
const lastDoc = ref<'bl' | 'customs' | 'weight' | 'quality' | ''>('')
type DocPreview = { name: string; url: string; image: boolean; file?: File }
const previews = reactive<Record<string, DocPreview>>({})
const ocrOpen = ref(false)
const ocrBusy = ref(false)
const ocrProgress = ref(0)
const ocrProgressKind = ref<'bl' | 'customs' | 'weight' | 'quality'>('customs')
const ocrTarget = ref<'inbound' | 'weight' | 'quality' | 'receive'>('inbound')
const qualityKeys = ref<QualityKey[]>(DEFAULT_QUALITY.map((item) => ({ ...item })))
const qualityFieldKeys = computed(() => qualityKeys.value.map((item) => item.key))
let ocrProgressTimer = 0

const mockData = { "id": "", "consignor": "广西南国铜业有限责任公司", "shipName": "TTM HARVEST", "blNo": "G20TTMTGN2601", "blWeight": "11713480", "time": "2026/08/04", "customsNo": "L7227B25A001", "checklistNo": "QD722726I000000151", "amount": "", "currency": "1", "material": "Chuquicamata", "oreType": "报备铜精矿", "shipMode": "散货", "containerCount": "", "filingNo": "1(1吨), 123(86576吨)", "stackCode": "4#B2", "areaId": "2111064108889866242", "cells": "", "stackPicks": [ { "stackCode": "4#B1", "areaId": "2111064108428492802", "cells": "1-2,1-3,1-4,1-5,1-6,2-2,2-3,2-4,2-5,2-6,3-2,3-3,3-4,3-5,3-6,4-2,4-3,4-4,4-5,4-6", "warehouseId": "2111008426543087617" }, { "stackCode": "4#A2", "areaId": "2111064107992285185", "cells": "1-1,1-2,1-3,1-4,1-5,2-1,2-2,2-3,2-4,2-5,3-1,3-2,3-3,3-4,3-5", "warehouseId": "2111008426543087617" } ], "receiptOrderDetails": [ { "itemCode": "2603000010", "itemName": "铜精矿（黄金价值部分）", "quantity": "42.48", "unit": "千克", "unitPrice": "168331.3602", "totalPrice": "7117049.91", "currency": "2", "originCountry": "塞尔维亚", "destCountry": "中国" }, { "itemCode": "2603000090", "itemName": "铜精矿（非黄金价值部分）", "quantity": "11713437.52", "unit": "千克", "unitPrice": "3.2139", "totalPrice": "36527630.90", "currency": "2", "originCountry": "塞尔维亚", "destCountry": "中国" } ], "orcId": "2114234856675368961", "wet": "", "dry": "", "moisture": "", "weightOrcId": "", "elementsOrcId": "", "qualityNo": "", "remark": "", "category": "原料", "cargoType": "报备矿", "orderNo": "", "cu": "", "ag": "", "au": "", "as": "", "pb": "", "cd": "", "f": "", "hg": "" };
const defaultData = {
  id: '',
  consignor: props.consignors[0] || '',
  shipName: '',
  blNo: '',
  blWeight: '',
  time: '',
  customsNo: '',
  checklistNo: '',
  amount: '',
  currency: props.currencies[0]?.value || 'CNY',
  material: '',
  oreType: props.oreTypes.includes('精铜矿') ? '精铜矿' : (props.oreTypes[0] || ''),
  shipMode: props.shipModes[0] || '',
  containerCount: '',
  filingNo: '',
  stackCode: '',
  areaId: '',
  cells: '',
  stackPicks: [] as StackPick[],
  receiptOrderDetails: [Object.assign({}, MONEY_ROW)],
  orcId: '',
  wet: '',
  dry: '',
  moisture: '',
  weightOrcId: '',
  elementsOrcId: '',
  qualityNo: '',
  remark: '',
  category: '原料',
  cargoType: '',
  orderNo: '',
};
const form = reactive<Record<string, any>>(defaultData)
const draft = reactive<Record<string, any>>({})

for (const item of qualityKeys.value) form[item.key] = form[item.key] ?? ''

if (props.seed) {
  Object.assign(form, props.seed, { category: '原料' })
  if (Array.isArray(form.cells)) form.cells = form.cells.join(',')
  if (!Array.isArray(form.stackPicks) || !form.stackPicks.length) {
    if (form.stackCode || form.areaId) {
      form.stackPicks = [{
        stackCode: String(form.stackCode || ''),
        areaId: String(form.areaId || ''),
        cells: String(form.cells || ''),
      }]
    } else {
      form.stackPicks = []
    }
  }
  if (props.seed.orcId) ocrStatus.value = `已关联报关单任务 ${props.seed.orcId}`
  if (Array.isArray(form.stackPicks)) {
    form.stackPicks = form.stackPicks.map((row: StackPick) => ({
      ...row,
      wet: row.wet ?? '',
      dry: row.dry ?? '',
    }))
  }
}

function applyQualityItems(items: unknown) {
  if (!Array.isArray(items) || !items.length) return
  const rows: QualityKey[] = []
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>
    const symbol = String(item.symbol || '').trim()
    if (!symbol) continue
    const key = symbol.toLowerCase()
    const known = DEFAULT_QUALITY.find((row) => row.key === key)
    const name = String(item.name || '').trim() || known?.name || ''
    rows.push({
      key,
      symbol,
      name,
      label: qualityLabel(name, symbol),
      unit: known?.unit || qualityUnit(key),
      // 系统参数页暂未配置必填时，沿用默认（Cu 必填）
      required: String(item.isRequired || '') === '1' || Boolean(known?.required),
    })
    if (form[key] == null) form[key] = ''
  }
  if (rows.length) qualityKeys.value = rows
}

onMounted(async () => {
  const res = await settingsApi.get()
  if (res.success && res.data) {
    const saved = res.data.qualityItems
    if (Array.isArray(saved) && saved.length) applyQualityItems(saved)
    else {
      const symbols = String(res.data.qualities || '').split(/[、,，\s]+/).filter(Boolean)
      if (symbols.length) {
        applyQualityItems(symbols.map((symbol) => {
          const known = DEFAULT_QUALITY.find((item) => item.symbol === symbol)
          return { symbol, name: known?.name || '', isRequired: known?.required ? '1' : '0' }
        }))
      }
    }
  }
})

const rawMaterials = computed(() => props.materials.filter((row) => {
  const cargo = String(row.cargoType || '')
  return cargo !== '成品' && cargo !== '混成品'
}))
const containerMode = computed(() => String(form.shipMode).includes('集装箱'))
const reportedOre = computed(() => form.cargoType === '报备矿')
const filingText = computed(() => dash(form.filingNo))
const pickedStack = computed(() => props.stacks.find((row) => String(row.code) === form.stackCode))
const ocrTitle = computed(() => {
  if (ocrTarget.value === 'weight') return 'OCR 识别结果 · 重量单'
  if (ocrTarget.value === 'quality') return 'OCR 识别结果 · 品质证书'
  if (ocrTarget.value === 'receive') return 'OCR 识别结果 · 收货登记'
  return 'OCR 识别结果 · 入库预约（报关单）'
})
const preview = computed(() => {
  const kind = ocrTarget.value === 'weight' ? 'weight' : ocrTarget.value === 'quality' ? 'quality' : lastDoc.value
  return kind ? previews[kind] : undefined
})

/** 当前矿区下可用备案（报备矿拉取后缓存，供提货重量变化时重算）。 */
const itemFilings = ref<{ code: string; remain: number; filingDate: string }[]>([])
const filingLoading = ref(false)

function onShipMode(name: string) {
  if (!String(name).includes('集装箱')) form.containerCount = ''
}

function tonText(value: number) {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/** 按提货重量分配预计使用量；单条不够则累加多条，格式如 JG-2026-BL-01(300吨), JG-2027-BL-03(6700吨)。 */
function buildFilingText(rows: { code: string; remain: number; filingDate: string }[], demand: number) {
  const usable = rows
    .filter((row) => row.code && row.remain > 0)
    .slice()
    .sort((a, b) => {
      const byDate = String(a.filingDate || '').localeCompare(String(b.filingDate || ''))
      return byDate || a.code.localeCompare(b.code)
    })
  if (!usable.length) return ''
  const need = Number.isFinite(demand) && demand > 0 ? demand : usable[0].remain
  const parts: string[] = []
  let left = need
  for (const row of usable) {
    if (left <= 0) break
    const use = Math.min(row.remain, left)
    parts.push(`${row.code}(${tonText(use)}吨)`)
    left -= use
  }
  return parts.join(', ')
}

/** 按矿区货物类型匹配矿种：报备矿 → 含「报备」的矿种，达标矿 → 含「达标」的矿种。 */
function oreTypeForCargo(cargoType: string) {
  const types = props.oreTypes
  if (!types.length) return ''
  if (cargoType === '报备矿') {
    return types.find((item) => item.includes('报备')) || types.find((item) => item === '报备矿') || ''
  }
  if (cargoType === '达标矿') {
    return types.find((item) => item.includes('达标')) || types.find((item) => item === '达标矿') || ''
  }
  return ''
}

function applyFilingNo() {
  if (!reportedOre.value) {
    form.filingNo = ''
    return
  }
  form.filingNo = buildFilingText(itemFilings.value, numberOrBlank(form.blWeight))
}

async function loadFilingsForItem(itemId: string) {
  filingLoading.value = true
  try {
    const res = await materialApi.filingsByItem(itemId)
    if (!res.success || !Array.isArray(res.data)) {
      itemFilings.value = []
      form.filingNo = ''
      if (res.message) ElMessage.warning(res.message)
      return
    }
    itemFilings.value = res.data
      .filter((row) => String(row.status || '') !== '已用尽')
      .map((row) => ({
        code: String(row.code || ''),
        remain: Number(row.remain) || 0,
        filingDate: String(row.filingDate || ''),
      }))
      .filter((row) => row.code && row.remain > 0)
    applyFilingNo()
    if (!form.filingNo) ElMessage.warning('该矿区暂无可用矿源备案')
  } finally {
    filingLoading.value = false
  }
}

async function onMaterial(name: string) {
  const row = rawMaterials.value.find((item) => item.name === name)
  form.cargoType = row ? String(row.cargoType || '') : form.cargoType
  const matched = oreTypeForCargo(form.cargoType)
  if (matched) form.oreType = matched
  itemFilings.value = []
  if (row?.cargoType !== '报备矿') {
    form.filingNo = ''
    return
  }
  const itemId = String(row.id || '')
  if (!itemId) {
    form.filingNo = ''
    ElMessage.warning('所选矿区缺少物料 id，无法带出备案号')
    return
  }
  await loadFilingsForItem(itemId)
}

watch(() => form.blWeight, () => {
  if (reportedOre.value && itemFilings.value.length) applyFilingNo()
})

const DOC_TYPE: Record<'bl' | 'customs' | 'weight' | 'quality', string> = {
  bl: '提单',
  customs: '入库报关单',
  weight: '重量单',
  quality: '品质单',
}

function filled(value: unknown) {
  return value != null && String(value).trim() !== ''
}

function cellCount(cells: unknown) {
  return String(cells || '').split(',').filter(Boolean).length
}

function nearEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.011
}

const allocWet = computed(() => (form.stackPicks as StackPick[]).reduce((sum, row) => {
  const value = numberOrBlank(row.wet)
  return sum + (Number.isFinite(value) ? value : 0)
}, 0))
const allocDry = computed(() => (form.stackPicks as StackPick[]).reduce((sum, row) => {
  const value = numberOrBlank(row.dry)
  return sum + (Number.isFinite(value) ? value : 0)
}, 0))

function syncSingleAlloc() {
  if (!receiveMode || form.stackPicks.length !== 1) return
  const pick = form.stackPicks[0] as StackPick
  if (!filled(pick.wet) && filled(form.wet)) pick.wet = form.wet
  if (!filled(pick.dry) && filled(form.dry)) pick.dry = form.dry
}

syncSingleAlloc()
watch(() => [form.wet, form.dry], syncSingleAlloc)

function copyFields(keys: string[], from: Record<string, any>, to: Record<string, any>) {
  for (const key of keys) to[key] = from[key]
}

function fillFields(keys: string[], from: Record<string, any>, to: Record<string, any>) {
  for (const key of keys) {
    if (filled(from[key])) to[key] = from[key]
  }
}

function fillQualityFields(from: Record<string, any>, to: Record<string, any>, onlyFilled = true) {
  for (const key of qualityFieldKeys.value) {
    if (onlyFilled && !filled(from[key])) continue
    to[key] = filled(from[key]) ? stripQualityUnit(from[key]) : ''
  }
}

function pick(kind: 'bl' | 'customs' | 'weight' | 'quality') {
  pickKind.value = kind
  if (!picker.value) return
  picker.value.value = ''
  picker.value.click()
}

function syncDraftFromForm(kind: 'bl' | 'customs' | 'weight' | 'quality') {
  if (!ocrOpen.value) return
  if (kind === 'bl' || kind === 'customs') {
    if (ocrTarget.value !== 'inbound') return
    copyFields(['shipName', 'blNo', 'blWeight', 'customsNo', 'checklistNo', 'amount', 'currency'], form, draft)
    return
  }
  if (kind === 'weight' && (ocrTarget.value === 'weight' || ocrTarget.value === 'receive')) {
    copyFields(['wet', 'dry', 'moisture'], form, draft)
    return
  }
  if (kind === 'quality' && (ocrTarget.value === 'quality' || ocrTarget.value === 'receive')) {
    copyFields(['qualityNo', 'moisture', ...qualityFieldKeys.value], form, draft)
  }
}

async function recognizeFile(kind: 'bl' | 'customs' | 'weight' | 'quality', file: File, replacePreview = true) {
  if (ocrBusy.value) return false
  if (replacePreview) {
    const previous = previews[kind]
    if (previous?.url) URL.revokeObjectURL(previous.url)
    const image = file.type.startsWith('image/')
    previews[kind] = { name: file.name, url: image ? URL.createObjectURL(file) : '', image, file }
  } else {
    previews[kind] = { ...previews[kind], name: file.name, file }
  }
  lastDoc.value = kind
  ocrProgressKind.value = kind
  ocrBusy.value = true
  ocrProgress.value = 4
  ocrProgressTimer = window.setInterval(() => {
    ocrProgress.value = Math.min(92, ocrProgress.value + Math.max(1, Math.ceil((92 - ocrProgress.value) / 14)))
  }, 220)
  try {
    const [res] = await Promise.all([
      ocrApi.recognize({ docType: DOC_TYPE[kind], fileName: file.name, __file: file }),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ])
    if (!res.success || !res.data) {
      ElMessage.error(res.message || '识别失败')
      return false
    }
    const data = res.data as Record<string, unknown>
    const id = String(data.id || '')
    if (kind === 'bl' || kind === 'customs') {
      fillFields(['shipName', 'blNo', 'blWeight', 'customsNo', 'checklistNo', 'amount', 'currency'], data, form)
      if (filled(data.timeText)) form.time = data.timeText
      form.orcId = id
      ocrStatus.value = `已识别 ${file.name}`
      ElMessage.success(`${kind === 'bl' ? '提单' : '报关单'}已识别并回填`)
    } else if (kind === 'weight') {
      fillFields(['wet', 'dry', 'moisture'], data, form)
      form.weightOrcId = id
      weightStatus.value = `重量单已识别：湿重 ${data.wet || '—'}t / 干重 ${data.dry || '—'}t`
      ElMessage.success('重量单已识别并回填')
    } else {
      fillFields(['qualityNo'], data, form)
      fillQualityFields(data, form)
      if (filled(data.moisture) && !filled(form.moisture)) form.moisture = data.moisture
      form.elementsOrcId = id
      qualityStatus.value = `品质证书已识别：${data.qualityNo || file.name}`
      ElMessage.success('品质证书已识别并回填')
    }
    syncDraftFromForm(kind)
    ocrProgress.value = 100
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '识别失败，请重试'
    ElMessage.error(message)
    return false
  } finally {
    window.clearInterval(ocrProgressTimer)
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    ocrBusy.value = false
  }
}

async function onPicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await recognizeFile(pickKind.value, file)
}

function openOcr(target: 'inbound' | 'weight' | 'quality' | 'receive') {
  ocrTarget.value = target
  copyFields(['shipName', 'blNo', 'blWeight', 'customsNo', 'checklistNo', 'amount', 'currency', 'wet', 'dry', 'moisture', 'qualityNo', ...qualityFieldKeys.value], form, draft)
  ocrOpen.value = true
}

function repickOcr() {
  if (ocrTarget.value === 'weight') pick('weight')
  else if (ocrTarget.value === 'quality') pick('quality')
  else if (ocrTarget.value === 'inbound') pick(lastDoc.value === 'bl' ? 'bl' : 'customs')
  else if (previews.weight) pick('weight')
  else if (previews.quality) pick('quality')
  else pick('customs')
}

async function rerecognize() {
  const kind = ocrTarget.value === 'quality'
    ? 'quality'
    : ocrTarget.value === 'weight'
      ? 'weight'
      : ocrTarget.value === 'inbound'
        ? (lastDoc.value === 'bl' ? 'bl' : 'customs')
        : (previews.weight?.file ? 'weight' : previews.quality?.file ? 'quality' : '')
  if (!kind) {
    ElMessage.warning('请先上传证书')
    return
  }
  const file = previews[kind]?.file
  if (!file) {
    ElMessage.warning('当前没有可重新识别的文件，请重新上传')
    return
  }
  await recognizeFile(kind, file, false)
}

function applyOcr() {
  if (ocrTarget.value === 'inbound') copyFields(['shipName', 'blNo', 'blWeight', 'customsNo', 'checklistNo', 'amount', 'currency'], draft, form)
  else if (ocrTarget.value === 'weight') copyFields(['wet', 'dry', 'moisture'], draft, form)
  else if (ocrTarget.value === 'quality') {
    copyFields(['qualityNo', 'moisture'], draft, form)
    fillQualityFields(draft, form, false)
  } else {
    copyFields(['wet', 'dry', 'moisture', 'qualityNo'], draft, form)
    fillQualityFields(draft, form, false)
  }
  ocrOpen.value = false
  ElMessage.success('已回填并归档')
}

function stripQualityUnit(value: unknown) {
  return String(value ?? '').trim().replace(/\s*(%|g\/t)\s*$/i, '')
}

function numberOrBlank(value: unknown) {
  if (value == null || String(value).trim() === '') return Number.NaN
  return Number(stripQualityUnit(value))
}

function createdId(data: unknown) {
  if (data == null || data === '') return ''
  if (typeof data === 'string' || typeof data === 'number') return String(data)
  if (typeof data === 'object' && 'id' in data && (data as { id?: unknown }).id != null) return String((data as { id?: unknown }).id)
  return ''
}

async function submitReserve() {
  if (!form.consignor || !form.shipName || !form.blNo || !form.material || !form.shipMode) {
    ElMessage.warning('请填写委托方、船名、提单号、矿区和货运方式')
    return
  }
  if (!String(form.oreType || '').trim()) {
    ElMessage.warning('请选择矿种')
    return
  }
  const details = (Array.isArray(form.receiptOrderDetails) ? form.receiptOrderDetails : [])
    .filter((detail: Record<string, unknown>) => [
      detail.itemCode,
      detail.itemName,
      detail.quantity,
      detail.unitPrice,
      detail.totalPrice,
      detail.originCountry,
      detail.unit !== '千克' ? detail.unit : '',
      detail.currency !== '1' ? detail.currency : '',
      detail.destCountry !== '中国' ? detail.destCountry : '',
    ].some((value) => String(value ?? '').trim() !== ''))
  if (!details.length) {
    ElMessage.warning('请至少填写一条报关金额明细')
    return
  }
  if (details.some((detail: Record<string, unknown>) => {
    const total = String(detail.totalPrice ?? '').trim()
    return !total || !Number.isFinite(Number(total))
  })) {
    ElMessage.warning('请填写每条报关金额明细的总价')
    return
  }
  const picks = (Array.isArray(form.stackPicks) ? form.stackPicks as StackPick[] : [])
    .filter((row) => row.stackCode || row.areaId)
  if (!picks.length) {
    ElMessage.warning('请放大仓库并选择堆位')
    return
  }
  for (const pick of picks) {
    const stack = props.stacks.find((row) => String(row.code) === pick.stackCode || String(row.id) === pick.areaId)
    if (cellKeys(stack).length && !String(pick.cells || '').trim()) {
      ElMessage.warning(`请为堆位 ${pick.stackCode || pick.areaId} 框选存放格子`)
      return
    }
  }
  if (!form.orcId) {
    ElMessage.warning('请先上传报关单完成识别')
    return
  }
  saving.value = true
  try {
    const dock = picks.some((row) => String(row.stackCode).includes('码头'))
    const status = dock ? '暂存码头' : '待收货'
    const created = await inboundApi.create({
      ...form,
      stackPicks: picks,
      areaId: form.areaId || picks[0]?.areaId || pickedStack.value?.id,
      category: '原料',
      status,
      containerCount: containerMode.value ? form.containerCount : '',
    })

    if (!created.success) {
      ElMessage.error(created.message)
      return
    }
    ElMessage.success(created.message || '入库预约已创建')
    if (!createdId(created.data)) ElMessage.info('预约已创建')
    emit('done')
  } finally {
    saving.value = false
  }
}

function moistureValue(wet: number, dry: number) {
  const parsed = numberOrBlank(form.moisture)
  if (Number.isFinite(parsed)) return parsed
  if (Number.isFinite(wet) && wet > 0 && Number.isFinite(dry)) return Math.round(((wet - dry) / wet) * 10000) / 100
  return Number.NaN
}

async function submitReceive() {
  const wet = numberOrBlank(form.wet)
  const dry = numberOrBlank(form.dry)
  const moisture = moistureValue(wet, dry)
  if (!form.id) {
    ElMessage.warning('未找到入库单')
    return
  }
  if (!Number.isFinite(wet) || !Number.isFinite(dry)) {
    ElMessage.warning('请填写湿重、干重，或上传重量单')
    return
  }
  if (!Number.isFinite(moisture)) {
    ElMessage.warning('请填写水分，或上传重量单')
    return
  }
  const picks = (Array.isArray(form.stackPicks) ? form.stackPicks as StackPick[] : [])
    .filter((row) => row.stackCode || row.areaId)
  if (!picks.length) {
    ElMessage.warning('本单没有预定堆位，无法收货')
    return
  }
  for (const pick of picks) {
    const areaWet = numberOrBlank(pick.wet)
    const areaDry = numberOrBlank(pick.dry)
    if (!Number.isFinite(areaWet) || !Number.isFinite(areaDry)) {
      ElMessage.warning(`请为堆位 ${pick.stackCode || pick.areaId} 填写湿重和干重`)
      return
    }
  }
  if (!nearEqual(allocWet.value, wet) || !nearEqual(allocDry.value, dry)) {
    ElMessage.warning(`各堆位湿重/干重合计需等于本票湿重 ${wet} / 干重 ${dry}`)
    return
  }
  const missingQuality = qualityKeys.value.find((item) => item.required && !String(form[item.key] || '').trim())
  if (missingQuality) {
    ElMessage.warning(`请填写${missingQuality.label}，或上传品质证书`)
    return
  }
  const elements = qualityKeys.value.flatMap((item) => {
    const value = numberOrBlank(form[item.key])
    if (!Number.isFinite(value)) return []
    return [{ elementCode: item.symbol, elementValue: value }]
  })
  saving.value = true
  try {
    const received = await inboundApi.update(String(form.id), {
      ...form,
      stackPicks: picks,
      wet, dry, moisture: `${moisture}%`,
      wetWeight: wet, dryWeight: dry, moistureContent: moisture,
      elements,
      category: form.category || '原料',
      status: '已入库',
      containerCount: containerMode.value ? form.containerCount : '',
    })
    if (!received.success) {
      ElMessage.error(received.message)
      return
    }
    ElMessage.success(received.message || '到货收货已提交')
    emit('done')
  } finally {
    saving.value = false
  }
}

/** 添加金额行 */
function addReceiptOrderDetails() {
  form.receiptOrderDetails.push(Object.assign({}, MONEY_ROW))
}

/** 删除金额行 */
function deleteReceiptOrderDetails(idx: number) {
  form.receiptOrderDetails.splice(idx, 1)
}

onBeforeUnmount(() => {
  window.clearInterval(ocrProgressTimer)
  for (const item of Object.values(previews)) {
    if (item.url) URL.revokeObjectURL(item.url)
  }
})
</script>

<template>
  <div>
    <el-dialog
      :model-value="true"
      :class="receiveMode ? 'inbound-receive inbound-receive-wide' : 'inbound-wizard'"
      :width="receiveMode ? '96vw' : '94vw'"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :show-close="true"
      @close="emit('close')"
    >
      <template #header>
        <h3 class="dlg-title">{{ receiveMode ? '到货收货 / 称重登记' : '新建入库预约' }}</h3>
      </template>

      <input ref="picker" class="file" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onPicked" />

      <!-- {{form}} -->
      <section v-if="!receiveMode" class="reserve">
        <div class="ocr-bar">
          <span class="ocr-label">OCR 识别回填</span>
          <em>报关单</em>
          <button type="button" @click="pick('customs')">上传报关单</button>
          <button type="button" class="text" @click="openOcr('inbound')">打开识别详情</button>
          <span class="status">{{ ocrStatus }}</span>
        </div>
        <div class="split">
          <el-form class="fields" label-width="108px">
            <el-form-item label="委托方" required><el-select v-model="form.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
            <el-form-item label="报关单号"><el-input v-model="form.customsNo" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="申报日期"><el-input v-model="form.time" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="提货重量"><el-input v-model="form.blWeight" type="number" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="船名" required><el-input v-model="form.shipName" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="核注清单号"><el-input v-model="form.checklistNo" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="提运单号" required><el-input v-model="form.blNo" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="报关金额明细" required>
              <div class="money-editor">
                <div class="money-heading">
                  <div>
                    <strong>商品金额明细</strong>
                    <span>填写报关商品、数量与金额信息</span>
                  </div>
                  <el-button size="small" type="primary" plain @click="addReceiptOrderDetails">
                    <el-icon><Plus /></el-icon>
                    添加明细
                  </el-button>
                </div>
                <div class="money-list">
                  <section v-for="(item, idx) in form.receiptOrderDetails" :key="idx" class="money-card">
                    <div class="money-card-heading">
                      <span class="money-index">{{ String(idx + 1).padStart(2, '0') }}</span>
                      <strong>商品明细</strong>
                      <span v-if="idx === 0" class="money-required">至少保留一行</span>
                      <el-button v-else link type="danger" @click="deleteReceiptOrderDetails(idx)">
                        <el-icon><Delete /></el-icon>
                        删除
                      </el-button>
                    </div>
                    <div class="money-fields">
                      <label class="money-field"><span>商品编号</span><el-input v-model="item.itemCode" size="small" placeholder="请输入编号" /></label>
                      <label class="money-field"><span>商品名称</span><el-input v-model="item.itemName" size="small" placeholder="请输入名称" /></label>
                      <label class="money-field"><span>数量</span><el-input v-model="item.quantity" size="small" placeholder="请输入数量" /></label>
                      <label class="money-field"><span>单位</span><el-input v-model="item.unit" size="small" placeholder="如：千克" /></label>
                      <label class="money-field"><span>单价</span><el-input v-model="item.unitPrice" size="small" placeholder="请输入单价" /></label>
                      <label class="money-field"><span>总价</span><el-input v-model="item.totalPrice" size="small" placeholder="请输入总价" /></label>
                      <label class="money-field"><span>币制</span><el-select v-model="item.currency" size="small" placeholder="请选择币制">
                        <el-option v-for="currency in currencies" :key="currency.value" :label="currency.label" :value="currency.value" />
                      </el-select></label>
                      <label class="money-field"><span>原产国</span><el-input v-model="item.originCountry" size="small" placeholder="请输入原产国" /></label>
                      <label class="money-field"><span>目的地</span><el-input v-model="item.destCountry" size="small" placeholder="请输入目的地" /></label>
                    </div>
                  </section>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="矿区" required>
              <el-select v-model="form.material" @change="onMaterial">
                <el-option v-for="item in rawMaterials" :key="String(item.id)" :label="String(item.name)" :value="String(item.name)" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="reportedOre" label="矿源备案号">
              <el-input :model-value="filingText" readonly disabled :placeholder="filingLoading ? '加载备案中…' : '选择报备矿后自动带出'" />
            </el-form-item>
            <el-form-item label="矿种" required>
              <el-select v-model="form.oreType" placeholder="请选择矿种" filterable>
                <el-option v-for="item in oreTypes" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="货运方式" required><el-select v-model="form.shipMode" @change="onShipMode"><el-option v-for="item in shipModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item v-if="containerMode" label="集装箱柜数"><el-input v-model="form.containerCount" type="number" placeholder="柜" /></el-form-item>
          </el-form>
          <div class="map-pane">
            <div class="map-label">存放位置 <span>*</span></div>
            <StackGridPicker
              multi
              v-model:stack-code="form.stackCode"
              v-model:area-id="form.areaId"
              v-model:cells="form.cells"
              v-model:picks="form.stackPicks"
              :stacks="stacks"
            />
          </div>
        </div>
      </section>

      <section v-else class="receive">
        <el-form label-width="108px">
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="入库单号" required><el-input :model-value="dash(form.orderNo || form.id)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="dash(form.consignor)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿区"><el-input :model-value="dash(form.material)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿种"><el-input :model-value="dash(form.oreType)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="货物类型"><el-input :model-value="dash(form.cargoType)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿源备案号"><el-input :model-value="filingText" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="货运方式"><el-input :model-value="dash(form.shipMode)" readonly disabled /></el-form-item></el-col>
            <el-col v-if="containerMode" :span="12"><el-form-item label="集装箱柜数"><el-input :model-value="dash(form.containerCount)" readonly disabled /></el-form-item></el-col>
            <el-col :span="24">
              <div class="ocr-dual">
                <div>
                  <button v-if="!previews.weight" type="button" class="slot" @click="pick('weight')">
                    <strong>上传重量单</strong><span>识别湿重 / 干重 / 水分</span>
                  </button>
                  <button v-else type="button" class="slot shot" @click="openOcr('weight')">
                    <img v-if="previews.weight.image && previews.weight.url" :src="previews.weight.url" :alt="previews.weight.name" />
                    <div v-else class="file-card"><strong>{{ previews.weight.name }}</strong><span>点击查看 OCR 详情</span></div>
                    <em>点击查看 OCR</em>
                  </button>
                  <span class="status">{{ weightStatus }}</span>
                </div>
                <div>
                  <button v-if="!previews.quality" type="button" class="slot" @click="pick('quality')">
                    <strong>上传品质证书</strong><span>识别各品质元素 / 证书编号</span>
                  </button>
                  <button v-else type="button" class="slot shot" @click="openOcr('quality')">
                    <img v-if="previews.quality.image && previews.quality.url" :src="previews.quality.url" :alt="previews.quality.name" />
                    <div v-else class="file-card"><strong>{{ previews.quality.name }}</strong><span>点击查看 OCR 详情</span></div>
                    <em>点击查看 OCR</em>
                  </button>
                  <span class="status">{{ qualityStatus }}</span>
                </div>
              </div>
            </el-col>
            <el-col :span="8"><el-form-item label="湿重(吨)" required><el-input v-model="form.wet" type="number" placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="干重(吨)" required><el-input v-model="form.dry" type="number" placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="水分"><el-input v-model="form.moisture" placeholder="可手填或 OCR 回填" /></el-form-item></el-col>
            <el-col :span="24">
              <el-form-item label="品质参数">
                <div class="quality">
                  <label v-for="item in qualityKeys" :key="item.key">
                    <span>{{ item.label }}<i v-if="item.required">*</i></span>
                    <el-input v-model="form[item.key]" type="number">
                      <template #suffix>{{ item.unit }}</template>
                    </el-input>
                  </label>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12"><el-form-item label="品质证书号"><el-input v-model="form.qualityNo" readonly placeholder="OCR 回填" /></el-form-item></el-col>
          </el-row>
        </el-form>

        <div class="receive-split">
          <div class="map-pane">
            <div class="map-label">本票堆位</div>
            <StackGridPicker
              multi
              readonly
              v-model:stack-code="form.stackCode"
              v-model:area-id="form.areaId"
              v-model:cells="form.cells"
              v-model:picks="form.stackPicks"
              :stacks="stacks"
            />
          </div>
          <div class="alloc-pane">
            <div class="map-label">堆位重量分配 <span>*</span></div>
            <el-table :data="form.stackPicks" border size="small" empty-text="本单暂无预定堆位">
              <el-table-column prop="stackCode" label="堆位" min-width="100" />
              <el-table-column label="格数" width="72" align="center">
                <template #default="{ row }">{{ cellCount(row.cells) || '—' }}</template>
              </el-table-column>
              <el-table-column label="湿重(吨)" min-width="120">
                <template #default="{ row }">
                  <el-input v-model="row.wet" type="number" placeholder="必填" />
                </template>
              </el-table-column>
              <el-table-column label="干重(吨)" min-width="120">
                <template #default="{ row }">
                  <el-input v-model="row.dry" type="number" placeholder="必填" />
                </template>
              </el-table-column>
            </el-table>
            <p class="alloc-sum">
              已分配湿重 {{ tonText(allocWet) }} / {{ dash(form.wet) }}
              · 干重 {{ tonText(allocDry) }} / {{ dash(form.dry) }}
            </p>
          </div>
        </div>

        <el-form label-width="108px" class="receive-remark">
          <el-form-item label="收货备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
        </el-form>
      </section>

      <template #footer>
        <el-button @click="emit('close')">取消</el-button>
        <el-button type="primary" :loading="saving" @click="receiveMode ? submitReceive() : submitReserve()">{{ receiveMode ? '确认收货' : '提交预约' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ocrOpen" :title="ocrTitle" width="860px" align-center append-to-body>
      <div class="ocr-detail">
        <div>
          <div v-if="preview?.image && preview.url" class="ocr-shot">
            <ImageViewer :src="preview.url" :name="preview.name" :title="ocrTitle" />
          </div>
          <div v-else class="preview">
            <strong>{{ preview?.name || '单据预览区' }}</strong>
            <span>{{ preview?.name ? '该文件不能在这里预览' : '上传后显示识别影像' }}</span>
          </div>
          <div class="ocr-actions">
            <el-button size="small" :disabled="ocrBusy" @click="repickOcr">重新上传</el-button>
            <el-button size="small" :loading="ocrBusy" :disabled="!preview?.file" @click="rerecognize">重新识别</el-button>
          </div>
        </div>
        <el-form label-width="96px">
          <p class="hint">识别字段均可手工修正后回填</p>
          <template v-if="ocrTarget === 'inbound'">
            <el-form-item label="船名"><el-input v-model="draft.shipName" /></el-form-item>
            <el-form-item label="提单号"><el-input v-model="draft.blNo" /></el-form-item>
            <el-form-item label="提货重量"><el-input v-model="draft.blWeight" type="number" /></el-form-item>
            <el-form-item label="报关单号"><el-input v-model="draft.customsNo" /></el-form-item>
            <el-form-item label="核注清单号"><el-input v-model="draft.checklistNo" /></el-form-item>
            <el-form-item label="金额">
              <div class="money">
                <el-select v-model="draft.currency" style="width: 120px"><el-option v-for="item in currencies" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                <el-input v-model="draft.amount" type="number" />
              </div>
            </el-form-item>
          </template>
          <template v-if="ocrTarget === 'weight' || ocrTarget === 'receive'">
            <el-form-item label="湿重(吨)"><el-input v-model="draft.wet" /></el-form-item>
            <el-form-item label="干重(吨)"><el-input v-model="draft.dry" /></el-form-item>
            <el-form-item label="水分"><el-input v-model="draft.moisture" /></el-form-item>
          </template>
          <template v-if="ocrTarget === 'quality' || ocrTarget === 'receive'">
            <el-form-item label="证书编号"><el-input v-model="draft.qualityNo" /></el-form-item>
            <el-form-item label="品质参数">
              <div class="quality">
                <label v-for="item in qualityKeys" :key="item.key">
                  <span>{{ item.label }}</span>
                  <el-input v-model="draft[item.key]" type="number">
                    <template #suffix>{{ item.unit }}</template>
                  </el-input>
                </label>
              </div>
            </el-form-item>
          </template>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="ocrOpen = false">取消</el-button>
        <el-button @click="ElMessage.success('已归档附件')">仅归档</el-button>
        <el-button type="primary" @click="applyOcr">回填并归档</el-button>
      </template>
    </el-dialog>

    <Teleport to="body">
      <div v-if="ocrBusy" class="ocr-mask" role="status" aria-live="polite">
        <div class="ocr-progress-card">
          <div class="ocr-spinner" />
          <strong>正在识别{{ DOC_TYPE[ocrProgressKind] }}</strong>
          <span>正在提取单据字段，请稍候…</span>
          <div class="ocr-progress-track"><i :style="{ width: `${ocrProgress}%` }" /></div>
          <small>{{ ocrProgress }}%</small>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dlg-title { margin: 0; font-size: 16px; font-weight: 600; }
.file { display: none; }
.ocr-mask { position: fixed; z-index: 5000; inset: 0; display: grid; place-items: center; background: rgb(18 22 28 / 52%); backdrop-filter: blur(3px); }
.ocr-progress-card { display: flex; width: min(360px, calc(100vw - 40px)); flex-direction: column; align-items: center; gap: 12px; padding: 28px 30px 22px; border: 1px solid var(--el-color-primary-light-7); border-radius: 12px; background: var(--el-bg-color); box-shadow: 0 20px 60px rgb(0 0 0 / 20%); color: var(--el-text-color-primary); }
.ocr-progress-card strong { font-size: 16px; font-weight: 600; }
.ocr-progress-card > span { color: var(--el-text-color-secondary); font-size: 13px; }
.ocr-spinner { width: 38px; height: 38px; border: 3px solid var(--el-color-primary-light-8); border-top-color: var(--el-color-primary); border-radius: 50%; animation: ocr-spin 0.8s linear infinite; }
.ocr-progress-track { width: 100%; height: 6px; overflow: hidden; border-radius: 99px; background: var(--el-color-primary-light-9); }
.ocr-progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--el-color-primary); transition: width 220ms ease; }
.ocr-progress-card small { color: var(--el-color-primary-dark-2); font-size: 12px; font-variant-numeric: tabular-nums; }
@keyframes ocr-spin { to { transform: rotate(360deg); } }
.reserve { min-height: 0; height: 100%; display: flex; flex-direction: column}
.ocr-bar, .ocr-dual { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: #fff; border: 1px solid #ececec; border-radius: 8px; }
.ocr-bar { margin-bottom: 12px; }
.ocr-label { font-weight: 600; }
.ocr-bar em { font-style: normal; color: var(--el-color-primary); font-size: 12px; padding: 2px 8px; border-radius: 4px; background: #eef5ff; }
.ocr-bar button, .slot {
  height: 32px; padding: 0 12px; border: 1px solid #d1d1d1; border-radius: 4px; background: #fff; cursor: pointer; font: inherit;
}
.ocr-bar button.text { border: none; color: var(--el-color-primary); background: transparent; }
.status { color: #5c5c5c; font-size: 13px; }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fields { overflow: auto; padding-right: 4px; }
.fields small, .map-pane small { display: block; margin-top: 4px; color: #8a8a8a; }
.map-pane { min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid #ececec; border-radius: 8px; padding: 12px; }
.map-label { font-weight: 600; }
.map-label span { color: var(--el-color-danger); }
.map-pane :deep(.pick) { flex: 1; min-height: 0; }
.money-editor { width: 100%; padding: 9px; border: 1px solid var(--el-color-primary-light-7); border-radius: 8px; background: linear-gradient(180deg, var(--el-color-primary-light-9) 0%, #fff 100%); }
.money-heading, .money-card-heading { display: flex; align-items: center; }
.money-heading { justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.money-heading > div { display: flex; flex-direction: column; gap: 3px; }
.money-heading strong { color: var(--el-text-color-primary); font-size: 13px; }
.money-heading span { color: var(--el-text-color-secondary); font-size: 11px; }
.money-list { display: flex; flex-direction: column; gap: 7px; }
.money-card { padding: 8px 9px; border: 1px solid var(--el-border-color); border-radius: 6px; background: #fff; }
.money-card-heading { gap: 7px; margin-bottom: 7px; padding-bottom: 6px; border-bottom: 1px solid var(--el-color-primary-light-9); }
.money-card-heading strong { color: var(--el-text-color-primary); font-size: 12px; }
.money-index { display: inline-flex; width: 21px; height: 21px; align-items: center; justify-content: center; border-radius: 5px; background: var(--el-color-primary-light-9); color: var(--el-color-primary-dark-2); font-size: 10px; font-weight: 700; }
.money-required { margin-left: auto; color: var(--el-text-color-secondary); font-size: 11px; }
.money-card-heading .el-button { margin-left: auto; }
.money-fields { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px 9px; }
.money-field { display: flex; min-width: 0; flex-direction: column; gap: 3px; color: var(--el-text-color-secondary); font-size: 11px; }
.money-field :deep(.el-input), .money-field :deep(.el-select) { width: 100%; }
.money-field :deep(.el-input__wrapper), .money-field :deep(.el-select__wrapper) { box-shadow: 0 0 0 1px var(--el-border-color) inset; }
.money-field :deep(.el-input__wrapper:hover), .money-field :deep(.el-select__wrapper:hover) { box-shadow: 0 0 0 1px var(--el-color-primary-light-5) inset; }
.ocr-dual { margin-bottom: 16px; align-items: stretch; }
.receive { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.receive-split {
  display: grid;
  grid-template-columns: minmax(360px, 1.1fr) minmax(320px, 0.9fr);
  gap: 16px;
  min-height: 320px;
}
.receive-split .map-pane { min-height: 320px; }
.receive-split .map-pane :deep(.yard-plan) { flex: 1; min-height: 280px; }
.alloc-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 8px;
  padding: 12px;
}
.alloc-sum { margin: 0; color: #5c5c5c; font-size: 13px; }
.receive-remark { margin-top: 4px; }
.ocr-dual > div { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.slot { height: auto; min-height: 72px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px; text-align: left; }
.ocr-dual .slot { height: 120px; min-height: 120px; box-sizing: border-box; }
.slot span { color: #8a8a8a; font-size: 12px; }
.slot.shot {
  position: relative;
  padding: 0;
  overflow: hidden;
  align-items: stretch;
}
.slot.shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #f3f3f3;
}
.slot.shot .file-card {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  background: #f7f7f7;
}
.slot.shot em {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 4px 8px;
  font-style: normal;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  text-align: center;
}
.ocr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.quality { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; width: 100%; }
.quality label { display: flex; align-items: center; gap: 8px; }
.quality span { flex: 0 0 72px; color: #5c5c5c; white-space: nowrap; }
.quality .el-input { flex: 1; min-width: 0; }
.quality .el-input :deep(.el-input__suffix) { color: #8a8a8a; }
.quality i { color: var(--el-color-danger); font-style: normal; }
.ocr-detail { display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
.ocr-shot { display: block; margin-bottom: 12px; }
.ocr-shot :deep(.shot img) { height: 220px; }
.preview { min-height: 180px; margin-bottom: 12px; border: 1px dashed #dcdfe6; border-radius: 6px; background: #f7f7f7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #8a8a8a; overflow: hidden; }
.hint { margin: 0 0 8px; color: #5c5c5c; }
@media (max-width: 1100px) {
  .money-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .money-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .money-heading { align-items: flex-start; }
}
</style>

<style>
.inbound-wizard.el-dialog {
  width: 94vw;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
}
.inbound-wizard .el-dialog__header,
.inbound-receive .el-dialog__header {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e5e5;
}
.inbound-wizard .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 20px;
  background: #f3f3f3;
}
.inbound-receive .el-dialog__body { max-height: 70vh; overflow: auto; }
.inbound-receive-wide.el-dialog {
  width: 96vw;
  height: 92vh;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
}
.inbound-receive-wide .el-dialog__body {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow: auto;
  padding: 16px 20px;
  background: #f3f3f3;
}
.inbound-wizard .el-dialog__footer,
.inbound-receive .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #e5e5e5;
}
</style>
