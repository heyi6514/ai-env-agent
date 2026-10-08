<script setup lang="ts">
import ChatPanel from '../components/ChatPanel.vue'
import ReasoningPanel from '../components/ReasoningPanel.vue'
</script>

<template>
  <div class="workbench">
    <div class="left">
      <ChatPanel />
    </div>
    <div class="right">
      <div class="panel">
        <div class="panel-title">Agent 推理链路</div>
        <ReasoningPanel />
      </div>
      <div class="panel">
        <div class="panel-title">地图（Day 6 接入）</div>
        <el-empty description="OpenLayers 地图占位" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  height: 100vh;
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
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}
.panel + .panel {
  border-top: 1px solid var(--el-border-color);
}
.panel-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}
</style>
