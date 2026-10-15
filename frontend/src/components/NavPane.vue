<script setup lang="ts" generic="T extends string">
import { computed, ref, watch } from 'vue'

export interface NavPaneItem<K extends string = string> {
  key: K
  label: string
  hint?: string
}

const props = withDefaults(defineProps<{
  modelValue: T
  items: NavPaneItem<T>[]
  searchable?: boolean
  searchPlaceholder?: string
}>(), {
  searchable: false,
  searchPlaceholder: '查找',
})

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

const query = ref('')
const motion = ref<'pane-next' | 'pane-prev'>('pane-next')

const visibleItems = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.items
  return props.items.filter((item) => `${item.label} ${item.hint || ''}`.toLowerCase().includes(keyword))
})

watch(() => props.modelValue, (value, previous) => {
  const next = props.items.findIndex((item) => item.key === value)
  const prev = props.items.findIndex((item) => item.key === previous)
  motion.value = next >= prev ? 'pane-next' : 'pane-prev'
})

function pick(key: T) {
  if (key !== props.modelValue) emit('update:modelValue', key)
}
</script>

<template>
  <div class="nav-pane">
    <nav class="nav">
      <el-input v-if="searchable" v-model="query" class="find" clearable :placeholder="searchPlaceholder" />
      <button
        v-for="item in visibleItems"
        :key="item.key"
        type="button"
        class="item"
        :class="{ on: item.key === modelValue, stacked: !!item.hint }"
        @click="pick(item.key)"
      >
        <span>{{ item.label }}</span>
        <small v-if="item.hint">{{ item.hint }}</small>
      </button>
      <p v-if="!visibleItems.length" class="empty">没有匹配项</p>
    </nav>
    <div class="body">
      <Transition :name="motion" mode="out-in">
        <div :key="modelValue" class="pane">
          <slot />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.nav-pane {
  display: flex;
  height: 100%;
  min-height: 0;
  border: 1px solid #e6ebf2;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.nav {
  width: 216px;
  flex: none;
  min-height: 0;
  overflow: auto;
  background: var(--el-color-primary-light-9);
  padding: 12px 8px;
  border-right: 1px solid var(--el-color-primary-light-7);
}
.find { display: block; width: 100%; margin: 0 0 10px; }
.item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 6px;
  padding: 10px 14px;
  color: #1a2332;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}
.item.stacked { display: flex; flex-direction: column; align-items: flex-start; }
.item small { margin-top: 2px; color: #616161; font-size: 12px; font-weight: 400; }
.item:hover { background: var(--el-color-primary-light-8); }
.item.on {
  background: #fff;
  color: var(--el-color-primary-dark-2);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}
.item.on small { color: var(--el-color-primary); }
.empty { margin: 12px; color: #616161; font-size: 13px; }
.body { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 20px 28px 28px; }
.body :deep(h2) { margin: 0 0 18px; font-size: 20px; font-weight: 600; }
.pane-next-enter-active,
.pane-next-leave-active,
.pane-prev-enter-active,
.pane-prev-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.pane-next-enter-from,
.pane-prev-leave-to { opacity: 0; transform: translateX(16px); }
.pane-next-leave-to,
.pane-prev-enter-from { opacity: 0; transform: translateX(-16px); }
@media (prefers-reduced-motion: reduce) {
  .item,
  .pane-next-enter-active,
  .pane-next-leave-active,
  .pane-prev-enter-active,
  .pane-prev-leave-active { transition: none; }
}
</style>
