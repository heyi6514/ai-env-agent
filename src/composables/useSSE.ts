export interface ToolSource {
  source: string
  page: number | null
  score: number
}

/** 地图点位（Day 4 协议，Day 6 由 OpenLayers 渲染）。
 *  type 枚举覆盖 6 类点位，决定 Day 6 图标分组与状态色：
 *  air/water/solid=企业污染源（固定源），airStation/waterStation=环境质量监测站，vehicle=机动车遥测点 */
export interface MapPoint {
  id: string
  name: string
  type: 'air' | 'water' | 'solid' | 'airStation' | 'waterStation' | 'vehicle'
  status: '正常' | '超标'
  lon: number
  lat: number
  /** 弹窗内容（一行摘要），Day 6 Overlay 使用 */
  detail?: string
}

/** map_render 事件载荷：toolId + 点位 + 视口 bounding box [minLon, minLat, maxLon, maxLat] */
export interface MapRenderData {
  /** 产生这批点位的工具调用 ID，用于推理面板"在地图查看"按钮关联 */
  id: string
  points: MapPoint[]
  /** 视口 bounding box，空数组点位时不发本字段 */
  viewport?: [number, number, number, number]
}

export interface SSEHandlers {
  onMessage: (content: string) => void
  onError?: (message: string) => void
  onDone?: () => void
  /** Day 2：Agent 工具调用事件（推理链路展示用） */
  onToolStart?: (id: string, name: string, args: unknown) => void
  onToolEnd?: (id: string, name: string, summary: string, sources?: ToolSource[], dataSummary?: string) => void
  /** Day 4：报告工具生成后触发下载 */
  onReport?: (id: string, filename: string, markdown: string) => void
  /** Day 4：工具返回带坐标点位时触发，前端地图联动渲染。
   *  Day 5：增加 toolId 参数，用于推理面板关联点位与工具步骤 */
  onMapRender?: (toolId: string, data: MapRenderData) => void
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
        else if (event === 'report')
          handlers.onReport?.(payload.id, payload.filename, payload.markdown)
        else if (event === 'map_render') handlers.onMapRender?.(payload.id, payload as MapRenderData)
      } catch {
        // 忽略非法 JSON 块
      }
    }
  }

  handlers.onDone?.()
}
