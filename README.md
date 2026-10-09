# AI 环保智能监管工作台

> 面向生态环境监管业务的垂直 AI Agent 工作台 —— 自然语言驱动 GIS 污染源查询 + RAG 法规检索 + 监测数据统计 + 执法报告生成

**在线 Demo**: [https://ai.heyi.pub](https://ai.heyi.pub)

## 功能总览

| 功能 | 说明 |
|------|------|
| AI 对话问答 | SSE 流式打字机输出，Markdown 渲染 + 代码高亮 |
| Agent 推理链路可视化 | 思考 → 选工具 → 入参 → 返回 四色时序卡片，逐步可折叠 |
| GIS 污染源地图 | OpenLayers 10 + 天地图，点位状态染色 + 弹窗 + 视口自适应 |
| RAG 法规知识库 | PDF/MD/TXT 上传 → 分块 → embedding → Pinecone 检索 → 原文溯源 |
| 监测数据统计 | AQI / 水质断面 / 机动车遥测，模拟动态数据（时间桶抖动） |
| 执法报告导出 | Agent 多工具查询 → 自动拼装 Markdown 执法报告 → 前端下载 |
| 会话管理 | localStorage 持久化历史会话，支持新建/切换/删除 |
| 布局模式切换 | 巡视/均衡/分析三档 + 可拖拽分隔条，地图与推理面板自由配比 |

## 技术栈

| 层 | 选型 |
|---|------|
| 前端 | Vue 3 + TypeScript + Vite 8 + Pinia + Element Plus + Tailwind CSS 4 |
| 地图 | OpenLayers 10（天地图 vec_w + cva_w 双图层，无 Key 回退 OSM） |
| LLM | DeepSeek `deepseek-flash`（Function Calling） |
| Agent 框架 | `@langchain/core` 手写 tool-calling 循环（非 AgentExecutor） |
| Embedding | 硅基流动 `BAAI/bge-large-zh-v1.5`（1024 维） |
| 向量库 | Pinecone Serverless |
| PDF 解析 | unpdf |
| 后端 | Express 4 + Node 20（tsx 直接跑 TS） |
| 部署 | 阿里云 ECS + nginx + pm2 + GitHub Actions CI/CD |
| CI/CD | push main → 自动构建 → rsync 部署 → 健康检查 |

## 架构

```
浏览器 (Vue 3 SPA)
  ├─ 对话区 (ChatPanel)          ← SSE 流式
  ├─ 推理链路面板 (ReasoningPanel) ← tool_start / tool_end / thought 事件
  ├─ 地图面板 (MapPanel)           ← map_render 事件联动 OpenLayers
  └─ 知识库管理 (Knowledge)        ← REST 上传/列表/删除
        │
        ▼ POST /api/chat (SSE)
nginx :443 ──反代──→ Express :3000 (pm2 常驻)
  ├─ LangChain Agent (deepseek-flash, temperature=0)
  │    ├─ query_pollution_sources  → mock 污染源数据（时间桶抖动）
  │    ├─ query_air_quality        → mock AQI 监测站
  │    ├─ query_water_quality      → mock 水质断面/水源地
  │    ├─ query_vehicle_sensing    → mock 机动车遥测
  │    ├─ search_knowledge_base    → Pinecone 向量检索
  │    └─ generate_report          → Markdown 报告拼装
  │
  ├─ POST /api/upload   → unpdf 解析 → 递归分块 → embedding → Pinecone
  └─ GET/DELETE /api/documents      → Pinecone 文档管理
```

### SSE 事件协议

```
event: message      data: {"content":"..."}                           # 打字机文本
event: tool_start   data: {"id":"...","name":"...","args":{...}}      # 工具调用开始
event: tool_end     data: {"id":"...","summary":"...","sources":[...]} # 工具返回
event: map_render   data: {"id":"...","points":[...],"viewport":[...]} # 地图联动
event: report       data: {"id":"...","filename":"...","markdown":""}  # 报告下载
event: error        data: {"message":"..."}
event: done         data: {}
```

## 快速开始

### 前置要求

- Node.js >= 20
- pnpm 10
- DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com)）
- 硅基流动 API Key（[siliconflow.cn](https://siliconflow.cn)，用于 embedding）
- Pinecone API Key + 预先创建的 Index（[pinecone.io](https://pinecone.io)，维度 1024）
- 天地图 Key（可选，[tianditu.gov.cn](https://tianditu.gov.cn)，无 Key 回退 OSM）

### 安装与启动

```bash
# 克隆项目
git clone https://github.com/heyi6514/ai-env-agent.git
cd ai-env-agent

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 终端 1：启动后端（端口 3000）
pnpm dev:server

# 终端 2：启动前端（端口 5173，/api 自动代理到 3000）
pnpm dev
```

打开 http://localhost:5173 即可使用。

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 是 |
| `EMBEDDING_API_KEY` | 硅基流动 API Key | 是 |
| `PINECONE_API_KEY` | Pinecone API Key | 是 |
| `PINECONE_INDEX` | Pinecone Index 名称 | 是 |
| `TIAN_DI_TU_KEY` | 天地图 Key（前端构建期注入需加 `VITE_` 前缀） | 否 |
| `PORT` | 后端端口，默认 3000 | 否 |

### 生产部署

```bash
# 构建前端
pnpm build

# 生产模式启动（Express 托管 dist + SPA fallback）
NODE_ENV=production tsx server/index.ts
```

项目已配置 GitHub Actions 自动化部署（push main 触发），详见 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。

## 项目结构

```
ai-env-agent/
├── server/                          # Express 后端
│   ├── index.ts                     # 入口：路由 + 生产托管 dist/
│   ├── routes/
│   │   ├── chat.ts                  # SSE Agent 对话（流式）
│   │   └── upload.ts                # 文档上传 + 知识库管理
│   ├── lib/
│   │   ├── agent.ts                 # 手写 tool-calling Agent 循环
│   │   ├── embedding.ts             # 硅基流动 BGE embedding（带重试）
│   │   ├── vector-store.ts          # Pinecone 封装
│   │   ├── document.ts              # PDF/文本解析 + 页码映射
│   │   ├── text-splitter.ts         # 递归字符分块器（中文友好）
│   │   ├── simulate.ts              # 动态 mock 引擎（时间桶抖动 + IAQI 国标）
│   │   └── tools/
│   │       ├── gis.ts               # 污染源点位查询
│   │       ├── air.ts               # 空气质量监测站查询
│   │       ├── water.ts             # 水环境质量查询
│   │       ├── vehicle.ts           # 机动车遥测查询
│   │       ├── rag.ts               # 法规知识库检索
│   │       └── report.ts            # 执法报告生成
│   └── data/
│       ├── mock-sources.ts          # 30 条污染源基准数据
│       └── mock-monitoring.ts       # AQI/水质/遥测基准数据
├── src/
│   ├── stores/chat.ts               # Pinia：消息 + 工具事件 + 地图点位 + 会话管理
│   ├── composables/useSSE.ts        # SSE 流解析器（POST 方式）
│   ├── utils/markdown.ts            # MarkdownIt + highlight.js
│   ├── views/
│   │   ├── Workbench.vue            # 工作台三栏布局 + 模式切换 + 拖拽分隔
│   │   └── Knowledge.vue            # 知识库上传/管理页
│   ├── components/
│   │   ├── ChatPanel.vue            # 对话面板（消息列表 + 输入区）
│   │   ├── MessageItem.vue          # 单条消息（Markdown 渲染 + 操作按钮）
│   │   ├── ReasoningPanel.vue       # 推理链路时间轴（四色卡片 + 折叠）
│   │   └── MapPanel.vue             # OpenLayers 地图（点位渲染 + 弹窗 + 图例）
│   └── assets/gis/map-icon/         # 6 类点位 PNG 图标
├── public/geojson/                  # 准格尔旗边界 + 街道 GeoJSON
├── .github/workflows/deploy.yml     # GitHub Actions CI/CD
├── ecosystem.config.cjs             # pm2 进程配置
└── .env.example                     # 环境变量模板
```

## 核心设计决策

### 1. 手写 Agent 循环而非 AgentExecutor

`@langchain/core` 的 `AgentExecutor` 在 0.3 已标记 deprecated，LangGraph 又引入过多概念。项目手写 `while(has tool_calls)` 循环（约 60 行），事件时序完全可控，便于 SSE 桥接和推理链路可视化。

### 2. Mock 数据动态化引擎

不是静态 JSON，而是通过「时间桶 + Mulberry32 种子随机 + 抖动函数」生成可复现的动态快照。同一小时内查询结果稳定（演示不翻车），跨小时自动演变（有真实感）。AQI 按国标 HJ 633-2012 IAQI 分段插值公式实时重算。

### 3. RAG 页码精确映射

PDF 分块器返回每个 chunk 在全文中的字符偏移，用偏移二分查找页码表，而非 `indexOf` 定位，避免重叠文本/重复段落导致的页码错位。

### 4. 密钥三层隔离

- 前端构建期密钥（天地图）→ GitHub Secrets，构建时注入
- 服务端运行时密钥（DeepSeek/Pinecone/硅基流动）→ 仅服务器 `.env`，不进仓库不进 CI
- SSH 部署密钥 → 独立 ed25519 密钥对，仅用于部署

### 5. nginx 全站反代而非分离托管

利用 Express 的 `NODE_ENV=production` 分支自托管 dist + SPA fallback，nginx 只需一条反代规则。站点根目录不指向源码目录，天然规避 `.env` 被静态服务泄露。

## 踩坑记录

开发过程中遇到的典型问题及排查思路完整记录在 [DEVLOG.md](DEVLOG.md)，涵盖：

- SSE 空 200 响应（`req.on('close')` 误触发）
- DeepSeek 模型名迁移与思考模式兼容
- Pinecone v9 SDK 签名变更三连坑
- OpenLayers Flex 高度链挤压问题
- 老系统（glibc 2.17）跑 Node 20 的 unofficial-builds 方案
- pm2 script 字段不能指向 pnpm shell wrapper
- nginx SSE 缓冲导致打字机失效
- GitHub Actions CI 非交互会话 nvm 不加载
- ... 共 20+ 条四段式记录（现象 → 根因 → 解法 → 面试一句话）

## 演示场景

1. **污染源查询**：「沙圪堵镇有哪些超标废气企业？」→ Agent 调用 GIS 工具 → 地图自动定位渲染超标点位
2. **环境质量**：「薛家湾镇空气质量怎么样？」→ Agent 调用 AQI 工具 → 返回六参数 + 等级
3. **法规检索**：上传环保法规 PDF → 「SO2 排放标准限值是多少？」→ RAG 检索原文并标注来源
4. **执法报告**：「生成沙圪堵镇废气污染源执法检查报告」→ Agent 先查数据 → 拼装报告 → 自动下载 .md
5. **移动源**：「G109 国道机动车遥测超标情况」→ 查询遥测点位 → 地图渲染超标路段

## License

MIT
