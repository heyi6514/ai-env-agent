import { AIMessageChunk } from '@langchain/core/messages'
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
import { ChatDeepSeek } from '@langchain/deepseek'
import { queryPollutionSources } from './tools/gis'
import { queryAirQuality } from './tools/air'
import { queryWaterQuality } from './tools/water'
import { queryVehicleSensing } from './tools/vehicle'
import { searchKnowledgeBase } from './tools/rag'

const TOOLS = [queryPollutionSources, queryAirQuality, queryWaterQuality, queryVehicleSensing, searchKnowledgeBase]

// 用 string 作为 key 类型，避免工具联合类型导致 invoke 签名不兼容
const TOOL_MAP = new Map<string, (typeof TOOLS)[number]>(TOOLS.map(t => [t.name, t]))

/** Agent 单次提问最多执行的工具轮数，防止模型陷入循环调用 */
const MAX_TOOL_ROUNDS = 5

export interface AgentCallbacks {
  onToken: (content: string) => void
  onToolStart: (id: string, name: string, args: unknown) => void
  onToolEnd: (id: string, name: string, summary: string, sources?: ToolSource[], dataSummary?: string) => void
}

/** 工具返回的命中来源（供前端推理链路展示） */
export interface ToolSource {
  source: string
  page: number | null
  score: number
}

export interface ToolExecution {
  payload: string
  summary: string
  sources?: ToolSource[]
  /** 数据摘要：GIS 工具返回的数据概况，RAG 工具为空 */
  dataSummary?: string
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
    // 工具的 invoke 签名因 zod schema 不同而互不兼容，统一断言为通用调用
    const payload = await (t as unknown as { invoke: (a: unknown) => Promise<string> }).invoke(args)
    let summary = '执行完成'
    let sources: ToolSource[] | undefined
    let dataSummary: string | undefined
    try {
      const parsed = JSON.parse(payload) as { total?: number; sources?: ToolSource[]; dataSummary?: string }
      if (typeof parsed.total === 'number') summary = `返回 ${parsed.total} 条记录`
      if (Array.isArray(parsed.sources)) sources = parsed.sources
      if (typeof parsed.dataSummary === 'string') dataSummary = parsed.dataSummary
    } catch {
      // 非 JSON 结果保持默认 summary
    }
    return { payload, summary, sources, dataSummary }
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

/** 从 chunk 中提取文本 token，处理 string / text 数组两种形态 */
function extractText(chunk: AIMessageChunk): string {
  if (typeof chunk.content === 'string') return chunk.content
  if (Array.isArray(chunk.content)) {
    return chunk.content.map(p => ('text' in p ? p.text : '')).join('')
  }
  return ''
}

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
      const text = extractText(chunk)
      if (text) cb.onToken(text)
      chunks.push(chunk)
    }

    if (chunks.length === 0) return
    const merged = chunks.reduce((a, b) => a.concat(b))
    const toolCalls = merged.tool_calls?.length ? merged.tool_calls : undefined

    // 模型直接返回文本回答，无工具调用 → 结束
    if (!toolCalls) return

    // 有工具调用：追加 AIMessage(tool_calls) 占位，逐个执行工具并追加 ToolMessage
    current = [...current, merged as AIMessage]
    for (const tc of toolCalls) {
      const id = tc.id ?? `call_${round}_${Math.random().toString(36).slice(2, 8)}`
      cb.onToolStart(id, tc.name, tc.args)
      const { payload, summary, sources, dataSummary } = await executeTool(tc.name, tc.args as Record<string, unknown>)
      cb.onToolEnd(id, tc.name, summary, sources, dataSummary)
      current = [...current, new ToolMessage({ content: payload, tool_call_id: id })]
    }
  }

  // 达到最大轮数后，若末尾仍是 ToolMessage（工具已执行但模型还没来得及总结），
  // 再请求一次模型生成最终文字回答，避免用户只看到工具执行却没有结论。
  if (current.length > 0 && current[current.length - 1] instanceof ToolMessage) {
    const stream = await model.stream(current, { signal })
    for await (const chunk of stream) {
      const text = extractText(chunk)
      if (text) cb.onToken(text)
    }
  }
}
