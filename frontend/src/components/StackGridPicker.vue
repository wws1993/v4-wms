<script setup lang="ts">
import YardPlanMap, { type StackPick } from '@/components/YardPlanMap.vue'

defineProps<{
  stacks: Record<string, unknown>[]
  /** 只允许选这个片区的堆位，例如待检区。 */
  areaLabel?: string
  /** 多堆位累加选择。 */
  multi?: boolean
  /** 只读展示已选堆位。 */
  readonly?: boolean
}>()

const stackCode = defineModel<string>('stackCode', { default: '' })
const areaId = defineModel<string>('areaId', { default: '' })
const cells = defineModel<string>('cells', { default: '' })
const picks = defineModel<StackPick[]>('picks', { default: () => [] })
</script>

<template>
  <YardPlanMap
    mode="select"
    :stacks="stacks"
    :area-label="areaLabel"
    :multi="multi"
    :readonly="readonly"
    v-model:stack-code="stackCode"
    v-model:area-id="areaId"
    v-model:cells="cells"
    v-model:picks="picks"
  />
</template>
