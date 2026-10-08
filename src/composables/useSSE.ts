export interface ToolSource {
  source: string
  page: number | null
  score: number
}

export interface SSEHandlers {
  onMessage: (content: string) => void
  onError?: (message: string) => void
  onDone?: () => void
  /** Day 2：Agent 工具调用事件（推理链路展示用） */
  onToolStart?: (id: string, name: string, args: unknown) => void
  onToolEnd?: (id: string, name: string, summary: string, sources?: ToolSource[], dataSummary?: string) => void
}

/**
 * POST 方式消费 SSE 流。
 * 不用 EventSource：它只支持 GET、不能携带 JSON body，对话接口必须 POST 历史消息。
 */
export async function fetchSSE(
  url: string,
  body: unknown,
  handlers: SSEHandlers,
  signal?: AbortSignal
): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok || !resp.body) {
    handlers.onError?.(`请求失败：HTTP ${resp.status}`)
    handlers.onDone?.()
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 事件以空行分隔
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try {
        const payload = JSON.parse(data)
        if (event === 'message') handlers.onMessage(payload.content ?? '')
        else if (event === 'error') handlers.onError?.(payload.message ?? '未知错误')
        else if (event === 'done') finished = true
        else if (event === 'tool_start')
          handlers.onToolStart?.(payload.id, payload.name, payload.args)
        else if (event === 'tool_end')
          handlers.onToolEnd?.(payload.id, payload.name, payload.summary, payload.sources, payload.dataSummary)
      } catch {
        // 忽略非法 JSON 块
      }
    }
  }

  handlers.onDone?.()
}
