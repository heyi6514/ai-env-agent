import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export interface ReportResult {
  summary: string
  report: {
    filename: string
    markdown: string
  }
}

/** 格式化日期：2026年10月09日 */
function fmtCnDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}年${m}月${d}日`
}

/** 格式化日期时间（纯数字）：202610091430（用于报告编号，符合公文规范） */
function fmtReportNo(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${y}${mo}${d}${h}${mi}`
}

/** 格式化日期时间（带连字符）：20261009-1430（用于文件名，可读性更好） */
function fmtFileDate(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${y}${mo}${d}-${h}${mi}`
}

function buildReport(
  title: string,
  scope: string,
  findings: string[],
  dataSummary: string | undefined,
  suggestion: string,
): { filename: string; markdown: string } {
  const now = new Date()
  const dateCn = fmtCnDate(now)
  const reportNo = fmtReportNo(now)
  const fileDate = fmtFileDate(now)

  const findingsList = findings.length > 0
    ? findings.map((f, i) => `${i + 1}. ${f}`).join('\n')
    : '暂无。'

  const markdown = `# ${title}

**报告编号**：环监检〔${reportNo}〕号
**生成日期**：${dateCn}
**检查范围**：${scope}

---

## 一、检查依据

依据《中华人民共和国环境保护法》《大气污染防治法》《水污染防治法》《固体废物污染环境防治法》等法律法规，对辖区内污染源排放情况开展执法检查。

## 二、数据统计

${dataSummary || '详见检查发现。'}

## 三、检查发现

${findingsList}

## 四、处置建议

${suggestion}

---

**检查人**：环保智能监管工作台 AI 助手
**备注**：本报告由 AI Agent 基于实时监测数据自动生成，仅供执法参考。`

  // 文件名：标题-日期.md，清理文件系统不安全字符
  const safeName = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 50) || '执法检查报告'
  const filename = `${safeName}-${fileDate}.md`

  return { filename, markdown }
}

/**
 * 报告导出工具：将 Agent 多工具查询结果拼装为结构化 Markdown 执法报告。
 * description 明确要求"先调数据工具拿真实数据再生成"，防止 LLM 编造 findings。
 */
export const generateReport = tool(
  ({ title, scope, findings, dataSummary, suggestion }) => {
    const report = buildReport(title, scope, findings, dataSummary, suggestion)
    const result: ReportResult = {
      summary: '报告已生成',
      report,
    }
    return JSON.stringify(result)
  },
  {
    name: 'generate_report',
    description:
      '生成环保执法检查报告（Markdown 格式）并触发前端下载。当用户要求"生成报告""执法报告""检查报告""导出报告"时必须调用本工具。调用时应将前面查询工具返回的真实数据整理为 findings 条目，严禁编造数据。建议先调用 query_pollution_sources / query_air_quality / query_water_quality 等数据工具获取真实数据，再调用本工具生成报告。',
    schema: z.object({
      title: z.string().describe('报告标题，如：沙圪堵镇废气污染源执法检查报告'),
      scope: z.string().describe('检查范围/对象，如：沙圪堵镇辖区内废气排放企业'),
      findings: z
        .array(z.string())
        .min(1)
        .describe('关键发现条目，每条为一句完整描述，来自前面工具返回的真实数据'),
      dataSummary: z
        .string()
        .optional()
        .describe('数据统计摘要，如：共查 8 家企业，超标 3 家'),
      suggestion: z.string().describe('处置建议，基于检查发现给出'),
    }),
  },
)
