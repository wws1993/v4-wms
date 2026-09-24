import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthUser } from '@/types'

const KEY = 'wms_auth'

export const useAuthStore = defineStore('auth', () => {
  const raw = sessionStorage.getItem(KEY)
  const user = ref<AuthUser | null>(raw ? JSON.parse(raw) as AuthUser : null)

  function setUser(value: AuthUser | null) {
    user.value = value
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value))
    else sessionStorage.removeItem(KEY)
  }

  function setPages(pages: string[]) {
    if (!user.value) return
    setUser({ ...user.value, pages })
  }

  function logout() {
    setUser(null)
  }

  return { user, setUser, setPages, logout }
})
