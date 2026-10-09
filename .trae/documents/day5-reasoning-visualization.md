# Day 5 实现方案：推理链路可视化完整实现

## Summary

Day 5 目标是将推理链路面板从"能用"升级为"好看且信息丰富"。核心改动：思考卡片（前端拦截移动文本方案）、卡片四色分类（思考黄/工具蓝/数据绿/异常红）、垂直时间轴连线、JSON 入参/返回折叠展示、面板可折叠、trace 步骤"在地图查看"按钮联动。

纯前端改动为主（3 个前端文件），服务端仅 agent.ts 做一处微调（map_render 回调补充 toolId，让前端能精确关联点位与工具步骤）。

---

## Current State Analysis

### 已完成（Day 3/4）
- 步骤编号、工具卡片可折叠、入参截断展开
- 工具名中文化、数据摘要（绿底）、命中来源（蓝底）、报告卡片（黄底）
- 工具耗时、运行中动画、自动滚动、清空按钮
- 失败状态红色 tag 标记

### 缺失（Day 5 需补齐）
1. **无思考卡片** — 模型在调用工具前生成的文本目前混在聊天回答里，未分离展示
2. **无卡片四色分类** — 所有卡片视觉一致，无法一眼区分类型
3. **无垂直时间轴** — 卡片之间无连线，不像"链路"
4. **入参是 key=value 字符串** — 不是 JSON 格式，不够直观
5. **无工具返回展示** — 工具输出只有摘要 tag，无折叠详情
6. **面板不可折叠** — 推理/地图面板比例固定，用户无法调整
7. **无"在地图查看"按钮** — 无法从推理步骤跳转到地图

---

## Proposed Changes

### 3.1 思考卡片（黄色）— 前端拦截移动文本

**方案原理**：模型在调用工具前可能生成文本（"让我查询一下…"）。这些文本先流式显示在聊天区（保留实时体验），当 `onToolStart` 触发时，将该文本从 `reply.content` 移出，作为一条"思考"卡片插入 `toolEvents` 数组（排在工具卡片之前），然后清空 `reply.content`。

**文件**: `src/stores/chat.ts`

ToolEvent 接口新增字段：
```ts
export interface ToolEvent {
  type: 'thought' | 'tool'   // 新增，默认 'tool'
  text?: string               // 思考文本，仅 type='thought' 时有值
  hasMapPoints?: boolean       // 该工具步骤是否返回了地图点位（3.6 用）
  // ... 以下为现有字段
  id: string
  name: string
  args?: unknown
  summary?: string
  sources?: ToolSource[]
  dataSummary?: string
  report?: { filename: string; markdown: string }
  status: 'running' | 'done'
  error?: boolean
  startTime: number
  duration?: number
}
```

`onToolStart` handler 改动：
```ts
onToolStart: (id, name, args) => {
  // 模型在调用工具前生成的文本 → 移入思考卡片
  if (reply.content.trim()) {
    this.toolEvents.push({
      id: `thought_${id}`,
      type: 'thought',
      name: '',
      text: reply.content,
      status: 'done',
      startTime: Date.now(),
    })
    reply.content = ''  // 清空聊天区，为下一轮（工具结果 + 最终回答）腾位
  }
  this.toolEvents.push({ id, type: 'tool', name, args, status: 'running', startTime: Date.now() })
},
```

**边界情况**：
- 模型工具调用前无文本 → 不创建思考卡片（DeepSeek 常见情况）
- 多轮工具调用 → 每轮的文本分别移入各自的思考卡片
- 最终回答（无工具调用）→ 文本留在 chat，不移入思考卡片

### 3.2 卡片四色分类

**文件**: `src/components/ReasoningPanel.vue` CSS

卡片左侧色条 + 浅色背景，根据 type 和状态决定颜色：

| 类型 | 条件 | 左边框色 | 背景色 |
|---|---|---|---|
| 思考 | `type === 'thought'` | `--el-color-warning` | `--el-color-warning-light-9` |
| 工具（默认） | `type === 'tool'` && 无 dataSummary && 无 error | `--el-color-primary` | `--el-color-primary-light-9` |
| 数据 | `type === 'tool'` && 有 dataSummary | `--el-color-success` | `--el-color-success-light-9` |
| 异常 | `type === 'tool'` && error | `--el-color-danger` | `--el-color-danger-light-9` |

实现方式：在 `<div class="event-card">` 上用 `:class` 绑定动态 class：
```html
<div class="event-card" :class="cardClass(ev)">
```
```ts
function cardClass(ev: ToolEvent): string {
  if (ev.type === 'thought') return 'card-thought'
  if (ev.error) return 'card-error'
  if (ev.dataSummary) return 'card-data'
  return 'card-tool'
}
```

CSS 用 `border-left: 3px solid <color>` + `background: <light-9>` 实现。

### 3.3 垂直时间轴连线

**文件**: `src/components/ReasoningPanel.vue` CSS + 模板微调

当前 `.timeline` 是普通 flex 列，卡片之间无连线。改为：

1. `.timeline` 加 `position: relative` + `padding-left: 32px`
2. `.timeline::before` 绘制竖线：`position: absolute; left: 15px; top: 20px; bottom: 20px; width: 2px; background: var(--el-border-color)`
3. 步骤编号圆 `.step-no` 从卡片内部移到时间轴线上（用 `position: absolute; left: -32px` 相对于卡片定位）
4. 思考卡片用小圆点（非数字）代替步骤编号

视觉效果：
```
①──[思考] 分析问题，需要查询污染源数据…
 │
②──[工具] 污染源点位查询  ✓ 返回15条  1.2s
 │
③──[工具] 执法报告生成  ✓ 报告已生成  0.8s
```

### 3.4 JSON 入参/返回折叠展示

**文件**: `src/components/ReasoningPanel.vue`

**入参**：从 `key=value` 字符串改为 `JSON.stringify(args, null, 2)` 格式化显示，放在 `<pre>` 标签中，长 JSON 默认折叠（max-height + overflow hidden），点击展开。

**返回**：新增"返回"折叠区块，汇总展示工具输出的结构化信息：
- summary 文本（如"返回 15 条记录"）
- dataSummary（绿底，已有，改为放在"返回"区块内）
- sources（蓝底，已有，改为放在"返回"区块内）
- report（黄底，已有，改为放在"返回"区块内）

将原有的 dataSummary/sources/report 三个独立区块统一收拢到一个"返回"标签下，用 `el-collapse` 或手动 toggle 实现。

入参和返回各一个折叠区块，默认入参折叠、返回展开（返回信息更重要）。

### 3.5 面板可折叠

**文件**: `src/views/Workbench.vue`

当前面板结构：
```html
<div class="panel"><div class="panel-title">Agent 推理链路</div><ReasoningPanel /></div>
<div class="panel"><div class="panel-title">污染源地图</div><MapPanel /></div>
```

改为：
```html
<div class="panel" :class="{ collapsed: reasoningCollapsed }">
  <div class="panel-title-bar" @click="reasoningCollapsed = !reasoningCollapsed">
    <span class="panel-title">Agent 推理链路</span>
    <el-icon class="collapse-icon" :class="{ folded: reasoningCollapsed }"><ArrowDown /></el-icon>
  </div>
  <div v-show="!reasoningCollapsed" class="panel-body"><ReasoningPanel /></div>
</div>
```

- 折叠时：`flex: 0 0 auto`（只显示标题栏），另一个面板自动撑满
- 展开时：`flex: 2`（推理）/ `flex: 1`（地图），恢复原比例
- 点击标题栏切换折叠/展开

### 3.6 "在地图查看"按钮联动

**文件**: `src/components/ReasoningPanel.vue` + `src/views/Workbench.vue` + `server/lib/agent.ts` + `src/composables/useSSE.ts` + `src/stores/chat.ts`

**问题**：当前 `map_render` 事件不携带 toolId，前端无法知道哪些工具步骤产生了地图点位。

**服务端微调**（agent.ts + chat.ts + useSSE.ts）：`onMapRender` 回调增加 toolId 参数：
```ts
// agent.ts: onMapRender 调用时传入当前工具 id
if (mapPoints && mapPoints.length > 0) cb.onMapRender?.(id, mapPoints, viewport)
```
```ts
// AgentCallbacks 接口
onMapRender?: (toolId: string, points: MapPoint[], viewport?: [number, number, number, number]) => void
```
```ts
// chat.ts SSE: send('map_render', { id, points, viewport })
```
```ts
// useSSE.ts: onMapRender?: (toolId: string, data: MapRenderData) => void
```

**前端 store**（chat.ts）：`onMapRender` 收到 toolId 后，标记对应 ToolEvent 的 `hasMapPoints = true`：
```ts
onMapRender: (toolId, data) => {
  if (data.points?.length) {
    this.mapPoints = [...this.mapPoints, ...data.points]
    const ev = this.toolEvents.find(e => e.id === toolId)
    if (ev) ev.hasMapPoints = true
  }
  if (data.viewport) this.viewport = data.viewport
},
```

**按钮展示**：在 ReasoningPanel 中，`ev.hasMapPoints` 为 true 的工具卡片显示"在地图查看"按钮：
```html
<el-button v-if="ev.hasMapPoints" link size="small" :icon="MapLocation"
  @click.stop="$emit('focus-map')">在地图查看</el-button>
```

**联动行为**（Workbench.vue）：ReasoningPanel emit `focus-map` 事件 → Workbench 接收后：
1. 折叠推理面板（或缩小比例）
2. 展开地图面板
3. 地图面板闪烁高亮 1 秒提示用户

---

## Files to Modify

| 文件 | 改动范围 | 说明 |
|---|---|---|
| `src/stores/chat.ts` | ToolEvent 接口 + onToolStart + onMapRender | 思考卡片逻辑 + hasMapPoints 标记 |
| `src/components/ReasoningPanel.vue` | 模板 + 脚本 + 样式 | 四色分类、时间轴、JSON 折叠、在地图查看按钮 |
| `src/views/Workbench.vue` | 模板 + 脚本 + 样式 | 面板可折叠 + focus-map 联动 |
| `server/lib/agent.ts` | onMapRender 回调签名 | 传 toolId（1 行改） |
| `server/routes/chat.ts` | map_render SSE data | 加 id 字段（1 行改） |
| `src/composables/useSSE.ts` | onMapRender handler 签名 | 加 toolId 参数 |

---

## Verification Steps

1. `npx vue-tsc --noEmit` 类型检查通过
2. `npx pnpm@10 build` 构建成功
3. 启动 server + 前端，提问"沙圪堵镇超标废气企业"：
   - 聊天区先短暂显示模型思考文本，随后文本消失（移入推理面板黄色思考卡片）
   - 推理面板出现：黄色思考卡片 → 蓝色/绿色工具卡片，有时间轴连线
   - 工具卡片有 JSON 入参折叠、返回折叠区块
   - 有 mapPoints 的工具卡片显示"在地图查看"按钮，点击后地图面板展开并高亮
4. 面板折叠：点击推理/地图面板标题可折叠/展开
5. 异常场景：问一个无数据的问题，工具返回空，卡片正常显示蓝色（无数据）
