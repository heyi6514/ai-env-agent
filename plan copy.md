The user wants the complete PLAN.md content. This is a new file creation, so I should output it as a code block directly. The file doesn't exist yet, so I can't use show_diff.

Let me write a comprehensive PLAN.md that consolidates everything from our conversation:
1. Project overview & goal
2. MVP scope (in/out)
3. Tech stack decisions
4. Architecture & SSE protocol
5. Directory structure
6. 7-day plan with checkboxes
7. Reusable assets list
8. Risks & degradation plans
9. Resume/interview notes
10. Action checklist

The user's latest message is in Chinese, so respond in Chinese. The file should be at d:\2026\work\clx_project\ai-env-agent\PLAN.md (new project directory). Since the file doesn't exist yet, I output a code block with the absolute path.

I should keep it comprehensive but organized. This is a markdown file so the language ID is `markdown`. Let me write it well-structured so a new session can pick it up seamlessly ("先读 PLAN.md，从 Day X 继续").
好的，以下是 `PLAN.md` 完整内容。请先创建好 `ai-env-agent` 目录（平级于 Environmental-IISS-Web），然后把内容保存为 `d:\2026\work\clx_project\ai-env-agent\PLAN.md`。

````markdown
# AI 环保智能监管工作台｜1 周冲刺开发计划（PLAN.md）

> **用途**：本项目唯一 roadmap。新会话恢复上下文只需说："先读 PLAN.md，从 Day X 继续"。
> **目标**：1 周（7 天 × 10-12h）完成可上线、可写进简历的 MVP，投递求职。
> **原则**：能跑通 > 能上线 > 截图好看 > 代码优雅。其余全部让步。

---

## 0. 一句话定位

面向生态环境监管业务的垂直 AI Agent 工作台：自然语言驱动 RAG 政策检索 + GIS 污染源查询 + 监测统计 + 报告导出，含 Agent 推理链路可视化与 OpenLayers 地图联动。业务背景来自本人过往环保政务/WebGIS 大屏项目沉淀（简历一脉相承）。

**简历项目名**：AI 环保智能监管工作台｜Web AI Agent 垂直业务 Demo（个人独立项目）

---

## 1. MVP 功能边界（In / Out）

### ✅ 必保（简历核心关键词来源）

| 功能 | 简历关键词 | 说明 |
|---|---|---|
| 对话 + SSE 流式打字机 | SSE 流式大模型 | DeepSeek 流式输出 + Markdown 渲染 |
| 多工具 Agent 调度 | Function Calling / Agent | 4 工具，LLM 自主选择调用 |
| Agent 推理链路可视化 | Agent 执行链路 | 思考→选工具→入参→返回 时序卡片（**核心亮点**） |
| RAG 政策知识库 | RAG / 向量库 | PDF/MD 上传→分块→embedding→检索→原文溯源 |
| OpenLayers 地图联动 | WebGIS | 点位渲染/状态色/弹窗/视口自动定位 |
| 密钥服务端代理 | 前端安全 | Vercel Function 环境变量，前端不暴露 Key |

### ⚠️ 极简实现

| 功能 | 简化方式 |
|---|---|
| Tool3 监测统计 | 返回写死的 mock 统计结果 |
| Tool4 报告导出 | 拼 Markdown 模板字符串，前端触发下载 .md |

### ❌ 明确砍掉（不做）

- 多会话管理（只做单会话 + LocalStorage 持久化）
- RAG 调优面板（参数硬编码：TopK=4, chunkSize=500, overlap=50）
- 知识库管理列表/删除/切片预览（只做上传）
- Function Calling 失败自动重试
- 文件大小校验（只校验扩展名）
- 单元测试 / 严格 TS / 响应式 / 暗黑模式 / i18n / 登录权限

---

## 2. 技术栈（锁定版本）

| 层 | 选型 | 备注 |
|---|---|---|
| 前端 | Vue 3.4 + TypeScript + Vite 5 + Pinia | 熟练栈 |
| UI / 样式 | Element Plus + TailwindCSS | 快速搭界面 |
| 地图 | OpenLayers 8 | 复用简历 GIS 经验 |
| LLM | DeepSeek `deepseek-chat` | 充值 30 元 |
| Agent 框架 | `langchain@0.3.x` + `@langchain/community@0.3.x`（**锁版本，勿装最新**） | Agent + 工具 + callbacks |
| Embedding | 硅基流动 `text-embedding-v3`（1024 维）或通义 `text-embedding-v2`（1536 维） | DeepSeek 无自家 embedding |
| 向量库 | Pinecone 免费档（统一本地+线上） | 建 index 时维度必须与 embedding 一致 |
| PDF 解析 | `unpdf`（备选 `pdf-parse`） | Vercel Node runtime 友好 |
| 文本分块 | `langchain/text_splitter` 的 `RecursiveCharacterTextSplitter` | 现成 |
| 部署 | Vercel（Edge + Node Serverless 混合） | 见 §3 运行时分工 |

---

## 3. 架构与运行时分工

```
Browser (Vue3 SPA)
  ├─ 对话区(左)  ├─ 推理链路面板(右上)  ├─ OpenLayers 地图(右下)
        │ POST /api/chat (SSE)
        ▼
/api/chat  [Edge runtime] ──→ LangChain Agent(deepseek-chat)
                                ├─ Tool1 rag_search    → /api/query-vector
                                ├─ Tool2 gis_query     → 本地 mock 数据
                                ├─ Tool3 monitor_stat  → 本地 mock 统计
                                └─ Tool4 report_export → 拼 Markdown
        │ POST /api/upload
        ▼
/api/upload  [Node runtime] → unpdf 解析 → Splitter 分块 → embedding → Pinecone
/api/query-vector [Node runtime] → Pinecone 检索 TopK
```

**运行时分工（关键，勿混）**：
- `api/chat.ts` → **Edge**（SSE 流式）
- `api/upload.ts` / `api/query-vector.ts` → **Node**（Pinecone SDK、PDF 解析需要 Node API，Edge 跑不了）
- `vercel.json` 中为 upload/query-vector 配 `maxDuration: 60`

---

## 4. SSE 事件协议（前后端契约）

```
event: message        data: {"content":"..."}                          # 打字机文本
event: agent_thought  data: {"thought":"...","step":1}                 # Agent 思考
event: tool_start     data: {"tool":"gis_query","input":{...},"step":2}
event: tool_end       data: {"tool":"gis_query","output":{...},"step":2,"duration":320}
event: map_render     data: {"points":[...],"viewport":[lng,lat,lng,lat]}  # 前端地图联动
event: report         data: {"filename":"...","markdown":"..."}        # 触发下载
event: error          data: {"message":"..."}
event: done           data: {}
```

实现：LangChain `callbacks`（`onLLMStart`/`onToolStart`/`onToolEnd`）→ SSE writer 桥接。

---

## 5. 目录结构

```
ai-env-agent/
├── api/                          # Vercel Serverless
│   ├── chat.ts                   # Edge, SSE Agent 对话
│   ├── upload.ts                 # Node, 文档处理入库
│   ├── query-vector.ts           # Node, RAG 检索
│   └── lib/
│       ├── agent.ts              # LangChain Agent + 4 工具注册
│       ├── tools/{rag,gis,monitor,report}.ts
│       ├── vector-store.ts       # Pinecone 封装
│       └── mock-data.ts          # 环保 mock 数据集
├── src/
│   ├── stores/chat.ts            # Pinia：消息 + trace + mapPoints
│   ├── views/{Workbench,Knowledge}.vue
│   ├── components/{ChatPanel,AgentTrace,MapPanel,MessageItem}.vue
│   ├── composables/{useSSE,useAgent}.ts
│   └── assets/gis/map-icon/      # 从 IISS 项目扒的点位图标
├── public/geojson/{zger,jiedao}.json
├── vercel.json
├── .env.example                  # 仅 key 名，不含值
└── PLAN.md                       # 本文件
```

**环境变量**（.env + Vercel 后台都配）：`DEEPSEEK_API_KEY`、`EMBEDDING_API_KEY`、`PINECONE_API_KEY`、`PINECONE_INDEX`。**严禁 commit 真实 key。**

**核心数据结构**：
```ts
interface PollutantPoint {
  id: string; name: string; type: '废气'|'废水'|'大气站'|'水站';
  status: '正常'|'超标'; lng: number; lat: number; region: string;
  indicators: { name: string; value: number; limit: number; unit: string }[]
}
interface Message {
  role: 'user'|'assistant'; content: string;
  trace?: TraceStep[]; mapPoints?: PollutantPoint[]; ts: number
}
```

---

## 6. 七天逐日计划

### Day 1｜账号 + SSE 聊天跑通
- [ ] 注册 DeepSeek(充30元)/Pinecone/硅基流动/Vercel，4 个 Key 备好
- [ ] 读 DeepSeek Function Calling 文档 30 分钟，fetch 跑通流式 chat
- [ ] `pnpm create vite ai-env-agent --template vue-ts`，装 Pinia/ElementPlus/Tailwind/OpenLayers
- [ ] 搭工作台三栏布局（对话/推理/地图占位）
- [ ] 写 `api/chat.ts`(Edge SSE) + 前端 `useSSE.ts`，无 Agent 纯聊天
- [ ] **验收：页面流式聊天 OK**
- 坑：Edge 用 `ReadableStream` 不用 `res.write`；DeepSeek 流是 `data:{...}\n\n` 格式

### Day 2｜Agent 最小闭环（单工具 GIS）
- [ ] LangChain.js Quickstart + Agent 章节速读，跑官方 demo
- [ ] 从 Environmental-IISS-Web 扒数据结构 + zger.json + 图标（见 §7）
- [ ] 手写 30 条 mock 点位（散布准格尔旗各乡镇，部分超标）
- [ ] 定义 `gisTool(region,type,status)`，写 `agent.ts`（先单工具）
- [ ] chat.ts 接入 Agent，前端展示回答
- [ ] **验收：问"沙圪堵镇超标废气企业"返回点位列表**
- 坑：锁版本 0.3.x；`ChatDeepSeek` 在 `@langchain/community/chat_models/deepseek`

### Day 3｜RAG 工具
- [ ] 建 Pinecone index（维度与 embedding 模型一致！）
- [ ] `vector-store.ts` 封装，手动塞文本→查询→返回片段
- [ ] `api/upload.ts`：unpdf 解析→Splitter(500/50)→embedding→入库
- [ ] `ragTool` 接入 Agent，双工具跑通
- [ ] **验收：上传政策 PDF 后问限值，能引用原文回答**
- 坑：embedding 批量入库要限速 sleep；Pinecone 冷启动 5-10s 属正常

### Day 4｜Tool3/4 极简 + 推理链路数据通路
- [ ] `monitorTool`（写死 mock 统计）、`reportTool`（拼 Markdown）
- [ ] 四工具全接入 Agent
- [ ] 实现 callbacks→SSE 桥接（§4 协议），前端 trace 数组累积
- [ ] `AgentTrace.vue` 骨架（卡片列表占位）
- [ ] **验收：面板能看到事件流**
- 坑：callbacks 参数签名 0.2/0.3 不同，看 node_modules 实际类型

### Day 5｜推理链路可视化完整实现
- [ ] 卡片分类样式：思考(黄)/工具(蓝)/数据(绿)/异常(红)
- [ ] JSON 入参/返回折叠展开（el-collapse）+ 垂直时间轴 + 自动滚动
- [ ] 面板可折叠；异常事件红色卡片
- [ ] trace 步骤"在地图查看"按钮联动
- [ ] **验收：四工具全流程链路完整展示**

### Day 6｜OpenLayers 地图联动
- [ ] 扒 IISS 项目 OpenLayers 初始化代码；加载 zger.json 边界
- [ ] 监听 `map_render` 渲染点位（绿正常/红超标）+ Overlay 弹窗
- [ ] 视口 fit 到查询区域；重新提问清空图层
- [ ] **验收：GIS 问题触发地图自动定位渲染**
- 坑：`optimizeDeps.include:['ol']`；底图直接用 OSM（天地图 key 申请慢）；点位多加 Cluster

### Day 7｜收尾 + 部署 + 简历
- [ ] 单会话 LocalStorage 持久化/清空/复制/停止生成(AbortController)/空态错误态
- [ ] Knowledge 上传页（极简）
- [ ] Vercel 环境变量 + vercel.json runtime 配置，部署并自测全流程
- [ ] README：架构 Mermaid + 4 张截图 + 启动步骤 + demo 链接
- [ ] 简历加"个人技术 Demo 项目"（用 PRD 第六节文案）
- [ ] **验收：发给朋友点开链接能跑通**

---

## 7. 从 Environmental-IISS-Web 复用的资产（只扒结构/资源，不扒业务代码）

| 资产 | 源路径 | 用途 |
|---|---|---|
| 准格尔旗边界 GeoJSON | `public/zger.json` | 地图边界（业务真实感关键） |
| 街道 GeoJSON | `public/jiedao.json` | 乡镇定位 |
| 点位图标 | `src/assets/gis/map-icon/*.png` | OpenLayers icon |
| GIS 字段结构 | `src/api/gis-system/{air,pollution,water,site}.ts` | mock 字段参考 |
| 监测字段结构 | `src/api/analysis-by-synthesis/*.ts` | Tool3 mock 参考 |
| 执法字段结构 | `src/api/law-enforcement/*.ts` | Tool4 报告参考 |

```bash
mkdir ai-env-agent\public\geojson
copy Environmental-IISS-Web\public\zger.json ai-env-agent\public\geojson\
copy Environmental-IISS-Web\public\jiedao.json ai-env-agent\public\geojson\
xcopy Environmental-IISS-Web\src\assets\gis\map-icon ai-env-agent\src\assets\gis\map-icon\ /E /I
```

---

## 8. 风险与降级预案（卡住超过 2 小时就执行）

| 卡点 | 降级方案 |
|---|---|
| Day 2 晚单工具 Agent 还没通 | 砍 Tool3/4，只做 RAG+GIS 双工具（简历依然成立） |
| Day 5 推理面板事件流不通 | 只展示 `tool_start`/`tool_end` 两种事件，去掉 agent_thought |
| Day 6 晚 OpenLayers 没渲染出来 | 改 el-table 点位列表，简历话术改"地理数据列表展示" |
| Pinecone 各种折腾不通 | 本地 vectra 开发，部署若失败 demo 录屏代替在线链接 |
| unpdf/pdf-parse 在 Vercel 报错 | 换另一个；仍不行则只支持 .md 上传 |
| LangChain 文档对不上 | 以 node_modules 实际类型定义为准 |

---

## 9. 简历/面试注意事项

1. **没上线绝对不写**；README 必须有截图
2. 技能栏写法：「掌握 LangChain-JS，具备 RAG 知识库、Function Calling 多工具 Agent、SSE 流式大模型 Web 应用开发实践」（不写"了解 AI"）
3. 三个灵魂问题背熟：
   - Agent vs 直接调 API？→ Function Calling 多工具调度 + RAG 溯源
   - RAG 怎么切分/TopK 怎么定？→ chunkSize=500/overlap=50/TopK=4 + 实测调优说法
   - 密钥怎么不泄露？→ Vercel Function 环境变量服务端代理
4. mock 数据不要含公司项目真实数据；key 不进仓库（`.env.example` + `.gitignore`）

---

## 10. 今天就做的 5 件事

1. 注册 DeepSeek(充值)/Pinecone/硅基流动/Vercel
2. Github 新建公开仓库 `ai-env-agent`
3. `cd d:\2026\work\clx_project && pnpm create vite ai-env-agent --template vue-ts`
4. 执行 §7 的资产拷贝命令
5. 读 DeepSeek Function Calling 文档 30 分钟

---

## 11. 开发协助请求模板

做到哪天卡住，新会话直接说：
> 先读 PLAN.md，我在 Day X 的【某步骤】卡住了，帮我输出【A/B/C/D/E】的完整代码：
> A: chat.ts(Edge SSE) + useSSE.ts　B: agent.ts + gisTool + mock 数据
> C: upload.ts + ragTool + vector-store.ts　D: callbacks→SSE 桥接 + AgentTrace.vue
> E: MapPanel.vue（点位渲染/弹窗/视口定位）
````

**几点使用说明：**

1. **保存位置**：`d:\2026\work\clx_project\ai-env-agent\PLAN.md`（先创建目录再保存）
2. **新会话恢复上下文**：以后任何新窗口，第一句话说“先读 PLAN.md，从 Day X 继续”，即可无缝衔接
3. **§11 是特意设计的**：请求帮助的句式模板，直接复制粘贴就行
4. **建议 git init 后把 PLAN.md 作为第一个 commit**，既是里程碑，也顺便验证仓库可用

保存好就可以开始 Day 1 了。做到任何一步卡住，回来按 §11 的模板找我。