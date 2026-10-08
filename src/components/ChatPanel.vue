<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'
import MessageItem from './MessageItem.vue'

const SUGGESTIONS = [
  '帮我介绍一下这个环保智能监管工作台',
  '用 Markdown 写一段 Python Hello World 示例代码',
  '归纳一下大气污染的主要来源',
  '什么是环境保护的“三同时”制度？',
]

const input = ref('')
const listRef = ref<HTMLElement>()
const stickBottom = ref(true)
const store = useChatStore()

const lastMsg = computed(() => store.messages[store.messages.length - 1])
const canRegenerate = computed(
  () => !store.sending && lastMsg.value?.role === 'assistant' && !!lastMsg.value?.content
)

// 用户上翻阅读时不强制拉底，贴底才跟随滚动
function onListScroll() {
  const el = listRef.value
  if (!el) return
  stickBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60
}

function scrollToBottom() {
  nextTick(() => listRef.value?.scrollTo({ top: listRef.value.scrollHeight }))
}

// 中文输入法选词时的 Enter 不触发发送
function onEnterKey(e: KeyboardEvent) {
  if (e.isComposing) return
  handleSend()
}

async function handleSend() {
  const text = input.value
  if (!text.trim() || store.sending) return
  input.value = ''
  stickBottom.value = true
  await store.sendMessage(text)
}

function handleSuggestion(text: string) {
  if (store.sending) return
  stickBottom.value = true
  store.sendMessage(text)
}

watch(
  () => lastMsg.value?.content,
  () => {
    if (stickBottom.value) scrollToBottom()
  }
)
watch(
  () => store.messages.length,
  () => {
    if (stickBottom.value) scrollToBottom()
  }
)
</script>

<template>
  <div class="chat-panel">
    <div class="panel-header">
      <span class="title">对话区</span>
      <el-tooltip content="清空对话" placement="top">
        <el-button
          :icon="Delete"
          text
          size="small"
          :disabled="store.messages.length === 0 || store.sending"
          @click="store.clear()"
        />
      </el-tooltip>
    </div>

    <div ref="listRef" class="msg-list" @scroll="onListScroll">
      <div v-if="store.messages.length === 0" class="empty-state">
        <div class="empty-title">👋 我是环保智能监管助手</div>
        <div class="empty-desc">可以问我污染源查询、环保政策解读、报告生成等问题</div>
        <div class="chips">
          <el-button
            v-for="s in SUGGESTIONS"
            :key="s"
            size="small"
            round
            plain
            type="primary"
            @click="handleSuggestion(s)"
          >
            {{ s }}
          </el-button>
        </div>
      </div>
      <template v-for="(msg, i) in store.messages" :key="i">
        <MessageItem
          :msg="msg"
          :streaming="store.sending && i === store.messages.length - 1 && msg.role === 'assistant'"
          :can-regenerate="canRegenerate && i === store.messages.length - 1"
          @regenerate="store.regenerate()"
        />
      </template>
    </div>

    <div class="input-area">
      <el-input
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        placeholder="例如：沙圪堵镇有哪些超标废气企业？（Enter 发送 / Shift+Enter 换行）"
        @keydown.enter.exact.prevent="onEnterKey"
      />
      <div class="btns">
        <el-button v-if="store.sending" type="danger" plain @click="store.stop()">
          停止生成
        </el-button>
        <el-button v-else type="primary" :disabled="!input.trim()" @click="handleSend">
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.panel-header .title {
  font-weight: 600;
  font-size: 15px;
}
.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.empty-title {
  font-size: 18px;
  font-weight: 600;
}
.empty-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.chips {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 480px;
}
.input-area {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btns {
  display: flex;
  justify-content: flex-end;
}
</style>
