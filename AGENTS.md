# AGENTS.md — AI 协作者指南

> **用途**：AI 协作者（Trae / Cursor / Claude 等）进入本项目的第一入口。读完即可建立全局认知并遵守约束。
> **适用场景**：任何 AI 首次接触本项目、或需要确认开发规范/设计决策时。
> **相关文档**：`ARCHITECTURE.md`（架构+接口契约，按需读）、`DEVLOG.md`（踩坑复盘+面试素材）、`README.md`（对外展示）、`plan.md`（原始 roadmap）。

---

## 1. 项目定位

AI 环保智能监管工作台——面向生态环境监管业务的垂直 AI Agent。自然语言驱动 GIS 污染源查询 + RAG 法规检索 + 监测数据统计 + 执法报告生成。

- 在线 Demo：https://ai.heyi.pub
- 代码仓库：https://github.com/heyi6514/ai-env-agent
- 协作模式：人类负责方向/设计/审核，AI 负责代码实现与文档维护

## 2. 技术栈速查

| 层 | 选型 | 关键约束 |
|---|------|----------|
| 前端 | Vue 3 + TS + Vite 8 + Pinia + Element Plus + Tailwind 4 | Element Plus 全量引入 |
| 地图 | OpenLayers 10 + 天地图 | 无 `VITE_TIAN_DI_TU_KEY` 回退 OSM |
| LLM | DeepSeek `deepseek-flash` | thinking 必须显式关闭 |
| Agent | `@langchain/core` 手写 tool-calling 循环 | 不用 AgentExecutor（已 deprecated） |
| Embedding | 硅基流动 `BAAI/bge-large-zh-v1.5`（1024 维） | 查询需加中文前缀 |
| 向量库 | Pinecone v9 Serverless | `upsert({ records })`，不是数组 |
| 后端 | Express 4 + Node 20 + tsx | pm2 script 指向 `dist/cli.mjs` |
| 部署 | 阿里云 ECS + nginx + pm2 + GitHub Actions | push `main` 即上线 |

## 3. 目录结构

```
server/                 # Express 后端
  index.ts              # 入口：路由 + 生产托管 dist/
  routes/chat.ts        # SSE Agent 对话（流式）
  routes/upload.ts      # 文档上传 + 知识库管理
  lib/agent.ts          # 手写 tool-calling Agent 循环
  lib/tools/            # 6 工具：gis / air / water / vehicle / rag / report
  lib/embedding.ts      # BGE embedding（指数退避重试）
  lib/vector-store.ts   # Pinecone 封装
  lib/document.ts       # PDF/文本解析 + 页码映射
  lib/text-splitter.ts  # 递归字符分块器（中文友好）
  lib/simulate.ts       # 动态 mock 引擎（时间桶抖动 + IAQI 国标）
  data/                 # mock 基准数据
src/                    # Vue 3 前端
  stores/chat.ts        # Pinia：消息 + 工具事件 + 地图点位 + 会话管理
  composables/useSSE.ts # SSE 流解析器（POST 方式）
  utils/markdown.ts     # MarkdownIt + highlight.js（html:false 防 XSS）
  views/Workbench.vue   # 工作台三栏 + 模式切换 + 拖拽分隔
  views/Knowledge.vue   # 知识库上传/管理页
  components/           # ChatPanel / MessageItem / ReasoningPanel / MapPanel
  assets/gis/map-icon/  # 6 类点位 PNG 图标
public/geojson/         # 准格尔旗边界 + 街道 GeoJSON
.github/workflows/      # GitHub Actions 部署
ecosystem.config.cjs    # pm2 配置
```

## 4. 开发规范（铁律）

### 4.1 禁止事项
- **禁止提交密钥**：`.env`、`api-key.md` 已 gitignore，新增密钥文件必须同步加到 `.gitignore`
- **禁止硬编码密钥**：服务端读 `process.env`，前端读 `import.meta.env.VITE_*`
- **禁止 `console.log` 留在生产代码**：调试用 `console.debug` 或临时加、改完即删
- **禁止在响应中返回 `err.message`**：生产环境只回通用提示，详情进服务端日志
- **禁止破坏现有 SSE 事件协议**：新增 event 类型必须同步更新 `useSSE.ts` 和 `chat store`

### 4.2 依赖规则
- 包管理器：**pnpm 10**（不用 npm/yarn），沙箱用 `npx pnpm@10`
- 依赖锁版本：`package.json` 用 `^x.y.z`，核心库（langchain/pinecone/ol）升级需验证
- 新增依赖：先确认功能是否已有实现，避免重复引入

### 4.3 代码风格
- TypeScript 严格模式（`tsconfig.app.json` / `server/tsconfig.json`）
- 缩进 2 空格，单引号，末尾无分号
- 文件命名：组件 PascalCase（`ChatPanel.vue`），工具/库 kebab-case（`text-splitter.ts`）
- 注释：复杂逻辑加中文注释，解释「为什么」而非「是什么」

### 4.4 分支与提交
- 部署触发：push `main` 即触发 GitHub Actions 自动部署
- 提交信息：`<type>: <desc>`，type 可选 feat/fix/refactor/docs/chore
- 推送前必须本地验证：`pnpm build` 通过（含 `vue-tsc` 类型检查）

### 4.5 AI 协作原则
- AI 负责代码实现，人类负责方向/设计/审核
- 改动前先确认需求细节，不擅自扩大范围
- 发现代码缺陷先列为「待确认变更单」，不未经授权改动
- 新功能优先复用现有模式（SSE 事件 / 工具注册 / Pinia store 结构）

## 5. 关键设计决策（一句话版）

> 每条只给结论和关键数值，详细解释见 DEVLOG.md 对应 Day。修改任何一条前先确认影响面。

### Agent 层
1. **手写 Agent 循环**：不用 AgentExecutor（已 deprecated），`while(has tool_calls)` 约 60 行，`MAX_TOOL_ROUNDS=5`
2. **模型固定配置**：`deepseek-flash`，`thinking: { type: 'disabled' }`，`temperature=0`（工具调用需要确定性输出）
3. **消息只取 user/assistant**：服务端过滤掉 system/工具消息，防伪造 system 注入
4. **历史消息截到最后一条 user 消息为止**：重新生成场景下尾部 assistant 占位不发给模型；再叠加最近 50 条截断（`MAX_HISTORY_MESSAGES`），单条 ≤ 10000 字符（`MAX_MESSAGE_LENGTH`）

### 工具设计层
5. **工具按数据域拆分而非按问题拆**：水环境"断面+水源地"合并为一个工具（kind 参数区分），避免工具数量膨胀
6. **description 必须声明"什么时候不选我"**：相邻工具互相声明边界（如 GIS vs AQI），是路由准确率的关键

### RAG 层
7. **embedding 直接 fetch 硅基流动**：不走 LangChain 封装，零额外依赖
8. **BGE 查询必加中文前缀**：`为这个句子生成表示以用于检索相关文章：`，否则中文检索效果骤降
9. **Pinecone index 维度固定 1024**：BGE-large-zh-v1.5 是 1024 维，建 index 时 dimension 必须填 1024
10. **Pinecone vector ID 必须纯 ASCII**：中文文件名只存 metadata.source，ID 用时间戳前缀
11. **相似度阈值 0.15**：BGE 相关文档分数常在 0.2~0.5，阈值过高会漏召回
12. **分块器自写**：不用 `@langchain/textsplitters`（langchain 1.x 路径变了）

### 数据层
13. **Mock 数据动态化**：时间桶 + 种子随机 + 抖动；AQI 按国标 IAQI 公式重算；临界点位（value/limit 0.85~1.15）冻结防翻车；水环境类别不抖（日报语义）；时间桶粒度按数据源区分（AQI=1h、水质=日报、遥测=昨日 07:00-19:00）

### 地图层
14. **底图双源回退**：天地图 vec_w+cva_w 双图层，无 `VITE_TIAN_DI_TU_KEY` 时回退 OSM，克隆项目零配置可跑
15. **MapPoint.type 6 类枚举**：`air`/`water`/`solid`（企业污染源）+ `airStation`/`waterStation`（环境质量站）+ `vehicle`（遥测点），决定图标分组与状态色
16. **viewport 用 bbox**：`[minLon, minLat, maxLon, maxLat]`，不是 center+zoom；`view.fit(extent, { maxZoom: 14 })`
17. **mapPoints 累加而非覆盖**：一次提问多轮工具调用结果在同一张图叠加
18. **数据归一化放工具层**：每个工具自己把字段映射成 MapPoint，agent.ts 只透传，不出现 if/else 工具名分支
19. **状态三重编码**：图标形状（类型）+ 右上角角标颜色（超标红/正常绿）+ 名称文字颜色，不只靠颜色区分（可访问性）
20. **OpenLayers 需 ResizeObserver**：OL 只监听 window resize，v-show 折叠后展开要自己调 `map.updateSize()` + 重新 fit
21. **flex 布局 basis:0 + min-height:0**：解高度挤压；面板折叠用 v-show 保留 DOM（非 v-if 销毁重建）

### 前端交互层
22. **思考卡片用前端拦截**：文本先流式显示，`onToolStart` 触发时移入推理面板，不用服务端 `agent_thought` 事件
23. **GIS 与 RAG 可视化策略不同**：GIS 工具展示 `dataSummary`（行业分布/AQI 范围/超标率），RAG 工具展示 `sources`（文件名+页码+相似度）
24. **卡片颜色按 dataSummary 有无**：有数据摘要=绿，无=蓝，不按工具类型分色
25. **入参默认折叠、返回默认展开**：用户更关心工具返回了什么而非传了什么参数
26. **会话持久化只存 messages**：toolEvents/mapPoints 等运行时状态不落盘

### 安全与部署层
27. **密钥三层隔离**：前端 VITE_ 密钥进 GitHub Secrets；服务端密钥只放服务器 .env；SSH 部署密钥独立
28. **错误信息脱敏**：生产环境只回通用提示，`err.message` 只进服务端日志
29. **上传超时一致性**：入库前/后检查 timedOut，失败回滚，保证「报错即未入库」
30. **健康检查作为 CI 上线判据**：`/api/health` 是部署自动化的成败判定，CI 红绿即部署成败，无人工确认
31. **pm2 script 指向 dist/cli.mjs**：不能指向 `.bin/tsx`（shell wrapper 被 node 解析会 SyntaxError）
32. **nginx 必须 proxy_buffering off**：否则 SSE 打字机被缓冲阻塞

## 6. 常用命令

```bash
pnpm dev              # 前端开发（5173，/api 代理到 3000）
pnpm dev:server       # 后端开发（3000，tsx watch）
pnpm build            # 类型检查 + 生产构建
npx tsc -p server/tsconfig.json --noEmit  # 仅服务端类型检查
git push origin main  # 触发自动部署
```

## 7. 当前状态

- 7 天冲刺全部完成，已上线 https://ai.heyi.pub
- 安全加固（3 个 P1）已修复并记入 DEVLOG Day 8+
- 已知待优化（P2/P3）：接口限流、CORS 白名单、listDocuments 全量扫描、打包体积 1.5MB

## 8. 任务路由（该读哪份文档）

| 任务类型 | 推荐阅读顺序 |
|---------|-------------|
| 新增 Agent 工具 | AGENTS.md → ARCHITECTURE.md（工具注册表）→ 现有工具（如 gis.ts） |
| 新增 SSE 事件 | AGENTS.md → ARCHITECTURE.md（SSE 协议）→ useSSE.ts → chat store |
| 排查线上故障 | DEVLOG.md（踩坑记录）→ 对应模块源码 |
| 修改部署配置 | DEVLOG.md Day 8 → deploy.yml → ecosystem.config.cjs |
| 优化前端布局 | AGENTS.md → Workbench.vue → 现有组件 |
| 了解完整架构 | ARCHITECTURE.md |
| 面试复盘 | DEVLOG.md |