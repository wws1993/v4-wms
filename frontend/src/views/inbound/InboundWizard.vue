<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { inboundApi, ocrApi } from '@/api'
import ImageViewer from '@/components/ImageViewer.vue'
import StackGridPicker from '@/components/StackGridPicker.vue'
import { cellKeys, dash } from '../ops/samples'

const props = defineProps<{
  consignors: string[]
  materials: Record<string, unknown>[]
  filings: Record<string, unknown>[]
  stacks: Record<string, unknown>[]
  shipModes: string[]
  minerals: string[]
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
const previews = reactive<Record<string, { name: string; url: string; image: boolean }>>({})
const ocrOpen = ref(false)
const ocrTarget = ref<'inbound' | 'weight' | 'quality' | 'receive'>('inbound')
const qualityKeys = [
  { key: 'cu', label: 'Cu 铜', required: true },
  { key: 'ag', label: 'Ag 银' },
  { key: 'au', label: 'Au 金' },
  { key: 'as', label: 'As 砷' },
  { key: 'pb', label: 'Pb 铅' },
  { key: 'cd', label: 'Cd 镉' },
  { key: 'f', label: 'F 氟' },
  { key: 'hg', label: 'Hg 汞' },
]

const form = reactive<Record<string, any>>({
  id: '',
  consignor: props.consignors[0] || '',
  shipName: '',
  blNo: '',
  time: '',
  customsNo: '',
  checklistNo: '',
  amount: '',
  currency: props.currencies[0]?.value || 'CNY',
  material: '',
  oreType: props.minerals[0] || '精铜矿',
  shipMode: props.shipModes[0] || '',
  containerCount: '',
  filingNo: '',
  stackCode: '',
  areaId: '',
  cells: '',
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
})
const draft = reactive<Record<string, any>>({})

if (props.seed) {
  Object.assign(form, props.seed, { category: '原料' })
  if (Array.isArray(form.cells)) form.cells = form.cells.join(',')
  if (props.seed.orcId) ocrStatus.value = `已关联报关单任务 ${props.seed.orcId}`
}

const rawMaterials = computed(() => props.materials.filter((row) => {
  const kind = String(row.kind || '')
  const cargo = String(row.cargoType || '')
  return kind !== '成品' && cargo !== '混成品'
}))
const containerMode = computed(() => String(form.shipMode).includes('集装箱'))
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

function onShipMode(name: string) {
  if (!String(name).includes('集装箱')) form.containerCount = ''
}

function onMaterial(name: string) {
  const row = rawMaterials.value.find((item) => item.name === name)
  form.cargoType = row ? String(row.cargoType || '') : form.cargoType
  if (row?.cargoType !== '报备矿') {
    form.filingNo = ''
    return
  }
  const filing = props.filings.find((item) => item.source === row.source && item.status !== '已用尽' && Number(item.remain) > 0)
  form.filingNo = filing ? String(filing.code) : ''
}

const DOC_TYPE: Record<'bl' | 'customs' | 'weight' | 'quality', string> = {
  bl: '提单',
  customs: '入库报关单',
  weight: '重量单',
  quality: '品质单',
}

function filled(value: unknown) {
  return value != null && String(value).trim() !== ''
}

function copyFields(keys: string[], from: Record<string, any>, to: Record<string, any>) {
  for (const key of keys) to[key] = from[key]
}

function fillFields(keys: string[], from: Record<string, any>, to: Record<string, any>) {
  for (const key of keys) {
    if (filled(from[key])) to[key] = from[key]
  }
}

function pick(kind: 'bl' | 'customs' | 'weight' | 'quality') {
  pickKind.value = kind
  if (!picker.value) return
  picker.value.value = ''
  picker.value.click()
}

async function onPicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const kind = pickKind.value
  const previous = previews[kind]
  if (previous?.url) URL.revokeObjectURL(previous.url)
  const image = file.type.startsWith('image/')
  previews[kind] = { name: file.name, url: image ? URL.createObjectURL(file) : '', image }
  lastDoc.value = kind
  const res = await ocrApi.recognize({ docType: DOC_TYPE[kind], fileName: file.name, __file: file })
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '识别失败')
    return
  }
  const data = res.data as Record<string, unknown>
  const id = String(data.id || '')
  if (kind === 'bl' || kind === 'customs') {
    fillFields(['shipName', 'blNo', 'customsNo', 'checklistNo', 'amount', 'currency'], data, form)
    if (filled(data.timeText)) form.time = data.timeText
    form.orcId = id
    ocrStatus.value = `已识别 ${file.name}`
    ElMessage.success(`${kind === 'bl' ? '提单' : '报关单'}已识别并回填`)
    return
  }
  if (kind === 'weight') {
    fillFields(['wet', 'dry', 'moisture'], data, form)
    form.weightOrcId = id
    weightStatus.value = `重量单已识别：湿重 ${data.wet || '—'}t / 干重 ${data.dry || '—'}t`
    ElMessage.success('重量单已识别并回填')
    return
  }
  fillFields(['qualityNo', 'cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg'], data, form)
  if (filled(data.moisture) && !filled(form.moisture)) form.moisture = data.moisture
  form.elementsOrcId = id
  qualityStatus.value = `品质证书已识别：${data.qualityNo || file.name}`
  ElMessage.success('品质证书已识别并回填')
}

function openOcr(target: 'inbound' | 'weight' | 'quality' | 'receive') {
  ocrTarget.value = target
  copyFields(['shipName', 'blNo', 'customsNo', 'checklistNo', 'amount', 'currency', 'wet', 'dry', 'moisture', 'qualityNo', 'cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg'], form, draft)
  ocrOpen.value = true
}

function applyOcr() {
  if (ocrTarget.value === 'inbound') copyFields(['shipName', 'blNo', 'customsNo', 'checklistNo', 'amount', 'currency'], draft, form)
  else if (ocrTarget.value === 'weight') copyFields(['wet', 'dry', 'moisture'], draft, form)
  else if (ocrTarget.value === 'quality') copyFields(['qualityNo', 'moisture', 'cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg'], draft, form)
  else copyFields(['wet', 'dry', 'moisture', 'qualityNo', 'cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg'], draft, form)
  ocrOpen.value = false
  ElMessage.success('已回填并归档')
}

function numberOrBlank(value: unknown) {
  if (value == null || String(value).trim() === '') return Number.NaN
  return Number(String(value).replace('%', ''))
}

function createdId(data: unknown) {
  if (data == null || data === '') return ''
  if (typeof data === 'string' || typeof data === 'number') return String(data)
  if (typeof data === 'object' && 'id' in data && (data as { id?: unknown }).id != null) return String((data as { id?: unknown }).id)
  return ''
}

async function submitReserve() {
  if (!form.consignor || !form.shipName || !form.blNo || !form.material || !form.oreType || !form.shipMode) {
    ElMessage.warning('请填写委托方、船名、提单号、物料、矿种和货运方式')
    return
  }
  if (form.amount === '' || form.amount == null) {
    ElMessage.warning('请填写订单金额')
    return
  }
  if (!form.stackCode) {
    ElMessage.warning('请放大仓库并选择堆位')
    return
  }
  if (cellKeys(pickedStack.value).length && !form.cells) {
    ElMessage.warning('请在平面图上框选存放格子')
    return
  }
  if (!form.orcId) {
    ElMessage.warning('请先上传报关单完成识别')
    return
  }
  saving.value = true
  try {
    const status = String(form.stackCode).includes('码头') ? '暂存码头' : '待收货'
    const created = await inboundApi.create({
      ...form,
      areaId: form.areaId || pickedStack.value?.id,
      category: '原料',
      status,
      containerCount: containerMode.value ? form.containerCount : ''
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
  if (!String(form.cu || '').trim()) {
    ElMessage.warning('请填写铜含量，或上传品质证书')
    return
  }
  saving.value = true
  try {
    const received = await inboundApi.update(String(form.id), {
      ...form,
      wet, dry, moisture: `${moisture}%`,
      wetWeight: wet, dryWeight: dry, moistureContent: moisture,
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

onBeforeUnmount(() => {
  for (const item of Object.values(previews)) {
    if (item.url) URL.revokeObjectURL(item.url)
  }
})
</script>

<template>
  <div>
    <el-dialog
      :model-value="true"
      :class="receiveMode ? 'inbound-receive' : 'inbound-wizard'"
      :width="receiveMode ? '920px' : '94vw'"
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
      <div style="height:12px"></div>
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
            <el-form-item label="船名" required><el-input v-model="form.shipName" /></el-form-item>
            <el-form-item label="提单号" required><el-input v-model="form.blNo" /></el-form-item>
            <el-form-item label="预计到货日"><el-date-picker v-model="form.time" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
            <el-form-item label="报关单号"><el-input v-model="form.customsNo" placeholder="OCR 回填" /></el-form-item>
            <el-form-item label="核注清单号"><el-input v-model="form.checklistNo" /></el-form-item>
            <el-form-item label="金额" required>
              <div class="money">
                <el-select v-model="form.currency" style="width: 120px"><el-option v-for="item in currencies" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                <el-input v-model="form.amount" type="number" placeholder="金额" />
              </div>
            </el-form-item>
            <el-form-item label="物料" required>
              <el-select v-model="form.material" @change="onMaterial">
                <el-option v-for="item in rawMaterials" :key="String(item.id)" :label="String(item.name)" :value="String(item.name)" />
              </el-select>
            </el-form-item>
            <el-form-item label="矿种" required><el-select v-model="form.oreType"><el-option v-for="item in minerals" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="货运方式" required><el-select v-model="form.shipMode" @change="onShipMode"><el-option v-for="item in shipModes" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item v-if="containerMode" label="集装箱柜数"><el-input v-model="form.containerCount" type="number" placeholder="柜" /></el-form-item>
          </el-form>
          <div class="map-pane">
            <div class="map-label">存放位置 <span>*</span></div>
            <StackGridPicker v-model:stack-code="form.stackCode" v-model:area-id="form.areaId" v-model:cells="form.cells" :stacks="stacks" />
          </div>
        </div>
      </section>

      <section v-else class="receive">
        <el-form label-width="108px">
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="入库单号" required><el-input :model-value="dash(form.orderNo || form.id)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="dash(form.consignor)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="物料"><el-input :model-value="dash(form.material)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="货物类型"><el-input :model-value="dash(form.cargoType)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿源备案号"><el-input :model-value="filingText" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿种"><el-input :model-value="dash(form.oreType)" readonly disabled /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="货运方式"><el-input :model-value="dash(form.shipMode)" readonly disabled /></el-form-item></el-col>
            <el-col v-if="containerMode" :span="12"><el-form-item label="集装箱柜数"><el-input :model-value="dash(form.containerCount)" readonly disabled /></el-form-item></el-col>
            <el-col :span="24">
              <div class="ocr-dual">
                <div>
                  <button type="button" class="slot" @click="pick('weight')"><strong>上传重量单</strong><span>识别湿重 / 干重 / 水分</span></button>
                  <span class="status">{{ weightStatus }}</span>
                </div>
                <div>
                  <button type="button" class="slot" @click="pick('quality')"><strong>上传品质证书</strong><span>识别各品质元素 / 证书编号</span></button>
                  <span class="status">{{ qualityStatus }}</span>
                </div>
              </div>
            </el-col>
            <el-col :span="8"><el-form-item label="湿重(吨)" required><el-input v-model="form.wet" type="number" placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="干重(吨)" required><el-input v-model="form.dry" type="number" placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="水分"><el-input v-model="form.moisture" readonly placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="24">
              <el-form-item label="品质参数">
                <div class="quality">
                  <label v-for="item in qualityKeys" :key="item.key">
                    <span>{{ item.label }}<i v-if="item.required">*</i></span>
                    <el-input v-model="form[item.key]" />
                  </label>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12"><el-form-item label="品质证书号"><el-input v-model="form.qualityNo" readonly placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="12">
              <el-form-item label="分类">
                <el-select v-model="form.category" style="width: 100%">
                  <el-option label="原料" value="原料" />
                  <el-option label="成品" value="成品" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12"><el-form-item label=" "><el-button @click="openOcr('receive')">查看 OCR 详情</el-button></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="收货备注"><el-input v-model="form.remark" type="textarea" /></el-form-item></el-col>
          </el-row>
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
          <el-button size="small" @click="pick(ocrTarget === 'weight' ? 'weight' : ocrTarget === 'quality' ? 'quality' : 'customs')">重新上传</el-button>
        </div>
        <el-form label-width="96px">
          <p class="hint">识别字段均可手工修正后回填</p>
          <template v-if="ocrTarget === 'inbound'">
            <el-form-item label="船名"><el-input v-model="draft.shipName" /></el-form-item>
            <el-form-item label="提单号"><el-input v-model="draft.blNo" /></el-form-item>
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
                <label v-for="item in qualityKeys" :key="item.key"><span>{{ item.label }}</span><el-input v-model="draft[item.key]" /></label>
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
  </div>
</template>

<style scoped>
.dlg-title { margin: 0; font-size: 16px; font-weight: 600; }
.file { display: none; }
.reserve { min-height: 0; height: 100%; display: flex; flex-direction: column; padding-top: 24px;}
.ocr-bar, .ocr-dual { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: #fff; border: 1px solid #ececec; border-radius: 8px; }
.ocr-bar { margin-bottom: 12px; }
.ocr-label { font-weight: 600; }
.ocr-bar em { font-style: normal; color: var(--el-color-primary); font-size: 12px; padding: 2px 8px; border-radius: 4px; background: #eef5ff; }
.ocr-bar button, .slot {
  height: 32px; padding: 0 12px; border: 1px solid #d1d1d1; border-radius: 4px; background: #fff; cursor: pointer; font: inherit;
}
.ocr-bar button.text { border: none; color: var(--el-color-primary); background: transparent; }
.status { color: #5c5c5c; font-size: 13px; }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 420px 1fr; gap: 16px; }
.fields { overflow: auto; padding-right: 4px; }
.fields small, .map-pane small { display: block; margin-top: 4px; color: #8a8a8a; }
.map-pane { min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid #ececec; border-radius: 8px; padding: 12px; }
.map-label { font-weight: 600; }
.map-label span { color: var(--el-color-danger); }
.map-pane :deep(.pick) { flex: 1; min-height: 0; }
.money { display: flex; gap: 8px; width: 100%; }
.money :deep(.el-input) { flex: 1; }
.ocr-dual { margin-bottom: 16px; align-items: stretch; }
.ocr-dual > div { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.slot { height: auto; min-height: 72px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px; text-align: left; }
.slot span { color: #8a8a8a; font-size: 12px; }
.quality { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; width: 100%; }
.quality label { display: flex; align-items: center; gap: 8px; }
.quality span { width: 64px; color: #5c5c5c; }
.quality i { color: var(--el-color-danger); font-style: normal; }
.ocr-detail { display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
.ocr-shot { display: block; margin-bottom: 12px; }
.ocr-shot :deep(.shot img) { height: 220px; }
.preview { min-height: 180px; margin-bottom: 12px; border: 1px dashed #dcdfe6; border-radius: 6px; background: #f7f7f7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #8a8a8a; overflow: hidden; }
.hint { margin: 0 0 8px; color: #5c5c5c; }
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
.inbound-wizard .el-dialog__footer,
.inbound-receive .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #e5e5e5;
}
</style>
