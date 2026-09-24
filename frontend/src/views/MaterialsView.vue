<script setup lang="ts">
import { ref } from 'vue'
import DataPage from '@/components/DataPage.vue'

const tab = ref('materials')
</script>

<template>
  <el-tabs v-model="tab">
    <el-tab-pane label="物料档案" name="materials">
      <DataPage v-if="tab === 'materials'" name="materials" />
    </el-tab-pane>
    <el-tab-pane label="矿源备案" name="filings">
      <DataPage v-if="tab === 'filings'" name="filings" />
    </el-tab-pane>
  </el-tabs>
</template>
