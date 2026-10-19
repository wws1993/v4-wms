<script setup lang="ts">
import { useRoute } from 'vue-router'
import DataPage from '@/components/DataPage.vue'

const name = String(useRoute().meta.schema || '')
</script>

<template>
  <DataPage :name="name" />
</template>
