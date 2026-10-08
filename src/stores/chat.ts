import { defineStore } from 'pinia'
import { fetchSSE } from '../composables/useSSE'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export interface ToolEvent {
  id: string
  name: string
  args?: unknown
  summary?: string
  status: 'running' | 'done'
}

interface UpstreamMessage {
  role: 'user' | 'assistant'
  content: string
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as ChatMessage[],
    /** 当前回答的工具调用事件（推理链路面板数据源，每次提问前清空） */
    toolEvents: [] as ToolEvent[],
    sending: false,
    controller: null as AbortController | null,
  }),
  actions: {
    async sendMessage(text: string) {
      const content = text.trim()
      if (!content || this.sending) return

      this.messages.push({ role: 'user', content, ts: Date.now() })
      this.messages.push({ role: 'assistant', content: '', ts: Date.now() })
      this.toolEvents = []
      await this.streamReply()
    },

    // 丢掉最后一条回复，基于相同历史重新生成
    async regenerate() {
      if (this.sending) return
      const last = this.messages[this.messages.length - 1]
      if (last?.role === 'assistant') this.messages.pop()
      const history = this.toHistory()
      if (history.length === 0 || history[history.length - 1].role !== 'user') return
      this.messages.push({ role: 'assistant', content: '', ts: Date.now() })
      this.toolEvents = []
      await this.streamReply()
    },

    async streamReply() {
      // push 进 reactive 数组的是普通对象，需重新从数组取响应式代理，否则视图不更新
      const reply = this.messages[this.messages.length - 1]
      const history = this.toHistory()

      this.sending = true
      this.controller = new AbortController()

      try {
        await fetchSSE(
          '/api/chat',
          { messages: history },
          {
            onMessage: chunk => {
              reply.content += chunk
            },
            onToolStart: (id, name, args) => {
              this.toolEvents.push({ id, name, args, status: 'running' })
            },
            onToolEnd: (id, _name, summary) => {
              const ev =
                this.toolEvents.find(e => e.id === id && e.status === 'running') ??
                this.toolEvents[this.toolEvents.length - 1]
              if (ev) {
                ev.status = 'done'
                ev.summary = summary
              }
            },
            onError: msg => {
              reply.content += `\n\n> ⚠️ ${msg}`
            },
          },
          this.controller.signal
        )
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          reply.content += '\n\n> ⚠️ 请求中断，请重试'
        }
      } finally {
        this.sending = false
        this.controller = null
      }
    },

    // 截到最后一条 user 消息为止（排除尾部尚未生成的 assistant 占位）
    toHistory(): UpstreamMessage[] {
      let end = this.messages.length
      if (end > 0 && this.messages[end - 1].role === 'assistant') end -= 1
      return this.messages.slice(0, end).map(m => ({ role: m.role, content: m.content }))
    },

    stop() {
      this.controller?.abort()
    },

    clear() {
      this.controller?.abort()
      this.messages = []
    },
  },
})
