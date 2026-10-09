<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import ChatPanel from '../components/ChatPanel.vue'
import ReasoningPanel from '../components/ReasoningPanel.vue'
import MapPanel from '../components/MapPanel.vue'

const reasoningCollapsed = ref(false)
const mapCollapsed = ref(false)
const mapFlash = ref(false)

/** "在地图查看"按钮联动：折叠推理面板、展开地图面板、闪烁高亮地图 */
function handleFocusMap() {
  reasoningCollapsed.value = true
  mapCollapsed.value = false
  mapFlash.value = true
  setTimeout(() => { mapFlash.value = false }, 1500)
}
</script>

<template>
  <div class="workbench">
    <div class="left">
      <ChatPanel />
    </div>
    <div class="right">
      <div class="panel" :class="{ collapsed: reasoningCollapsed }">
        <div class="panel-title-bar" @click="reasoningCollapsed = !reasoningCollapsed">
          <span class="panel-title">Agent 推理链路</span>
          <el-icon class="collapse-icon" :class="{ folded: reasoningCollapsed }"><ArrowDown /></el-icon>
        </div>
        <div v-show="!reasoningCollapsed" class="panel-body">
          <ReasoningPanel @focus-map="handleFocusMap" />
        </div>
      </div>
      <div class="panel" :class="{ collapsed: mapCollapsed, flash: mapFlash }">
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
.left {
  flex: 1;
  min-width: 420px;
  border-right: 1px solid var(--el-border-color);
  display: flex;
}
.right {
  width: 40%;
  min-width: 460px;
  display: flex;
  flex-direction: column;
}
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: flex 0.3s ease;
}
.panel:first-child {
  flex: 2;
}
.panel:last-child {
  flex: 1;
  min-height: 160px;
}
.panel + .panel {
  border-top: 1px solid var(--el-border-color);
}
.panel.collapsed {
  flex: 0 0 auto !important;
  min-height: 0 !important;
}
.panel-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.panel.collapsed .panel-title-bar {
  border-bottom: none;
}
.panel-title {
  font-weight: 600;
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
  overflow-y: auto;
  padding: 12px;
  display: flex;
}
/* 闪烁高亮地图面板 */
.panel.flash {
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
  transition: box-shadow 0.3s ease;
}
</style>
