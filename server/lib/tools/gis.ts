import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getSourcesSnapshot } from '../../data/mock-sources'
import type { PollutionSource } from '../../data/mock-sources'

/** 地图点位（与前端 useSSE.ts MapPoint 镜像，后端独立定义避免跨端类型依赖） */
export interface MapPoint {
  id: string
  name: string
  type: 'air' | 'water' | 'solid' | 'airStation' | 'waterStation' | 'vehicle'
  status: '正常' | '超标'
  lon: number
  lat: number
  detail?: string
}

/** 由点位坐标计算 bounding box 视口 [minLon, minLat, maxLon, maxLat]。
 *  单点位退化为 ±0.01 的方框，避免 Day 6 地图缩放过大。空数组返回 undefined。 */
export function calcViewport(points: { lon: number; lat: number }[]): [number, number, number, number] | undefined {
  if (points.length === 0) return undefined
  if (points.length === 1) {
    const { lon, lat } = points[0]
    return [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01]
  }
  const lons = points.map(p => p.lon)
  const lats = points.map(p => p.lat)
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export interface GisQueryResult {
  total: number
  items: PollutionSource[]
  /** 数据摘要，供前端推理链路展示数据概况 */
  dataSummary: string
  /** 地图点位（Day 4 协议，Day 6 由 OpenLayers 渲染） */
  mapPoints?: MapPoint[]
  /** 视口 bounding box */
  viewport?: [number, number, number, number]
}

function buildSummary(list: PollutionSource[]): string {
  if (list.length === 0) return '无匹配污染源'
  // 行业分布
  const industryCount: Record<string, number> = {}
  for (const s of list) industryCount[s.industry] = (industryCount[s.industry] ?? 0) + 1
  const topIndustries = Object.entries(industryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k}(${v})`)
    .join('、')
  const overCount = list.filter(s => s.status === '超标').length
  // 主要污染物
  const pollutantCount: Record<string, number> = {}
  for (const s of list) {
    for (const p of s.pollutant.split(/[、,，]/)) {
      const key = p.trim()
      if (key) pollutantCount[key] = (pollutantCount[key] ?? 0) + 1
    }
  }
  const topPollutants = Object.entries(pollutantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join('、')
  return `${list.length}个污染源，行业：${topIndustries}，超标 ${overCount} 个，主要污染物：${topPollutants}`
}

/** 将污染源映射为地图点位（字段归一化，供 Day 6 地图渲染） */
function toMapPoints(list: PollutionSource[]): MapPoint[] {
  return list.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
    lon: s.lon,
    lat: s.lat,
    detail: `${s.industry}｜${s.pollutant}｜实测 ${s.value}${s.limit ? '/' + s.limit : ''}`,
  }))
}

function fmt(list: PollutionSource[]): GisQueryResult {
  const mapPoints = toMapPoints(list)
  return {
    total: list.length,
    items: list,
    dataSummary: buildSummary(list),
    mapPoints,
    viewport: calcViewport(mapPoints),
  }
}

/**
 * GIS 污染源查询工具（Day 2 为 mock 数据源，Day 6 接真实底图联动）。
 * description 的业务语义直接决定模型选工具的准确率，要写清"什么时候必须调我"。
 */
export const queryPollutionSources = tool(
  ({ town, type, status, keyword }) => {
    let list = [...getSourcesSnapshot()]
    if (town) list = list.filter(s => s.town.includes(town.replace(/[镇区旗县]/g, '')) || s.town === town)
    if (type) list = list.filter(s => s.type === type)
    if (status) list = list.filter(s => s.status === status)
    if (keyword) {
      const k = keyword.toLowerCase()
      list = list.filter(
        s => s.name.toLowerCase().includes(k) || s.industry.toLowerCase().includes(k)
      )
    }
    return JSON.stringify(fmt(list))
  },
  {
    name: 'query_pollution_sources',
    description:
      '查询辖区污染源点位实时数据。当用户询问某个乡镇有哪些企业、污染源分布、超标情况、排放数据时，必须调用本工具获取数据，严禁凭记忆编造企业名称或监测数值。支持按乡镇(town)、污染类型(type)、状态(status)、名称/行业关键字(keyword)组合过滤。',
    schema: z.object({
      town: z.string().optional().describe('乡镇名称，如：沙圪堵镇、薛家湾镇'),
      type: z
        .enum(['air', 'water', 'solid'])
        .optional()
        .describe('污染类型：air=废气，water=废水，solid=固废'),
      status: z.enum(['正常', '超标']).optional().describe('排放状态'),
      keyword: z.string().optional().describe('企业名称或行业类别关键字，如：发电、化工'),
    }),
  },
)
