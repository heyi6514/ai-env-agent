import { Router } from 'express'

const router = Router()

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

router.post('/chat', async (req, res) => {
  const { messages } = req.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0) {
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
        messages: messages as ChatMessage[],
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
