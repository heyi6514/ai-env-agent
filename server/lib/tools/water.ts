import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getWaterSnapshot } from '../../data/mock-monitoring'

export interface WaterQueryResult {
  total: number
  items: ReturnType<typeof getWaterSnapshot>
  /** 数据摘要，供前端推理链路展示数据概况 */
  dataSummary: string
}

function buildSummary(list: ReturnType<typeof getWaterSnapshot>): string {
  if (list.length === 0) return '无匹配水质站点'
  const sectionCount = list.filter(s => s.kind === 'section').length
  const drinkingCount = list.filter(s => s.kind === 'drinking').length
  const upToStandard = list.filter(s => s.status === '达标').length
  const overCount = list.length - upToStandard
  // 水质类别分布
  const catCount: Record<string, number> = {}
  for (const s of list) catCount[s.category] = (catCount[s.category] ?? 0) + 1
  const catStr = Object.entries(catCount)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}(${v})`)
    .join('、')
  return `${list.length}个站点（断面${sectionCount}、水源地${drinkingCount}），水质：${catStr}，达标 ${upToStandard}、超标 ${overCount}`
}

/**
 * 水环境质量查询工具：河流断面与饮用水源地合并为一个工具，
 * 用 kind 参数区分两类实体（同属水环境数据域，用户问法常混在一起）。
 * 注意与 query_pollution_sources（企业废水排放口）区分：本工具查的是水环境质量（断面/水源地）。
 */
export const queryWaterQuality = tool(
  ({ kind, river, area, status }) => {
    let list = [...getWaterSnapshot()]
    if (kind) list = list.filter(s => s.kind === kind)
    if (river) list = list.filter(s => s.river.includes(river))
    if (area) list = list.filter(s => s.area.includes(area.replace(/[镇区旗县]/g, '')) || s.area === area)
    if (status) list = list.filter(s => s.status === status)
    const result: WaterQueryResult = { total: list.length, items: list, dataSummary: buildSummary(list) }
    return JSON.stringify(result)
  },
  {
    name: 'query_water_quality',
    description:
      '查询辖区水环境质量数据，包括河流断面水质类别（Ⅰ~劣Ⅴ类、考核目标、超标因子）和饮用水源地水质（是否达标）。当用户问河流水质、断面达标情况、饮用水源地水质时必须调用本工具。注意：本工具查的是水环境质量，不是企业废水排放——问企业废水排放请用 query_pollution_sources。',
    schema: z.object({
      kind: z
        .enum(['section', 'drinking'])
        .optional()
        .describe('实体类型：section=河流断面，drinking=饮用水源地；不传查全部'),
      river: z.string().optional().describe('河流/水体名称，如：黄河、十里长川'),
      area: z.string().optional().describe('区域/乡镇名称'),
      status: z.enum(['达标', '超标']).optional().describe('水质状态筛选'),
    }),
  },
)
