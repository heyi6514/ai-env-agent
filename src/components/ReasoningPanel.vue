<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Loading, Search, Document, Delete, ArrowRight, DataLine } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'
import type { ToolSource } from '../composables/useSSE'

const store = useChatStore()

/** 工具名 → 中文标签，对非技术面试官更友好 */
const TOOL_LABELS: Record<string, string> = {
  query_pollution_sources: '污染源点位查询',
  query_air_quality: '空气质量监测',
  query_water_quality: '水环境质量查询',
  query_vehicle_sensing: '机动车遥感监测',
  search_knowledge_base: '法规知识库检索',
}

const label = (name: string) => TOOL_LABELS[name] ?? name

function fmtArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([k, v]) => `${k}=${String(v)}`
  )
  return parts.join('，')
}

/** 入参长度超过此值则截断，点击展开 */
const ARGS_MAX_LEN = 80
const argsExpanded = ref<Record<string, boolean>>({})
function isArgsLong(args: unknown): boolean {
  return fmtArgs(args).length > ARGS_MAX_LEN
}
function displayArgs(ev: { id: string; args?: unknown }): string {
  const full = fmtArgs(ev.args)
  if (argsExpanded.value[ev.id] || full.length <= ARGS_MAX_LEN) return full
  return full.slice(0, ARGS_MAX_LEN) + '…'
}
function toggleArgs(id: string) {
  argsExpanded.value[id] = !argsExpanded.value[id]
}

/** 格式化来源列表：文件名 + 页码 + 相似度 */
function fmtSources(sources: ToolSource[]): string {
  return sources
    .map(s => {
      const page = s.page ? ` 第${s.page}页` : ''
      return `${s.source}${page}（${s.score}）`
    })
    .join('；')
}

/** 折叠状态：默认全部展开，可点击收起 */
const collapsed = ref<Record<string, boolean>>({})
function toggleCollapse(id: string) {
  collapsed.value[id] = !collapsed.value[id]
}

const hasEvents = computed(() => store.toolEvents.length > 0)

/** 自动滚动到最新事件 */
const timelineRef = ref<HTMLElement | null>(null)
watch(
  () => [store.toolEvents.length, store.sending],
  async () => {
    await nextTick()
    const el = timelineRef.value
    if (el) el.scrollTop = el.scrollHeight
  }
)

/** 清空推理链路（仅前端展示，不影响对话历史） */
function clearEvents() {
  store.toolEvents = []
  argsExpanded.value = {}
  collapsed.value = {}
}
</script>

<template>
  <div class="reasoning-panel">
    <!-- 工具栏：清空按钮 -->
    <div v-if="hasEvents" class="toolbar">
      <span class="event-count">共 {{ store.toolEvents.length }} 步</span>
      <el-button text size="small" :icon="Delete" @click="clearEvents">清空</el-button>
    </div>

    <el-empty
      v-if="!hasEvents"
      description="暂无推理事件：询问业务数据或法规时，这里将实时展示 Agent 的思考与工具调用链路"
      :image-size="60"
    />

    <div v-else ref="timelineRef" class="timeline">
      <div
        v-for="(ev, idx) in store.toolEvents"
        :key="ev.id"
        class="event-card"
        :class="{ running: ev.status === 'running' }"
      >
        <div class="event-head" @click="toggleCollapse(ev.id)">
          <el-icon class="caret" :class="{ open: !collapsed[ev.id] }">
            <ArrowRight />
          </el-icon>
          <span class="step-no">{{ idx + 1 }}</span>
          <el-icon v-if="ev.status === 'running'" class="spin" color="var(--el-color-primary)">
            <Loading />
          </el-icon>
          <el-icon v-else :color="ev.error ? 'var(--el-color-danger)' : 'var(--el-color-success)'">
            <Search />
          </el-icon>
          <span class="tool-name">{{ label(ev.name) }}</span>
          <el-tag
            size="small"
            :type="ev.status === 'running' ? 'primary' : ev.error ? 'danger' : 'success'"
          >
            {{ ev.status === 'running' ? '执行中' : ev.summary || '完成' }}
          </el-tag>
          <span v-if="ev.duration" class="duration">{{ (ev.duration / 1000).toFixed(1) }}s</span>
        </div>

        <!-- 可折叠详情区 -->
        <div v-show="!collapsed[ev.id]" class="event-body">
          <div v-if="fmtArgs(ev.args)" class="event-args">
            入参：
            <span>{{ displayArgs(ev) }}</span>
            <el-button
              v-if="isArgsLong(ev.args)"
              link
              size="small"
              class="toggle-btn"
              @click.stop="toggleArgs(ev.id)"
            >
              {{ argsExpanded[ev.id] ? '收起' : '展开' }}
            </el-button>
          </div>
          <!-- GIS 工具数据摘要：展示数据概况，体现工具返回了什么数据 -->
          <div v-if="ev.dataSummary" class="event-data">
            <el-icon class="data-icon"><DataLine /></el-icon>
            <span class="data-label">数据摘要：</span>
            <span class="data-text">{{ ev.dataSummary }}</span>
          </div>
          <!-- RAG 检索命中来源：展示文件名+页码，体现可解释性 -->
          <div v-if="ev.sources?.length" class="event-sources">
            <el-icon class="src-icon"><Document /></el-icon>
            <span class="src-label">命中来源：</span>
            <span class="src-text">{{ fmtSources(ev.sources) }}</span>
          </div>
        </div>
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
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.event-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.timeline {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
}
.event-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s;
}
.event-card.running {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}
.event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.caret {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  transition: transform 0.2s;
}
.caret.open {
  transform: rotate(90deg);
}
.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.tool-name {
  font-weight: 600;
  font-size: 13px;
}
.duration {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.event-body {
  margin-top: 8px;
}
.event-args {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.toggle-btn {
  margin-left: 4px;
  padding: 0;
  font-size: 12px;
}
.event-data {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.data-icon {
  margin-top: 2px;
  color: var(--el-color-success);
  flex-shrink: 0;
}
.data-label {
  color: var(--el-color-success);
  font-weight: 600;
  flex-shrink: 0;
}
.data-text {
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.event-sources {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.src-icon {
  margin-top: 2px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.src-label {
  color: var(--el-color-primary);
  font-weight: 600;
  flex-shrink: 0;
}
.src-text {
  color: var(--el-text-color-regular);
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
