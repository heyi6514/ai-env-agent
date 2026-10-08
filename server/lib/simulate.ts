// 动态 mock 数据仿真引擎
// 核心机制：以基准值为锚点，按"时间桶 + 站点ID种子"生成可复现的抖动快照
// 同一小时内查询结果稳定，跨小时自动演变，既真实又不会在演示期间乱跳

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return h
}

/** Mulberry32 —— 高质量种子随机，纯 JS 实现，零依赖 */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HOUR = 3600_000
const DAY = 24 * HOUR

/**
 * 获取当前时间桶的种子与时间戳
 * @param id 实体唯一标识（站点ID/断面ID等）
 * @param bucketMs 时间桶粒度，默认 1 小时（AQI 监测站小时报）
 */
export function bucketSeed(id: string, bucketMs = HOUR): [number, Date] {
  const bucket = Math.floor(Date.now() / bucketMs)
  return [hashStr(id) ^ bucket, new Date(bucket * bucketMs)]
}

/** 基准值按百分比抖动（±pct），结果保留 2 位小数 */
export function jitter(base: number, pct: number, rnd: () => number): number {
  return Math.round(base * (1 + pct * (rnd() * 2 - 1)) * 100) / 100
}

/** 格式化时间为 YYYY-MM-DD HH:mm:ss */
export function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 获取"昨天"的日期字符串（YYYY-MM-DD） */
export function yesterdayStr(): string {
  const d = new Date(Date.now() - DAY)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- IAQI 国标分段插值（HJ 633-2012） ----------

const IAQI_BP = [0, 50, 100, 150, 200, 300, 500]

// 各污染物浓度限值（与 IAQI_BP 一一对应）
const PM25_BP = [0, 35, 75, 115, 150, 250, 500]
const PM10_BP = [0, 50, 150, 250, 350, 420, 600]
const SO2_BP = [0, 50, 150, 475, 800, 1600, 2620]
const NO2_BP = [0, 40, 80, 180, 280, 565, 940]
const O3_BP = [0, 100, 160, 215, 265, 800, 1000]
const CO_BP = [0, 2, 4, 14, 24, 36, 60] // mg/m³

function calcIAQI(conc: number, bps: number[]): number {
  for (let i = 0; i < bps.length - 1; i++) {
    if (conc <= bps[i + 1]) {
      const bpL = bps[i]
      const bpH = bps[i + 1]
      const iaqiL = IAQI_BP[i]
      const iaqiH = IAQI_BP[i + 1]
      return Math.round(((iaqiH - iaqiL) / (bpH - bpL)) * (conc - bpL) + iaqiL)
    }
  }
  return 500
}

export function calcAqi(
  pm25: number,
  pm10: number,
  so2: number,
  no2: number,
  o3: number,
  co: number
): { aqi: number; primaryPollutant: string; level: string } {
  const iaqis = [
    { name: 'PM2.5', val: calcIAQI(pm25, PM25_BP) },
    { name: 'PM10', val: calcIAQI(pm10, PM10_BP) },
    { name: 'SO2', val: calcIAQI(so2, SO2_BP) },
    { name: 'NO2', val: calcIAQI(no2, NO2_BP) },
    { name: 'O3', val: calcIAQI(o3, O3_BP) },
    { name: 'CO', val: calcIAQI(co, CO_BP) },
  ]
  const max = iaqis.reduce((m, c) => (c.val > m.val ? c : m))
  const aqi = max.val
  let level = '优'
  if (aqi > 50) level = '良'
  if (aqi > 100) level = '轻度污染'
  if (aqi > 150) level = '中度污染'
  if (aqi > 200) level = '重度污染'
  return { aqi, primaryPollutant: max.name, level }
}
