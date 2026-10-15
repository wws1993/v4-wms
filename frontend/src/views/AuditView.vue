<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { auditApi } from '@/api'
import { presentAudit } from '@/audit/present'

const kinds = [
  { name: '全部', hint: '入库、出库、移库、生产、堆位、关务、基础数据、权限' },
  { name: '生产', hint: '投料、加工和完工' },
  { name: '移库', hint: '库内移库' },
  { name: '堆位', hint: '片区标识和堆位档案' },
  { name: '入库', hint: '入库预约和到货收货' },
  { name: '出库', hint: '出库审核和完成' },
  { name: '关务', hint: '保税和海关相关操作' },
  { name: '基础数据', hint: '仓库、物料、往来主体等档案' },
  { name: '权限', hint: '账号和权限变更' },
]

const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const kindQuery = ref('')
const selected = ref('全部')
const filters = reactive({
  operator: '',
  bizNo: '',
  customsNo: '',
  prodBatch: '',
  customsOnly: '否',
  from: '',
  to: '',
})
const detailOpen = ref(false)
const current = ref<Record<string, unknown> | null>(null)

const currentKind = computed(() => kinds.find((item) => item.name === selected.value) || kinds[0])
const visibleKinds = computed(() => {
  const keyword = kindQuery.value.trim().toLowerCase()
  if (!keyword) return kinds
  return kinds.filter((item) => `${item.name} ${item.hint}`.toLowerCase().includes(keyword))
})

function query() {
  const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value }
  if (selected.value !== '全部') params.module = selected.value
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue
    if (key === 'customsOnly' && value !== '是') continue
    params[key] = value
  }
  return params
}

async function load() {
  loading.value = true
  const res = await auditApi.list(query())
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '加载失败')
    rows.value = []
    total.value = 0
    return
  }
  rows.value = res.data.list.map((row) => presentAudit(row))
  total.value = res.data.total
}

function search() {
  page.value = 1
  load()
}

function pick(name: string) {
  if (name === selected.value) return
  selected.value = name
  search()
}

function openDetail(row: Record<string, unknown>) {
  current.value = row
  detailOpen.value = true
}

onMounted(load)
</script>

<template>
  <div class="audit-page">
    <aside class="nav">
      <el-input v-model="kindQuery" class="find" clearable placeholder="查找模块" />
      <div class="nav-list">
        <button
          v-for="item in visibleKinds"
          :key="item.name"
          type="button"
          class="nav-item"
          :class="{ on: item.name === selected }"
          @click="pick(item.name)"
        >
          <span class="nav-name">{{ item.name === '全部' ? '全部操作' : item.name }}</span>
          <span class="nav-code">{{ item.hint }}</span>
        </button>
        <p v-if="!visibleKinds.length" class="nav-empty">没有匹配的模块</p>
      </div>
    </aside>

    <section class="body">
      <header class="head">
        <div>
          <h2>{{ currentKind.name === '全部' ? '全部操作' : currentKind.name }}</h2>
          <p>{{ currentKind.hint }}</p>
        </div>
      </header>

      <div class="card">
        <div class="card-head">
          <h3>操作记录</h3>
          <div class="card-tools">
            <el-input v-model="filters.operator" clearable placeholder="操作人" style="width: 120px" @change="search" @clear="search" @keyup.enter="search" />
            <el-input v-model="filters.bizNo" clearable placeholder="业务单号" style="width: 140px" @change="search" @clear="search" @keyup.enter="search" />
            <el-input v-model="filters.customsNo" clearable placeholder="报关单号" style="width: 150px" @change="search" @clear="search" @keyup.enter="search" />
            <el-input v-model="filters.prodBatch" clearable placeholder="生产批次" style="width: 140px" @change="search" @clear="search" @keyup.enter="search" />
            <el-select v-model="filters.customsOnly" style="width: 110px" @change="search">
              <el-option label="全部账号" value="否" />
              <el-option label="仅关务" value="是" />
            </el-select>
            <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 140px" @change="search" />
            <span class="to">至</span>
            <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 140px" @change="search" />
          </div>
        </div>
        <el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无操作记录">
          <el-table-column prop="time" label="时间" min-width="150" />
          <el-table-column prop="operator" label="操作人" width="110" />
          <el-table-column prop="module" label="模块" width="100" />
          <el-table-column prop="action" label="业务类型" width="130" show-overflow-tooltip />
          <el-table-column prop="bizNo" label="业务单号" min-width="150" show-overflow-tooltip />
          <el-table-column prop="content" label="操作内容" min-width="220" show-overflow-tooltip />
          <el-table-column prop="detail" label="留痕详情" min-width="220" show-overflow-tooltip />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, prev, pager, next"
            background
            @current-change="load"
            @size-change="search"
          />
        </div>
      </div>
    </section>

    <el-dialog v-model="detailOpen" title="操作审计详情" width="920px" align-center destroy-on-close>
      <el-form v-if="current" label-width="148px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="操作人 / 账号类型"><el-input :model-value="`${current.operator} / ${current.accountType}`" readonly /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="操作时间 / 来源地址"><el-input :model-value="`${current.time} / ${current.ip}`" readonly /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="模块 / 关联单号"><el-input :model-value="`${current.module} / ${current.bizNo}`" readonly /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="操作结果"><el-input :model-value="String(current.result)" readonly /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="修改前"><el-input :model-value="String(current.before)" type="textarea" :rows="3" readonly /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="修改后"><el-input :model-value="String(current.after)" type="textarea" :rows="3" readonly /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="detailOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.audit-page {
  display: flex;
  align-items: stretch;
  height: calc(100vh - 56px);
  min-height: 0;
  overflow: hidden;
  margin: -16px -20px -20px;
  background: #f3f3f3;
}
.nav {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 10px 12px;
  background: var(--el-color-primary-light-9);
}
.find { margin: 0 6px 8px; }
.nav-list { flex: 1; min-height: 0; overflow: auto; padding: 0 2px; }
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  margin: 1px 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #1a1a1a;
  cursor: pointer;
  text-align: left;
}
.nav-item:hover { background: var(--el-color-primary-light-8); }
.nav-item.on {
  background: #fff;
  color: var(--el-color-primary-dark-2);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}
.nav-name { font-size: 14px; line-height: 20px; }
.nav-code { margin-top: 1px; font-size: 12px; font-weight: 400; color: #616161; }
.nav-item.on .nav-code { color: var(--el-color-primary); }
.nav-empty { margin: 12px; color: #616161; font-size: 13px; }
.body { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 28px 36px 32px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.head h2 { margin: 0; font-size: 28px; font-weight: 600; line-height: 1.25; color: #1a1a1a; }
.head p { margin: 6px 0 0; font-size: 14px; color: #5d5d5d; }
.card {
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 8px 16px 12px;
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; flex-wrap: wrap; }
.card-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.card-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.to { color: #5d5d5d; font-size: 13px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
@media (max-width: 1100px) {
  .audit-page { flex-direction: column; height: auto; min-height: calc(100vh - 56px); overflow: visible; }
  .nav { width: auto; max-height: 320px; }
}
</style>
