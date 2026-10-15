<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { inventoryApi } from '@/api'

const kinds = [
  { name: '全部', hint: '库容、库龄、码头超期、备案用量' },
  { name: '库容', hint: '仓库占用达到预警线' },
  { name: '库龄', hint: '原料在库超过期限' },
  { name: '码头超期', hint: '码头暂存超过天数' },
  { name: '备案用量', hint: '矿源备案用量达到预警线' },
]

const router = useRouter()
const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const kindQuery = ref('')
const selected = ref('全部')
const filters = reactive({
  level: '',
  keyword: '',
  from: '',
  to: '',
})

const current = computed(() => kinds.find((item) => item.name === selected.value) || kinds[0])
const visibleKinds = computed(() => {
  const keyword = kindQuery.value.trim().toLowerCase()
  if (!keyword) return kinds
  return kinds.filter((item) => `${item.name} ${item.hint}`.toLowerCase().includes(keyword))
})

function query() {
  const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value }
  if (selected.value !== '全部') params.type = selected.value
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value
  }
  return params
}

async function load() {
  loading.value = true
  const res = await inventoryApi.alerts(query())
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '加载失败')
    rows.value = []
    total.value = 0
    return
  }
  rows.value = res.data.list
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

function open(row: Record<string, unknown>) {
  router.push(String(row.link || '/inventory'))
}

onMounted(load)
</script>

<template>
  <div class="alert-page">
    <aside class="nav">
      <el-input v-model="kindQuery" class="find" clearable placeholder="查找类型" />
      <div class="nav-list">
        <button
          v-for="item in visibleKinds"
          :key="item.name"
          type="button"
          class="nav-item"
          :class="{ on: item.name === selected }"
          @click="pick(item.name)"
        >
          <span class="nav-name">{{ item.name === '全部' ? '全部预警' : item.name }}</span>
          <span class="nav-code">{{ item.hint }}</span>
        </button>
        <p v-if="!visibleKinds.length" class="nav-empty">没有匹配的类型</p>
      </div>
    </aside>

    <section class="body">
      <header class="head">
        <div>
          <h2>{{ current.name === '全部' ? '全部预警' : current.name }}</h2>
          <p>{{ current.hint }}</p>
        </div>
      </header>

      <div class="card">
        <div class="card-head">
          <h3>预警记录</h3>
          <div class="card-tools">
            <el-select v-model="filters.level" clearable placeholder="级别" style="width: 100px" @change="search">
              <el-option label="高" value="高" />
              <el-option label="中" value="中" />
            </el-select>
            <el-input v-model="filters.keyword" clearable placeholder="仓库、批次或备案号" style="width: 180px" @change="search" @clear="search" @keyup.enter="search" />
            <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 140px" @change="search" />
            <span class="to">至</span>
            <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 140px" @change="search" />
          </div>
        </div>
        <el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无预警">
          <el-table-column prop="time" label="时间" min-width="140" />
          <el-table-column label="级别" width="80">
            <template #default="{ row }">
              <el-tag :type="row.level === '高' ? 'danger' : 'warning'" effect="light">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="target" label="对象" min-width="160" show-overflow-tooltip />
          <el-table-column prop="detail" label="说明" min-width="280" show-overflow-tooltip />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="open(row)">查看</el-button>
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
  </div>
</template>

<style scoped>
.alert-page {
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
  .alert-page { flex-direction: column; height: auto; min-height: calc(100vh - 56px); overflow: visible; }
  .nav { width: auto; max-height: 320px; }
}
</style>
