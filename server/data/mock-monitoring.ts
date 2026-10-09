// 环境质量监测 mock 数据（AQI 站点 / 水环境断面与水源地 / 机动车遥测）
// 地域延续准格尔旗设定，坐标为 WGS84 经纬度（Day 6 地图联动预留）
// 演示组合保证：薛家湾镇站点 PM2.5 超标（轻度污染）；十里长川流域存在劣Ⅴ类断面；G109 遥测点位超标率显著
//
// 数据不再静态导出：以下 BASE_* 数组仅作为基准值，
// 通过 get*Snapshot() 按时间桶种子抖动生成动态快照（见 server/lib/simulate.ts）

import { bucketSeed, calcAqi, fmtTime, jitter, mulberry32, yesterdayStr } from '../lib/simulate'

// ---------- 环境空气质量（AQI） ----------

export type AqiLevel = '优' | '良' | '轻度污染' | '中度污染' | '重度污染'

export interface AirStation {
  id: string
  siteName: string
  area: string
  /** 站点类型 */
  siteType: '国控' | '省控' | '微站'
  /** 六参数（μg/m³，CO 为 mg/m³） */
  so2: number
  no2: number
  pm10: number
  pm25: number
  o3: number
  co: number
  aqi: number
  primaryPollutant: string
  level: AqiLevel
  lon: number
  lat: number
  updatedAt: string
}

const BASE_AIR_STATIONS: AirStation[] = [
  {
    id: 'AIR-001',
    siteName: '薛家湾镇监测站',
    area: '薛家湾镇',
    siteType: '国控',
    so2: 18,
    no2: 32,
    pm10: 121,
    pm25: 89,
    o3: 96,
    co: 0.9,
    aqi: 152,
    primaryPollutant: 'PM2.5',
    level: '轻度污染',
    lon: 111.69,
    lat: 39.84,
    updatedAt: '2026-10-09 10:00:00',
  },
  {
    id: 'AIR-002',
    siteName: '沙圪堵镇监测站',
    area: '沙圪堵镇',
    siteType: '省控',
    so2: 14,
    no2: 25,
    pm10: 78,
    pm25: 52,
    o3: 102,
    co: 0.7,
    aqi: 98,
    primaryPollutant: 'O3',
    level: '良',
    lon: 111.24,
    lat: 39.87,
    updatedAt: '2026-10-09 10:00:00',
  },
  {
    id: 'AIR-003',
    siteName: '大路工业园区站',
    area: '薛家湾镇',
    siteType: '省控',
    so2: 26,
    no2: 41,
    pm10: 95,
    pm25: 63,
    o3: 88,
    co: 1.1,
    aqi: 118,
    primaryPollutant: 'PM2.5',
    level: '轻度污染',
    lon: 111.62,
    lat: 39.82,
    updatedAt: '2026-10-09 10:00:00',
  },
  {
    id: 'AIR-004',
    siteName: '龙口镇微站',
    area: '龙口镇',
    siteType: '微站',
    so2: 9,
    no2: 15,
    pm10: 54,
    pm25: 33,
    o3: 84,
    co: 0.5,
    aqi: 62,
    primaryPollutant: 'PM10',
    level: '良',
    lon: 111.47,
    lat: 39.61,
    updatedAt: '2026-10-09 10:00:00',
  },
  {
    id: 'AIR-005',
    siteName: '准格尔召镇微站',
    area: '准格尔召镇',
    siteType: '微站',
    so2: 7,
    no2: 11,
    pm10: 42,
    pm25: 24,
    o3: 76,
    co: 0.4,
    aqi: 45,
    primaryPollutant: 'PM10',
    level: '优',
    lon: 111.16,
    lat: 39.86,
    updatedAt: '2026-10-09 10:00:00',
  },
]

// ---------- 水环境（河流断面 + 饮用水源地） ----------

export type WaterCategory = 'Ⅰ类' | 'Ⅱ类' | 'Ⅲ类' | 'Ⅳ类' | 'Ⅴ类' | '劣Ⅴ类'

export interface WaterSite {
  id: string
  /** section=河流断面 drinking=饮用水源地 */
  kind: 'section' | 'drinking'
  name: string
  /** 所属河流（水源地为所属水体） */
  river: string
  area: string
  category: WaterCategory
  /** 目标类别（断面考核目标） */
  target: WaterCategory
  /** 主要污染/超标因子 */
  factor: string
  status: '达标' | '超标'
  lon: number
  lat: number
  updatedAt: string
}

const BASE_WATER_SITES: WaterSite[] = [
  {
    id: 'WAT-001',
    kind: 'section',
    name: '十里长川入黄口断面',
    river: '十里长川',
    area: '沙圪堵镇',
    category: '劣Ⅴ类',
    target: 'Ⅳ类',
    factor: '氨氮、总磷',
    status: '超标',
    lon: 111.31,
    lat: 39.74,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-002',
    kind: 'section',
    name: '黑岱沟入黄口断面',
    river: '黑岱沟',
    area: '魏家峁镇',
    category: 'Ⅳ类',
    target: 'Ⅲ类',
    factor: '化学需氧量',
    status: '超标',
    lon: 111.52,
    lat: 39.55,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-003',
    kind: 'section',
    name: '黄河准格尔旗段Control断面',
    river: '黄河',
    area: '龙口镇',
    category: 'Ⅱ类',
    target: 'Ⅱ类',
    factor: '—',
    status: '达标',
    lon: 111.44,
    lat: 39.6,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-004',
    kind: 'section',
    name: '塔尔河下游断面',
    river: '塔尔河',
    area: '纳日松镇',
    category: 'Ⅲ类',
    target: 'Ⅲ类',
    factor: '—',
    status: '达标',
    lon: 110.98,
    lat: 39.44,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-005',
    kind: 'drinking',
    name: '薛家湾镇供水公司水源地',
    river: '黄河（地表水）',
    area: '薛家湾镇',
    category: 'Ⅱ类',
    target: 'Ⅲ类',
    factor: '—',
    status: '达标',
    lon: 111.16,
    lat: 39.86,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-006',
    kind: 'drinking',
    name: '沙圪堵镇自来水水源地',
    river: '地下水',
    area: '沙圪堵镇',
    category: 'Ⅲ类',
    target: 'Ⅲ类',
    factor: '—',
    status: '达标',
    lon: 111.24,
    lat: 39.87,
    updatedAt: '2026-10-09 08:00:00',
  },
  {
    id: 'WAT-007',
    kind: 'drinking',
    name: '龙口镇水源地',
    river: '黄河（地表水）',
    area: '龙口镇',
    category: 'Ⅱ类',
    target: 'Ⅲ类',
    factor: '—',
    status: '达标',
    lon: 111.46,
    lat: 39.62,
    updatedAt: '2026-10-09 08:00:00',
  },
]

// ---------- 机动车遥测 ----------

export interface VehicleSensingPoint {
  id: string
  /** 遥测点位名称 */
  name: string
  road: string
  area: string
  /** 检测时段 */
  period: string
  tested: number
  exceeded: number
  /** 超标率（%，保留 2 位） */
  exceedRate: number
  /** 主要超标车型 */
  mainVehicleType: string
  /** 主要超标项目 */
  mainPollutant: string
  lon: number
  lat: number
  updatedAt: string
}

const BASE_VEHICLE_POINTS: VehicleSensingPoint[] = [
  {
    id: 'VEH-001',
    name: 'G109 国道沙圪堵过境段遥测点',
    road: 'G109 国道',
    area: '沙圪堵镇',
    period: '2026-10-08 07:00-19:00',
    tested: 3247,
    exceeded: 187,
    exceedRate: 5.76,
    mainVehicleType: '柴油货车',
    mainPollutant: '林格曼黑度',
    lon: 111.2,
    lat: 39.85,
    updatedAt: '2026-10-09 09:00:00',
  },
  {
    id: 'VEH-002',
    name: 'G109 国道薛家湾段遥测点',
    road: 'G109 国道',
    area: '薛家湾镇',
    period: '2026-10-08 07:00-19:00',
    tested: 4102,
    exceeded: 96,
    exceedRate: 2.34,
    mainVehicleType: '柴油货车',
    mainPollutant: 'NOx',
    lon: 111.7,
    lat: 39.83,
    updatedAt: '2026-10-09 09:00:00',
  },
  {
    id: 'VEH-003',
    name: '大路园区运煤专线遥测点',
    road: '园区运煤专线',
    area: '薛家湾镇',
    period: '2026-10-08 07:00-19:00',
    tested: 1896,
    exceeded: 143,
    exceedRate: 7.54,
    mainVehicleType: '重型自卸货车',
    mainPollutant: '林格曼黑度',
    lon: 111.63,
    lat: 39.82,
    updatedAt: '2026-10-09 09:00:00',
  },
  {
    id: 'VEH-004',
    name: '龙口镇城镇路段遥测点',
    road: 'S103 省道',
    area: '龙口镇',
    period: '2026-10-08 07:00-19:00',
    tested: 1244,
    exceeded: 21,
    exceedRate: 1.69,
    mainVehicleType: '轻型柴油车',
    mainPollutant: 'NOx',
    lon: 111.47,
    lat: 39.6,
    updatedAt: '2026-10-09 09:00:00',
  },
]

// ---------- 动态快照（工具层统一走这里取数） ----------

/**
 * AQI 站点动态快照：六参数浓度按 ±15% 抖动后，
 * 用国标 HJ 633-2012 IAQI 分段插值重算 AQI/首要污染物/等级。
 * 真实监测站为小时级数据，时间桶粒度 1 小时。
 */
export function getAirSnapshot(): AirStation[] {
  return BASE_AIR_STATIONS.map(s => {
    const [seed, ts] = bucketSeed(s.id)
    const rnd = mulberry32(seed)
    const so2 = jitter(s.so2, 0.15, rnd)
    const no2 = jitter(s.no2, 0.15, rnd)
    const pm10 = jitter(s.pm10, 0.15, rnd)
    const pm25 = jitter(s.pm25, 0.15, rnd)
    const o3 = jitter(s.o3, 0.15, rnd)
    const co = jitter(s.co, 0.15, rnd)
    const { aqi, primaryPollutant, level } = calcAqi(pm25, pm10, so2, no2, o3, co)
    return {
      ...s,
      so2,
      no2,
      pm10,
      pm25,
      o3,
      co,
      aqi,
      primaryPollutant,
      level: level as AqiLevel,
      updatedAt: fmtTime(ts),
    }
  })
}

/**
 * 水环境快照：水质类别是按日评价的枚举值，真实业务不会小时级翻转，
 * 因此类别/达标状态保持基准值，仅刷新 updatedAt 为当前时间。
 */
export function getWaterSnapshot(): WaterSite[] {
  const now = fmtTime(new Date())
  return BASE_WATER_SITES.map(s => ({ ...s, updatedAt: now }))
}

/**
 * 机动车遥测快照：检测量 ±10% 抖动，超标数按超标率抖动反推，
 * 检测时段自动取"昨天 07:00-19:00"。
 */
export function getVehicleSnapshot(): VehicleSensingPoint[] {
  const period = `${yesterdayStr()} 07:00-19:00`
  return BASE_VEHICLE_POINTS.map(s => {
    const [seed, ts] = bucketSeed(s.id)
    const rnd = mulberry32(seed)
    const tested = Math.round(jitter(s.tested, 0.1, rnd))
    const exceedRate = Math.max(0.1, jitter(s.exceedRate, 0.15, rnd))
    const exceeded = Math.round((tested * exceedRate) / 100)
    return {
      ...s,
      period,
      tested,
      exceeded,
      exceedRate: Math.round((exceeded / tested) * 10000) / 100,
      updatedAt: fmtTime(ts),
    }
  })
}
