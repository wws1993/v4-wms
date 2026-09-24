<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV, NAV_GROUPS } from '@/nav'
import { useAuthStore } from '@/stores/auth'
import {
  Document, Download, Files, Finished, Grid, Medal, Notebook, Odometer,
  OfficeBuilding, Search, Setting, SetUp, Sort, Tickets, Upload, User, Warning,
} from '@element-plus/icons-vue'

const icons: Record<string, unknown> = {
  Document, Download, Files, Finished, Grid, Medal, Notebook, Odometer,
  OfficeBuilding, Search, Setting, SetUp, Sort, Tickets, Upload, User, Warning,
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isDash = computed(() => route.name === 'dashboard')
const title = computed(() => String(route.meta.title || ''))
const subtitle = computed(() => (isDash.value ? 'BONDED WMS · 关务监管' : String(route.meta.group || '')))

const groups = computed(() => {
  const pages = new Set(auth.user?.pages || [])
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV.filter((item) => item.group === group && pages.has(item.id)),
  })).filter((group) => group.items.length)
})

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin" :class="{ 'is-dashboard': isDash }">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark" />WWS系统</div>
      <nav class="menu">
        <section v-for="group in groups" :key="group.group">
          <div class="group-title">{{ group.group }}</div>
          <router-link v-for="item in group.items" :key="item.id" :to="item.path" class="nav-link">
            <el-icon><component :is="icons[item.icon]" /></el-icon>
            <span>{{ item.title }}</span>
          </router-link>
        </section>
      </nav>
    </aside>
    <section class="main">
      <header v-if="!isDash" class="topbar">
        <div>
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <el-dropdown>
          <span class="user-btn">{{ auth.user?.roleName }} · {{ auth.user?.name }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <div class="content" :class="{ panel: !isDash }">
        <router-view />
      </div>
    </section>
  </div>
</template>
