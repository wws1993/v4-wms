<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { warehouseApi } from '@/api'
import DataPage from '@/components/DataPage.vue'

const ready = ref(false)
const house = ref('')

onMounted(async () => {
  const res = await warehouseApi.stacks({ page: 1, pageSize: 1 })
  if (res.success && res.data?.list[0]) house.value = String(res.data.list[0].warehouse || '')
  ready.value = true
})
</script>

<template>
  <DataPage v-if="ready" name="stacks" :initial-filters="house ? { warehouse: house } : undefined" />
</template>
