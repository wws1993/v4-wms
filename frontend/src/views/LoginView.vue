<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authApi } from '@/api'
import { useLiveAuth } from '@/api/http'
import { lockHintText, noteLoginFailure, noteLoginSuccess } from '@/security/lockout'
import { touchSession } from '@/security/session'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loading = ref(false)
const clock = ref(Date.now())
const live = useLiveAuth()
let clockTimer = 0
const form = reactive({ username: 'admin', password: 'admin123', code: '', uuid: '' })
const captchaImg = ref('')
const role = ref('admin')

const demos = [
  { role: 'admin', username: 'admin', password: 'admin123', label: '系统管理员' },
  { role: 'warehouse', username: 'warehouse', password: 'wh123', label: '仓管员' },
  { role: 'customs', username: 'customs', password: 'cus123', label: '关务员' },
]

function onRole(value: string) {
  const item = demos.find((demo) => demo.role === value)
  if (!item) return
  form.username = item.username
  form.password = item.password
}

async function loadCaptcha() {
  if (!live) return
  const res = await authApi.captcha()
  if (!res.success || !res.data) return
  captchaImg.value = res.data.enabled ? res.data.img : ''
  form.uuid = res.data.uuid
  form.code = ''
}

const lockHint = computed(() => lockHintText(form.username, clock.value))

function showReason() {
  const reason = String(route.query.reason || '')
  if (reason === 'timeout') ElMessage.warning('长时间未操作，会话已超时，请重新登录')
  else if (reason === 'expired') ElMessage.warning('登录已失效，请重新登录')
  else return
  router.replace({ path: '/login' })
}

async function submit() {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请填写账号和密码')
    return
  }
  if (lockHint.value) {
    ElMessage.error(lockHint.value)
    return
  }
  loading.value = true
  const res = await authApi.login(form)
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(noteLoginFailure(form.username, res.message))
    clock.value = Date.now()
    if (live) loadCaptcha()
    return
  }
  noteLoginSuccess(form.username)
  touchSession()
  auth.setUser(res.data)
  router.push('/dashboard')
}

onMounted(() => {
  loadCaptcha()
  showReason()
  clockTimer = window.setInterval(() => {
    clock.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => window.clearInterval(clockTimer))

</script>

<template>
  <div class="login">
    <div class="card">
      <h1>欢迎使用WWS系统</h1>
      <p>保税仓储管理系统</p>
      <el-form @submit.prevent="submit">
        <el-form-item v-if="!live">
          <el-select v-model="role" size="large" placeholder="账号类型" @change="onRole">
            <el-option v-for="item in demos" :key="item.role" :label="item.label" :value="item.role" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.username" placeholder="账号" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" placeholder="密码" size="large" type="password" show-password />
        </el-form-item>
        <el-form-item v-if="captchaImg">
          <div class="captcha">
            <el-input v-model="form.code" placeholder="验证码" size="large" />
            <img :src="captchaImg" alt="验证码" @click="loadCaptcha" />
          </div>
        </el-form-item>
        <p v-if="lockHint" class="lock">{{ lockHint }}</p>
        <button class="submit" type="submit" :disabled="loading || Boolean(lockHint)">{{ loading ? '登录中…' : lockHint ? '已锁定' : '登录' }}</button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  background: #101217 url('/bg.png') center / cover no-repeat;
}
.card {
  width: 420px;
  padding: 48px 42px 40px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 2px;
  box-shadow: 0 18px 48px rgba(16, 18, 23, 0.22);
  backdrop-filter: blur(6px);
}
h1 {
  margin: 0;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: #1a2332;
  letter-spacing: 0.5px;
}
p {
  margin: 8px 0 28px;
  text-align: center;
  color: #5a6a7e;
  font-size: 14px;
}
.card :deep(.el-form-item) { margin-bottom: 16px; }
.card :deep(.el-input__wrapper),
.card :deep(.el-select__wrapper) {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 18, 23, 0.06);
}
.card :deep(.el-input__wrapper.is-focus),
.card :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #8d7040 inset;
}
.submit {
  width: 100%;
  height: 46px;
  margin-top: 8px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #9a7d45 0%, #6f5830 100%);
  color: #fff;
  font-size: 16px;
  letter-spacing: 4px;
  cursor: pointer;
}
.submit:hover { filter: brightness(1.06); }
.submit:disabled { opacity: 0.7; cursor: default; }
.lock { margin: 0 0 8px; text-align: center; color: #b42318; font-size: 13px; line-height: 1.5; }
.captcha { display: flex; gap: 8px; width: 100%; align-items: center; }
.captcha img { height: 40px; cursor: pointer; border-radius: 8px; }
</style>
