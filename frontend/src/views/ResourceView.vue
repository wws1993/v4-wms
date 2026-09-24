<script setup lang="ts">
import { useRoute } from 'vue-router'
import DataPage from '@/components/DataPage.vue'

const route = useRoute()
</script>

<template>
  <DataPage :name="String(route.meta.schema)" />
</template>
