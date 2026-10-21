<script setup lang="ts">
import YardPlanMap from '@/components/YardPlanMap.vue'

defineProps<{
  stacks: Record<string, unknown>[]
  /** 只允许选这个片区的堆位，例如待检区。 */
  areaLabel?: string
}>()

const stackCode = defineModel<string>('stackCode', { default: '' })
const areaId = defineModel<string>('areaId', { default: '' })
const cells = defineModel<string>('cells', { default: '' })
</script>

<template>
  <YardPlanMap
    mode="select"
    :stacks="stacks"
    :area-label="areaLabel"
    v-model:stack-code="stackCode"
    v-model:area-id="areaId"
    v-model:cells="cells"
  />
</template>
