<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import LotDetailDialog from '@/components/LotDetailDialog.vue'
import StackGridPicker from '@/components/StackGridPicker.vue'
import { inventoryApi, partnerApi, transferApi, warehouseApi } from '@/api'
import { dash, HOURS } from './ops/samples'

const route = useRoute()
const filters = reactive({ consignor: '', scene: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const stacks = ref<Record<string, unknown>[]>([])
const lots = ref<Record<string, unknown>[]>([])
const sourceLots = ref<Record<string, unknown>[]>([])
const lotsLoading = ref(false)
const saving = ref(false)
const single = ref(false)
const batch = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const ledgerOpen = ref(false)
const focus = ref('inbound')
const current = ref<Record<string, unknown> | null>(null)
const form = reactive({
  stackId: '', lotId: '', batchNo: '', inventoryId: '', scene: '整票移位',
  toStack: '', toAreaId: '', cells: '', weight: '',
  fromDate: '', fromHour: '08', toDate: '', toHour: '12',
})
const batchQuery = reactive({ warehouse: '', stack: '', consignor: '', keyword: '' })
const picked = ref<Record<string, { toStack: string; scene: string }>>({})

const houses = computed(() => [...new Set(stacks.value.map((row) => String(row.warehouse)))])
const selected = computed(() => sourceLots.value.find((row) => lotKey(row) === form.lotId))
const wholeLot = computed(() => form.scene === '整票移位')
const weightHint = computed(() => {
  const dry = Number(selected.value?.dry)
  return dry > 0 ? `不超过 ${dry} 吨` : '吨'
})
const batchStacks = computed(() => stacks.value.filter((row) => !batchQuery.warehouse || row.warehouse === batchQuery.warehouse))
const batchLots = computed(() => lots.value.filter((row) => {
  if (row.status !== '在库') return false
  if (batchQuery.warehouse && row.warehouse !== batchQuery.warehouse) return false
  if (batchQuery.stack && row.stackText !== batchQuery.stack) return false
  if (batchQuery.consignor && row.consignor !== batchQuery.consignor) return false
  const word = batchQuery.keyword
  if (word && !`${row.batchNo}${row.material}${row.stackText}`.includes(word)) return false
  return true
}))

function lotKey(row: Record<string, unknown>) {
  return String(row.id || row.inventoryId || row.batchNo)
}

function lotText(row: Record<string, unknown> | undefined, key: 'customs' | 'prod') {
  if (!row) return '—'
  if (key === 'customs') return row.batchKind === '报关单号' ? String(row.batchNo) : '—'
  return row.batchKind === '生产批次号' ? String(row.batchNo) : '—'
}

async function load() {
  loading.value = true
  const res = await transferApi.list({
    ...filters,
    page: filters.keyword ? 1 : page.value,
    pageSize: filters.keyword ? 200 : 10,
  })
  loading.value = false
  if (!res.success || !res.data) return
  rows.value = res.data.list
  total.value = res.data.total
}

async function reloadLots() {
  const lotRes = await inventoryApi.list({ page: 1, pageSize: 200, status: '在库' })
  if (lotRes.success && lotRes.data) lots.value = lotRes.data.list
}

function applyKeyword() {
  if (route.name !== 'transfer') return false
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (filters.keyword === keyword) return false
  filters.keyword = keyword
  page.value = 1
  return true
}

watch(() => route.query.keyword, () => {
  if (applyKeyword()) load()
})

onActivated(() => {
  if (applyKeyword()) load()
})

onMounted(async () => {
  const [who, stackRes] = await Promise.all([
    partnerApi.consignors(),
    warehouseApi.stacks({ page: 1, pageSize: 200 }),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  await reloadLots()
  applyKeyword()
  load()
})

async function openDetail(row: Record<string, unknown>, section = 'inbound') {
  const batchNo = String(row.batchNo || row.customsNo || row.prodBatch || '')
  focus.value = section
  detailOpen.value = true
  detailLoading.value = true
  current.value = {
    ...row,
    batchNo,
    batchKind: row.customsNo ? '报关单号' : '生产批次号',
    stackText: row.toStack || row.fromStack,
  }
  if (batchNo) {
    const res = await inventoryApi.detail(batchNo)
    if (detailOpen.value && res.success && res.data) current.value = res.data
  }
  detailLoading.value = false
}

function openSingle() {
  Object.assign(form, {
    stackId: '', lotId: '', batchNo: '', inventoryId: '', scene: '整票移位',
    toStack: '', toAreaId: '', cells: '', weight: '',
    fromDate: '', fromHour: '08', toDate: '', toHour: '12',
  })
  sourceLots.value = []
  single.value = true
}

let lotToken = 0
async function loadSourceLots(stackId: string) {
  form.lotId = ''
  form.batchNo = ''
  form.inventoryId = ''
  form.weight = ''
  sourceLots.value = []
  if (!stackId) return
  const token = ++lotToken
  lotsLoading.value = true
  const res = await inventoryApi.list({ stack: stackId, status: '在库', page: 1, pageSize: 200 })
  if (token !== lotToken) return
  lotsLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '票货查询失败')
    return
  }
  sourceLots.value = res.data.list
}

function pickLot(row: Record<string, unknown>) {
  form.lotId = lotKey(row)
  form.batchNo = String(row.batchNo || '')
  form.inventoryId = String(row.id || row.inventoryId || '')
}

async function submitSingle() {
  if (!form.stackId) {
    ElMessage.warning('请先选择原堆位')
    return
  }
  if (!selected.value) {
    ElMessage.warning('请选择要移动的票货')
    return
  }
  const source = stacks.value.find((item) => String(item.id) === form.stackId)
  const sameStack = (form.toAreaId && form.toAreaId === form.stackId) || (source && form.toStack === String(source.code))
  if ((!form.toAreaId && !form.toStack) || !form.cells) {
    ElMessage.warning('请在平面图上框选目标堆位格子')
    return
  }
  if (sameStack) {
    ElMessage.warning('目标堆位不能与原堆位相同')
    return
  }
  if (!wholeLot.value) {
    const weight = Number(form.weight)
    const dry = Number(selected.value.dry)
    if (!(weight > 0)) {
      ElMessage.warning('请填写移库重量')
      return
    }
    if (dry > 0 && weight > dry) {
      ElMessage.warning('移库重量不能超过在库干重')
      return
    }
  }
  if (!form.fromDate || !form.toDate) {
    ElMessage.warning('请选择移库时间')
    return
  }
  const from = `${form.fromDate} ${form.fromHour}`
  const to = `${form.toDate} ${form.toHour}`
  if (to < from) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
  }
  saving.value = true
  try {
    const res = await transferApi.create({
      batchNo: form.batchNo,
      inventoryId: form.inventoryId,
      toStack: form.toStack,
      areaId: form.toAreaId,
      cells: form.cells,
      scene: form.scene,
      weight: wholeLot.value ? undefined : Number(form.weight),
      shipName: selected.value.shipName || '—',
      containerCount: Number(selected.value.containerCount || 0),
      timeFrom: `${from}:00`,
      timeTo: `${to}:00`,
    })
    if (!res.success) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(res.message)
    single.value = false
    await reloadLots()
    load()
  } finally {
    saving.value = false
  }
}

function lotRowClass({ row }: { row: Record<string, unknown> }) {
  return lotKey(row) === form.lotId ? 'is-picked' : ''
}

function toggleLot(batchNo: string, on: boolean) {
  if (on) picked.value[batchNo] = picked.value[batchNo] || { toStack: '', scene: '整票移位' }
  else delete picked.value[batchNo]
}

function toggleAll(on: boolean) {
  if (!on) {
    picked.value = {}
    return
  }
  const next = { ...picked.value }
  for (const row of batchLots.value) {
    const key = String(row.batchNo)
    next[key] = next[key] || { toStack: '', scene: '整票移位' }
  }
  picked.value = next
}

async function submitBatch() {
  const items = Object.entries(picked.value)
  if (!items.length) {
    ElMessage.warning('请勾选矿批次')
    return
  }
  if (items.some(([, value]) => !value.toStack)) {
    ElMessage.warning('请为每一票选择目标堆位')
    return
  }
  for (const [batchNo, value] of items) {
    const res = await transferApi.create({ batchNo, toStack: value.toStack, scene: value.scene, shipName: '—', containerCount: 0, timeFrom: '', timeTo: '' })
    if (!res.success) {
      ElMessage.error(`${batchNo}：${res.message}`)
      return
    }
  }
  ElMessage.success(`已生成 ${items.length} 条移库单`)
  batch.value = false
  picked.value = {}
  await reloadLots()
  load()
}
</script>

<template>
  <div>
    <el-form :inline="true">
      <el-form-item label="单号">
        <el-input v-model="filters.keyword" clearable placeholder="报关单 / 批次 / 移库单" style="width: 200px" />
      </el-form-item>
      <el-form-item label="委托方">
        <el-select v-model="filters.consignor" clearable style="width: 140px">
          <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
      <el-form-item label="场景">
        <el-select v-model="filters.scene" clearable style="width: 130px">
          <el-option label="整票移位" value="整票移位" /><el-option label="拆票移位" value="拆票移位" /><el-option label="批量移位" value="批量移位" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <div class="toolbar">
      <el-button type="primary" @click="openSingle">新建移库</el-button>
      <el-button @click="picked = {}; batch = true">批量移库</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="orderNo" label="移库单号" min-width="150" />
      <el-table-column prop="consignor" label="委托方" width="110" />
      <el-table-column prop="scene" label="场景" width="110" />
      <el-table-column label="报关单号" min-width="160">
        <template #default="{ row }">
          <el-button v-if="row.customsNo" link type="primary" @click="openDetail(row, 'inbound')">{{ row.customsNo }}</el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="prodBatch" label="生产批次" min-width="130" />
      <el-table-column prop="material" label="物料" width="100" />
      <el-table-column label="船名" width="90"><template #default="{ row }">{{ dash(row.shipName) }}</template></el-table-column>
      <el-table-column label="柜数" width="70"><template #default="{ row }">{{ row.containerCount || '—' }}</template></el-table-column>
      <el-table-column prop="weight" label="重量" width="80" />
      <el-table-column prop="fromStack" label="原堆位" width="100" />
      <el-table-column prop="toStack" label="目标堆位" width="100" />
      <el-table-column label="移库时间" min-width="180"><template #default="{ row }">{{ dash(row.timeFrom) }} 至 {{ dash(row.timeTo) }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="90" />
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <LotDetailDialog
      v-model="detailOpen"
      v-model:ledger="ledgerOpen"
      :lot="current"
      :loading="detailLoading"
      :focus="focus"
      @open-batch="(batch, section) => openDetail({ batchNo: batch, customsNo: batch }, section || 'inbound')"
    />

    <el-dialog v-model="single" class="transfer-create" width="94vw" align-center destroy-on-close :close-on-click-modal="false">
      <template #header><h3 class="dlg-title">新建移库单</h3></template>
      <div class="split">
        <el-form class="fields" label-width="96px">
          <el-form-item label="原堆位" required>
            <el-select v-model="form.stackId" filterable placeholder="先选择堆位" @change="loadSourceLots">
              <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="票货" required>
            <el-table
              v-loading="lotsLoading"
              :data="sourceLots"
              border
              size="small"
              max-height="220"
              :empty-text="form.stackId ? '该堆位没有在库票货' : '请先选择原堆位'"
              :row-class-name="lotRowClass"
              @row-click="pickLot"
            >
              <el-table-column width="46">
                <template #default="{ row }">
                  <el-radio :model-value="form.lotId" :value="lotKey(row)" @click.stop="pickLot(row)" />
                </template>
              </el-table-column>
              <el-table-column label="报关单号" min-width="130"><template #default="{ row }">{{ lotText(row, 'customs') }}</template></el-table-column>
              <el-table-column label="生产批次" min-width="110"><template #default="{ row }">{{ lotText(row, 'prod') }}</template></el-table-column>
              <el-table-column prop="consignor" label="委托方" width="90" />
              <el-table-column prop="material" label="物料" width="80" />
              <el-table-column label="干重" width="70"><template #default="{ row }">{{ dash(row.dry) }}</template></el-table-column>
            </el-table>
          </el-form-item>
          <el-form-item v-if="selected" label="本票">
            <p class="lot-line">{{ dash(selected.consignor) }} · {{ dash(selected.material) }} · 船名 {{ dash(selected.shipName) }} · 干重 {{ dash(selected.dry) }} 吨</p>
          </el-form-item>
          <el-form-item label="场景" required>
            <el-select v-model="form.scene">
              <el-option label="整票移位" value="整票移位" />
              <el-option label="拆票移位" value="拆票移位" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="!wholeLot" label="移库重量" required>
            <el-input v-model="form.weight" type="number" :placeholder="weightHint">
              <template #append>吨</template>
            </el-input>
          </el-form-item>
          <el-form-item v-else label="移库重量">
            <p class="hint">整票移库按在库干重移动，无需填写重量。</p>
          </el-form-item>
          <el-form-item label="移库时间" required>
            <div class="hours">
              <el-date-picker v-model="form.fromDate" type="date" value-format="YYYY-MM-DD" />
              <el-select v-model="form.fromHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="hour" :label="`${hour}时`" :value="hour" /></el-select>
              <span>至</span>
              <el-date-picker v-model="form.toDate" type="date" value-format="YYYY-MM-DD" />
              <el-select v-model="form.toHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="`t${hour}`" :label="`${hour}时`" :value="hour" /></el-select>
            </div>
          </el-form-item>
        </el-form>
        <div class="map-pane">
          <div class="map-label">目标堆位 <span>*</span></div>
          <StackGridPicker v-model:stack-code="form.toStack" v-model:area-id="form.toAreaId" v-model:cells="form.cells" :stacks="stacks" />
        </div>
      </div>
      <template #footer>
        <el-button @click="single = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitSingle">提交并更新库存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batch" title="批量移库任务" width="1100px" align-center>
      <p class="hint">可勾选各仓库待移矿批次。提交后每票各生成一条移库记录。</p>
      <el-form :inline="true">
        <el-form-item label="仓库"><el-select v-model="batchQuery.warehouse" clearable style="width: 120px"><el-option v-for="name in houses" :key="name" :label="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="原堆位"><el-select v-model="batchQuery.stack" clearable filterable style="width: 120px"><el-option v-for="item in batchStacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.code)" /></el-select></el-form-item>
        <el-form-item label="委托方"><el-select v-model="batchQuery.consignor" clearable style="width: 120px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="关键字"><el-input v-model="batchQuery.keyword" placeholder="报关单 / 批次 / 物料 / 堆位" /></el-form-item>
        <el-form-item><el-checkbox @change="toggleAll(Boolean($event))">全选</el-checkbox></el-form-item>
        <el-form-item><span class="hint">已选 {{ Object.keys(picked).length }} 票 / 共 {{ batchLots.length }} 票可移</span></el-form-item>
      </el-form>
      <el-table :data="batchLots" border max-height="360">
        <el-table-column label="选择" width="70">
          <template #default="{ row }">
            <el-checkbox :model-value="Boolean(picked[String(row.batchNo)])" @change="toggleLot(String(row.batchNo), Boolean($event))" />
          </template>
        </el-table-column>
        <el-table-column prop="stackText" label="原堆位" width="90" />
        <el-table-column label="报关单号" min-width="140"><template #default="{ row }">{{ lotText(row, 'customs') }}</template></el-table-column>
        <el-table-column label="生产批次" min-width="120"><template #default="{ row }">{{ lotText(row, 'prod') }}</template></el-table-column>
        <el-table-column prop="material" label="物料" width="90" />
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="船名" width="70"><template #default>—</template></el-table-column>
        <el-table-column label="柜数" width="70"><template #default>—</template></el-table-column>
        <el-table-column prop="dry" label="可移重量" width="90" />
        <el-table-column label="目标堆位" width="130">
          <template #default="{ row }">
            <el-select v-if="picked[String(row.batchNo)]" v-model="picked[String(row.batchNo)].toStack" filterable size="small">
              <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.code)" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="移位方式" width="130">
          <template #default="{ row }">
            <el-select v-if="picked[String(row.batchNo)]" v-model="picked[String(row.batchNo)].scene" size="small">
              <el-option label="整票移位" value="整票移位" /><el-option label="拆票移位" value="拆票移位" /><el-option label="批量移位" value="批量移位" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="batch = false">取消</el-button>
        <el-button type="primary" @click="submitBatch">校验并提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.hint { margin: 0 0 12px; color: #5a6a7e; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.dlg-title { margin: 0; font-size: 16px; font-weight: 600; }
.split { height: 100%; min-height: 0; display: grid; grid-template-columns: minmax(640px, 720px) minmax(420px, 1fr); gap: 16px; }
.fields { min-height: 0; overflow: auto; padding-right: 4px; }
.lot-line { margin: 0; line-height: 1.5; }
.hours { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.map-pane { min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid #ececec; border-radius: 8px; padding: 12px; }
.map-label { font-weight: 600; }
.map-label span { color: var(--el-color-danger); }
.map-pane :deep(.pick) { flex: 1; min-height: 0; }
.fields :deep(.is-picked) { --el-table-tr-bg-color: #eef5ff; }
</style>

<style>
.transfer-create.el-dialog {
  height: 88vh;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
}
.transfer-create .el-dialog__header {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e5e5;
}
.transfer-create .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 20px;
  background: #f3f3f3;
}
.transfer-create .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #e5e5e5;
}
</style>
