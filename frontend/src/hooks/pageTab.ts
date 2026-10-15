import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** 把页面内标签写进地址栏，刷新后仍停在当前标签。 */
export function usePageTab(fallback: string, allowed: readonly string[]) {
  const route = useRoute()
  const router = useRouter()
  function read(value: unknown) {
    const name = String(value || '')
    return allowed.includes(name) ? name : fallback
  }
  const tab = ref(read(route.query.tab))
  watch(tab, (value) => {
    if (route.query.tab === value) return
    router.replace({ query: { ...route.query, tab: value } })
  })
  watch(() => route.query.tab, (value) => {
    const next = read(value)
    if (tab.value !== next) tab.value = next
  })
  return tab
}
