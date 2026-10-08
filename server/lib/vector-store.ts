/**
 * Pinecone 向量库封装。
 * 暴露两个核心方法：upsertChunks（文本入库）、queryChunks（语义检索）。
 * 内部调用 embedding.ts 生成向量，调用方只需关心文本。
 *
 * 选用 @pinecone-database/pinecone 原生 SDK 而非 @langchain/pinecone，
 * 与项目「手写循环、去封装」风格一致，面试可讲清每一步。
 */
import { Pinecone, type PineconeRecord } from '@pinecone-database/pinecone'
import { embedQuery, embedTexts } from './embedding'

/** 待入库的文本块 */
export interface Chunk {
  /** 唯一 ID，建议 `${source}:${chunkIndex}` */
  id: string
  /** 分块文本 */
  text: string
  /** 元数据（值只能是 string/number/boolean，Pinecone 限制） */
  metadata: {
    source: string
    chunkIndex: number
    page?: number
  }
}

/** 检索结果 */
export interface QueryResult {
  id: string
  text: string
  score: number
  source: string
  chunkIndex: number
  page?: number
}

/** 文档汇总信息 */
export interface DocumentInfo {
  /** 文档唯一标识（时间戳，Pinecone vector ID 前缀） */
  docId: string
  /** 原始文件名，供展示 */
  source: string
  /** 分块数 */
  chunks: number
  /** 页数（仅 PDF 有） */
  pages?: number
  /** 上传时间（由 docId 时间戳转换） */
  uploadedAt: string
}

const DEFAULT_TOP_K = 4

let client: Pinecone | null = null

function getClient(): Pinecone {
  if (!client) {
    const apiKey = process.env.PINECONE_API_KEY
    if (!apiKey) throw new Error('PINECONE_API_KEY 未配置')
    client = new Pinecone({ apiKey })
  }
  return client
}

function getIndexName(): string {
  const name = process.env.PINECONE_INDEX
  if (!name) throw new Error('PINECONE_INDEX 未配置')
  return name
}

/**
 * 批量入库：文本 → embedding → Pinecone upsert。
 * 自动按 embedding 批次分片，Pinecone upsert 单次最多 1000 条，
 * 此处每批不超过 embedding 的 BATCH_SIZE（32），简化流程。
 */
export async function upsertChunks(chunks: Chunk[]): Promise<number> {
  if (chunks.length === 0) return 0

  const index = getClient().Index(getIndexName())
  let inserted = 0

  for (let i = 0; i < chunks.length; i += 32) {
    const batch = chunks.slice(i, i + 32)
    const vectors = await embedTexts(batch.map(c => c.text))

    const records: PineconeRecord[] = batch.map((c, idx) => ({
      id: c.id,
      values: vectors[idx],
      metadata: {
        text: c.text,
        source: c.metadata.source,
        chunkIndex: c.metadata.chunkIndex,
        ...(c.metadata.page != null ? { page: c.metadata.page } : {}),
      },
    }))

    // Pinecone v9 upsert 签名：{ records: PineconeRecord[] }，不再直接传数组
    await index.upsert({ records })
    inserted += records.length
  }

  return inserted
}

/**
 * 语义检索：query → embedding → Pinecone query → 返回带原文的结果。
 * 默认 topK=4（plan.md 硬编码参数，不做调优面板）。
 */
export async function queryChunks(
  query: string,
  topK = DEFAULT_TOP_K,
): Promise<QueryResult[]> {
  const vector = await embedQuery(query)
  const index = getClient().Index(getIndexName())

  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
  })

  return (res.matches ?? []).map(m => ({
    id: m.id,
    score: m.score ?? 0,
    text: (m.metadata?.text as string) ?? '',
    source: (m.metadata?.source as string) ?? '',
    chunkIndex: Number(m.metadata?.chunkIndex ?? 0),
    page: m.metadata?.page != null ? Number(m.metadata.page) : undefined,
  }))
}

/**
 * 列出知识库中所有文档（按 docId 分组汇总）。
 * 实现：listPaginated 拿全部 ID → fetch 批量拿 metadata → 按 docId 聚合 chunk 数和页数。
 * Pinecone 免费档记录数有限，全量拉取可接受。
 */
export async function listDocuments(): Promise<DocumentInfo[]> {
  const index = getClient().Index(getIndexName())

  // 1. 分页拿所有 ID
  const allIds: string[] = []
  let paginationToken: string | undefined
  do {
    const page = await index.listPaginated({
      prefix: '',
      limit: 100,
      ...(paginationToken ? { paginationToken } : {}),
    })
    const vectors = page.vectors ?? []
    allIds.push(...vectors.map(v => v.id).filter((id): id is string => !!id))
    paginationToken = page.pagination?.next
  } while (paginationToken)

  if (allIds.length === 0) return []

  // 2. 批量 fetch 拿 metadata（单次最多 1000 个 ID）
  //    按 docId（vector ID 中冒号前的部分）分组，docId 即上传时间戳
  const docMap = new Map<string, { source: string; chunks: number; pages: Set<number> }>()
  for (let i = 0; i < allIds.length; i += 1000) {
    const batch = allIds.slice(i, i + 1000)
    const { records } = await index.fetch({ ids: batch })
    for (const id of batch) {
      const rec = records[id]
      if (!rec?.metadata) continue
      // vector ID 格式为 ${docId}:${chunkIndex}，docId 即上传时间戳
      const docId = id.split(':')[0] ?? id
      const source = (rec.metadata.source as string) ?? '(未知)'
      const entry = docMap.get(docId) ?? { source, chunks: 0, pages: new Set<number>() }
      entry.chunks += 1
      if (rec.metadata.page != null) entry.pages.add(Number(rec.metadata.page))
      docMap.set(docId, entry)
    }
  }

  // 3. 转为数组，按上传时间倒序（最新的在前）
  return Array.from(docMap.entries())
    .map(([docId, info]) => {
      // docId 格式为 `${timestamp}_${random}`，取下划线前的时间戳
      const ts = Number(docId.split('_')[0])
      const uploadedAt = Number.isNaN(ts) ? '未知' : new Date(ts).toLocaleString('zh-CN')
      return {
        docId,
        source: info.source,
        chunks: info.chunks,
        pages: info.pages.size > 0 ? info.pages.size : undefined,
        uploadedAt,
      }
    })
    .sort((a, b) => {
      const ta = Number(a.docId.split('_')[0])
      const tb = Number(b.docId.split('_')[0])
      // 非时间戳的旧记录排到最后
      if (Number.isNaN(ta) && Number.isNaN(tb)) return a.source.localeCompare(b.source, 'zh-CN')
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return tb - ta
    })
}

/**
 * 按 docId 删除某文档的所有向量。
 * vector ID 格式为 ${docId}:${chunkIndex}，列出所有以 ${docId}: 开头的 ID 后批量删除。
 * @returns 删除的向量条数
 */
export async function deleteByDocId(docId: string): Promise<number> {
  const index = getClient().Index(getIndexName())

  // 1. 列出所有 ID，筛选属于该 docId 的
  const targetIds: string[] = []
  let paginationToken: string | undefined
  const prefix = `${docId}:`
  do {
    const page = await index.listPaginated({
      prefix,
      limit: 100,
      ...(paginationToken ? { paginationToken } : {}),
    })
    const vectors = page.vectors ?? []
    targetIds.push(...vectors.map(v => v.id).filter((id): id is string => !!id))
    paginationToken = page.pagination?.next
  } while (paginationToken)

  if (targetIds.length === 0) return 0

  // 2. 批量删除（每次最多 1000 个 ID）
  for (let i = 0; i < targetIds.length; i += 1000) {
    await index.deleteMany({ ids: targetIds.slice(i, i + 1000) })
  }

  return targetIds.length
}
