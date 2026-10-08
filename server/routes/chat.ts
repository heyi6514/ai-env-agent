import { Router } from 'express'

const router = Router()

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 服务端注入 system prompt，而非前端拼接，防止被伪造；
// 「不要编造数据」约束用来在工具未接入前防幻觉（Day 2 接入 tools 后再调整声明）
const SYSTEM_PROMPT = `你是「环保智能监管工作台」的内置 AI 助手，服务于基层生态环境执法与监管人员。

工作台介绍：本平台是面向旗县级生态环境部门的一站式智能监管系统，核心功能包括：
1. AI 对话问答（当前对话窗口）
2. Agent 推理链路可视化展示
3. 污染源 GIS 地图（基于天地图，展示废气/废水/固废等污染源分布）
4. 环保法规知识库检索（RAG）
5. 污染源数据查询与执法报告生成

当前可用能力：环保法规解读、监管业务咨询、通用环保知识问答。污染源数据查询、文档上传与报告生成功能即将上线；当用户要求查询具体企业/监测点数据时，请说明该功能正在接入中，严禁编造具体企业名称、监测数值或法规条款编号。

回答要求：使用简体中文，专业、简洁、条理化，善用 Markdown 列表与表格；面向执法场景，结论先行；不确定的内容明确说明，不臆测。`

router.post('/chat', async (req, res) => {
  const { messages } = req.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ message: 'messages 不能为空' })
    return
  }

  // 只保留 user/assistant 文本消息：防止客户端伪造 system 角色覆盖服务端人设
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
  // 注意：不能监听 req 的 close —— express.json() 消费完 body 后它会立即触发，
  // 导致上游请求刚发出就被 abort。res 的 close 配合 writableEnded 才是可靠判断。
  const upstream = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) upstream.abort()
  })

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
        // deepseek-flash 默认开启思考模式，会先输出 reasoning_content，导致打字机前段空白，这里显式关闭
        thinking: { type: 'disabled' },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        stream: true,
      }),
      signal: upstream.signal,
    })

    if (!resp.ok || !resp.body) {
      const detail = await resp.text()
      send('error', { message: `DeepSeek ${resp.status}: ${detail.slice(0, 200)}` })
      send('done', {})
      return
    }

    // 逐块读取上游 SSE，解析 data: 行后转发为自定义事件
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const chunk = JSON.parse(payload)
          const content: string | undefined = chunk.choices?.[0]?.delta?.content
          if (content) send('message', { content })
        } catch {
          // 忽略无法解析的行（如 keep-alive 注释）
        }
      }
    }

    send('done', {})
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      send('error', { message: err instanceof Error ? err.message : '服务异常' })
      send('done', {})
    }
  } finally {
    if (!res.writableEnded) res.end()
  }
})

export default router
