/**
 * 文档解析与分块工具。
 * - PDF：unpdf 提取每页文本
 * - MD/TXT：直接读取，无页码
 * - 分块：RecursiveCharacterTextSplitter（chunkSize=500, overlap=50）
 *
 * 页码保留策略：
 *   将所有页文本拼接为全文，记录每页在全文中的起始字符偏移；
 *   分块器返回每个 chunk 在全文中的起始偏移，直接用偏移二分查页码。
 *   相比 indexOf 定位，偏移法不受重叠文本/重复段落干扰，页码映射准确。
 */
import { extractText } from 'unpdf'
import { recursiveSplitText, type TextChunk } from './text-splitter'
import type { Chunk } from './vector-store'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50

/** 单页文本 */
interface PageText {
  page: number
  text: string
}

/**
 * 解析 PDF，返回每页文本（带页码）。
 * unpdf 的 extractText 在 mergePages=false 时返回 string[]，索引即页码（从 0 开始）。
 */
export async function parsePdf(buffer: Buffer): Promise<PageText[]> {
  // unpdf 要求 Uint8Array，Node Buffer 虽是子类但被严格类型检查拦截，需显式转换
  const res = await extractText(new Uint8Array(buffer), { mergePages: false })
  return res.text.map((text, i) => ({ page: i + 1, text: text || '' }))
}

/**
 * 将分块结果映射回页码。
 * 分块器已返回每个 chunk 在全文中的起始偏移，直接用偏移二分查页码表，
 * 避免 indexOf 在重叠文本或重复段落中定位错误。
 *
 * @param docId 纯 ASCII 的文档唯一标识（用于生成 Pinecone vector ID）
 * @param source 原始文件名（存入 metadata，供展示，可含中文）
 */
function mapChunksToPages(
  pages: PageText[],
  chunks: TextChunk[],
  docId: string,
  source: string,
): Chunk[] {
  // 拼接全文，记录每页起始偏移
  const pageOffsets: number[] = []
  let fullText = ''
  for (const p of pages) {
    pageOffsets.push(fullText.length)
    fullText += p.text + '\n'
  }

  // 二分查找：给定字符偏移，返回所属页码
  const findPage = (offset: number): number => {
    let lo = 0
    let hi = pageOffsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (pageOffsets[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return pages[lo]?.page ?? 1
  }

  return chunks
    .filter(c => c.text.trim().length > 0) // 过滤空白 chunk（扫描版 PDF 提取出空文本）
    .map((chunk, i) => ({
      id: `${docId}:${i}`,
      text: chunk.text,
      metadata: { source, chunkIndex: i, page: findPage(chunk.offset) },
    }))
}

/**
 * 文档分块入口：
 * - PDF：解析每页 → 拼接 → 分块 → 映射页码
 * - 纯文本（MD/TXT）：直接分块，无页码
 *
 * @param docId 纯 ASCII 文档标识，用于 Pinecone vector ID（Pinecone 要求 ID 必须 ASCII）
 * @param source 原始文件名，存入 metadata 供展示（可含中文）
 */
export async function splitDocument(
  content: string | PageText[],
  docId: string,
  source: string,
): Promise<Chunk[]> {
  // PDF：带页码
  if (Array.isArray(content)) {
    const fullText = content.map(p => p.text).join('\n')
    const chunks = recursiveSplitText(fullText, { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
    return mapChunksToPages(content, chunks, docId, source)
  }

  // 纯文本：无页码
  const chunks = recursiveSplitText(content, { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
  return chunks
    .filter(c => c.text.trim().length > 0)
    .map((chunk, i) => ({
      id: `${docId}:${i}`,
      text: chunk.text,
      metadata: { source, chunkIndex: i },
    }))
}
