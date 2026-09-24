<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { inventoryApi, partnerApi, transferApi, warehouseApi } from '@/api'

const filters = reactive({ consignor: '', from: '', to: '' })
const consignors = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const stacks = ref<Record<string, unknown>[]>([])
const lots = ref<Record<string, unknown>[]>([])

const single = ref(false)
const batch = ref(false)
const form = reactive({ warehouse: '', stackCode: '', batchNo: '', toStack: '', timeFrom: '', timeTo: '' })
const picked = ref<string[]>([])
const batchQuery = reactive({ warehouse: '', consignor: '', keyword: '' })

const selectedLot = computed(() => lots.value.find((row) => row.batchNo === form.batchNo))
const stackOptions = computed(() => stacks.value.filter((row) => !form.warehouse || row.warehouse === form.warehouse))
const batchLots = computed(() => lots.value.filter((row) => {
  if (batchQuery.warehouse && row.warehouse !== batchQuery.warehouse) return false
  if (batchQuery.consignor && row.consignor !== batchQuery.consignor) return false
  if (batchQuery.keyword && !String(row.batchNo).includes(batchQuery.keyword) && !String(row.stackText).includes(batchQuery.keyword)) return false
  return row.status === '在库'
}))

async function load() {
  loading.value = true
  const res = await transferApi.list({ ...filters, page: page.value, pageSize: 10 })
  loading.value = false
  if (!res.success || !res.data) return
  rows.value = res.data.list
  total.value = res.data.total
}

onMounted(async () => {
  const [who, stackRes, lotRes] = await Promise.all([
    partnerApi.consignors(),
    warehouseApi.stacks({ page: 1, pageSize: 100 }),
    inventoryApi.list({ page: 1, pageSize: 100, status: '在库' }),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  if (lotRes.success && lotRes.data) lots.value = lotRes.data.list
  load()
})

function openSingle() {
  Object.assign(form, { warehouse: '', stackCode: '', batchNo: '', toStack: '', timeFrom: '', timeTo: '' })
  single.value = true
}

async function submitSingle() {
  if (!form.batchNo || !form.toStack) {
    ElMessage.warning('请选择批次和目标堆位')
    return
  }
  const res = await transferApi.create({ ...form })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  single.value = false
  load()
}

async function submitBatch() {
  const res = await transferApi.batch({ batchNos: picked.value, toStack: form.toStack, timeFrom: form.timeFrom, timeTo: form.timeTo })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  batch.value = false
  picked.value = []
  load()
}

const lotChoices = computed(() => lots.value.filter((row) => row.stackText === form.stackCode && row.status === '在库'))
</script>

<template>
  <div>
    <el-form :inline="true">
      <el-form-item label="委托方">
        <el-select v-model="filters.consignor" clearable style="width: 160px">
          <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <div class="toolbar">
      <el-button type="primary" @click="openSingle">新建移库</el-button>
      <el-button @click="batch = true">批量移库</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="timeFrom" label="开始时间" min-width="150" />
      <el-table-column prop="timeTo" label="结束时间" min-width="150" />
      <el-table-column prop="consignor" label="委托方" width="110" />
      <el-table-column prop="customsNo" label="报关单号" min-width="160" />
      <el-table-column prop="prodBatch" label="生产批次" min-width="130" />
      <el-table-column prop="material" label="物料" width="100" />
      <el-table-column prop="shipName" label="船名" width="100" />
      <el-table-column prop="containerCount" label="柜数" width="80" />
      <el-table-column prop="fromStack" label="原堆位" width="110" />
      <el-table-column prop="toStack" label="目标堆位" width="110" />
    </el-table>
    <div class="pager">
      <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" />
    </div>

    <el-dialog v-model="single" title="新建移库" width="760px">
      <el-form label-width="100px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="原仓库">
              <el-select v-model="form.warehouse" style="width: 100%" @change="form.stackCode = ''; form.batchNo = ''">
                <el-option v-for="item in stacks.map((row) => row.warehouse).filter((v, i, arr) => arr.indexOf(v) === i)" :key="String(item)" :label="String(item)" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="原堆位">
              <el-select v-model="form.stackCode" style="width: 100%" @change="form.batchNo = ''">
                <el-option v-for="item in stackOptions" :key="String(item.id)" :label="String(item.code)" :value="item.code" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <el-table :data="lotChoices" border size="small" @row-click="(row: Record<string, unknown>) => form.batchNo = String(row.batchNo)">
        <el-table-column width="50">
          <template #default="{ row }"><el-radio :model-value="form.batchNo" :value="row.batchNo" /></template>
        </el-table-column>
        <el-table-column prop="batchNo" label="批次" min-width="160" />
        <el-table-column prop="consignor" label="委托方" />
        <el-table-column prop="cargoType" label="货物类型" />
        <el-table-column prop="wet" label="湿吨" width="80" />
      </el-table>
      <el-descriptions v-if="selectedLot" :column="3" border class="brief">
        <el-descriptions-item label="委托方">{{ selectedLot.consignor }}</el-descriptions-item>
        <el-descriptions-item label="报关单号">{{ selectedLot.batchKind === '报关单号' ? selectedLot.batchNo : '—' }}</el-descriptions-item>
        <el-descriptions-item label="生产批次">{{ selectedLot.batchKind === '生产批次号' ? selectedLot.batchNo : '—' }}</el-descriptions-item>
        <el-descriptions-item label="物料">{{ selectedLot.material }}</el-descriptions-item>
        <el-descriptions-item label="船名">—</el-descriptions-item>
        <el-descriptions-item label="柜数">—</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="100px" class="target">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="目标堆位"><el-select v-model="form.toStack" style="width: 100%"><el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="开始"><el-date-picker v-model="form.timeFrom" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="结束"><el-date-picker v-model="form.timeTo" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="single = false">取消</el-button>
        <el-button type="primary" @click="submitSingle">生成移库单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batch" title="批量移库" width="860px">
      <el-form :inline="true">
        <el-form-item label="仓库"><el-select v-model="batchQuery.warehouse" clearable style="width: 140px"><el-option v-for="name in ['1仓','2仓','4仓','5仓','6仓','码头仓库']" :key="name" :label="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="委托方"><el-select v-model="batchQuery.consignor" clearable style="width: 140px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
        <el-form-item label="关键字"><el-input v-model="batchQuery.keyword" clearable /></el-form-item>
      </el-form>
      <el-table :data="batchLots" border @selection-change="(list: Record<string, unknown>[]) => picked = list.map((row) => String(row.batchNo))">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="warehouse" label="仓库" width="110" />
        <el-table-column prop="stackText" label="原堆位" width="110" />
        <el-table-column prop="consignor" label="委托方" width="110" />
        <el-table-column prop="batchNo" label="批次" min-width="160" />
        <el-table-column prop="cargoType" label="货物类型" width="100" />
        <el-table-column prop="wet" label="湿吨" width="80" />
      </el-table>
      <el-form :inline="true" class="target">
        <el-form-item label="目标堆位"><el-select v-model="form.toStack" style="width: 160px"><el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="item.code" /></el-select></el-form-item>
        <el-form-item label="开始"><el-date-picker v-model="form.timeFrom" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
        <el-form-item label="结束"><el-date-picker v-model="form.timeTo" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batch = false">取消</el-button>
        <el-button type="primary" @click="submitBatch">按票生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; display: flex; gap: 8px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.brief, .target { margin-top: 12px; }
</style>
