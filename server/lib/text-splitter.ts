/**
 * 简化版递归字符分块器（RecursiveCharacterTextSplitter 的精简实现）。
 * 不依赖 @langchain/textsplitters，自己实现核心逻辑，面试可讲清分块原理。
 *
 * 算法：
 *   1. 按分隔符优先级列表递归切分：\n\n → \n → 。！？ → ，； → 空格 → 字符
 *   2. 每段若 ≤ chunkSize 直接保留；否则用下一级分隔符继续切
 *   3. 相邻 chunk 之间保留 overlap 个字符的重叠，避免语义被切断
 *   4. 切到字符级仍超长的 chunk，硬切（兜底）
 *
 * 每个分块返回 startOffset（在原始文本中的起始字符偏移），
 * 用于 document.ts 精确映射页码，避免 indexOf 在重叠文本中定位错误。
 */

/** 中文友好的分隔符优先级（从粗到细） */
const SEPARATORS = ['\n\n', '\n', '。', '！', '？', '，', '；', ' ', '']

export interface SplitOptions {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string[]
}

/** 带起始偏移的文本分块 */
export interface TextChunk {
  text: string
  offset: number
}

interface Segment {
  text: string
  offset: number
}

function mergeSplits(splits: Segment[], separator: string, chunkSize: number, overlap: number): TextChunk[] {
  const docs: TextChunk[] = []
  let current: Segment[] = []
  let total = 0

  for (const d of splits) {
    const len = d.text.length
    // 当前累积 + 新段 + 分隔符 超过 chunkSize → 先把 current 合并输出
    if (total + len + (current.length ? separator.length : 0) > chunkSize && current.length > 0) {
      const text = current.map(s => s.text).join(separator)
      if (text.length > 0) {
        // merged chunk 的起始偏移 = current 中第一个 segment 的偏移
        docs.push({ text, offset: current[0].offset })
      }
      // 保留尾部 overlap 字符作为下一个 chunk 的前缀
      while (current.length > 0 && total > overlap) {
        const removed = current.shift()!
        total -= removed.text.length + separator.length
      }
    }
    current.push(d)
    total += len + separator.length
  }

  // 处理最后一段
  if (current.length > 0) {
    const text = current.map(s => s.text).join(separator)
    if (text.length > 0) {
      docs.push({ text, offset: current[0].offset })
    }
  }

  return docs
}

function splitText(
  text: string,
  startOffset: number,
  separators: string[],
  chunkSize: number,
  overlap: number,
): TextChunk[] {
  // 取当前优先级最高的分隔符
  const separator = separators[0]
  const rawSplits = separator ? text.split(separator) : text.split('')

  // 计算每个切分段在原始文本中的起始偏移
  let cursor = startOffset
  const splits: Segment[] = rawSplits.map(s => {
    const seg: Segment = { text: s, offset: cursor }
    cursor += s.length + separator.length
    return seg
  })

  const goodSplits: Segment[] = []
  const merged: TextChunk[] = []

  for (const s of splits) {
    if (s.text.length < chunkSize) {
      goodSplits.push(s)
    } else {
      // 这段还是太长，先用已收集的 goodSplits 合并一批，再递归切这段
      if (goodSplits.length > 0) {
        merged.push(...mergeSplits(goodSplits, separator, chunkSize, overlap))
        goodSplits.length = 0
      }
      if (separators.length > 1) {
        // 还有更细的分隔符可用，递归
        merged.push(...splitText(s.text, s.offset, separators.slice(1), chunkSize, overlap))
      } else {
        // 已到字符级，硬切兜底。step 至少为 1，防止 overlap >= chunkSize 时死循环
        const step = Math.max(1, chunkSize - overlap)
        for (let i = 0; i < s.text.length; i += step) {
          merged.push({ text: s.text.slice(i, i + chunkSize), offset: s.offset + i })
        }
      }
    }
  }

  if (goodSplits.length > 0) {
    merged.push(...mergeSplits(goodSplits, separator, chunkSize, overlap))
  }

  return merged
}

/**
 * 递归字符分块。
 * @param text 待分块文本
 * @param options chunkSize 默认 500，chunkOverlap 默认 50
 * @returns 带起始偏移的分块数组
 */
export function recursiveSplitText(text: string, options: SplitOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 500
  const overlap = options.chunkOverlap ?? 50
  const separators = options.separators ?? SEPARATORS
  if (chunkSize <= 0) return []
  if (text.length <= chunkSize) return [{ text, offset: 0 }]
  return splitText(text, 0, separators, chunkSize, overlap)
}
