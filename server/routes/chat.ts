import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Router } from 'express'
import { runAgent } from '../lib/agent'

const router = Router()

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 服务端注入 system prompt，而非前端拼接，防止被伪造
const SYSTEM_PROMPT = `你是「环保智能监管工作台」的内置 AI 助手，服务于基层生态环境执法与监管人员。

工作台介绍：本平台是面向旗县级生态环境部门的一站式智能监管系统，核心功能包括：
1. AI 对话问答（当前对话窗口）
2. Agent 推理链路可视化展示
3. 污染源 GIS 地图（基于天地图，展示废气/废水/固废等污染源分布）
4. 环保法规知识库检索（RAG，即将上线）
5. 污染源数据查询与执法报告生成

当前可用工具（按用户问题语义选择，严禁凭记忆编造数据）：
- query_pollution_sources：污染源点位查询（企业废气/废水/固废排放，固定源）
- query_air_quality：环境空气质量监测站（AQI 指数、首要污染物、空气质量等级）
- query_water_quality：水环境质量（河流断面水质类别、饮用水源地达标情况）
- query_vehicle_sensing：机动车遥感监测（移动源，遥测点位超标率、超标车型）
文档检索（RAG）与报告生成功能即将上线，被问及时如实说明。

回答要求：使用简体中文，专业、简洁、条理化，善用 Markdown 列表与表格；面向执法场景，结论先行；数据必须来自工具返回结果，不确定的内容明确说明，不臆测。`

/** 单次请求整体超时（含多轮工具调用） */
const REQUEST_TIMEOUT_MS = 60_000

router.post('/chat', async (req, res) => {
  const { messages } = req.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ message: 'messages 不能为空' })
    return
  }

  // 只保留 user/assistant 文本消息：防止客户端伪造 system/工具消息
  const history = (messages as ChatMessage[]).filter(
    m =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim() !== ''
  )
  if (history.length === 0) {
    res.status(400).json({ message: 'messages 不能为空' })
    return
  }

  // SSE 响应头三件套 + 关闭 nginx 缓冲（部署阶段用）
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // 客户端中途断开时中止上游请求。
  // 不能监听 req 的 close —— express.json() 消费完 body 后它会立即触发；
  // res 的 close 配合 writableEnded 才是可靠判断。
  const upstream = new AbortController()
  let closed = false
  res.on('close', () => {
    if (!res.writableEnded) {
      closed = true
      upstream.abort()
    }
  })

  // 60s 整体超时：abort 时通过 closed 标志区分"客户端断开"与"服务端超时"
  const timer = setTimeout(() => upstream.abort(), REQUEST_TIMEOUT_MS)

  try {
    const baseMessages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...history.map(m =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
      ),
    ]

    await runAgent(
      baseMessages,
      {
        onToken: content => send('message', { content }),
        onToolStart: (id, name, args) => send('tool_start', { id, name, args }),
        onToolEnd: (id, name, summary) => send('tool_end', { id, name, summary }),
      },
      upstream.signal
    )

    send('done', {})
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('[chat] agent error:', err)
      send('error', { message: err instanceof Error ? err.message : '服务异常' })
      send('done', {})
    } else if (!closed) {
      // 非客户端断开的 abort = 60s 超时
      send('error', { message: '请求超时，请重试或缩小提问范围' })
      send('done', {})
    }
  } finally {
    clearTimeout(timer)
    if (!res.writableEnded) res.end()
  }
})

export default router
