import { AIMessageChunk } from '@langchain/core/messages'
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
import { ChatDeepSeek } from '@langchain/deepseek'
import { queryPollutionSources } from './tools/gis'
import { queryAirQuality } from './tools/air'
import { queryWaterQuality } from './tools/water'
import { queryVehicleSensing } from './tools/vehicle'

const TOOLS = [queryPollutionSources, queryAirQuality, queryWaterQuality, queryVehicleSensing]

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]))

/** Agent 单次提问最多执行的工具轮数，防止模型陷入循环调用 */
const MAX_TOOL_ROUNDS = 5

export interface AgentCallbacks {
  onToken: (content: string) => void
  onToolStart: (id: string, name: string, args: unknown) => void
  onToolEnd: (id: string, name: string, summary: string) => void
}

export interface ToolExecution {
  payload: string
  summary: string
}

function createModel() {
  return new ChatDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    // 工具调用需要确定性输出，temperature 固定 0
    temperature: 0,
    // deepseek-flash 默认开启思考模式，会拖慢首 token 且与流式工具调用不兼容，显式关闭
    modelKwargs: { thinking: { type: 'disabled' } },
  }).bindTools(TOOLS)
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecution> {
  const t = TOOL_MAP.get(name)
  if (!t) {
    return { payload: `未知工具：${name}`, summary: '未知工具' }
  }
  try {
    const payload = await t.invoke(args)
    let summary = '执行完成'
    try {
      const parsed = JSON.parse(payload) as { total?: number }
      if (typeof parsed.total === 'number') summary = `返回 ${parsed.total} 条记录`
    } catch {
      // 非 JSON 结果保持默认 summary
    }
    return { payload, summary }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { payload: `工具执行失败：${msg}`, summary: '执行失败' }
  }
}

/**
 * 手写 tool-calling Agent 循环：
 *   stream 输出 → 无 tool_calls 则结束；有则执行工具、追加 ToolMessage、进入下一轮。
 * 本质等价于 while (finish_reason === 'tool_calls')，相比 AgentExecutor
 * 去掉了 deprecated 封装，事件时序完全可控，便于 SSE 桥接与 Day 4 推理链路展示。
 */
export async function runAgent(
  messages: BaseMessage[],
  cb: AgentCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const model = createModel()
  let current = messages

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await model.stream(current, { signal })
    const chunks: AIMessageChunk[] = []

    for await (const chunk of stream) {
      if (typeof chunk.content === 'string' && chunk.content) {
        cb.onToken(chunk.content)
      } else if (Array.isArray(chunk.content)) {
        // 兼容多段 content（文本块数组）
        const text = chunk.content.map(p => ('text' in p ? p.text : '')).join('')
        if (text) cb.onToken(text)
      }
      chunks.push(chunk)
    }

    if (chunks.length === 0) return
    const merged = chunks.reduce((a, b) => a.concat(b))
    const toolCalls = merged.tool_calls?.length ? merged.tool_calls : undefined

    if (!toolCalls) return

    // 先发占位 AIMessage（含 tool_calls），再逐个执行工具并追加 ToolMessage
    current = [...current, merged as AIMessage]
    for (const tc of toolCalls) {
      const id = tc.id ?? `call_${round}_${Math.random().toString(36).slice(2, 8)}`
      cb.onToolStart(id, tc.name, tc.args)
      const { payload, summary } = await executeTool(tc.name, tc.args as Record<string, unknown>)
      cb.onToolEnd(id, tc.name, summary)
      current = [...current, new ToolMessage({ content: payload, tool_call_id: id })]
    }
  }
}
