<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { customsApi } from '@/api'
import { downloadText } from '@/api/result'
import { dash } from './ops/samples'

const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const open = ref(false)
const details = ref<Record<string, unknown>[]>([])
const current = ref<Record<string, unknown> | null>(null)

const stats = computed(() => {
  const diffRows = rows.value.filter((row) => Number(row.diff) !== 0)
  const pending = diffRows.reduce((sum, row) => sum + Math.abs(Number(row.diff) || 0), 0)
  return {
    total: rows.value.length,
    ok: rows.value.length - diffRows.length,
    diff: diffRows.length,
    pending,
  }
})

async function load() {
  loading.value = true
  const res = await customsApi.list({ page: 1, pageSize: 50 })
  loading.value = false
  if (res.success && res.data) rows.value = res.data.list
}

onMounted(load)

async function reconcile() {
  ElMessage.success('正在对账…')
  await load()
  ElMessage.success('对账完成')
}

function exportDiff() {
  const lines = ['账册编号,物料,账册库存,实物库存,差异,结果', ...rows.value.map((row) => [row.book, row.item, row.bookWet, row.stockWet, row.diff, row.status].join(','))]
  downloadText('账实差异报表.csv', lines.join('\n'))
  ElMessage.success('差异报表已导出')
}

async function show(row: Record<string, unknown>) {
  current.value = row
  const res = await customsApi.details(String(row.id))
  details.value = res.success && res.data ? res.data : []
  open.value = true
}

async function writeOff() {
  const res = await customsApi.writeOff()
  if (res.success) ElMessage.success(res.message)
  else ElMessage.warning(res.message)
}
</script>

<template>
  <div>
    <div class="stats">
      <div><span>账册物料项</span><strong>{{ stats.total }}</strong></div>
      <div><span>账实一致</span><strong>{{ stats.ok }}</strong></div>
      <div><span>差异项</span><strong>{{ stats.diff }}</strong></div>
      <div><span>待处理差异</span><strong>{{ stats.pending }}</strong></div>
    </div>
    <div class="toolbar">
      <el-button type="primary" @click="reconcile">执行对账</el-button>
      <el-button @click="exportDiff">导出差异报表</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="book" label="账册编号" min-width="140" />
      <el-table-column prop="item" label="物料" width="120" />
      <el-table-column prop="bookWet" label="账册库存" width="110" />
      <el-table-column prop="stockWet" label="实物库存" width="110" />
      <el-table-column prop="diff" label="差异" width="90" />
      <el-table-column prop="status" label="结果" width="100" />
      <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="show(row)">查明细</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="open" title="账实差异穿透明细" width="860px" align-center>
      <p class="hint">从汇总差异穿透至核注清单、报关单号与生产批次。当前账册 {{ current?.book }} / {{ current?.item }}。</p>
      <el-table :data="details" border empty-text="暂无穿透明细">
        <el-table-column prop="checklistNo" label="核注清单" />
        <el-table-column label="报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNo) }}</template></el-table-column>
        <el-table-column label="生产批次"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
        <el-table-column prop="bookWet" label="账册数量" />
        <el-table-column prop="stockWet" label="实物数量" />
        <el-table-column prop="diff" label="差异" />
      </el-table>
      <template #footer>
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" @click="writeOff">提交核销复核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
.stats div { background: #fff; border: 1px solid #e3eaf3; padding: 12px 16px; }
.stats span { display: block; color: #5a6a7e; font-size: 13px; }
.stats strong { font-size: 22px; color: var(--el-color-primary); }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.hint { color: #5a6a7e; }
</style>
