import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getAirSnapshot } from '../../data/mock-monitoring'

export interface AirQueryResult {
  total: number
  items: ReturnType<typeof getAirSnapshot>
  /** 数据摘要，供前端推理链路展示数据概况 */
  dataSummary: string
}

function buildSummary(list: ReturnType<typeof getAirSnapshot>): string {
  if (list.length === 0) return '无匹配监测站'
  const aqiVals = list.map(s => s.aqi)
  const minAqi = Math.min(...aqiVals)
  const maxAqi = Math.max(...aqiVals)
  // 等级分布
  const levelCount: Record<string, number> = {}
  for (const s of list) levelCount[s.level] = (levelCount[s.level] ?? 0) + 1
  const levelStr = Object.entries(levelCount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join('、')
  // 首要污染物
  const pollutantCount: Record<string, number> = {}
  for (const s of list) {
    if (s.primaryPollutant && s.primaryPollutant !== '—') {
      pollutantCount[s.primaryPollutant] = (pollutantCount[s.primaryPollutant] ?? 0) + 1
    }
  }
  const topPollutants = Object.entries(pollutantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join('、')
  return `${list.length}个监测站，AQI ${minAqi}~${maxAqi}，等级：${levelStr}，首要污染物：${topPollutants || '无'}`
}

/**
 * 环境空气质量（AQI 监测站）查询工具。
 * 注意与 query_pollution_sources（企业污染源废气排放）区分：本工具查的是区域环境空气质量，
 * 用户问"空气好不好/AQI 多少/今天空气质量"时选本工具；问"企业废气排放"时选前者。
 */
export const queryAirQuality = tool(
  ({ area, level, keyword }) => {
    let list = [...getAirSnapshot()]
    if (area) list = list.filter(s => s.area.includes(area.replace(/[镇区旗县]/g, '')) || s.area === area)
    if (level) list = list.filter(s => s.level === level)
    if (keyword) {
      const k = keyword.toLowerCase()
      list = list.filter(
        s =>
          s.siteName.toLowerCase().includes(k) ||
          s.primaryPollutant.toLowerCase().includes(k)
      )
    }
    const result: AirQueryResult = { total: list.length, items: list, dataSummary: buildSummary(list) }
    return JSON.stringify(result)
  },
  {
    name: 'query_air_quality',
    description:
      '查询辖区环境空气质量监测站（AQI）实时数据，包括 AQI 指数、六参数浓度、首要污染物与空气质量等级（优/良/轻度污染等）。当用户问某区域空气质量如何、AQI 多少、有没有污染天气时必须调用本工具。注意：本工具查的是环境空气（监测站），不是企业废气排放——问企业废气排放请用 query_pollution_sources。',
    schema: z.object({
      area: z.string().optional().describe('区域/乡镇名称，如：薛家湾镇、沙圪堵镇'),
      level: z
        .enum(['优', '良', '轻度污染', '中度污染', '重度污染'])
        .optional()
        .describe('空气质量等级筛选'),
      keyword: z.string().optional().describe('站点名称或首要污染物关键字'),
    }),
  },
)
