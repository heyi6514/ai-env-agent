import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { MOCK_SOURCES, type PollutionSource } from '../../data/mock-sources'

export interface GisQueryResult {
  total: number
  items: PollutionSource[]
}

function fmt(list: PollutionSource[]): GisQueryResult {
  return { total: list.length, items: list }
}

/**
 * GIS 污染源查询工具（Day 2 为 mock 数据源，Day 6 接真实底图联动）。
 * description 的业务语义直接决定模型选工具的准确率，要写清"什么时候必须调我"。
 */
export const queryPollutionSources = tool(
  ({ town, type, status, keyword }) => {
    let list = [...MOCK_SOURCES]
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
