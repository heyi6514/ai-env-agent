<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Loading, Search, Document, Delete, ArrowRight, DataLine, Download, MapLocation, ChatRound } from '@element-plus/icons-vue'
import { useChatStore, type ToolEvent } from '../stores/chat'
import type { ToolSource } from '../composables/useSSE'

const emit = defineEmits<{
  (e: 'focus-map'): void
}>()

const store = useChatStore()

/** 工具名 → 中文标签，对非技术面试官更友好 */
const TOOL_LABELS: Record<string, string> = {
  query_pollution_sources: '污染源点位查询',
  query_air_quality: '空气质量监测',
  query_water_quality: '水环境质量查询',
  query_vehicle_sensing: '机动车遥感监测',
  search_knowledge_base: '法规知识库检索',
  generate_report: '执法报告生成',
}

const label = (name: string) => TOOL_LABELS[name] ?? name

/** 卡片四色分类：思考(黄)/工具(蓝)/数据(绿)/异常(红) */
function cardClass(ev: ToolEvent): string {
  if (ev.type === 'thought') return 'card-thought'
  if (ev.error) return 'card-error'
  if (ev.dataSummary) return 'card-data'
  return 'card-tool'
}

/** 工具步骤编号（仅统计 tool 类型，跳过 thought） */
function toolStepNo(idx: number): number {
  return store.toolEvents.slice(0, idx + 1).filter(e => e.type === 'tool').length
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

/** 入参是否非空对象 */
function hasArgs(args: unknown): boolean {
  return !!args && typeof args === 'object' && Object.keys(args as object).length > 0
}

/** 入参 JSON 格式化 */
function fmtArgsJson(args: unknown): string {
  if (!hasArgs(args)) return ''
  return JSON.stringify(args, null, 2)
}

/** 折叠状态管理 */
const collapsed = ref<Record<string, boolean>>({})
function toggleCollapse(id: string) {
  collapsed.value[id] = !collapsed.value[id]
}

/** 入参折叠（默认折叠） */
const argsExpanded = ref<Record<string, boolean>>({})
function isArgsExpanded(id: string): boolean {
  return argsExpanded.value[id] === true
}
function toggleArgs(id: string) {
  argsExpanded.value[id] = !isArgsExpanded(id)
}

/** 返回折叠（默认展开） */
const returnExpanded = ref<Record<string, boolean>>({})
function isReturnExpanded(id: string): boolean {
  return returnExpanded.value[id] !== false
}
function toggleReturn(id: string) {
  returnExpanded.value[id] = !isReturnExpanded(id)
}

/** 是否有返回内容 */
function hasReturn(ev: ToolEvent): boolean {
  return !!(ev.dataSummary || ev.sources?.length || ev.report)
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
  returnExpanded.value = {}
}
</script>

<template>
  <div class="reasoning-panel">
    <!-- 工具栏：清空按钮 -->
    <div v-if="hasEvents" class="toolbar">
      <span class="event-count">共 {{ store.toolEvents.filter(e => e.type === 'tool').length }} 步</span>
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
        :class="[cardClass(ev), { running: ev.status === 'running' }]"
      >
        <!-- 时间轴节点 -->
        <span class="timeline-node">
          <span v-if="ev.type === 'thought'" class="thought-dot"></span>
          <span v-else class="step-no">{{ toolStepNo(idx) }}</span>
        </span>

        <!-- 思考卡片：黄色，简单展示文本 -->
        <div v-if="ev.type === 'thought'" class="thought-content">
          <el-icon class="thought-icon"><ChatRound /></el-icon>
          <span class="thought-label">思考</span>
          <span class="thought-text">{{ ev.text }}</span>
        </div>

        <!-- 工具卡片：蓝/绿/红，完整布局 -->
        <template v-else>
          <div class="event-head" @click="toggleCollapse(ev.id)">
            <el-icon class="caret" :class="{ open: !collapsed[ev.id] }">
              <ArrowRight />
            </el-icon>
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
            <el-button
              v-if="ev.hasMapPoints"
              link
              size="small"
              :icon="MapLocation"
              class="map-btn"
              @click.stop="emit('focus-map')"
            >
              在地图查看
            </el-button>
          </div>

          <!-- 可折叠详情区 -->
          <div v-show="!collapsed[ev.id]" class="event-body">
            <!-- 入参（JSON 折叠，默认收起） -->
            <div v-if="hasArgs(ev.args)" class="event-section">
              <div class="section-label" @click.stop="toggleArgs(ev.id)">
                <el-icon class="caret sm" :class="{ open: isArgsExpanded(ev.id) }"><ArrowRight /></el-icon>
                入参
              </div>
              <pre v-show="isArgsExpanded(ev.id)" class="json-block">{{ fmtArgsJson(ev.args) }}</pre>
            </div>

            <!-- 返回（折叠区块，默认展开） -->
            <div v-if="hasReturn(ev)" class="event-section">
              <div class="section-label" @click.stop="toggleReturn(ev.id)">
                <el-icon class="caret sm" :class="{ open: isReturnExpanded(ev.id) }"><ArrowRight /></el-icon>
                返回
              </div>
              <div v-show="isReturnExpanded(ev.id)" class="return-body">
                <!-- GIS 工具数据摘要 -->
                <div v-if="ev.dataSummary" class="return-item data-item">
                  <el-icon class="item-icon"><DataLine /></el-icon>
                  <span class="item-label">数据摘要：</span>
                  <span class="item-text">{{ ev.dataSummary }}</span>
                </div>
                <!-- RAG 检索命中来源 -->
                <div v-if="ev.sources?.length" class="return-item source-item">
                  <el-icon class="item-icon"><Document /></el-icon>
                  <span class="item-label">命中来源：</span>
                  <span class="item-text">{{ fmtSources(ev.sources) }}</span>
                </div>
                <!-- 报告工具生成的文件 -->
                <div v-if="ev.report" class="return-item report-item">
                  <el-icon class="item-icon"><Download /></el-icon>
                  <span class="item-label">报告已生成：</span>
                  <span class="item-text">{{ ev.report.filename }}</span>
                  <el-button
                    link
                    size="small"
                    class="report-download"
                    @click.stop="store.downloadReport(ev.report!)"
                  >
                    下载
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </template>
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

/* 垂直时间轴 */
.timeline {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
  padding-left: 28px;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: var(--el-border-color);
}

/* 时间轴节点 */
.timeline-node {
  position: absolute;
  left: -28px;
  top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  z-index: 1;
}
.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px var(--el-bg-color);
}
.thought-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-color-warning);
  box-shadow: 0 0 0 3px var(--el-bg-color);
}

/* 事件卡片基础样式 */
.event-card {
  position: relative;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.event-card.running {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}

/* 四色分类：左边框 + 浅色背景 */
.card-thought {
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.card-tool {
  border-left: 3px solid var(--el-color-primary);
}
.card-data {
  border-left: 3px solid var(--el-color-success);
  background: var(--el-color-success-light-9);
}
.card-error {
  border-left: 3px solid var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

/* 思考卡片内容 */
.thought-content {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.6;
}
.thought-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
  margin-top: 1px;
}
.thought-label {
  color: var(--el-color-warning);
  font-weight: 600;
  flex-shrink: 0;
}
.thought-text {
  color: var(--el-text-color-regular);
  word-break: break-all;
}

/* 工具卡片头部 */
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
  flex-shrink: 0;
}
.caret.open {
  transform: rotate(90deg);
}
.caret.sm {
  font-size: 10px;
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
.map-btn {
  margin-left: 4px;
  font-size: 12px;
  flex-shrink: 0;
}

/* 卡片详情区 */
.event-body {
  margin-top: 8px;
}
.event-section {
  margin-top: 6px;
}
.section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}
.json-block {
  margin: 4px 0 0 0;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--el-text-color-regular);
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}
.return-body {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.return-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.data-item {
  background: var(--el-color-success-light-9);
}
.source-item {
  background: var(--el-color-primary-light-9);
}
.report-item {
  background: var(--el-color-warning-light-9);
  align-items: center;
}
.item-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.data-item .item-icon {
  color: var(--el-color-success);
}
.source-item .item-icon {
  color: var(--el-color-primary);
}
.report-item .item-icon {
  color: var(--el-color-warning);
}
.item-label {
  font-weight: 600;
  flex-shrink: 0;
}
.data-item .item-label {
  color: var(--el-color-success);
}
.source-item .item-label {
  color: var(--el-color-primary);
}
.report-item .item-label {
  color: var(--el-color-warning);
}
.item-text {
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.report-download {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 12px;
}

/* 运行中动画 */
.spin {
  animation: rotate 1s linear infinite;
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 等待指示器 */
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
