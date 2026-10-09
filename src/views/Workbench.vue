<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, Fold, Expand, Plus, Delete } from '@element-plus/icons-vue'
import ChatPanel from '../components/ChatPanel.vue'
import ReasoningPanel from '../components/ReasoningPanel.vue'
import MapPanel from '../components/MapPanel.vue'
import { useChatStore } from '../stores/chat'

const store = useChatStore()

// —— 会话历史侧栏（方案 G）——
const sidebarCollapsed = ref(false)

// —— 面板折叠状态 ——
const reasoningCollapsed = ref(false)
const mapCollapsed = ref(false)
const mapFlash = ref(false)

// —— 推理/地图面板比例（方案 A：可切换工作模式 + 拖拽分隔）——
const reasoningFlex = ref(1)
const mapFlex = ref(1)
type WorkMode = 'inspect' | 'balanced' | 'analyze' | 'custom'
const mode = ref<WorkMode>('balanced')

function setMode(m: Exclude<WorkMode, 'custom'>) {
  mode.value = m
  if (m === 'inspect') { reasoningFlex.value = 0.43; mapFlex.value = 1.57 }
  else if (m === 'balanced') { reasoningFlex.value = 1; mapFlex.value = 1 }
  else { reasoningFlex.value = 1.57; mapFlex.value = 0.43 }
}

/** 拖拽分隔条：动态调整推理/地图面板比例 */
function onDragStart(e: MouseEvent) {
  e.preventDefault()
  mode.value = 'custom'
  const rightCol = (e.currentTarget as HTMLElement).parentElement as HTMLElement
  const totalH = rightCol.clientHeight
  const startY = e.clientY
  const startRatio = reasoningFlex.value / (reasoningFlex.value + mapFlex.value)

  function onMove(ev: MouseEvent) {
    const delta = ev.clientY - startY
    const newRatio = Math.max(0.15, Math.min(0.85, startRatio + delta / totalH))
    reasoningFlex.value = newRatio
    mapFlex.value = 1 - newRatio
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

/**
 * 方案 A+C：「在地图查看」联动——不折叠推理面板（非互斥），
 * 改为闪烁高亮 + 自动弹窗第一个点位（focusedPoint 联动 MapPanel）
 */
function handleFocusMap() {
  reasoningCollapsed.value = false
  mapCollapsed.value = false
  mapFlash.value = true
  if (store.mapPoints.length > 0) {
    store.setFocusedPoint(store.mapPoints[0])
  }
  setTimeout(() => { mapFlash.value = false }, 1500)
}

/** 会话时间格式化：今天显示时:分，其他显示月/日 */
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <div class="workbench">
    <!-- 会话历史侧栏（方案 G） -->
    <aside class="session-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header" @click="sidebarCollapsed = !sidebarCollapsed">
        <span v-if="!sidebarCollapsed" class="sidebar-title">会话历史</span>
        <el-icon class="sidebar-toggle"><Fold v-if="!sidebarCollapsed" /><Expand v-else /></el-icon>
      </div>
      <div v-show="!sidebarCollapsed" class="sidebar-body">
        <el-button
          class="new-session-btn"
          type="primary"
          plain
          size="small"
          :icon="Plus"
          :disabled="store.sending"
          @click="store.newSession()"
        >
          新建对话
        </el-button>
        <div class="session-list">
          <div
            v-for="s in store.sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === store.activeSessionId }"
            @click="store.switchSession(s.id)"
          >
            <span class="session-title">{{ s.title }}</span>
            <span class="session-time">{{ fmtTime(s.createdAt) }}</span>
            <el-button
              text
              size="small"
              :icon="Delete"
              class="session-delete"
              @click.stop="store.deleteSession(s.id)"
            />
          </div>
        </div>
      </div>
    </aside>

    <!-- 对话区 -->
    <div class="chat-area">
      <ChatPanel />
    </div>

    <!-- 右栏：推理 + 地图（方案 A：50/50 + 可切换模式 + 拖拽分隔） -->
    <div class="right-col">
      <!-- 模式切换工具条 -->
      <div class="mode-bar">
        <el-button-group>
          <el-button size="small" :type="mode === 'inspect' ? 'primary' : ''" @click="setMode('inspect')">
            巡视模式
          </el-button>
          <el-button size="small" :type="mode === 'balanced' ? 'primary' : ''" @click="setMode('balanced')">
            均衡
          </el-button>
          <el-button size="small" :type="mode === 'analyze' ? 'primary' : ''" @click="setMode('analyze')">
            分析模式
          </el-button>
        </el-button-group>
      </div>

      <!-- 推理面板 -->
      <div
        class="panel"
        :class="{ collapsed: reasoningCollapsed }"
        :style="{ flex: reasoningCollapsed ? '0 0 auto' : `${reasoningFlex} 1 0` }"
      >
        <div class="panel-title-bar" @click="reasoningCollapsed = !reasoningCollapsed">
          <span class="panel-title">Agent 推理链路</span>
          <el-icon class="collapse-icon" :class="{ folded: reasoningCollapsed }"><ArrowDown /></el-icon>
        </div>
        <div v-show="!reasoningCollapsed" class="panel-body">
          <ReasoningPanel @focus-map="handleFocusMap" />
        </div>
      </div>

      <!-- 拖拽分隔条 -->
      <div
        v-if="!reasoningCollapsed && !mapCollapsed"
        class="drag-handle"
        @mousedown="onDragStart"
      />

      <!-- 地图面板 -->
      <div
        class="panel"
        :class="{ collapsed: mapCollapsed, flash: mapFlash }"
        :style="{ flex: mapCollapsed ? '0 0 auto' : `${mapFlex} 1 0` }"
      >
        <div class="panel-title-bar" @click="mapCollapsed = !mapCollapsed">
          <span class="panel-title">污染源地图</span>
          <el-icon class="collapse-icon" :class="{ folded: mapCollapsed }"><ArrowDown /></el-icon>
        </div>
        <div v-show="!mapCollapsed" class="panel-body">
          <MapPanel />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  height: 100%;
}

/* —— 会话历史侧栏（方案 G）—— */
.session-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
}
.session-sidebar.collapsed {
  width: 36px;
}
.sidebar-header {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  user-select: none;
}
.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.sidebar-toggle {
  color: var(--el-text-color-placeholder);
}
.sidebar-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.new-session-btn {
  margin: 8px;
  flex-shrink: 0;
}
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px 8px;
}
.session-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: background 0.2s;
}
.session-item:hover {
  background: var(--el-fill-color-light);
}
.session-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.session-delete {
  opacity: 0;
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}
.session-item:hover .session-delete {
  opacity: 1;
}
.session-delete:hover {
  color: var(--el-color-danger) !important;
}

/* —— 对话区 —— */
.chat-area {
  flex: 1;
  min-width: 360px;
  border-right: 1px solid var(--el-border-color);
  display: flex;
}

/* —— 右栏 —— */
.right-col {
  width: 50%;
  min-width: 360px;
  display: flex;
  flex-direction: column;
}

/* —— 模式切换条 —— */
.mode-bar {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* —— 面板通用 —— */
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  transition: flex 0.3s ease;
}
.panel.collapsed {
  min-height: 0 !important;
}
.panel-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-top: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.panel:first-of-type .panel-title-bar {
  border-top: none;
}
.panel.collapsed .panel-title-bar {
  border-bottom: none;
}
.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.collapse-icon {
  color: var(--el-text-color-placeholder);
  transition: transform 0.3s ease;
}
.collapse-icon.folded {
  transform: rotate(-90deg);
}
.panel-body {
  flex: 1;
  overflow: hidden;
  display: flex;
}

/* —— 拖拽分隔条 —— */
.drag-handle {
  height: 4px;
  flex-shrink: 0;
  background: var(--el-border-color);
  cursor: row-resize;
  transition: background 0.2s;
}
.drag-handle:hover {
  background: var(--el-color-primary-light-5);
}
.drag-handle:active {
  background: var(--el-color-primary);
}

/* —— 闪烁高亮（方案 A：联动时闪烁地图面板）—— */
.panel.flash {
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
  transition: box-shadow 0.3s ease;
}
</style>
