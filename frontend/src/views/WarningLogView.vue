<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { warningApi } from '@/api'
import { dash } from './ops/samples'

const types = ['库容', '库龄', '码头超期', '备案用量']
const levels = ['低', '中', '高']
const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ type: '', level: '', keyword: '', from: '', to: '' })

function query() {
  return {
    page: page.value,
    pageSize: pageSize.value,
    type: filters.type || undefined,
    level: filters.level || undefined,
    keyword: filters.keyword.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }
}

async function load() {
  loading.value = true
  const res = await warningApi.list(query())
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

function reset() {
  Object.assign(filters, { type: '', level: '', keyword: '', from: '', to: '' })
  search()
}

onMounted(load)
</script>

<template>
  <div>
    <el-form :inline="true" @submit.prevent="search">
      <el-form-item label="类型">
        <el-select v-model="filters.type" clearable style="width: 130px">
          <el-option v-for="item in types" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="级别">
        <el-select v-model="filters.level" clearable style="width: 100px">
          <el-option v-for="item in levels" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键字">
        <el-input v-model="filters.keyword" clearable placeholder="仓库、批次或备案号" style="width: 200px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </el-form-item>
    </el-form>
    <el-table v-loading="loading" :data="rows" border stripe empty-text="暂无预警日志">
      <el-table-column prop="time" label="时间" width="120" />
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column prop="level" label="级别" width="80" />
      <el-table-column prop="target" label="对象" min-width="180" />
      <el-table-column prop="detail" label="说明" min-width="280" show-overflow-tooltip />
      <el-table-column label="状态" width="90"><template #default="{ row }">{{ dash(row.status) }}</template></el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </div>
  </div>
</template>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
