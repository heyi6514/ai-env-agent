# ARCHITECTURE.md — 系统架构与接口契约

> **用途**：系统级架构说明、接口契约、数据模型定义。修改任何对外协议前必须先更新本文档。
> **适用场景**：新增 Agent 工具 / SSE 事件 / REST 接口 / 排查数据流 / 面试展示系统设计。
> **相关文档**：`AGENTS.md`（速查+规范）、`DEVLOG.md`（踩坑复盘）、`README.md`（对外展示）。

---

## 1. 系统总览

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Vue 3 SPA)                     │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ ChatPanel │ │ReasoningPanel│ │      MapPanel        │ │
│  │ (对话区)  │ │ (推理链路)   │ │  (OpenLayers 10)    │ │
│  └─────┬─────┘ └──────┬───────┘ └──────────┬───────────┘ │
│        │              │                     │             │
│        └──────────────┼─────────────────────┘             │
│                       │                                   │
│              useSSE.ts (POST + ReadableStream)            │
└───────────────────────┼───────────────────────────────────┘
                        │ POST /api/chat (SSE)
                        │ POST /api/upload
                        │ GET/DELETE /api/documents
┌───────────────────────▼───────────────────────────────────┐
│              nginx (443, HTTPS, 反代 :3000)                 │
│              proxy_buffering off (SSE 必备)                │
└───────────────────────┬───────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────┐
│           Express 4 (pm2 常驻, NODE_ENV=production)         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  /api/chat (SSE)  → runAgent()                        │ │
│  │  /api/upload      → unpdf → split → embedding → Pinecone│ │
│  │  /api/documents   → Pinecone list/delete              │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Agent (手写 tool-calling 循环, MAX_TOOL_ROUNDS=5)    │ │
│  │    ├─ query_pollution_sources  → mock-sources         │ │
│  │    ├─ query_air_quality        → mock-monitoring      │ │
│  │    ├─ query_water_quality      → mock-monitoring      │ │
│  │    ├─ query_vehicle_sensing    → mock-monitoring      │ │
│  │    ├─ search_knowledge_base    → Pinecone (BGE embed) │ │
│  │    └─ generate_report          → Markdown 拼装        │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 1.2 请求数据流（以"查询污染源"为例）

```
用户输入 → ChatPanel
  → store.send() 构造 messages
  → useSSE.fetchSSE('/api/chat', { messages })
  → Express chat.ts:
      1. 过滤 user/assistant 消息（防伪造 system）
      2. 长度/条数限制（MAX_MESSAGE_LENGTH=10000, MAX_HISTORY=50）
      3. 注入 SYSTEM_PROMPT
      4. runAgent(messages, callbacks, abortSignal)
  → Agent 循环:
      model.stream() → 检查 tool_calls
      有 tool_calls → onToolStart → executeTool → onToolEnd
        → 数据类工具附带 mapPoints → onMapRender → send('map_render')
      追加 ToolMessage → 下一轮
      无 tool_calls → 结束
  → SSE 事件流回前端:
      message (token) → ChatPanel 打字机渲染
      tool_start/end → ReasoningPanel 时间轴
      map_render    → MapPanel 点位渲染 + 视口自适应
      done          → 结束
```

---

## 2. SSE 事件协议

**Endpoint**: `POST /api/chat`
**Content-Type**: `text/event-stream; charset=utf-8`
**传输方式**: fetch + ReadableStream（不用 EventSource，因为需要 POST body）

### 2.1 事件类型清单

| event | payload 字段 | 触发时机 |
|-------|-------------|---------|
| `message` | `{ content: string }` | LLM 流式 token 输出 |
| `tool_start` | `{ id, name, args }` | Agent 决定调用工具 |
| `tool_end` | `{ id, name, summary, sources?, dataSummary? }` | 工具执行完成 |
| `map_render` | `{ id, points: MapPoint[], viewport? }` | 工具返回带坐标点位 |
| `report` | `{ id, filename, markdown }` | 报告工具生成完毕 |
| `error` | `{ message: string }` | 服务端异常 / 超时 |
| `done` | `{}` | 整个对话流结束 |

### 2.2 关键数据结构

```typescript
/** 地图点位（前后端镜像定义） */
interface MapPoint {
  id: string
  name: string
  type: 'air' | 'water' | 'solid' | 'airStation' | 'waterStation' | 'vehicle'
  status: '正常' | '超标'
  lon: number          // 经度（WGS84）
  lat: number          // 纬度（WGS84）
  detail?: string      // 弹窗摘要
}

/** map_render 视口 bounding box [minLon, minLat, maxLon, maxLat] */
type Viewport = [number, number, number, number]

/** RAG 命中来源（推理链路展示用） */
interface ToolSource {
  source: string       // 文件名
  page: number | null  // 页码（PDF 有，文本无）
  score: number        // 相似度（0~1，BGE 模型相关文档常在 0.2~0.5）
}
```

### 2.3 协议约束

- 空点位不发 `map_render`（避免地图闪空视图）
- `tool_end` 的 `summary` 优先取工具返回的 `summary` 字段，否则用 `total` 生成"返回 N 条记录"
- `error` 后必跟 `done`，前端据此结束 loading
- 生产环境 `error.message` 不含 `err.message`（脱敏）

---

## 3. REST API 契约

### 3.1 POST /api/chat — Agent 对话（SSE）

**请求体**:
```json
{
  "messages": [
    { "role": "user", "content": "沙圪堵镇有哪些超标企业？" },
    { "role": "assistant", "content": "..." }
  ]
}
```

**校验规则**:
- `messages` 必须是非空数组
- 只保留 `role` 为 `user` 或 `assistant` 且 `content` 为非空字符串的消息（防伪造 system/工具消息）
- 单条 `content` 长度 ≤ 10000 字符（超出返回 400）
- 截取最近 50 条（超出静默截断）

**响应**: SSE 流，见第 2 节。

### 3.2 POST /api/upload — 文档上传入库

**Content-Type**: `multipart/form-data`
**字段**: `file`（单文件）

**校验规则**:
- 文件类型：仅 `.pdf` / `.md` / `.txt`
- 文件大小：≤ 20MB
- 处理超时：120s（超时返回 504，已入库向量回滚）

**响应**:
```json
{
  "filename": "环保法.pdf",
  "chunks": 42
}
```

### 3.3 GET /api/documents — 知识库文档列表

**响应**:
```json
{
  "documents": [
    {
      "docId": "1728000000000_a1b2c3",
      "filename": "环保法.pdf",
      "chunks": 42,
      "pages": 15,
      "uploadedAt": "2026-10-09T10:00:00.000Z"
    }
  ]
}
```

### 3.4 DELETE /api/documents/:docId — 删除文档

**路径参数**: `docId` — 文档唯一标识（Pinecone vector ID 前缀）

**响应**:
```json
{ "deleted": 42 }
```

### 3.5 GET /api/health — 健康检查

**响应**:
```json
{ "status": "ok", "ts": 1728000000000 }
```

用途：pm2/nginx 探活、CI 部署验收判据。

---

## 4. Agent 工具注册表

所有工具通过 `@langchain/core/tools` 的 `tool()` 定义，zod schema 约束入参，返回 JSON 字符串。

### 4.1 query_pollution_sources — 污染源查询

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `town` | string | 否 | 乡镇名称 |
| `type` | `'air' \| 'water' \| 'solid'` | 否 | 废气/废水/固废 |
| `status` | `'正常' \| '超标'` | 否 | 排放状态 |
| `keyword` | string | 否 | 企业名/行业关键字 |

**返回**: `{ total, items, dataSummary, mapPoints, viewport }`

### 4.2 query_air_quality — 空气质量监测

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `town` | string | 否 | 乡镇名称 |

**返回**: `{ total, items, dataSummary, mapPoints, viewport }`（items 含 AQI、六参数、等级、首要污染物）

### 4.3 query_water_quality — 水环境质量

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `town` | string | 否 | 乡镇名称 |
| `kind` | `'section' \| 'drinking'` | 否 | 河流断面/饮用水源地 |

**返回**: `{ total, items, dataSummary, mapPoints, viewport }`

### 4.4 query_vehicle_sensing — 机动车遥测

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `town` | string | 否 | 乡镇名称 |

**返回**: `{ total, items, dataSummary, mapPoints, viewport }`（items 含检测数、超标数、超标率、主要车型）

### 4.5 search_knowledge_base — 法规知识库检索（RAG）

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 检索关键词 |

**返回**: `{ total, content, sources }`（content 为格式化的原文片段带来源编号，sources 为命中的文件名+页码+相似度）

### 4.6 generate_report — 执法报告生成

| 入参 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 报告标题 |
| `scope` | string | 是 | 检查范围 |
| `findings` | string[] | 是（≥1） | 检查发现条目（必须来自工具真实数据） |
| `dataSummary` | string | 否 | 数据统计摘要 |
| `suggestion` | string | 是 | 处置建议 |

**返回**: `{ summary, report: { filename, markdown } }`，触发前端下载 `.md` 文件。

---

## 5. 数据模型

### 5.1 Mock 数据源

| 文件 | 内容 | 动态化方式 |
|------|------|-----------|
| `data/mock-sources.ts` | 30 条污染源（废气/废水/固废） | 浓度 ±10% 抖动，临界点位（value/limit 在 0.85~1.15）冻结防翻车 |
| `data/mock-monitoring.ts` | 5 AQI 站 + 7 水质实体 + 4 遥测点 | AQI 六参数 ±15% 抖动后按 HJ 633-2012 国标公式重算；水质类别不抖；遥测 ±10% |

**动态化引擎** (`lib/simulate.ts`):
- Mulberry32 种子随机（可复现）
- 时间桶（AQI=1h，水质=日报，遥测=昨日 07:00-19:00）
- 同一小时内查询结果稳定，跨小时自动演变

### 5.2 Pinecone 向量结构

```typescript
// 待入库
interface Chunk {
  id: string           // `${docId}:${chunkIndex}`，纯 ASCII
  text: string
  metadata: {
    source: string      // 原始文件名
    chunkIndex: number
    page?: number       // PDF 页码
  }
}

// 检索结果
interface QueryResult {
  id: string
  text: string
  score: number        // 余弦相似度
  source: string
  chunkIndex: number
  page?: number
}
```

**约束**:
- Pinecone v9 `upsert({ records })`（不是数组）
- vector ID 必须 ASCII（中文文件名只存 metadata.source）
- 相似度阈值 0.15（BGE 模型相关文档常在 0.2~0.5）

### 5.3 前端状态（Pinia chat store）

```typescript
interface ChatState {
  messages: Message[]              // 对话历史
  toolEvents: ToolEvent[]          // 推理链路事件（思考/工具/数据/异常）
  mapPoints: MapPoint[]            // 地图点位
  mapViewport: Viewport | null     // 地图视口
  sessions: Session[]              // 会话列表（localStorage 持久化）
  activeSessionId: string | null
}
```

---

## 6. 部署架构

### 6.1 CI/CD 流水线（GitHub Actions）

```
git push origin main
  ↓
checkout → pnpm install → pnpm build (注入 VITE_TIAN_DI_TU_KEY)
  ↓
rsync 三条:
  dist/ → 服务器 dist/
  server/ → 服务器 server/ (排除 node_modules)
  package.json pnpm-lock.yaml ecosystem.config.cjs → 服务器根目录
  ↓
SSH 远程执行:
  source ~/.nvm/nvm.sh
  pnpm install --frozen-lockfile
  pm2 reload || pm2 start
  pm2 save
  循环重试 /api/health (最多 30s)
  ↓
CI 红绿 = 部署成败
```

### 6.2 服务器拓扑

```
阿里云 ECS (Alibaba Cloud Linux 2, glibc 2.17)
  ├─ nginx (80→443 强制 HTTPS, 反代 127.0.0.1:3000)
  │   └─ proxy_buffering off (SSE 打字机必备)
  ├─ pm2 (进程名 ai-env-agent, script=node_modules/tsx/dist/cli.mjs)
  │   └─ Express :3000 (自托管 dist + SPA fallback)
  └─ Node 20 (unofficial-builds glibc-217 变体, 经 nvm 管理)
```

### 6.3 密钥分层

| 层级 | 密钥 | 存储位置 |
|------|------|---------|
| 前端构建期 | `VITE_TIAN_DI_TU_KEY` | GitHub Secrets |
| 服务端运行时 | `DEEPSEEK_API_KEY` / `EMBEDDING_API_KEY` / `PINECONE_*` | 服务器 `/www/wwwroot/ai.heyi.pub/.env` |
| 部署 | SSH 私钥 | GitHub Secrets `SSH_PRIVATE_KEY` |

---

## 7. 安全机制

| 机制 | 实现 | 位置 |
|------|------|------|
| XSS 防护 | MarkdownIt `html: false`，所有用户内容走转义 | `src/utils/markdown.ts` |
| 密钥隔离 | 三层分离，.env gitignore，生产不暴露 err.message | `.gitignore` / `chat.ts` / `upload.ts` |
| 输入校验 | zod schema 约束工具入参，消息角色过滤，长度/条数限制 | 各 `tools/*.ts` / `chat.ts` |
| 上传安全 | 类型白名单 + 20MB + 120s 超时 + 失败回滚 | `routes/upload.ts` |
| 系统注入防护 | system prompt 服务端注入，客户端消息只取 user/assistant | `routes/chat.ts` |
| Agent 防循环 | MAX_TOOL_ROUNDS=5，超时强制模型生成最终回答 | `lib/agent.ts` |
| LLM 成本控制 | temperature=0，历史 50 条截断，单条 10000 字符上限 | `routes/chat.ts` |
