import { defineStore } from 'pinia'
import { fetchSSE, type ToolSource, type MapPoint } from '../composables/useSSE'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
  /** 该轮生成的执法报告（仅 report 工具触发时挂载，供消息区下载卡片使用） */
  report?: { filename: string; markdown: string }
}

/** 会话历史记录（localStorage 持久化，仅存 messages，不含运行时状态） */
export interface Session {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

const STORAGE_KEY = 'env-agent-sessions'

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Session[]
  } catch {
    return []
  }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // 忽略 quota 超限等异常
  }
}

function genSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface ToolEvent {
  /** 卡片类型：thought=思考卡片（模型工具调用前的推理文本），tool=工具执行 */
  type: 'thought' | 'tool'
  id: string
  name: string
  /** 思考文本，仅 type='thought' 时有值 */
  text?: string
  args?: unknown
  summary?: string
  sources?: ToolSource[]
  /** GIS 工具返回的数据摘要，RAG 工具为空 */
  dataSummary?: string
  /** 报告工具生成的报告文件，其他工具为空 */
  report?: { filename: string; markdown: string }
  status: 'running' | 'done'
  /** 工具执行是否失败（summary 为"执行失败"时标记，用于红色展示） */
  error?: boolean
  /** 工具开始时间戳，用于计算耗时 */
  startTime: number
  /** 工具耗时（毫秒），结束时填入 */
  duration?: number
  /** 该工具步骤是否返回了地图点位（"在地图查看"按钮显示用） */
  hasMapPoints?: boolean
}

interface UpstreamMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 触发浏览器下载 Markdown 文件 */
function triggerDownload(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 延迟回收，避免大文件下载未完成时 URL 已失效
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const useChatStore = defineStore('chat', {
  state: () => {
    // 初始化时从 localStorage 加载历史会话，无则创建一个空会话
    const sessions = loadSessions()
    let activeSessionId = ''
    let messages: ChatMessage[] = []
    if (sessions.length > 0) {
      activeSessionId = sessions[0].id
      messages = [...sessions[0].messages]
    } else {
      const id = genSessionId()
      sessions.push({ id, title: '新对话', createdAt: Date.now(), messages: [] })
      activeSessionId = id
    }
    return {
      sessions,
      activeSessionId,
      messages,
      /** 当前回答的工具调用事件（推理链路面板数据源，每次提问前清空） */
      toolEvents: [] as ToolEvent[],
      /** 当前回答的地图点位（Day 4 协议，每次提问前清空，Day 6 由 MapPanel 渲染） */
      mapPoints: [] as MapPoint[],
      /** 地图视口 bounding box [minLon, minLat, maxLon, maxLat] */
      viewport: undefined as [number, number, number, number] | undefined,
      /** 方案 C：地图点位→对话上下文——弹窗「询问此点位」设置，
       *  ChatPanel watch 后填入输入框，消费后清除 */
      pendingInput: undefined as string | undefined,
      /** 方案 C：对话→地图——推理面板「在地图查看」设置，
       *  MapPanel watch 后弹窗居中，消费后清除 */
      focusedPoint: undefined as MapPoint | undefined,
      sending: false,
      controller: null as AbortController | null,
    }
  },
  actions: {
    async sendMessage(text: string) {
      const content = text.trim()
      if (!content || this.sending) return

      this.messages.push({ role: 'user', content, ts: Date.now() })
      this.messages.push({ role: 'assistant', content: '', ts: Date.now() })
      // 首条用户消息作为会话标题
      const s = this.sessions.find(s => s.id === this.activeSessionId)
      if (s && (s.title === '新对话' || !s.title)) {
        s.title = content.slice(0, 24) + (content.length > 24 ? '…' : '')
      }
      this.toolEvents = []
      this.mapPoints = []
      this.viewport = undefined
      this.focusedPoint = undefined
      this.pendingInput = undefined
      await this.streamReply()
    },

    // 丢掉最后一条回复，基于相同历史重新生成。
    // 注意：若旧回复含 report（执法报告），重新生成后报告也会丢失——
    // 这是合理的"重新生成"语义：用户要求重新回答，旧交付物自然作废。
    async regenerate() {
      if (this.sending) return
      const last = this.messages[this.messages.length - 1]
      if (last?.role === 'assistant') this.messages.pop()
      const history = this.toHistory()
      if (history.length === 0 || history[history.length - 1].role !== 'user') return
      this.messages.push({ role: 'assistant', content: '', ts: Date.now() })
      this.toolEvents = []
      this.mapPoints = []
      this.viewport = undefined
      this.focusedPoint = undefined
      this.pendingInput = undefined
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
              // 模型在调用工具前生成的文本 → 移入思考卡片
              // 这些文本先流式显示在聊天区（保留实时体验），
              // 当工具开始执行时将其从聊天区移出，作为黄色思考卡片展示
              if (reply.content.trim()) {
                this.toolEvents.push({
                  id: `thought_${id}`,
                  type: 'thought',
                  name: '',
                  text: reply.content,
                  status: 'done',
                  startTime: Date.now(),
                })
                reply.content = ''
              }
              this.toolEvents.push({ id, type: 'tool', name, args, status: 'running', startTime: Date.now() })
            },
            onToolEnd: (id, _name, summary, sources, dataSummary) => {
              const ev =
                this.toolEvents.find(e => e.id === id && e.status === 'running') ??
                (this.toolEvents.length > 0 ? this.toolEvents[this.toolEvents.length - 1] : undefined)
              if (ev) {
                ev.status = 'done'
                ev.summary = summary
                ev.sources = sources
                ev.dataSummary = dataSummary
                ev.duration = Date.now() - ev.startTime
                ev.error = summary === '执行失败'
              }
            },
            onError: msg => {
              reply.content += `\n\n> ⚠️ ${msg}`
            },
            onReport: (id, filename, markdown) => {
              // 报告挂到当前正在生成的助手消息上，供消息区下载卡片使用
              reply.report = { filename, markdown }
              // 通过 toolId 精确匹配对应工具事件，避免多轮工具场景下挂错
              const ev = this.toolEvents.find(e => e.id === id)
              if (ev) ev.report = { filename, markdown }
            },
            onMapRender: (toolId, data) => {
              // 多轮工具调用会多次触发 map_render，点位累加而非覆盖，
              // 让一次提问涉及的多个工具点位能在同一张图上叠加展示。
              if (data.points?.length) {
                this.mapPoints = [...this.mapPoints, ...data.points]
                // 标记对应工具步骤有地图点位，用于显示"在地图查看"按钮
                const ev = this.toolEvents.find(e => e.id === toolId)
                if (ev) ev.hasMapPoints = true
              }
              if (data.viewport) this.viewport = data.viewport
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
        // 持久化当前会话到 localStorage
        const s = this.sessions.find(s => s.id === this.activeSessionId)
        if (s) {
          s.messages = [...this.messages]
          saveSessions(this.sessions)
        }
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

    // —— 会话历史管理（方案 G）——

    /** 新建会话：当前会话已有内容则存入 sessions，然后创建空会话 */
    newSession() {
      if (this.sending) return
      this.controller?.abort()
      // 当前会话已有消息 → 持久化后新建；空会话 → 直接复用
      if (this.messages.length > 0) {
        const cur = this.sessions.find(s => s.id === this.activeSessionId)
        if (cur) {
          cur.messages = [...this.messages]
          saveSessions(this.sessions)
        }
        const id = genSessionId()
        this.sessions.unshift({ id, title: '新对话', createdAt: Date.now(), messages: [] })
        this.activeSessionId = id
      } else if (!this.activeSessionId) {
        const id = genSessionId()
        this.sessions.unshift({ id, title: '新对话', createdAt: Date.now(), messages: [] })
        this.activeSessionId = id
      }
      this.messages = []
      this.toolEvents = []
      this.mapPoints = []
      this.viewport = undefined
      this.focusedPoint = undefined
      this.pendingInput = undefined
      saveSessions(this.sessions)
    },

    /** 切换会话：保存当前 → 加载目标 */
    switchSession(id: string) {
      if (this.sending || id === this.activeSessionId) return
      // 持久化当前
      const cur = this.sessions.find(s => s.id === this.activeSessionId)
      if (cur) cur.messages = [...this.messages]
      // 加载目标
      const target = this.sessions.find(s => s.id === id)
      if (!target) return
      this.activeSessionId = id
      this.messages = [...target.messages]
      this.toolEvents = []
      this.mapPoints = []
      this.viewport = undefined
      this.focusedPoint = undefined
      this.pendingInput = undefined
      saveSessions(this.sessions)
    },

    /** 删除会话 */
    deleteSession(id: string) {
      const idx = this.sessions.findIndex(s => s.id === id)
      if (idx < 0) return
      this.sessions.splice(idx, 1)
      if (this.activeSessionId === id) {
        if (this.sessions.length > 0) {
          this.switchSession(this.sessions[0].id)
        } else {
          const newId = genSessionId()
          this.sessions.push({ id: newId, title: '新对话', createdAt: Date.now(), messages: [] })
          this.activeSessionId = newId
          this.messages = []
          this.toolEvents = []
          this.mapPoints = []
          this.viewport = undefined
          this.focusedPoint = undefined
          this.pendingInput = undefined
        }
      }
      saveSessions(this.sessions)
    },

    /** 清空当前对话（ChatPanel 清空按钮，语义=新建空会话） */
    clear() {
      this.newSession()
    },

    /** 方案 C：设置焦点点位（对话→地图方向，推理面板"在地图查看"调用） */
    setFocusedPoint(point: MapPoint | undefined) {
      this.focusedPoint = point
    },

    /** 方案 C：设置待填入输入框的文本（地图→对话方向，弹窗"询问此点位"调用） */
    setPendingInput(text: string | undefined) {
      this.pendingInput = text
    },

    /** 重新下载指定报告（推理面板按钮调用） */
    downloadReport(report: { filename: string; markdown: string }) {
      triggerDownload(report.filename, report.markdown)
    },
  },
})
