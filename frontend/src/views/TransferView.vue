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
const focus = ref('basic')
const current = ref<Record<string, unknown> | null>(null)
const form = reactive({
  stackId: '', customsKeyword: '', lotId: '', batchNo: '', inventoryId: '', scene: '整票移位',
  toStack: '', toAreaId: '', cells: '', weight: '',
  fromDate: '', fromHour: '08', toDate: '', toHour: '12',
})
const batchQuery = reactive({ warehouse: '', stack: '', consignor: '', keyword: '' })
const batchTime = reactive({ fromDate: '', fromHour: '08', toDate: '', toHour: '12' })
type BatchPick = { toStack: string; toAreaId: string; cells: string; scene: string; weight: string }
const picked = ref<Record<string, BatchPick>>({})
/** 当前在平面图上框选目标的票 */
const batchFocus = ref('')

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
  if (key === 'customs') return dash(row.recordNo || row.customsNo)
  return dash(row.batchNo)
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

async function openDetail(row: Record<string, unknown>) {
  const batchNo = String(row.batchNo || row.customsNo || row.prodBatch || '')
  focus.value = 'basic'
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
    stackId: '', customsKeyword: '', lotId: '', batchNo: '', inventoryId: '', scene: '整票移位',
    toStack: '', toAreaId: '', cells: '', weight: '',
    fromDate: '', fromHour: '08', toDate: '', toHour: '12',
  })
  sourceLots.value = []
  single.value = true
}

let lotToken = 0
async function loadSourceLots(stackId = form.stackId) {
  form.lotId = ''
  form.batchNo = ''
  form.inventoryId = ''
  form.weight = ''
  sourceLots.value = []
  const keyword = form.customsKeyword.trim()
  if (!stackId && !keyword) return
  const token = ++lotToken
  lotsLoading.value = true
  const res = await inventoryApi.list({
    stack: stackId || undefined,
    keyword: keyword || undefined,
    status: '在库',
    page: 1,
    pageSize: 200,
  })
  if (token !== lotToken) return
  lotsLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '票货查询失败')
    return
  }
  sourceLots.value = res.data.list
  if (!form.stackId && sourceLots.value.length) {
    const stackText = String(sourceLots.value[0].stackText || '')
    const hit = stacks.value.find((row) => String(row.code) === stackText || String(row.id) === stackText)
    if (hit) form.stackId = String(hit.id)
  }
}

function querySourceLots() {
  if (!form.stackId && !form.customsKeyword.trim()) {
    ElMessage.warning('请选择原堆位或输入报关单号')
    return
  }
  loadSourceLots(form.stackId)
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
  if ((!form.toAreaId && !form.toStack) || !form.cells) {
    ElMessage.warning('请在平面图上框选目标堆位格子')
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

function emptyPick(): BatchPick {
  return { toStack: '', toAreaId: '', cells: '', scene: '整票移位', weight: '' }
}

function targetLabel(value?: BatchPick) {
  if (!value?.toStack || !value.cells) return '右侧框选'
  const count = value.cells.split(',').filter(Boolean).length
  return `${value.toStack} · ${count} 格`
}

function findBatchLot(key: string) {
  return lots.value.find((row) => lotKey(row) === key)
}

function lotLabel(row: Record<string, unknown> | undefined, key?: string) {
  if (!row) return key || '所选库存'
  const batch = String(row.batchNo || '—')
  const stack = String(row.stackText || '')
  return stack ? `${batch} · ${stack}` : batch
}

function focusBatchLot(row: Record<string, unknown>) {
  const key = lotKey(row)
  if (!picked.value[key]) picked.value[key] = emptyPick()
  batchFocus.value = key
}

function toggleLot(key: string, on: boolean) {
  if (on) {
    picked.value[key] = picked.value[key] || emptyPick()
    batchFocus.value = key
    return
  }
  delete picked.value[key]
  if (batchFocus.value === key) batchFocus.value = Object.keys(picked.value)[0] || ''
}

function toggleAll(on: boolean) {
  if (!on) {
    picked.value = {}
    batchFocus.value = ''
    return
  }
  const next = { ...picked.value }
  for (const row of batchLots.value) {
    const key = lotKey(row)
    next[key] = next[key] || emptyPick()
  }
  picked.value = next
  if (!batchFocus.value) batchFocus.value = Object.keys(next)[0] || ''
}

function batchRowClass({ row }: { row: Record<string, unknown> }) {
  return lotKey(row) === batchFocus.value ? 'is-picked' : ''
}

function openBatch() {
  picked.value = {}
  batchFocus.value = ''
  Object.assign(batchTime, { fromDate: '', fromHour: '08', toDate: '', toHour: '12' })
  batch.value = true
}

async function submitBatch() {
  const items = Object.entries(picked.value)
  if (!items.length) {
    ElMessage.warning('请勾选矿批次')
    return
  }
  if (!batchTime.fromDate || !batchTime.toDate) {
    ElMessage.warning('请选择移库时间')
    return
  }
  const from = `${batchTime.fromDate} ${batchTime.fromHour}`
  const to = `${batchTime.toDate} ${batchTime.toHour}`
  if (to < from) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
  }
  for (const [key, value] of items) {
    const source = findBatchLot(key)
    const label = lotLabel(source, key)
    if (!value.toStack || !value.cells) {
      ElMessage.warning(`请为 ${label} 在平面图上框选目标堆位格子`)
      batchFocus.value = key
      return
    }
    if (!source || !String(source.id || source.inventoryId || '')) {
      ElMessage.warning(`${label}：缺少库存 ID，无法提交`)
      batchFocus.value = key
      return
    }
    if (value.scene === '拆票移位') {
      const weight = Number(value.weight)
      const dry = Number(source.dry)
      if (!(weight > 0)) {
        ElMessage.warning(`请为 ${label} 填写移库重量`)
        batchFocus.value = key
        return
      }
      if (dry > 0 && weight > dry) {
        ElMessage.warning(`${label}：移库重量不能超过可移重量`)
        batchFocus.value = key
        return
      }
    }
  }
  saving.value = true
  try {
    const res = await transferApi.batch({
      startDate: batchTime.fromDate,
      startHour: `${batchTime.fromHour}:00:00`,
      endDate: batchTime.toDate,
      endHour: `${batchTime.toHour}:00:00`,
      list: items.map(([key, value]) => {
        const source = findBatchLot(key)!
        const split = value.scene === '拆票移位'
        return {
          batchNo: String(source.batchNo || ''),
          inventoryId: String(source.id || source.inventoryId || ''),
          toStack: value.toStack,
          areaId: value.toAreaId,
          cells: value.cells,
          scene: value.scene || '批量移库',
          weight: split ? Number(value.weight) : undefined,
          shipName: source.shipName || '—',
          containerCount: Number(source.containerCount || 0),
          timeFrom: `${from}:00`,
          timeTo: `${to}:00`,
        }
      }),
    })
    if (!res.success) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(res.message || `已生成 ${items.length} 条移库单`)
    batch.value = false
    picked.value = {}
    batchFocus.value = ''
    await reloadLots()
    load()
  } finally {
    saving.value = false
  }
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
      <el-button @click="openBatch">批量移库</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="orderNo" label="移库单号" width="150" />
      <el-table-column prop="consignor" label="委托方" width="110" />
      <el-table-column prop="scene" label="场景" width="110" />
      <el-table-column label="报关单号" min-width="160">
        <template #default="{ row }">
          <el-button v-if="row.customsNo" link type="primary" @click="openDetail(row)">{{ row.customsNo }}</el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="prodBatch" label="生产批次" min-width="130">
        <template #default="{ row }">{{ dash(row.prodBatch) }}</template>
      </el-table-column>
      <el-table-column prop="material" label="矿区" width="150" />
      <el-table-column prop="cargoType" label="货物类型" width="100">
        <template #default="{ row }">{{ dash(row.cargoType) }}</template>
      </el-table-column>
      <el-table-column prop="weight" label="重量" width="80" />
      <el-table-column prop="fromStack" label="原堆位" width="100" />
      <el-table-column prop="toStack" label="目标堆位" width="100" />
      <el-table-column label="移库时间" min-width="180"><template #default="{ row }">{{ dash(row.timeFrom) }} 至 {{ dash(row.timeTo) }}</template></el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <LotDetailDialog
      v-model="detailOpen"
      v-model:ledger="ledgerOpen"
      :lot="current"
      :loading="detailLoading"
      :focus="focus"
      @open-batch="(batch) => openDetail({ batchNo: batch, customsNo: batch })"
    />

    <el-dialog v-model="single" class="transfer-create" width="94vw" align-center destroy-on-close :close-on-click-modal="false">
      <template #header><h3 class="dlg-title">新建移库单</h3></template>
      <div class="split">
        <el-form class="fields" label-width="96px">
          <el-form-item label="原堆位" required>
            <div class="stack-query">
              <el-select v-model="form.stackId" filterable clearable placeholder="请选择原堆位" style="width: 140px" @change="loadSourceLots">
                <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.id)" />
              </el-select>
              <el-input
                v-model="form.customsKeyword"
                clearable
                placeholder="报关单号查询"
                style="flex: 1; min-width: 140px"
                @keyup.enter="querySourceLots"
              />
              <el-button type="primary" :loading="lotsLoading" @click="querySourceLots">查询</el-button>
            </div>
          </el-form-item>
          <el-form-item label="票货" required>
            <el-table
              v-loading="lotsLoading"
              :data="sourceLots"
              border
              size="small"
              max-height="220"
              :empty-text="form.stackId || form.customsKeyword.trim() ? '没有匹配的在库票货' : '请先选择原堆位或查询报关单号'"
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

    <el-dialog v-model="batch" class="transfer-create" width="94vw" align-center destroy-on-close :close-on-click-modal="false">
      <template #header><h3 class="dlg-title">批量移库任务</h3></template>
      <div class="split">
        <div class="fields">
          <p class="hint">勾选票货后点选一行，在右侧平面图框选该票的目标堆位与格子；每票独立选择。</p>
          <el-form :inline="true" class="batch-filters">
            <el-form-item label="仓库"><el-select v-model="batchQuery.warehouse" clearable style="width: 120px"><el-option v-for="name in houses" :key="name" :label="name" :value="name" /></el-select></el-form-item>
            <el-form-item label="原堆位"><el-select v-model="batchQuery.stack" clearable filterable style="width: 120px"><el-option v-for="item in batchStacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.code)" /></el-select></el-form-item>
            <el-form-item label="委托方"><el-select v-model="batchQuery.consignor" clearable style="width: 120px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
            <el-form-item label="关键字"><el-input v-model="batchQuery.keyword" clearable placeholder="报关单 / 批次 / 物料" style="width: 160px" /></el-form-item>
            <el-form-item><el-checkbox @change="toggleAll(Boolean($event))">全选</el-checkbox></el-form-item>
            <el-form-item><span class="hint">已选 {{ Object.keys(picked).length }} 条 / 共 {{ batchLots.length }} 条可移</span></el-form-item>
            <el-form-item label="移库时间" required>
              <div class="hours">
                <el-date-picker v-model="batchTime.fromDate" type="date" value-format="YYYY-MM-DD" />
                <el-select v-model="batchTime.fromHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="hour" :label="`${hour}时`" :value="hour" /></el-select>
                <span>至</span>
                <el-date-picker v-model="batchTime.toDate" type="date" value-format="YYYY-MM-DD" />
                <el-select v-model="batchTime.toHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="`bt${hour}`" :label="`${hour}时`" :value="hour" /></el-select>
              </div>
            </el-form-item>
          </el-form>
          <el-table
            :data="batchLots"
            border
            size="small"
            max-height="520"
            :row-class-name="batchRowClass"
            @row-click="focusBatchLot"
          >
            <el-table-column label="选择" width="56">
              <template #default="{ row }">
                <el-checkbox
                  :model-value="Boolean(picked[lotKey(row)])"
                  @click.stop
                  @change="toggleLot(lotKey(row), Boolean($event))"
                />
              </template>
            </el-table-column>
            <el-table-column prop="stackText" label="原堆位" width="80" />
            <el-table-column label="报关单号" min-width="120"><template #default="{ row }">{{ lotText(row, 'customs') }}</template></el-table-column>
            <el-table-column label="生产批次" min-width="100"><template #default="{ row }">{{ lotText(row, 'prod') }}</template></el-table-column>
            <el-table-column prop="material" label="物料" width="80" />
            <el-table-column prop="consignor" label="委托方" width="90" />
            <el-table-column prop="dry" label="可移重量" width="84" />
            <el-table-column label="目标堆位" min-width="120">
              <template #default="{ row }">
                <button
                  v-if="picked[lotKey(row)]"
                  type="button"
                  class="target-btn"
                  @click.stop="focusBatchLot(row)"
                >{{ targetLabel(picked[lotKey(row)]) }}</button>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="移位方式" width="120">
              <template #default="{ row }">
                <el-select
                  v-if="picked[lotKey(row)]"
                  v-model="picked[lotKey(row)].scene"
                  size="small"
                  @click.stop
                >
                  <el-option label="整票移位" value="整票移位" />
                  <el-option label="拆票移位" value="拆票移位" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="移库重量" width="130">
              <template #default="{ row }">
                <el-input
                  v-if="picked[lotKey(row)]?.scene === '拆票移位'"
                  v-model="picked[lotKey(row)].weight"
                  type="number"
                  size="small"
                  :placeholder="Number(row.dry) > 0 ? `≤${row.dry}` : '吨'"
                  @click.stop
                >
                  <template #append>吨</template>
                </el-input>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div class="map-pane">
          <div class="map-label">
            目标堆位 <span>*</span>
            <em v-if="batchFocus">当前 {{ lotLabel(findBatchLot(batchFocus), batchFocus) }}</em>
          </div>
          <p v-if="!batchFocus || !picked[batchFocus]" class="map-empty">请先勾选并点选一票，再在平面图框选目标格子</p>
          <StackGridPicker
            v-else
            :key="batchFocus"
            v-model:stack-code="picked[batchFocus].toStack"
            v-model:area-id="picked[batchFocus].toAreaId"
            v-model:cells="picked[batchFocus].cells"
            :stacks="stacks"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="batch = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitBatch">校验并提交</el-button>
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
.stack-query { display: flex; gap: 8px; align-items: center; width: 100%; }
.lot-line { margin: 0; line-height: 1.5; }
.hours { display: flex; gap: 6px; align-items: center; flex-wrap: nowrap; }
.hours :deep(.el-date-editor) { width: 136px; }
.map-pane { min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid #ececec; border-radius: 8px; padding: 12px; }
.map-label { display: flex; align-items: baseline; gap: 10px; font-weight: 600; }
.map-label span { color: var(--el-color-danger); }
.map-label em { color: #6b5424; font-style: normal; font-weight: 500; font-size: 13px; }
.map-empty { margin: 24px 8px; color: #8a93a3; font-size: 13px; }
.map-pane :deep(.yard-plan),
.map-pane :deep(.pick) { flex: 1; min-height: 0; }
.batch-filters { margin-bottom: 4px; }
.batch-filters .hint { margin: 0; }
.target-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: #1f6feb;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.target-btn:hover { text-decoration: underline; }
.muted { color: #9aa3b2; }
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
