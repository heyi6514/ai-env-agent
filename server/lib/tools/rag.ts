import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { queryChunks } from '../vector-store'

/**
 * 法规知识库检索工具（RAG）。
 * 入参 query → embedding → Pinecone 检索 TopK → 格式化返回带来源的原文片段。
 *
 * 返回 JSON 格式：{ total, content }
 *   - total：命中条数，供 agent.ts 生成 summary（如"返回 4 条法规片段"）
 *   - content：格式化的原文片段，供 LLM 回答时引用来源
 *   - sources：命中的文件名+页码，供前端推理链路展示
 */

/**
 * 相似度阈值：低于此值的结果过滤掉。
 * BGE-large-zh-v1.5 相关文档分数常在 0.2-0.5 区间，0.3 阈值偏高会漏召回，
 * 调低到 0.15 宁可多召回也不漏掉相关法规片段。
 */
const SIMILARITY_THRESHOLD = 0.15

export const searchKnowledgeBase = tool(
  async ({ query }) => {
    const results = await queryChunks(query, 4)

    // 过滤低相似度结果
    const relevant = results.filter(r => r.score >= SIMILARITY_THRESHOLD)

    if (relevant.length === 0) {
      // 诊断信息：原始命中数 + 最高分，帮助区分「知识库空」和「相似度不够」
      const maxScore = results.length > 0 ? Math.max(...results.map(r => r.score)) : 0
      const topSource = results.length > 0 ? results[0].source : '无'
      return JSON.stringify({
        total: 0,
        content: `知识库中未检索到相似度足够的相关内容。诊断：原始命中 ${results.length} 条，最高分 ${maxScore.toFixed(3)}（来源 ${topSource}），阈值 ${SIMILARITY_THRESHOLD}。若命中数为 0 说明知识库暂无相关文档，请上传对应法规文件。`,
      })
    }

    const lines = relevant.map((r, i) => {
      const page = r.page ? `第${r.page}页` : ''
      const tag = `[${i + 1}] 来源: ${r.source}${page ? ' ' + page : ''}（相似度 ${r.score.toFixed(3)}）`
      return `${tag}\n${r.text}`
    })

    const content = `以下是从环保法规知识库检索到的相关内容，请基于这些内容回答用户问题，引用时标注来源编号：\n\n${lines.join('\n\n')}`

    // sources 供前端推理链路展示命中的文件名+页码，体现 RAG 可解释性
    const sources = relevant.map(r => ({
      source: r.source,
      page: r.page ?? null,
      score: Number(r.score.toFixed(3)),
    }))

    return JSON.stringify({ total: relevant.length, content, sources })
  },
  {
    name: 'search_knowledge_base',
    description:
      '检索环保法规知识库。当用户询问环保法律法规、排放标准限值、政策条款、处罚依据等问题时，必须调用本工具获取原文依据，严禁凭记忆编造法规编号或限值数据。返回结果包含来源文件名与原文片段。',
    schema: z.object({
      query: z.string().describe('要检索的法规/政策/标准关键词，如：SO2排放标准限值、水污染处罚'),
    }),
  },
)
