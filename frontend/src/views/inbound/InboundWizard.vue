<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import Mock from 'mockjs'
import { inboundApi } from '@/api'
import InboundStackMap from '@/components/InboundStackMap.vue'
import OcrDrop from '@/components/OcrDrop.vue'
import { cellKeys, dash } from '../ops/samples'

const props = defineProps<{
  consignors: string[]
  materials: Record<string, unknown>[]
  filings: Record<string, unknown>[]
  stacks: Record<string, unknown>[]
  methods: { name: string; containers: number }[]
  minerals: string[]
  currencies: { label: string; value: string }[]
  start: number
  seed?: Record<string, unknown> | null
}>()

const emit = defineEmits<{ close: []; done: [] }>()

const steps = ['基本信息', '设置堆位', '重量单', '品质单']
const titles = ['填写基本信息', '设置存放堆位', '登记重量单', '登记品质单']
const blurbs = [
  '上传报关单可回填下方字段。入库货品都是原料。',
  '点击仓库放大，在堆位上拖拽框选存放格子。',
  '上传重量证书，核对湿重、干重和水分。',
  '上传品质证书，核对识别出的品质参数。',
]
const index = ref(props.start)
const saving = ref(false)
const ocrStatus = ref('支持 PDF、JPG、PNG，上传后自动识别并回填')
const weightStatus = ref('支持 PDF、JPG、PNG，上传后自动识别湿重、干重和水分')
const qualityStatus = ref('支持 PDF、JPG、PNG，上传后自动识别品质参数')
const qualityKeys = ['cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg']

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
  shipMode: props.methods[0]?.name || '',
  containerCount: props.methods[0]?.containers ?? '',
  filingNo: '',
  stackCode: '',
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
})

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
const pickedMethod = computed(() => props.methods.find((item) => item.name === form.shipMode))
const pickedStack = computed(() => props.stacks.find((row) => String(row.code) === form.stackCode))

function onShipMode(name: string) {
  const row = props.methods.find((item) => item.name === name)
  form.containerCount = row ? row.containers : ''
}

function onMaterial(name: string) {
  const row = rawMaterials.value.find((item) => item.name === name)
  if (row?.cargoType !== '报备矿') {
    form.filingNo = ''
    return
  }
  const filing = props.filings.find((item) => item.source === row.source && item.status !== '已用尽' && Number(item.remain) > 0)
  form.filingNo = filing ? String(filing.code) : ''
}

function applyOcr(data: Record<string, unknown>) {
  for (const key of ['customsNo', 'checklistNo', 'shipName', 'blNo', 'amount', 'currency', 'time', 'wet', 'dry', 'moisture', 'qualityNo', 'cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg']) {
    if (data[key] != null && data[key] !== '') form[key] = data[key]
  }
}

function taskId() {
  return Mock.Random.string('number', 18)
}

function mockCustoms() {
  const currencies = props.currencies
  const currency = currencies.length ? currencies[Mock.Random.integer(0, currencies.length - 1)].value : form.currency
  return {
    orcId: taskId(),
    shipName: Mock.Random.pick(['海豚号', '海洋之星', '丰联一号', '北部湾', '桂海号']),
    blNo: `BL${Mock.Random.date('yyyyMMdd')}${Mock.Random.integer(100, 999)}`,
    customsNo: `BG${Mock.Random.date('yyyyMMdd')}${Mock.Random.integer(1000, 9999)}`,
    checklistNo: `HZ${Mock.Random.date('yyyyMMdd')}${Mock.Random.integer(100, 999)}`,
    amount: Mock.Random.integer(80000, 2800000),
    currency,
    time: Mock.Random.date('yyyy-MM-dd'),
  }
}

function mockWeight() {
  const wet = Number(Mock.Random.float(200, 1500, 2, 2))
  const moisture = Mock.Random.integer(6, 14)
  const dry = Number((wet * (1 - moisture / 100)).toFixed(2))
  return { wet, dry, moisture: `${moisture}%`, weightOrcId: taskId() }
}

function mockQuality() {
  const pct = (min: number, max: number, digits = 2) => `${Mock.Random.float(min, max, digits, digits)}%`
  const gpt = (min: number, max: number) => `${Mock.Random.float(min, max, 1, 2)} g/t`
  return {
    elementsOrcId: taskId(),
    qualityNo: `QA-${Mock.Random.date('yyyyMMdd')}-${Mock.Random.integer(100, 999)}`,
    cu: pct(18, 32, 1),
    ag: gpt(20, 80),
    au: gpt(0.2, 2),
    as: pct(0.01, 0.3, 3),
    pb: pct(0.01, 0.2, 3),
    cd: pct(0.001, 0.05, 3),
    f: pct(0.005, 0.08, 3),
    hg: pct(0.0001, 0.01, 4),
  }
}

function fillCustoms(file: UploadFile) {
  if (!file.raw) return
  const data = mockCustoms()
  applyOcr(data)
  form.orcId = data.orcId
  ocrStatus.value = `已识别 ${file.name}`
  ElMessage.success('报关单已识别并回填')
}

function fillWeight(file: UploadFile) {
  if (!file.raw) return
  const data = mockWeight()
  applyOcr(data)
  form.weightOrcId = data.weightOrcId
  weightStatus.value = `已识别 ${file.name}`
  ElMessage.success('重量证书已识别并回填')
}

function fillQuality(file: UploadFile) {
  if (!file.raw) return
  const data = mockQuality()
  applyOcr(data)
  form.elementsOrcId = data.elementsOrcId
  qualityStatus.value = `已识别 ${file.name}`
  ElMessage.success('品质证书已识别并回填')
}

function numberOrBlank(value: unknown) {
  if (value == null || String(value).trim() === '') return Number.NaN
  return Number(String(value).replace('%', ''))
}

function stepError() {
  if (form.id) {
    if (index.value !== 2) return ''
  } else if (index.value === 0) {
    if (!form.orcId) return '请先上传报关单完成识别'
    if (!form.consignor || !form.shipName || !form.blNo || !form.material || !form.oreType || !form.shipMode) return '请填写委托方、船名、提单号、物料、矿种和装运方式'
    if (form.amount === '' || form.amount == null) return '请填写订单金额'
  } else if (index.value === 1) {
    if (!form.stackCode) return '请放大仓库并选择堆位'
    if (cellKeys(pickedStack.value).length && !form.cells) return '请框选存放格子'
  }
  if (index.value === 2) {
    const wet = numberOrBlank(form.wet)
    const dry = numberOrBlank(form.dry)
    const moisture = numberOrBlank(form.moisture)
    if (!Number.isFinite(wet) || !Number.isFinite(dry) || !Number.isFinite(moisture)) return '请填写湿重、干重和水分'
  }
  return ''
}

async function finish() {
  const issue = stepError()
  if (issue) {
    ElMessage.warning(issue)
    return
  }
  saving.value = true
  try {
    form.category = '原料'
    if (!form.id) {
      const created = await inboundApi.create({ ...form, status: '待收货' })
      if (!created.success) {
        ElMessage.error(created.message)
        return
      }
      form.id = createdId(created.data)
      if (!form.id) {
        ElMessage.success('预约已创建，请从列表继续登记重量单')
        emit('done')
        return
      }
    }
    const wet = Number(form.wet)
    const dry = Number(form.dry)
    const moisture = Number(String(form.moisture).replace('%', ''))
    const received = await inboundApi.update(String(form.id), {
      ...form,
      wet, dry, moisture: `${moisture}%`,
      wetWeight: wet, dryWeight: dry, moistureContent: moisture,
      category: '原料',
      status: '已入库',
    })
    if (!received.success) {
      ElMessage.error(received.message)
      return
    }
    ElMessage.success(received.message || '入库已完成')
    emit('done')
  } finally {
    saving.value = false
  }
}

function createdId(data: unknown) {
  if (data == null || data === '') return ''
  if (typeof data === 'string' || typeof data === 'number') return String(data)
  if (typeof data === 'object' && 'id' in data && (data as { id?: unknown }).id != null) return String((data as { id?: unknown }).id)
  return ''
}

function next() {
  const issue = stepError()
  if (issue) {
    ElMessage.warning(issue)
    return
  }
  if (index.value < 3) index.value += 1
  else finish()
}
</script>

<template>
  <el-dialog
    :model-value="true"
    class="inbound-wizard"
    width="94vw"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :show-close="true"
    @close="emit('close')"
  >
    <template #header>
      <ol class="steps">
        <li v-for="(name, at) in steps" :key="name" :class="{ on: at === index, done: at < index }">
          <span>{{ at < index ? '✓' : at + 1 }}</span>
          {{ name }}
        </li>
      </ol>
    </template>
    <section class="body" :class="{ mapstep: index === 1 }">
      <h2>{{ titles[index] }}</h2>
      <p>{{ blurbs[index] }}</p>
      <div v-if="index === 0" class="card form">
        <OcrDrop label="报关单" :tip="ocrStatus" @file="fillCustoms" />
        <el-form label-width="108px">
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="委托方" required><el-select v-model="form.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="船名" required><el-input v-model="form.shipName" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="提单号" required><el-input v-model="form.blNo" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="预计到货日"><el-date-picker v-model="form.time" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="报关单号"><el-input v-model="form.customsNo" placeholder="OCR 回填" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="核注清单号"><el-input v-model="form.checklistNo" /></el-form-item></el-col>
            <el-col :span="12">
              <el-form-item label="金额" required>
                <div class="money">
                  <el-select v-model="form.currency" style="width: 120px"><el-option v-for="item in currencies" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                  <el-input v-model="form.amount" type="number" />
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="物料" required>
                <el-select v-model="form.material" @change="onMaterial">
                  <el-option v-for="item in rawMaterials" :key="String(item.id)" :label="String(item.name)" :value="String(item.name)" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12"><el-form-item label="矿种" required><el-select v-model="form.oreType"><el-option v-for="item in minerals" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="装运方式" required><el-select v-model="form.shipMode" @change="onShipMode"><el-option v-for="item in methods" :key="item.name" :label="item.name" :value="item.name" /></el-select></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="柜数"><el-input :model-value="pickedMethod ? String(pickedMethod.containers) : ''" readonly placeholder="取自货运方式" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="矿源备案号"><el-input v-model="form.filingNo" readonly placeholder="报备矿按矿源自动匹配" /></el-form-item></el-col>
          </el-row>
        </el-form>
      </div>
      <div v-else-if="index === 1" class="card map">
        <InboundStackMap v-model:stack-code="form.stackCode" v-model:cells="form.cells" :stacks="stacks" />
      </div>
      <div v-else-if="index === 2" class="card form narrow">
        <OcrDrop label="重量证书" :tip="weightStatus" @file="fillWeight" />
        <el-form label-width="108px">
          <el-form-item label="入库单">{{ dash(form.orderNo || form.customsNo || '完成本步后创建') }}</el-form-item>
          <el-form-item label="堆位">{{ dash(form.stackCode) }} · {{ dash(form.cells) }}</el-form-item>
          <el-form-item label="湿重(吨)" required><el-input v-model="form.wet" type="number" /></el-form-item>
          <el-form-item label="干重(吨)" required><el-input v-model="form.dry" type="number" /></el-form-item>
          <el-form-item label="水分" required><el-input v-model="form.moisture" /></el-form-item>
        </el-form>
      </div>
      <div v-else class="card form narrow">
        <OcrDrop label="品质证书" :tip="qualityStatus" @file="fillQuality" />
        <el-form label-width="108px">
          <el-form-item label="品质证书号"><el-input v-model="form.qualityNo" /></el-form-item>
          <el-form-item label="品质参数">
            <div class="quality">
              <span v-for="key in qualityKeys" :key="key">{{ key.toUpperCase() }} {{ dash(form[key]) }}</span>
            </div>
          </el-form-item>
          <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
        </el-form>
      </div>
    </section>
    <template #footer>
      <button type="button" :disabled="index === 0" @click="index -= 1">上一步</button>
      <button type="button" class="primary" :disabled="saving" @click="next">{{ index === 3 ? '完成入库' : '下一步' }}</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.steps { display: flex; justify-content: center; align-items: center; width: 100%; gap: 16px; margin: 0; padding: 4px 48px; list-style: none; }
.steps li { display: flex; align-items: center; gap: 12px; color: #616161; font-size: 18px; }
.steps li:not(:last-child)::after { content: ""; width: 72px; height: 2px; background: #d1d1d1; margin-left: 8px; }
.steps li span {
  width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center;
  background: #e6e6e6; color: #616161; font-size: 20px; font-weight: 600;
}
.steps li.on { color: #1a1a1a; font-weight: 600; }
.steps li.on span, .steps li.done span { background: var(--el-color-primary); color: #fff; }
.body { min-height: 0; }
.body.mapstep { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.body h2 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.body p { margin: 0 0 18px; color: #5c5c5c; }
.card { background: #fff; border: 1px solid #ececec; border-radius: 8px; padding: 20px 22px; }
.form { max-width: none; }
.narrow { max-width: 720px; }
.map { width: 100%; min-height: 360px; display: flex; flex-direction: column; padding: 16px; }
.body.mapstep .map { flex: 1; height: auto; min-height: 0; }
.money { display: flex; gap: 8px; width: 100%; }
.money :deep(.el-input) { flex: 1; }
.quality { display: flex; flex-wrap: wrap; gap: 8px; }
.quality span { padding: 4px 8px; border-radius: 4px; background: #f6f6f6; }
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
.inbound-wizard .el-dialog__header {
  position: relative;
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #e5e5e5;
  background: #fff;
}
.inbound-wizard .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 8px;
  background: #f3f3f3;
  color: #1a1a1a;
}
.inbound-wizard .el-dialog__footer {
  display: flex;
  justify-content: space-between;
  padding: 14px 24px;
  border-top: 1px solid #e5e5e5;
  background: #fff;
}
.inbound-wizard .el-dialog__footer button {
  height: 32px;
  padding: 0 16px;
  border-radius: 4px;
  border: 1px solid #d1d1d1;
  background: #fff;
  cursor: pointer;
  font: inherit;
}
.inbound-wizard .el-dialog__footer button.primary {
  background: var(--el-color-primary);
  color: #fff;
  border-color: transparent;
}
.inbound-wizard .el-dialog__footer button:disabled { opacity: .45; cursor: default; }
</style>
