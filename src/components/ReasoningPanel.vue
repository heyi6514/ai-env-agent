<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Search } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'

const store = useChatStore()

const TOOL_LABELS: Record<string, string> = {
  query_pollution_sources: 'GIS 污染源查询',
}

const label = (name: string) => TOOL_LABELS[name] ?? name

function fmtArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([k, v]) => `${k}=${String(v)}`
  )
  return parts.join('，')
}

const hasEvents = computed(() => store.toolEvents.length > 0)
</script>

<template>
  <div class="reasoning-panel">
    <el-empty
      v-if="!hasEvents"
      description="暂无推理事件：询问业务数据（如污染源查询）时，这里将实时展示 Agent 的思考与工具调用链路"
      :image-size="60"
    />
    <div v-else class="timeline">
      <div v-for="ev in store.toolEvents" :key="ev.id" class="event-card">
        <div class="event-head">
          <el-icon v-if="ev.status === 'running'" class="spin" color="var(--el-color-primary)">
            <Loading />
          </el-icon>
          <el-icon v-else color="var(--el-color-success)"><Search /></el-icon>
          <span class="tool-name">{{ label(ev.name) }}</span>
          <el-tag size="small" :type="ev.status === 'running' ? 'primary' : 'success'">
            {{ ev.status === 'running' ? '执行中' : ev.summary || '完成' }}
          </el-tag>
        </div>
        <div v-if="fmtArgs(ev.args)" class="event-args">入参：{{ fmtArgs(ev.args) }}</div>
      </div>
      <div v-if="store.sending" class="waiting">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <em>Agent 推理中…</em>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reasoning-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.event-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
}
.event-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-name {
  font-weight: 600;
  font-size: 13px;
}
.event-args {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.spin {
  animation: rotate 1s linear infinite;
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
.waiting {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 2px;
}
.waiting .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: bounce 1.2s infinite;
}
.waiting .dot:nth-child(2) {
  animation-delay: 0.2s;
}
.waiting .dot:nth-child(3) {
  animation-delay: 0.4s;
}
.waiting em {
  font-style: normal;
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
