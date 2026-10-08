// Mock 污染源点位数据（Day 2 用，30 条）
// 坐标基于内蒙古自治区鄂尔多斯市准格尔旗一带（WGS84 经纬度）
// 字段设计与 Day 6 地图联动保持一致：type 决定图标分组，status 决定超标红标
//
// 基准值内部化，通过 getSourcesSnapshot() 按时间桶抖动生成动态快照

import { bucketSeed, fmtTime, jitter, mulberry32 } from '../lib/simulate'
export type SourceType = 'air' | 'water' | 'solid'
export type SourceStatus = '正常' | '超标'

export interface PollutionSource {
  id: string
  name: string
  /** 所属乡镇 */
  town: string
  /** air=废气 water=废水 solid=固废 */
  type: SourceType
  status: SourceStatus
  /** 行业类别 */
  industry: string
  /** 主要污染物 */
  pollutant: string
  /** 排放浓度实测值 */
  value: number
  /** 限值 */
  limit: number
  lon: number
  lat: number
  /** 最后更新时间（ISO） */
  updatedAt: string
}

const TOWNS = ['沙圪堵镇', '薛家湾镇', '龙口镇', '魏家峁镇', '纳日松镇', '准格尔召镇'] as const

const AIR_INDUSTRY = ['火力发电', '煤化工', '水泥制造', '焦化', '陶瓷'] as const
const WATER_INDUSTRY = ['煤矿疏干水', '化工园区污水', '城镇生活污水', '食品加工'] as const
const SOLID_INDUSTRY = ['煤矸石堆场', '粉煤灰库', '危废暂存', '生活垃圾填埋'] as const

function mk(
  i: number,
  type: SourceType,
  townIdx: number,
  industry: string,
  pollutant: string,
  value: number,
  limit: number,
  lon: number,
  lat: number
): PollutionSource {
  const value_ = Math.round(value * 10) / 10
  const limit_ = Math.round(limit * 10) / 10
  return {
    id: `${type.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
    name: `${TOWNS[townIdx]}${industry}${type === 'air' ? '废气' : type === 'water' ? '废水' : '固废'}排放点${(i % 5) + 1}号`,
    town: TOWNS[townIdx],
    type,
    status: value_ > limit_ ? '超标' : '正常',
    industry,
    pollutant,
    value: value_,
    limit: limit_,
    lon,
    lat,
    updatedAt: '2026-10-08 09:00:00',
  }
}

// 保证演示组合命中：沙圪堵镇 + 废气 + 超标 至少 2 条；薛家湾镇 + 废水 + 超标 1 条
const BASE_SOURCES: PollutionSource[] = [
  mk(0, 'air', 0, '火力发电', 'NOx', 92.5, 50, 111.24, 39.86),
  mk(1, 'air', 0, '煤化工', 'SO2', 68.3, 35, 111.31, 39.82),
  mk(2, 'air', 0, '水泥制造', '颗粒物', 22.1, 20, 111.19, 39.91),
  mk(3, 'air', 0, '焦化', '苯并[a]芘', 1.8, 2.5, 111.36, 39.79),
  mk(4, 'air', 1, '火力发电', 'NOx', 41.2, 50, 111.15, 39.87),
  mk(5, 'air', 1, '陶瓷', '颗粒物', 12.4, 20, 111.09, 39.76),
  mk(6, 'air', 2, '煤化工', 'SO2', 30.6, 35, 111.42, 39.65),
  mk(7, 'air', 3, '焦化', 'SO2', 55.7, 35, 111.52, 39.55),
  mk(8, 'air', 4, '水泥制造', 'NOx', 88.9, 50, 110.96, 39.42),
  mk(9, 'air', 5, '陶瓷', '颗粒物', 15.2, 20, 110.88, 39.35),
  mk(10, 'water', 1, '煤矿疏干水', '悬浮物', 210, 200, 111.12, 39.84),
  mk(11, 'water', 1, '化工园区污水', 'COD', 62.4, 60, 111.18, 39.8),
  mk(12, 'water', 0, '城镇生活污水', '氨氮', 4.2, 8, 111.27, 39.88),
  mk(13, 'water', 2, '煤矿疏干水', '悬浮物', 95, 200, 111.45, 39.62),
  mk(14, 'water', 3, '食品加工', 'COD', 48.1, 60, 111.55, 39.5),
  mk(15, 'water', 4, '化工园区污水', '氨氮', 9.6, 8, 110.99, 39.45),
  mk(16, 'water', 5, '城镇生活污水', 'COD', 30.2, 60, 110.85, 39.3),
  mk(17, 'water', 0, '煤矿疏干水', 'COD', 55.8, 60, 111.22, 39.92),
  mk(18, 'solid', 0, '煤矸石堆场', '扬尘', 0.4, 1, 111.29, 39.78),
  mk(19, 'solid', 1, '粉煤灰库', '扬尘', 1.2, 1, 111.06, 39.81),
  mk(20, 'solid', 2, '危废暂存', '渗滤液', 0.2, 0.5, 111.38, 39.68),
  mk(21, 'solid', 3, '生活垃圾填埋', '渗滤液', 0.35, 0.5, 111.48, 39.58),
  mk(22, 'solid', 4, '煤矸石堆场', '扬尘', 0.7, 1, 110.92, 39.48),
  mk(23, 'solid', 5, '粉煤灰库', '扬尘', 0.15, 1, 110.82, 39.38),
  mk(24, 'solid', 0, '危废暂存', '渗滤液', 0.08, 0.5, 111.33, 39.85),
  mk(25, 'air', 2, '火力发电', 'SO2', 25.4, 35, 111.4, 39.7),
  mk(26, 'water', 4, '煤矿疏干水', '氨氮', 3.1, 8, 111.02, 39.52),
  mk(27, 'air', 4, '煤化工', '颗粒物', 8.6, 10, 110.94, 39.4),
  mk(28, 'solid', 1, '生活垃圾填埋', '扬尘', 0.9, 1, 111.1, 39.78),
  mk(29, 'water', 5, '食品加工', '悬浮物', 120, 200, 110.88, 39.32),
]

/**
 * 污染源动态快照：排放浓度按 ±10% 抖动并重算超标状态。
 * 临界护栏：基准值在限值 0.85~1.15 之间的点位不抖 value，防止演示剧本翻车
 * （例如"沙圪堵镇有哪些超标废气企业"在某个小时突然查空）。
 */
export function getSourcesSnapshot(): PollutionSource[] {
  return BASE_SOURCES.map(s => {
    const ratio = s.value / s.limit
    const [seed, ts] = bucketSeed(s.id)
    // 临界点位（含基准已超标/接近超标的）保持原值，只刷新时间
    if (ratio >= 0.85 && ratio <= 1.15) {
      return { ...s, updatedAt: fmtTime(ts) }
    }
    const rnd = mulberry32(seed)
    const value = jitter(s.value, 0.1, rnd)
    return {
      ...s,
      value,
      status: value > s.limit ? '超标' : '正常',
      updatedAt: fmtTime(ts),
    }
  })
}
