<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Close, ArrowDown } from '@element-plus/icons-vue'
import 'ol/ol.css'
import { useChatStore } from '../stores/chat'
import type { MapPoint } from '../composables/useSSE'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Overlay from 'ol/Overlay'
import { Style, Circle as CircleStyle, Fill, Stroke, Text, Icon } from 'ol/style'
import type { StyleFunction } from 'ol/style/Style'
import { fromLonLat, transformExtent } from 'ol/proj'
// 6 类点位专属图标（定位针样式 PNG，资产来自 src/assets/gis/map-icon）
import flueGasUrl from '../assets/gis/map-icon/flue-gas.png'
import flueWaterUrl from '../assets/gis/map-icon/flue-water.png'
import solidWasteUrl from '../assets/gis/map-icon/solid-waste.png'
import airStationUrl from '../assets/gis/map-icon/air-qk1.png'
import waterStationUrl from '../assets/gis/map-icon/water-cz1.png'
import vehicleUrl from '../assets/gis/map-icon/jidongche.png'

const store = useChatStore()
const mapContainer = ref<HTMLDivElement>()
const popupEl = ref<HTMLDivElement>()
const popupData = ref<MapPoint | null>(null)
const TIAN_DI_TU_KEY = import.meta.env.VITE_TIAN_DI_TU_KEY

/** 点位类型 → 中文标签（弹窗与图例共用） */
const TYPE_LABELS: Record<MapPoint['type'], string> = {
  air: '废气排放口',
  water: '废水排放口',
  solid: '固废堆场',
  airStation: '空气监测站',
  waterStation: '水质监测站',
  vehicle: '机动车遥测点',
}

/** 点位类型 → 图标 URL */
const TYPE_ICONS: Record<MapPoint['type'], string> = {
  air: flueGasUrl,
  water: flueWaterUrl,
  solid: solidWasteUrl,
  airStation: airStationUrl,
  waterStation: waterStationUrl,
  vehicle: vehicleUrl,
}

/** 图例条目（预生成数组，避免模板里用 string 索引 Record 的 TS 报错） */
const LEGEND_ITEMS = (Object.keys(TYPE_LABELS) as MapPoint['type'][]).map(type => ({
  type,
  label: TYPE_LABELS[type],
  icon: TYPE_ICONS[type],
}))

/** 图例折叠状态 */
const legendCollapsed = ref(false)

let map: Map | null = null
let pointSource: VectorSource | null = null
let overlay: Overlay | null = null
let resizeObserver: ResizeObserver | null = null

/** 点位样式：类型定位针图标 + 右上角状态角标 + 上方名称标注。
 *  图标 PNG 本身不可染色，状态用角标圆点（超标红/正常绿）+ 名称文字颜色双重表达。
 *  StyleFunction 允许返回 Style 数组，三段各自独立定位。 */
const pointStyle: StyleFunction = (feature) => {
  const type = feature.get('type') as MapPoint['type']
  const isOver = feature.get('status') === '超标'
  return [
    // 定位针图标：anchor 底尖对准真实坐标（scale 0.55 ≈ 26px 显示高度）
    new Style({
      image: new Icon({
        src: TYPE_ICONS[type] ?? flueGasUrl,
        scale: 0.55,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    }),
    // 状态角标：右上角小圆点。displacement x 正=右移、y 正=上移（OL 源码 getAnchor 语义）
    new Style({
      image: new CircleStyle({
        radius: 5,
        displacement: [10, 20],
        fill: new Fill({ color: isOver ? '#f5222d' : '#52c41a' }),
        stroke: new Stroke({ color: '#fff', width: 1.5 }),
      }),
    }),
    // 名称标注：悬浮在图标上方（负 offsetY），超标红字醒目
    new Style({
      text: new Text({
        text: feature.get('name') ?? '',
        offsetY: -32,
        font: '11px sans-serif',
        fill: new Fill({ color: isOver ? '#cf1322' : '#333' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
      }),
    }),
  ]
}

/** 全量重渲染点位（store 覆盖式赋值，clear+add 即可） */
function renderPoints(points: MapPoint[]) {
  if (!pointSource) return
  pointSource.clear()
  for (const p of points) {
    const f = new Feature({ geometry: new Point(fromLonLat([p.lon, p.lat])), ...p })
    f.setId(p.id)
    pointSource.addFeature(f)
  }
}

/** 视口适配：bounding box(EPSG:4326) → 3857 后 fit，限制最大 zoom 避免单点过度放大 */
function fitViewport(vp: [number, number, number, number]) {
  if (!map) return
  map.getView().fit(transformExtent(vp, 'EPSG:4326', 'EPSG:3857'), {
    padding: [50, 50, 50, 50],
    maxZoom: 14,
  })
}

/** 加载准格尔旗边界 geojson，EPSG:4326→3857 投影转换 */
async function loadBoundary(src: VectorSource) {
  try {
    const r = await fetch('/geojson/zger.json')
    const fmt = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
    src.addFeatures(fmt.readFeatures(await r.json()))
  } catch (e) {
    console.error('边界加载失败', e)
  }
}

function closePopup() {
  overlay?.setPosition(undefined)
  popupData.value = null
}

/** 方案 C：弹窗「询问此点位」→ 设置 pendingInput → ChatPanel 填入输入框 */
function askAboutPoint() {
  if (!popupData.value) return
  const pt = popupData.value
  store.setPendingInput(`「${pt.name}」的近期排放情况如何？`)
  closePopup()
}

onMounted(() => {
  if (!mapContainer.value || !popupEl.value) return
  const boundarySource = new VectorSource()
  pointSource = new VectorSource()
  overlay = new Overlay({
    element: popupEl.value,
    positioning: 'bottom-center',
    // 定位针图标高约 26px + 名称标注在 -32 处，弹窗上提到 -40 避免遮挡
    offset: [0, -40],
    autoPan: { animation: { duration: 250 } },
  })

  // 有 key 用天地图矢量+注记，无 key 回退 OSM 保证可用
  const baseLayers = TIAN_DI_TU_KEY
    ? [
        new TileLayer({
          source: new XYZ({
            url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${TIAN_DI_TU_KEY}`,
            crossOrigin: 'anonymous',
          }),
        }),
        new TileLayer({
          source: new XYZ({
            url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=cva_w&x={x}&y={y}&l={z}&tk=${TIAN_DI_TU_KEY}`,
            crossOrigin: 'anonymous',
          }),
        }),
      ]
    : [new TileLayer({ source: new OSM() })]

  map = new Map({
    target: mapContainer.value,
    overlays: [overlay],
    view: new View({ center: fromLonLat([111.24, 39.86]), zoom: 9 }),
    layers: [
      ...baseLayers,
      new VectorLayer({
        source: boundarySource,
        style: new Style({
          fill: new Fill({ color: 'rgba(64,158,255,0.05)' }),
          stroke: new Stroke({ color: '#409eff', width: 2 }),
        }),
      }),
      new VectorLayer({ source: pointSource, style: pointStyle }),
    ],
  })

  map.on('singleclick', (e) => {
    // 用 const 数组收集命中要素：TS 对"闭包内给 let 赋值"的窄化会退化成 never，
    // const 数组 push 不存在该问题
    const hits: MapPoint[] = []
    map!.forEachFeatureAtPixel(e.pixel, (f) => {
      hits.push({
        id: f.get('id'),
        name: f.get('name'),
        type: f.get('type'),
        status: f.get('status'),
        lon: f.get('lon'),
        lat: f.get('lat'),
        detail: f.get('detail'),
      } as MapPoint)
      return true
    })
    const hit = hits[0]
    if (hit) {
      popupData.value = hit
      overlay!.setPosition(fromLonLat([hit.lon, hit.lat]))
    } else {
      closePopup()
    }
  })

  // OL 只监听 window resize；面板折叠(display:none)再展开时尺寸恢复它感知不到，
  // 用 ResizeObserver 显式 updateSize，并在 0→非0 时重新 fit 视口
  let lastWidth = 0
  let lastHeight = 0
  resizeObserver = new ResizeObserver(() => {
    if (!map || !mapContainer.value) return
    const { offsetWidth, offsetHeight } = mapContainer.value
    const wasZero = lastWidth === 0 || lastHeight === 0
    if (offsetWidth === lastWidth && offsetHeight === lastHeight) return
    lastWidth = offsetWidth
    lastHeight = offsetHeight
    if (offsetWidth === 0 || offsetHeight === 0) return
    map.updateSize()
    if (wasZero && store.viewport) fitViewport(store.viewport)
  })
  resizeObserver.observe(mapContainer.value)
  // 兜底：构造可能发生在浏览器布局完成前（首帧尺寸为 0），
  // 下一帧强制重新测量并渲染一次
  requestAnimationFrame(() => map?.updateSize())

  loadBoundary(boundarySource)
  if (store.mapPoints.length) renderPoints(store.mapPoints)
  if (store.viewport) fitViewport(store.viewport)

  // dev-only 调试钩子：控制台可直接访问 map 实例（生产构建被 tree-shake）
  if (import.meta.env.DEV) {
    ;(window as unknown as { __map?: Map }).__map = map
  }
})

// 方案 C：对话→地图——推理面板「在地图查看」设置 focusedPoint，
// 这里 watch 后弹窗居中显示，消费后清除
watch(
  () => store.focusedPoint,
  (pt) => {
    if (!pt || !map || !overlay) return
    popupData.value = pt
    overlay.setPosition(fromLonLat([pt.lon, pt.lat]))
    map.getView().animate({ center: fromLonLat([pt.lon, pt.lat]), duration: 300 })
    store.setFocusedPoint(undefined)
  }
)

watch(
  () => store.mapPoints,
  (pts) => {
    renderPoints(pts)
    closePopup()
  }
)

watch(
  () => store.viewport,
  (vp) => {
    if (vp) fitViewport(vp)
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="map-panel">
    <div ref="mapContainer" class="map-container"></div>

    <!-- 图例浮层：6 类点位图标 + 状态色说明（左下角，可折叠） -->
    <div class="map-legend">
      <div class="legend-header" @click="legendCollapsed = !legendCollapsed">
        <span class="legend-title">图例</span>
        <el-icon class="legend-caret" :class="{ folded: legendCollapsed }"><ArrowDown /></el-icon>
      </div>
      <div v-show="!legendCollapsed" class="legend-body">
        <div v-for="item in LEGEND_ITEMS" :key="item.type" class="legend-row">
          <img :src="item.icon" class="legend-icon" :alt="item.label" />
          <span class="legend-label">{{ item.label }}</span>
        </div>
        <div class="legend-divider" />
        <div class="legend-status">
          <span class="legend-status-item">
            <span class="status-dot over" />超标
          </span>
          <span class="legend-status-item">
            <span class="status-dot normal" />正常
          </span>
        </div>
      </div>
    </div>

    <div ref="popupEl" class="popup">
      <div v-if="popupData" class="popup-content">
        <div class="popup-header">
          <span class="popup-title">{{ popupData.name }}</span>
          <el-icon class="popup-close" @click="closePopup"><Close /></el-icon>
        </div>
        <div class="popup-body">
          <p><span class="popup-label">类型：</span>{{ TYPE_LABELS[popupData.type] }}</p>
          <p>
            <span class="popup-label">状态：</span>
            <span :class="popupData.status === '超标' ? 'status-over' : 'status-normal'">
              {{ popupData.status }}
            </span>
          </p>
          <p>
            <span class="popup-label">坐标：</span>{{ popupData.lon.toFixed(6) }},
            {{ popupData.lat.toFixed(6) }}
          </p>
          <p v-if="popupData.detail"><span class="popup-label">详情：</span>{{ popupData.detail }}</p>
          <div class="popup-actions">
            <el-button size="small" type="primary" plain @click.stop="askAboutPoint">
              询问此点位
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-panel {
  position: relative;
  width: 100%;
  height: 100%;
}
.map-container {
  width: 100%;
  height: 100%;
}

/* —— 图例浮层 —— */
.map-legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 2;
  min-width: 132px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  user-select: none;
}
.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  cursor: pointer;
}
.legend-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.legend-caret {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s;
}
.legend-caret.folded {
  transform: rotate(-90deg);
}
.legend-body {
  padding: 2px 10px 8px;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.legend-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}
.legend-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}
.legend-divider {
  height: 1px;
  background: var(--el-border-color-lighter);
  margin: 6px 0;
}
.legend-status {
  display: flex;
  gap: 12px;
}
.legend-status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}
.status-dot.over {
  background: #f5222d;
}
.status-dot.normal {
  background: #52c41a;
}
.popup {
  pointer-events: none;
}
.popup-content {
  position: relative;
  pointer-events: auto;
  min-width: 200px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
}
.popup-content::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #fff;
}
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.popup-title {
  font-weight: 600;
  font-size: 13px;
}
.popup-close {
  cursor: pointer;
  color: var(--el-text-color-secondary);
}
.popup-close:hover {
  color: var(--el-color-danger);
}
.popup-body p {
  margin: 4px 12px;
  font-size: 12px;
  line-height: 1.6;
}
.popup-label {
  color: var(--el-text-color-secondary);
}
.status-over {
  color: var(--el-color-danger);
  font-weight: 600;
}
.status-normal {
  color: var(--el-color-success);
}
.popup-actions {
  padding: 6px 12px 2px;
}
.popup-actions .el-button {
  width: 100%;
}
</style>
