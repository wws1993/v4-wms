<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { inventoryApi, partnerApi, transferApi, warehouseApi } from '@/api'
import { dash, HOURS } from './ops/samples'

const filters = reactive({ consignor: '', scene: '', from: '', to: '' })
const consignors = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const stacks = ref<Record<string, unknown>[]>([])
const lots = ref<Record<string, unknown>[]>([])
const single = ref(false)
const batch = ref(false)
const form = reactive({ stackCode: '', batchNo: '', scene: '整票移位', toStack: '', weight: '', fromDate: '', fromHour: '08', toDate: '', toHour: '12' })
const batchQuery = reactive({ warehouse: '', stack: '', consignor: '', keyword: '' })
const picked = ref<Record<string, { toStack: string; scene: string }>>({})

const houses = computed(() => [...new Set(stacks.value.map((row) => String(row.warehouse)))])
const selected = computed(() => lots.value.find((row) => row.batchNo === form.batchNo))
const lotChoices = computed(() => lots.value.filter((row) => row.stackText === form.stackCode && row.status === '在库'))
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

function lotText(row: Record<string, unknown> | undefined, key: 'customs' | 'prod') {
  if (!row) return '—'
  if (key === 'customs') return row.batchKind === '报关单号' ? String(row.batchNo) : '—'
  return row.batchKind === '生产批次号' ? String(row.batchNo) : '—'
}

async function load() {
  loading.value = true
  const res = await transferApi.list({ ...filters, page: page.value, pageSize: 10 })
  loading.value = false
  if (!res.success || !res.data) return
  rows.value = res.data.list
  total.value = res.data.total
}

async function reloadLots() {
  const lotRes = await inventoryApi.list({ page: 1, pageSize: 200, status: '在库' })
  if (lotRes.success && lotRes.data) lots.value = lotRes.data.list
}

onMounted(async () => {
  const [who, stackRes] = await Promise.all([
    partnerApi.consignors(),
    warehouseApi.stacks({ page: 1, pageSize: 200 }),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  await reloadLots()
  load()
})

function openSingle() {
  Object.assign(form, { stackCode: '', batchNo: '', scene: '整票移位', toStack: '', weight: '', fromDate: '', fromHour: '08', toDate: '', toHour: '12' })
  single.value = true
}

function onBatchChange() {
  form.weight = selected.value ? String(selected.value.dry || '') : ''
}

async function submitSingle() {
  if (!form.batchNo || !form.toStack || !form.weight || !form.fromDate || !form.toDate) {
    ElMessage.warning('请选择批次、目标堆位、重量和移库时间')
    return
  }
  const res = await transferApi.create({
    batchNo: form.batchNo,
    toStack: form.toStack,
    scene: form.scene,
    weight: Number(form.weight),
    shipName: '—',
    containerCount: 0,
    timeFrom: `${form.fromDate} ${form.fromHour}:00`,
    timeTo: `${form.toDate} ${form.toHour}:00`,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  single.value = false
  await reloadLots()
  load()
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
      <el-table-column prop="customsNo" label="报关单号" min-width="160" />
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

    <el-dialog v-model="single" title="新建移库单" width="820px" align-center>
      <p class="hint">请先选择原堆位，再选择该堆位上要移动的矿批次。批次信息由库存带出，不可修改。</p>
      <el-form label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="原堆位" required>
              <el-select v-model="form.stackCode" filterable @change="form.batchNo = ''">
                <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.code)" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="矿批次" required>
              <el-select v-model="form.batchNo" @change="onBatchChange">
                <el-option v-for="item in lotChoices" :key="String(item.batchNo)" :label="String(item.batchNo)" :value="String(item.batchNo)" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-table :data="selected ? [selected] : []" border empty-text="请先选择矿批次">
          <el-table-column prop="consignor" label="委托方" />
          <el-table-column label="报关单号"><template #default="{ row }">{{ lotText(row, 'customs') }}</template></el-table-column>
          <el-table-column label="生产批次"><template #default="{ row }">{{ lotText(row, 'prod') }}</template></el-table-column>
          <el-table-column prop="material" label="物料" />
          <el-table-column label="船名"><template #default>—</template></el-table-column>
          <el-table-column label="柜数"><template #default>—</template></el-table-column>
        </el-table>
        <el-row :gutter="12" class="gap">
          <el-col :span="8"><el-form-item label="场景" required><el-select v-model="form.scene"><el-option label="整票移位" value="整票移位" /><el-option label="拆票移位" value="拆票移位" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="目标堆位" required><el-select v-model="form.toStack" filterable><el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.code)" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="移库重量(吨)" required><el-input v-model="form.weight" type="number" /></el-form-item></el-col>
          <el-col :span="24">
            <el-form-item label="移库时间" required>
              <div class="hours">
                <el-date-picker v-model="form.fromDate" type="date" value-format="YYYY-MM-DD" />
                <el-select v-model="form.fromHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="hour" :label="`${hour}时`" :value="hour" /></el-select>
                <span>至</span>
                <el-date-picker v-model="form.toDate" type="date" value-format="YYYY-MM-DD" />
                <el-select v-model="form.toHour" style="width: 90px"><el-option v-for="hour in HOURS" :key="`t${hour}`" :label="`${hour}时`" :value="hour" /></el-select>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="single = false">取消</el-button>
        <el-button type="primary" @click="submitSingle">提交并更新库存</el-button>
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
.hint { margin-bottom: 12px; color: #5a6a7e; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.gap { margin-top: 12px; }
.hours { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
