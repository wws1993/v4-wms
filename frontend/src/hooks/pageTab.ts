import { onActivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** 把页面内标签写进地址栏，刷新后仍停在当前标签。缓存页面离开后不再改地址。 */
export function usePageTab(fallback: string, allowed: readonly string[]) {
  const route = useRoute()
  const router = useRouter()
  const owner = String(route.name || '')

  function read(value: unknown) {
    const name = String(value || '')
    return allowed.includes(name) ? name : fallback
  }

  function here() {
    return String(route.name || '') === owner
  }

  const tab = ref(read(route.query.tab))

  watch(tab, (value) => {
    if (!here() || route.query.tab === value) return
    router.replace({ query: { ...route.query, tab: value } })
  })

  watch(() => route.query.tab, (value) => {
    if (!here()) return
    const name = String(value || '')
    if (!allowed.includes(name) || tab.value === name) return
    tab.value = name
  })

  onActivated(() => {
    const name = String(route.query.tab || '')
    if (allowed.includes(name)) {
      if (tab.value !== name) tab.value = name
      return
    }
    if (route.query.tab !== tab.value) router.replace({ query: { ...route.query, tab: tab.value } })
  })

  return tab
}
