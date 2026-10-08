<script setup lang="ts">
import { ref } from 'vue'
import Workbench from './views/Workbench.vue'
import Knowledge from './views/Knowledge.vue'

type TabKey = 'workbench' | 'knowledge'

const activeTab = ref<TabKey>('workbench')
const tabs: { key: TabKey; label: string }[] = [
  { key: 'workbench', label: '智能工作台' },
  { key: 'knowledge', label: '法规知识库' },
]
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <span class="brand-dot" />
        <span class="brand-name">环保智能监管工作台</span>
      </div>
      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>
    </header>
    <main class="app-main">
      <Workbench v-if="activeTab === 'workbench'" />
      <Knowledge v-else />
    </main>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409eff, #67c23a);
}
.brand-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
}
.tabs {
  display: flex;
  gap: 4px;
}
.tab {
  padding: 6px 16px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}
.tab:hover {
  background: var(--el-fill-color-light);
}
.tab.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}
.app-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
