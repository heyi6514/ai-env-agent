/**
 * 硅基流动 BGE 中文 embedding 封装。
 * 硅基流动提供 OpenAI 兼容的 embeddings 接口，直接用 Node 内置 fetch 调用，
 * 不引入 @langchain/openai 额外依赖，与项目「去封装、可控」风格一致。
 *
 * 模型：BAAI/bge-large-zh-v1.5，1024 维，对中文法规文本效果好。
 * 文档：https://docs.siliconflow.cn/api-reference/embeddings/create-embeddings
 *
 * ⚠️ BGE 模型重要特性：
 *   - 文档入库：直接对原文做 embedding，不加前缀
 *   - 检索查询：必须加前缀「为这个句子生成表示以用于检索相关文章：」，
 *     否则中文检索效果会显著下降（BGE 官方要求）
 */

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'
const EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5'

/** bge-large-zh-v1.5 输出维度，建 Pinecone index 时 dimension 必须填这个值 */
export const EMBEDDING_DIMENSION = 1024

/** BGE 中文查询前缀，检索时必须加在 query 前面 */
const QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：'

/** 单次批量 embedding 上限（硅基流动接口限制） */
const BATCH_SIZE = 32

/** 批量调用间的间隔（ms），避免触发 QPS 限制 */
const BATCH_INTERVAL_MS = 200

/** 重试配置：对 5xx/429 等瞬时错误重试，指数退避 */
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[]
}

function getApiKey(): string {
  const key = process.env.EMBEDDING_API_KEY
  if (!key) throw new Error('EMBEDDING_API_KEY 未配置')
  return key
}

/** 判断是否为可重试的瞬时错误 */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

/** 带重试的 fetch，对 429/5xx 指数退避重试 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok || !isRetryable(res.status)) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      // 网络错误（ECONNRESET 等）也重试
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
    // 最后一次不等待
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr ?? new Error('embedding 请求失败')
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetchWithRetry(`${SILICONFLOW_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`embedding 接口 ${res.status}: ${body}`)
  }
  const json = (await res.json()) as EmbeddingResponse
  // 按 index 排序，保证返回顺序与入参一致
  json.data.sort((a, b) => a.index - b.index)
  return json.data.map(d => d.embedding)
}

/**
 * 批量 embedding（用于文档入库，不加前缀）。
 * 自动按 BATCH_SIZE 分片 + 限速调用，返回的向量数组与入参 texts 一一对应。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const result: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const vectors = await embedBatch(batch)
    result.push(...vectors)
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, BATCH_INTERVAL_MS))
    }
  }
  return result
}

/**
 * 查询语句 embedding（加 BGE 中文前缀）。
 * 语义检索时必须用此函数，不能直接用 embedBatch。
 */
export async function embedQuery(query: string): Promise<number[]> {
  const [v] = await embedBatch([QUERY_PREFIX + query])
  return v
}
