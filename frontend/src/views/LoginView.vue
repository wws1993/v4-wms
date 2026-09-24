<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const form = reactive({ username: 'admin', password: 'admin123' })

const demos = [
  { username: 'admin', password: 'admin123', label: '系统管理员' },
  { username: 'warehouse', password: 'wh123', label: '仓管员' },
  { username: 'customs', password: 'cus123', label: '关务员' },
]

async function submit() {
  loading.value = true
  const res = await authApi.login(form)
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  auth.setUser(res.data)
  router.push('/dashboard')
}

function quick(item: { username: string; password: string }) {
  form.username = item.username
  form.password = item.password
  submit()
}
</script>

<template>
  <div class="login">
    <div class="card">
      <div class="mark" />
      <h1>WWS系统</h1>
      <p>保税仓储管理系统</p>
      <el-form @submit.prevent="submit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="账号" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" placeholder="密码" size="large" type="password" show-password />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="submit">登录</el-button>
      </el-form>
      <div class="demos">
        <el-button v-for="item in demos" :key="item.username" text @click="quick(item)">{{ item.label }}</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  background: #101217;
}
.card {
  width: 380px;
  padding: 36px 32px 24px;
  background: #fff;
  border-radius: 8px;
}
.mark {
  width: 36px;
  height: 36px;
  border: 2px solid #1b4f8a;
  border-radius: 4px;
  margin-bottom: 16px;
}
h1 { margin: 0; font-size: 24px; }
p { margin: 6px 0 24px; color: #5a6a7e; }
.demos { display: flex; justify-content: space-between; margin-top: 8px; }
</style>
