import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getVehicleSnapshot } from '../../data/mock-monitoring'

export interface VehicleQueryResult {
  total: number
  items: ReturnType<typeof getVehicleSnapshot>
  /** 数据摘要，供前端推理链路展示数据概况 */
  dataSummary: string
}

function buildSummary(list: ReturnType<typeof getVehicleSnapshot>): string {
  if (list.length === 0) return '无匹配遥测点位'
  const totalTested = list.reduce((sum, s) => sum + s.tested, 0)
  const totalExceeded = list.reduce((sum, s) => sum + s.exceeded, 0)
  const avgRate = totalTested > 0 ? ((totalExceeded / totalTested) * 100).toFixed(1) : '0'
  // 主要超标车型
  const vehicleCount: Record<string, number> = {}
  for (const s of list) {
    if (s.mainVehicleType) vehicleCount[s.mainVehicleType] = (vehicleCount[s.mainVehicleType] ?? 0) + 1
  }
  const topVehicles = Object.entries(vehicleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join('、')
  return `${list.length}个点位，检测 ${totalTested} 辆，超标 ${totalExceeded} 辆，平均超标率 ${avgRate}%，主要车型：${topVehicles || '无'}`
}

/**
 * 移动源（机动车遥测）查询工具。
 * 移动源与固定源（query_pollution_sources）是污染源两大分类，本工具只管机动车遥测数据。
 */
export const queryVehicleSensing = tool(
  ({ road, area, keyword }) => {
    let list = [...getVehicleSnapshot()]
    if (road) list = list.filter(s => s.road.includes(road))
    if (area) list = list.filter(s => s.area.includes(area.replace(/[镇区旗县]/g, '')) || s.area === area)
    if (keyword) {
      const k = keyword.toLowerCase()
      list = list.filter(
        s =>
          s.name.toLowerCase().includes(k) ||
          s.mainVehicleType.toLowerCase().includes(k) ||
          s.mainPollutant.toLowerCase().includes(k)
      )
    }
    const result: VehicleQueryResult = { total: list.length, items: list, dataSummary: buildSummary(list) }
    return JSON.stringify(result)
  },
  {
    name: 'query_vehicle_sensing',
    description:
      '查询辖区机动车遥感监测（移动源）数据，包括各遥测点位的检测车辆数、超标车辆数、超标率、主要超标车型（如柴油货车）与超标项目。当用户问机动车/移动源/柴油车/车辆尾气遥测相关数据时必须调用本工具。注意：机动车属于移动源，企业排放属于固定源（用 query_pollution_sources）。',
    schema: z.object({
      road: z.string().optional().describe('道路/路段名称关键字，如：G109、运煤专线'),
      area: z.string().optional().describe('区域/乡镇名称'),
      keyword: z.string().optional().describe('点位名称/车型/污染物关键字，如：柴油货车'),
    }),
  },
)
