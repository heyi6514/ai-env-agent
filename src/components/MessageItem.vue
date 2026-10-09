<script setup lang="ts">
import { computed } from 'vue'
import { CopyDocument, RefreshRight, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { ChatMessage } from '../stores/chat'
import { useChatStore } from '../stores/chat'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{
  msg: ChatMessage
  streaming?: boolean
  canRegenerate?: boolean
}>()

const store = useChatStore()

const emit = defineEmits<{ regenerate: [] }>()

const html = computed(() => renderMarkdown(props.msg.content))
const thinking = computed(() => props.streaming && props.msg.content === '')

async function copy() {
  try {
    await navigator.clipboard.writeText(props.msg.content)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div class="msg-item" :class="msg.role">
    <div class="bubble">
      <div v-if="thinking" class="thinking">
        <span></span><span></span><span></span>
        <em>正在思考…</em>
      </div>
      <template v-else>
        <div v-if="msg.role === 'assistant'" class="md-body" v-html="html"></div>
        <div v-else class="plain">{{ msg.content }}</div>
        <div v-if="msg.report" class="report-card">
          <el-icon class="report-icon"><Download /></el-icon>
          <div class="report-info">
            <div class="report-title">执法检查报告已生成</div>
            <div class="report-name">{{ msg.report.filename }}</div>
          </div>
          <el-button
            type="primary"
            size="small"
            :icon="Download"
            @click="store.downloadReport(msg.report!)"
          >
            下载报告
          </el-button>
        </div>
        <div v-if="msg.role === 'assistant' && !streaming && msg.content" class="ops">
          <el-button link size="small" @click="copy">
            <el-icon><CopyDocument /></el-icon>&nbsp;复制
          </el-button>
          <el-button v-if="canRegenerate" link size="small" @click="emit('regenerate')">
            <el-icon><RefreshRight /></el-icon>&nbsp;重新生成
          </el-button>
        </div>
      </template>
      <span v-if="streaming && msg.content" class="cursor">▍</span>
    </div>
  </div>
</template>

<style scoped>
.msg-item {
  display: flex;
  margin-bottom: 16px;
}
.msg-item.user {
  justify-content: flex-end;
}
.msg-item.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 10px;
  line-height: 1.65;
  word-break: break-word;
  font-size: 14px;
}
.user .bubble {
  background: var(--el-color-primary);
  color: #fff;
  white-space: pre-wrap;
}
.assistant .bubble {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.plain {
  white-space: pre-wrap;
}
.cursor {
  animation: blink 1s step-start infinite;
  color: var(--el-color-primary);
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
}
.thinking span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: bounce 1.2s infinite;
}
.thinking span:nth-child(2) {
  animation-delay: 0.2s;
}
.thinking span:nth-child(3) {
  animation-delay: 0.4s;
}
.thinking em {
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
.report-card {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.report-card .report-icon {
  color: var(--el-color-warning);
  font-size: 20px;
  flex-shrink: 0;
}
.report-card .report-info {
  flex: 1;
  min-width: 0;
}
.report-card .report-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-warning);
}
.report-card .report-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  margin-top: 2px;
}
.ops {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.msg-item:hover .ops {
  opacity: 1;
}

.md-body :deep(p) {
  margin: 4px 0;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  margin: 10px 0 6px;
  font-size: 15px;
}
.md-body :deep(code) {
  background: var(--el-fill-color);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 13px;
  font-family: Consolas, Monaco, 'Courier New', monospace;
}
.md-body :deep(pre) {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.md-body :deep(pre code) {
  background: transparent;
  padding: 0;
  line-height: 1.5;
}
.md-body :deep(blockquote) {
  border-left: 3px solid var(--el-color-primary-light-5);
  margin: 6px 0;
  padding: 2px 10px;
  color: var(--el-text-color-secondary);
}
.md-body :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}
.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 4px 10px;
}
.md-body :deep(th) {
  background: var(--el-fill-color-light);
}
.md-body :deep(a) {
  color: var(--el-color-primary);
}
</style>
