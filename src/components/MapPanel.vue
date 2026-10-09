<script setup lang="ts">
import { computed } from 'vue'
import { Location, MapLocation } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'
import type { MapPoint } from '../composables/useSSE'

const store = useChatStore()

/** 点位类型 → 中文标签（Day 6 图标分组的中文映射） */
const TYPE_LABELS: Record<MapPoint['type'], string> = {
  air: '废气排放口',
  water: '废水排放口',
  solid: '固废堆场',
  airStation: '空气监测站',
  waterStation: '水质监测站',
  vehicle: '机动车遥测点',
}

/** 点位类型 → 状态色（Day 6 图标颜色参考，现用于列表 dot） */
const TYPE_COLORS: Record<MapPoint['type'], string> = {
  air: '#e6a23c',
  water: '#409eff',
  solid: '#909399',
  airStation: '#67c23a',
  waterStation: '#67c23a',
  vehicle: '#f56c6c',
}

const points = computed(() => store.mapPoints)
const hasPoints = computed(() => points.value.length > 0)

/** 按类型分组统计，供骨架阶段展示数据概况 */
const groupByType = computed(() => {
  const groups: Record<string, { list: MapPoint[]; color: string }> = {}
  for (const p of points.value) {
    const key = TYPE_LABELS[p.type]
    if (!groups[key]) groups[key] = { list: [], color: TYPE_COLORS[p.type] }
    groups[key].list.push(p)
  }
  return groups
})

/** 超标点位数 */
const overCount = computed(() => points.value.filter(p => p.status === '超标').length)

/** 视口四至（用于展示 bounding box，验证协议数据通） */
const viewportText = computed(() => {
  if (!store.viewport) return ''
  const [minLon, minLat, maxLon, maxLat] = store.viewport
  return `${minLon.toFixed(2)},${minLat.toFixed(2)} ~ ${maxLon.toFixed(2)},${maxLat.toFixed(2)}`
})
</script>

<template>
  <div class="map-panel">
    <!-- 占位态：无点位时提示 -->
    <el-empty
      v-if="!hasPoints"
      description="OpenLayers 地图（Day 6 接入）&#10;查询污染源/监测数据时，点位将在此渲染"
      :image-size="50"
    >
      <template #image>
        <el-icon :size="50" color="var(--el-text-color-placeholder)"><MapLocation /></el-icon>
      </template>
    </el-empty>

    <!-- 骨架态：有点位但地图未接入，用列表验证协议通了 -->
    <div v-else class="point-list">
      <div class="list-header">
        <div class="header-left">
          <el-icon class="header-icon"><Location /></el-icon>
          <span class="header-title">地图点位预览</span>
          <el-tag size="small" type="info">共 {{ points.length }} 个</el-tag>
          <el-tag v-if="overCount > 0" size="small" type="danger">超标 {{ overCount }}</el-tag>
        </div>
        <span v-if="viewportText" class="viewport">
          视口：{{ viewportText }}
        </span>
      </div>

      <div class="groups">
        <div v-for="(group, label) in groupByType" :key="label" class="group">
          <div class="group-title">
            <span class="dot" :style="{ background: group.color }"></span>
            <span>{{ label }}</span>
            <span class="group-count">({{ group.list.length }})</span>
          </div>
          <div class="group-items">
            <div
              v-for="p in group.list"
              :key="p.id"
              class="point-item"
              :class="{ over: p.status === '超标' }"
            >
              <span class="point-name">{{ p.name }}</span>
              <el-tag
                size="small"
                :type="p.status === '超标' ? 'danger' : 'success'"
                effect="plain"
              >
                {{ p.status }}
              </el-tag>
              <span class="point-coord">{{ p.lon.toFixed(2) }},{{ p.lat.toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="map-hint">
        <el-icon><MapLocation /></el-icon>
        <span>Day 6 接入 OpenLayers 后，上述点位将渲染为地图图标并自动定位视口</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.point-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.header-icon {
  color: var(--el-color-primary);
}
.header-title {
  font-weight: 600;
  font-size: 13px;
}
.viewport {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}
.groups {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.group-count {
  color: var(--el-text-color-placeholder);
}
.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.point-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}
.point-item.over {
  background: var(--el-color-danger-light-9);
}
.point-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.point-coord {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}
.map-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.map-hint .el-icon {
  font-size: 12px;
}
</style>
