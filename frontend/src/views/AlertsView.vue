<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { inventoryApi } from '@/api'

const router = useRouter()
const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  const res = await inventoryApi.alerts({ page: 1, pageSize: 50 })
  loading.value = false
  if (res.success && res.data) rows.value = res.data.list
})

function open(row: Record<string, unknown>) {
  const link = String(row.link || '/inventory')
  router.push(link)
}
</script>

<template>
  <div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="level" label="级别" width="80" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column prop="target" label="对象" min-width="160" />
      <el-table-column prop="detail" label="说明" min-width="280" />
      <el-table-column prop="time" label="触发时间" width="140" />
      <el-table-column label="操作" width="90">
        <template #default="{ row }"><el-button link type="primary" @click="open(row)">查看</el-button></template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
</style>
