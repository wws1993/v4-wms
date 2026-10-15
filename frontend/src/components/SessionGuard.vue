<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'
import { writeToken } from '@/api/ruoyi'
import { useAuthStore } from '@/stores/auth'
import { clearSessionClock, SESSION_WARN_MS, sessionRemainMs, touchSession } from '@/security/session'

const router = useRouter()
const auth = useAuthStore()
const open = ref(false)
const seconds = ref(60)
let timer = 0
let leaving = false

function onActivity() {
  if (open.value || leaving || sessionRemainMs() <= SESSION_WARN_MS) return
  touchSession()
}

async function leave() {
  if (leaving) return
  leaving = true
  open.value = false
  clearSessionClock()
  auth.logout()
  writeToken('')
  authApi.logout().catch(() => undefined)
  await router.replace({ path: '/login', query: { reason: 'timeout' } })
}

function stay() {
  touchSession()
  open.value = false
}

function tick() {
  if (leaving) return
  const remain = sessionRemainMs()
  if (remain <= 0) {
    leave()
    return
  }
  if (remain <= SESSION_WARN_MS) {
    seconds.value = Math.max(1, Math.ceil(remain / 1000))
    open.value = true
    return
  }
  open.value = false
}

onMounted(() => {
  if (!sessionStorage.getItem('wms_session_at')) touchSession()
  tick()
  window.addEventListener('pointerdown', onActivity, true)
  window.addEventListener('keydown', onActivity, true)
  window.addEventListener('scroll', onActivity, true)
  timer = window.setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onActivity, true)
  window.removeEventListener('keydown', onActivity, true)
  window.removeEventListener('scroll', onActivity, true)
  window.clearInterval(timer)
})
</script>

<template>
  <el-dialog
    v-model="open"
    title="会话即将超时"
    width="420px"
    align-center
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <p class="text">长时间未操作，会话将在 {{ seconds }} 秒后退出。</p>
    <template #footer>
      <el-button @click="leave">立即退出</el-button>
      <el-button type="primary" @click="stay">继续使用</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.text { margin: 0; color: #1a2332; line-height: 1.6; }
</style>
