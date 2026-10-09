# DEVLOG｜开发日志与复盘记录

> **用途**：记录每日完成事项、踩坑过程、设计偏差，供项目完成后复盘，并沉淀为面试素材。
> **规则**：每天收工时更新；每个坑用四段式（现象→根因→解法→面试一句话）记录。
> **配套文档**：[plan.md](./plan.md)（roadmap）、[api-key.md](./api-key.md)（本地密钥，已 gitignore，严禁提交）

---

## Day 0（2026-10-08）账号准备 + 工程初始化

### ✅ 完成事项
- 注册 DeepSeek（充值 30 元）/ Pinecone / 硅基流动 / 天地图开放平台，Key 统一记入 `api-key.md`
- GitHub 建仓 `ai-env-agent`（https://github.com/heyi6514/ai-env-agent ）
- Vite + Vue3 + TS 初始化；GIS 资产拷贝（zger.json / jiedao.json + 84 个污染源图标）

### 🕳 踩坑记录

**坑 1：`.gitignore` 写成 `.api-key.md`，密钥文件差点入库**
- 现象：暂存列表里 `api-key.md` 仍然出现（A 状态）
- 根因：`.gitignore` 里写的是 `.api-key.md`（前面多了个点），模式匹配不到真实文件名
- 解法：改为 `api-key.md`，重新 `git add` 验证暂存列表
- 面试一句话：*"密钥文件入库事故九成出在 .gitignore 拼写和已跟踪文件未 untrack，提交前必须 git status 人工复核暂存列表"*

**坑 2：Vercel 注册受阻，触发部署架构重新选型**
- 现象：注册页打不开 / 登录失败，多节点重试无效
- 根因：Vercel 对国内网络不友好，注册/访问不稳定
- 解法：弃用 Vercel，改用自有阿里云 ECS（详见设计偏差 1）
- 面试一句话：*"部署选型要优先考虑目标用户访问体验——国内政务类项目，备案域名 + 国内 ECS 比海外 Serverless 更合适"*

### 📐 设计偏差（PLAN 没想到的）
1. **架构从 Vercel Functions 转向阿里云 Express 单服务（最大偏差）**
   - 原设计：Edge（chat）+ Node（upload/query-vector）双运行时 + vercel.json
   - 实际：`server/` 目录 Express 4 单服务 + nginx 静态/反代 + pm2 常驻
   - 原因：① 国内访问速度（面试官点开要秒开）② 已有 ECS + 已备案域名，零新增成本 ③ SSE 用 `res.write` 比 Edge `ReadableStream` 直观 ④ PDF 解析不受 60s 超时限制
2. **地图底图确定用天地图**（Key 已就位），替代原 PLAN 未明确指定底图的方案

---

## Day 1（2026-10-08）SSE 流式聊天跑通

### ✅ 完成事项
- 后端：`server/index.ts`（Express 入口）+ `server/routes/chat.ts`（SSE 流式转发 DeepSeek）
- 前端：`useSSE`（fetch+ReadableStream 解析）→ Pinia chat store → ChatPanel 三栏工作台
- 服务端注入 system prompt（助手人设 + 能力边界 + 防幻觉约束）
- Markdown 渲染 + highlight.js 代码高亮（按需注册 10 种语言）
- 交互增强：思考中动画 / 复制 / 重新生成 / 空态快捷问题 / 智能滚动 / 清空对话 / 自适应输入框
- `vue-tsc + vite build` 通过；推送 GitHub（commit `99334af`）
- 端到端验收：浏览器实测流式打字机输出正常

### 🕳 踩坑记录

**坑 1：SSE 流式响应返回空 200（Day 1 最隐蔽的坑）**
- 现象：发消息后 Network 显示 200 但 body 为空，无报错
- 根因：`req.on('close')` 在 `express.json()` 消费完 body 后会**立即触发**，导致上游 DeepSeek 请求刚发出就被 `AbortController` 中止
- 解法：改听 `res` 的 close，并用 `res.writableEnded` 判断是否为客户端真实断开
- 面试一句话：*"SSE 场景下 Express 的 req close 在 body 消费完就会触发，不能当作客户端断开信号，要用 res close 配合 writableEnded"*

**坑 2：pnpm 10 拦截 esbuild 的 postinstall 脚本**
- 现象：vite / tsx 启动报错找不到 esbuild 二进制
- 根因：pnpm 10 默认阻止依赖的 install 脚本（安全策略）
- 解法：package.json 加 `pnpm.onlyBuiltDependencies: ["esbuild"]` 后重装
- 面试一句话：*"pnpm 10 的安全默认值会拦构建脚本，CI 里报二进制缺失先查 onlyBuiltDependencies"*

**坑 3：DeepSeek 模型名迁移（deepseek-chat → deepseek-flash）**
- 现象：按旧文档用 `deepseek-chat`，打字机前段出现"空白"后才输出正文
- 根因：官方已将模型名升级为 `deepseek-flash` / `deepseek-v4-pro`，旧名是兼容别名；**flash 默认开启思考模式**，先流式输出 `reasoning_content` 再输出 `content`，而解析代码只取 content
- 解法：切 `deepseek-flash` + 显式 `thinking: { type: 'disabled' }`
- 面试一句话：*"模型 API 的'稳定别名'也可能迁移，且新模型默认行为会变（如默认开思考模式），流式解析要按 delta 字段实际结构处理"*

**坑 4：MarkdownIt highlight 自引用导致 TS 循环类型推导**
- 现象：`vue-tsc` 报 TS7022 `'md' implicitly has type 'any'`，指向初始化表达式
- 根因：`highlight` 回调里引用了正在初始化的 `md.utils.escapeHtml`，形成自引用循环
- 解法：提取独立 `escapeHtml` 函数，消除循环引用
- 面试一句话：*"配置对象回调里引用自身实例会触发 TS 自引用类型推导循环，把工具函数提出来即可"*

**坑 5：助手"不认识自己"（system prompt 缺失）**
- 现象：问"介绍这个工作台"，模型去科普市面上的聚光科技/雪迪龙产品
- 根因：后端把前端 messages 原样转发，对话里没有任何消息告诉模型"你是谁"
- 解法：服务端注入 SYSTEM_PROMPT（人设 + 5 大功能 + 当前/即将上线能力 + 严禁编造企业数据与法规编号）；且放在服务端注入而非前端拼接，防止绕过页面伪造
- 面试一句话：*"垂直业务 Agent 必须服务端注入 system prompt 定义身份和能力边界，并在工具未接入前显式声明'不知道就说不知道'来防幻觉"*

**坑 6：前端 502**
- 现象：发消息报 502
- 根因：`pnpm dev:server` 没启动（验收后停掉了临时后端），Vite 代理找不到上游
- 解法：开发期保持双终端（dev:server + dev）常驻
- 面试一句话：*"502 先查上游是否存活：vite proxy 的 502 几乎总是后端进程没起，而不是代理配置错"*

### 📐 设计偏差（PLAN 没想到的）
1. **聊天前端比 PLAN 更"产品化"**：PLAN 只要求"SSE 流式 + Markdown 渲染"，实际补了重新生成、智能滚动、快捷问题等——开发中发现"能聊"和"演示给面试官看"之间还有一层交互体验差距
2. **历史消息构造规则**：请求历史要截到最后一条 user 消息为止（排除尾部未生成的 assistant 占位），否则重新生成场景会把空占位发给模型
3. **中文输入法细节**：Enter 发送必须判断 `e.isComposing`，否则拼音选词会误发送（国内产品必备细节）

---

## Day 2（2026-10-08）LangChain Agent 最小闭环 + GIS 单工具

### ✅ 完成事项
- Day 1 收尾加固：服务端过滤消息角色（防伪造 system 注入）、Express 404 兜底 + 统一错误中间件（body-parser 400 语义化）
- 依赖：`langchain` + `@langchain/core` + `@langchain/deepseek` + `zod@3`
- `server/data/mock-sources.ts`：30 条点位（准格尔旗真实镇名，字段与 Day 6 地图联动对齐，status 由 value>limit 动态计算保证数据自洽）
- `server/lib/tools/gis.ts`：`query_pollution_sources` 工具（zod schema，支持 town/type/status/keyword 组合过滤）
- `server/lib/agent.ts`：**手写 tool-calling 循环**（ChatDeepSeek + bindTools + stream 聚合 chunk 判断 tool_calls），MAX_TOOL_ROUNDS=5 防循环
- `chat.ts` 重构为 Agent→SSE 翻译层：新增 `tool_start`/`tool_end` 事件；60s 整体超时；区分"客户端断开"与"服务端超时"
- 前端：useSSE 扩展工具事件 → store `toolEvents` → `ReasoningPanel.vue` 推理链路时间线（执行中 spinner → 完成态 summary）
- 端到端验收通过：curl 实测 `tool_start(args: {town:沙圪堵镇, type:air, status:超标})` → `tool_end(返回 3 条)` → 464 个流式 token → done，无 error

### 🕳 踩坑记录

**坑 1：PowerShell 传 JSON 给 curl.exe 双引号被吞，后端被冤枉 500**
- 现象：curl 测 /api/chat 返回 500，服务器日志报 JSON parse 失败，body 变成 `{messages:[{role:user...}]}`
- 根因：PowerShell 向原生命令传参时 `"$body"` 内的 `"` 不会自动转义，到达服务器的 JSON 缺引号
- 解法：body 写入临时文件用 `--data-binary "@file.json"` 传递
- 面试一句话：*"Windows 下用 curl 测 JSON 接口务必走文件传参，PowerShell 的引号转发规则会静默破坏请求体"*

**坑 2：3000 端口被旧 dev:server 占用（EADDRINUSE）+ pnpm 重装后旧进程模块失效**
- 现象：新起后端报 EADDRINUSE 退出；打到旧进程的请求返回 500
- 根因：安装 langchain 时 pnpm 重排了 node_modules，长驻旧进程持有的模块句柄部分失效
- 解法：`Get-NetTCPConnection -LocalPort 3000` 找 PID 后 `Stop-Process`，重启干净进程
- 面试一句话：*"pnpm 装完依赖必须重启 dev 进程——node_modules 是符号链接重排，旧进程可能拿着已失效的模块句柄"*

**坑 3：chat 流式接口对非法 JSON 返回 500 而非 400**
- 根因：body-parser 解析失败走 next(err)，统一错误中间件无脑 500
- 解法：中间件读取 `err.status`（body-parser 抛 400 语义错误），按状态码返回并区分日志级别
- 面试一句话：*"统一错误中间件要尊重中间件抛出的状态码，非法请求体返回 500 会误导排查方向"*

### 📐 设计偏差（PLAN 没想到的）
1. **不用 AgentExecutor，手写 tool-calling 循环**：AgentExecutor 已被 0.3 标 deprecated，LangGraph 又引入额外概念；手写 `while(has tool_calls)` 约 60 行，事件时序完全可控，面试还能讲清 Agent 本质
2. **思考模式必须在 modelKwargs 显式关闭**：ChatDeepSeek 没有直接的 thinking 参数，通过 `modelKwargs: { thinking: { type: 'disabled' } }` 透传 DeepSeek 专有字段
3. **工具事件协议**：SSE 新增 `tool_start`/`tool_end` 事件（含 id/name/args/summary），Day 4 只需在 payload 里补 reasoning 字段即可升级推理链路，前端解析器零改动

---

## Day 2+（2026-10-09）扩展：环境质量监测三工具（提前落地 Day 4 部分）

### ✅ 完成事项
- 新增 3 个工具：`query_air_quality`（AQI 站点）、`query_water_quality`（河流断面+饮用水源地合并）、`query_vehicle_sensing`（机动车遥测）
- `server/data/mock-monitoring.ts`：5 个 AQI 站点（含六参数）+ 7 个水环境实体 + 4 个遥测点位
- `agent.ts` executeTool 从硬编码改为 TOOL_MAP 查表——新工具注册即用，Agent 循环零改动
- system prompt 同步工具清单（含"固定源/移动源""环境空气/企业废气"边界说明）
- 多工具路由验收：AQI/水环境/移动源三问三中，入参解析全部正确

### 📐 设计偏差
1. **按数据域拆工具而非按问题拆**：水环境的"断面+水源地"合并为 1 个工具（kind 参数区分），避免工具数量膨胀与 description 语义稀释
2. **description 边界声明是路由准确率的关键**：在相邻工具（query_pollution_sources vs query_air_quality）的 description 里互相声明"什么时候不选我"，5 工具路由测试 100% 命中

---

## Day 2+ 收尾（2026-10-09）Mock 数据动态化改造

### ✅ 完成事项
- 新增 `server/lib/simulate.ts`：Mulberry32 种子随机 + 时间桶（默认 1h）+ 抖动函数 + HJ 633-2012 IAQI 分段插值公式
- `mock-monitoring.ts` 基准值内部化：六参数浓度 ±15% 抖动后按国标重算 AQI/首要污染物/等级；水环境类别日评价不抖动；机动车遥测量 ±10% 抖动
- `mock-sources.ts` 基准值内部化：排放浓度 ±10% 抖动 + "临界护栏"（value/limit 比率在 0.85~1.15 区间的点位不抖，防止演示剧本突然翻车）
- 4 个工具文件统一改走快照函数，工具层/agent 层/前端零改动

### 🕳 踩坑记录

**坑 1：AQI 用原始基准值 vs 国标公式重算结果不一致**
- 现象：基准 AIR-001 的 AQI=152，用六参数按 HJ 633-2012 公式重算出来约 118
- 根因：原始基准是手工设定的演示数据，不是严格按国标公式反推的
- 解法：接受公式重算后的漂移，关键是验证抖动后等级是否保持（AIR-001 抖动后仍在轻度污染区间，演示组合不破坏）
- 面试一句话：*"动态化不是随机捏造数字，而是用国标公式基于六参数浓度重算 AQI，让数字有物理一致性"*

**坑 2：临界点位抖动后会导致演示剧本翻车**
- 现象：沙圪堵镇水泥制造废气排放点基准 value=22.1 / limit=20（超标），±10% 抖动后可能掉到 19.89（正常），导致"沙圪堵镇有哪些超标废气企业"查空
- 根因：演示组合里的超标点位有些贴近限值，抖动会翻越阈值
- 解法：对 value/limit 比率在 0.85~1.15 之间的临界点位"冻住浓度、只刷新时间"，确保演示剧本稳定
- 面试一句话：*"仿真数据加护栏不是作弊，而是区分'可抖动的常态点位'和'演示剧本依赖的临界点位'"*

### 📐 设计偏差
1. **水环境类别不该抖**：真实业务中河流断面水质类别是按日评价的枚举值，不可能小时级在"Ⅲ类↔劣Ⅴ类"之间翻转。只刷新 updatedAt 更符合业务语义，也是"哪些字段该动"的语义判断——不是全量字段都要随机化。
2. **时间桶粒度按数据源语义区分**：AQI 是小时报 → 1h 桶；水环境是日报 → 只刷时间；机动车遥测通常按天出报告 → period 自动取"昨天 07:00-19:00"。

---

## Day 2 漏洞修复（2026-10-09）

### ✅ 完成事项
- **agent.ts**：循环达 MAX_TOOL_ROUNDS 后，若末尾仍是 ToolMessage 则再请求模型生成最终文字回答，避免用户只看到工具执行却没有结论；同时提取 `extractText` 辅助函数消除 token 解析重复代码
- **mock-sources.ts**：污染源快照所有点位的 `updatedAt` 统一用时间桶时间（原来临界点位用 `new Date()` 导致同一小时内不同点位时间戳不一致）
- **index.ts**：新增 `/api/health` 接口，供 pm2/nginx 探活与部署自检

### 🕳 踩坑记录

**坑 1：Agent 循环到上限后没有最终回答**
- 现象：若模型在 MAX_TOOL_ROUNDS 轮内一直返回 tool_calls，循环退出后用户只看到工具执行完毕，却没有文字总结
- 根因：for 循环只处理"模型返回文本"和"执行工具"两种情况，没处理"工具执行完了但还没让模型总结"的收尾
- 解法：循环结束后检查 `current` 末尾是否为 ToolMessage，若是则再请求一次模型（只取文本输出，不再执行工具）
- 面试一句话：*"手写 Agent 循环要显式处理'工具已执行但未总结'的收尾态，不能假设循环内一定能 return"*

**坑 2：污染源快照时间戳不统一**
- 现象：同一小时内查询，临界点位（浓度不抖动）和非临界点位的 `updatedAt` 不一样，看起来数据"跳"
- 根因：临界点位用 `fmtTime(new Date())`（实时时间），非临界点位用 `fmtTime(ts)`（时间桶时间）
- 解法：临界点位也调用 `bucketSeed` 取时间桶时间戳，统一所有点位的时间语义
- 面试一句话：*"仿真数据的时间字段必须统一来自同一时间桶，否则同一查询结果里时间戳不一致会暴露伪造痕迹"*

---

## Day 3（2026-10-09）RAG 法规知识库链路 + 推理链路可解释性

### ✅ 完成事项
- **向量底层**：`server/lib/embedding.ts`（硅基流动 BAAI/bge-large-zh-v1.5，1024 维，BGE 中文查询前缀 + 429/5xx 指数退避重试）+ `server/lib/vector-store.ts`（Pinecone upsert/query/listDocuments/deleteByDocId）
- **文档处理**：`server/lib/text-splitter.ts`（自写递归字符分块器，返回 `{ text, offset }` 用于页码精确映射）+ `server/lib/document.ts`（unpdf 解析 PDF 带页码，按偏移二分查页，过滤扫描件空白 chunk）
- **RAG 工具**：`server/lib/tools/rag.ts`（`search_knowledge_base`，TopK=4，相似度阈值 0.15 过滤，返回 `{ total, content, sources }` JSON）
- **上传接口**：`server/routes/upload.ts`（multer 内存存储 → multer 文件名 Latin-1→UTF-8 修复 → 智能编码检测 UTF-8/GBK → 分块 → 入库，120s 超时，docId = `时间戳_随机后缀` 保证 Pinecone ID 纯 ASCII 且防同毫秒碰撞）
- **文档管理**：`GET /api/documents`（按 docId 聚合，返回文件名/分块数/页数/上传时间）+ `DELETE /api/documents/:docId`（按 ID 前缀批量删除）
- **前端上传页**：`src/views/Knowledge.vue`（拖拽上传 PDF/MD/TXT ≤20MB + 多文件队列串行上传 + 上传中 loading 动画 + 知识库文档列表 + 删除按钮 + 本次上传记录）+ App.vue 顶部 tab 切换
- **推理链路可解释性**：`ReasoningPanel.vue` 全面优化——工具名中文化（5 个工具）+ 步骤编号 ①②③ + 耗时展示 + 失败红色状态 + 卡片可折叠 + 入参过长截断展开 + 自动滚动 + 清空按钮
- **RAG 命中来源展示**：rag 工具返回 `sources`（文件名+页码+相似度），前端推理链路蓝色卡片展示，体现 RAG 可解释性
- **GIS 数据摘要**：4 个 GIS 工具新增 `dataSummary` 字段（行业分布/超标数/AQI 范围/水质类别/超标率等），前端绿色卡片展示，解决"只看到返回 N 条不知道是什么数据"的问题
- **测试数据**：`test-data/` 下载 3 份真实法规 PDF + 生成 3 份 MD 法规文本（大气污染防治法/土壤污染防治法/噪声污染防治法），已加入 .gitignore
- **Pinecone**：创建 index `ai-env-agent`（1024 维 / cosine / aws us-east-1 serverless），清理扫描件垃圾数据
- **质量加固**：完成 P0-P3 全部漏洞修复（同名覆盖、死循环守卫、页码错位、无重试、无超时、ASCII ID、低相似度过滤、编码检测、死代码清理、docId 碰撞、JSDoc 注释、TS 可选参数）
- 端到端验收：TXT/MD/PDF 上传入库 → 文档列表展示 → 对话检索返回带来源+页码的原文片段 → GIS 工具展示数据摘要

### 🕳 踩坑记录

**坑 1：硅基流动没有 `text-embedding-v3` 模型**
- 现象：按 plan.md 用 `text-embedding-v3`，接口返回 model not found
- 根因：硅基流动平台实际可用的中文 embedding 模型是 `BAAI/bge-large-zh-v1.5`（plan.md 也提到了这个，但先试了 text-embedding-v3）
- 解法：切换到 `BAAI/bge-large-zh-v1.5`，验证维度确实是 1024
- 面试一句话：*"LLM 平台的模型名以平台控制台为准，文档里提到的可能是别名或已下线，先调一次 list models 再写死"*

**坑 2：BGE 模型查询必须加中文前缀**
- 现象：直接对 query 做 embedding 后检索，相似度普遍偏低，相关文档排不到前面
- 根因：BGE 系列模型训练时查询和文档用了不同的前缀，中文查询必须加 `为这个句子生成表示以用于检索相关文章：`
- 解法：`embedQuery` 函数自动拼接前缀，`embedTexts`（入库）不加
- 面试一句话：*"embedding 模型的 query 和 passage 通常不对称，必须查官方文档看是否需要加前缀，否则检索效果腰斩"*

**坑 3：Pinecone v9 upsert 签名变更**
- 现象：`index.upsert(records[])` 报 `Must pass in at least 1 record`
- 根因：v9 SDK 把签名从 `upsert(records)` 改成了 `upsert({ records })`，直接传数组会被当成 options 对象
- 解法：改为 `index.upsert({ records })`
- 面试一句话：*"SDK 大版本升级先查 breaking changes，尤其是方法签名从位置参数变对象参数这种"*

**坑 4：Pinecone vector ID 必须 ASCII，中文文件名直接报错**
- 现象：上传中文文件名 PDF，报 `Vector ID must be ASCII, but got 'xxx_æ±¡æ°´...'`
- 根因：Pinecone serverless index 要求 vector ID 只能是 ASCII 字符，中文文件名拼进 ID 会被拒绝
- 解法：ID 用纯 ASCII 的 `docId`（时间戳+随机后缀），原始文件名存 metadata.source 供展示；listDocuments 按 docId 分组而非 source
- 面试一句话：*"向量库的 ID 字段通常有限制（ASCII/长度），业务标识和存储 ID 要解耦，ID 用内部生成的唯一标识，业务字段放 metadata"*

**坑 5：langchain 1.x 移除了 text_splitter 子路径**
- 现象：`import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'` 报模块找不到
- 根因：langchain 1.x 重构了导出路径，text_splitter 不再作为顶级子路径
- 解法：不自装 `@langchain/textsplitters`，自己写一个递归字符分块器（约 100 行），面试还能讲清分块原理
- 面试一句话：*"依赖包升级导致子路径导出消失时，要么找新路径要么自实现——分块器逻辑不复杂，自写反而可控且能讲原理"*

**坑 6：unpdf 要求 Uint8Array 而非 Buffer**
- 现象：`extractText(buffer)` 类型检查报错
- 根因：unpdf 的类型声明要求 `Uint8Array`，Node Buffer 虽是子类但被严格类型检查拦截
- 解法：显式 `new Uint8Array(buffer)` 转换
- 面试一句话：*"Node Buffer 是 Uint8Array 的子类，但 TS 结构类型系统不自动兼容，跨库传参时需显式转换"*

**坑 7：Pinecone listPaginated 的 limit 上限是 100 不是 1000**
- 现象：`listPaginated({ limit: 1000 })` 报 `Limit must be greater than 0 and less than or equal to 100`
- 根因：listPaginated 单次最多返回 100 条，fetch 才是 1000
- 解法：listPaginated 用 limit=100 分页，fetch 批量用 1000
- 面试一句话：*"Pinecone 的 list 和 fetch 批量上限不一样（100 vs 1000），别想当然用同一个数"*

**坑 8：indexOf 页码映射在重叠文本中定位错误**
- 现象：分块后用 `fullText.indexOf(chunkText)` 找起始位置，部分 chunk 映射到错误页码
- 根因：分块器有 overlap，相邻 chunk 文本重叠，indexOf 从 searchFrom 开始找可能命中错误位置；PDF 页眉页脚重复也会干扰
- 解法：改造分块器返回每个 chunk 的 `offset`（在原始全文中的起始字符偏移），直接用 offset 二分查页码表，彻底不用 indexOf
- 面试一句话：*"带 overlap 的分块不能用 indexOf 定位原始位置，必须在分块时记录偏移，否则页码/位置溯源会错位"*

**坑 9：multer 中文文件名乱码**
- 现象：上传中文文件名 PDF，知识库列表显示 `æ°´æ±¡æ³æ±é防æ³•.pdf` 乱码
- 根因：multer 解析 multipart 的 filename 字段时默认用 Latin-1 解码，而浏览器实际上传的是 UTF-8 字节
- 解法：`fixFilename()` 把 Latin-1 字符串按字节转回 Buffer 再用 UTF-8 解码，检测到替换字符 U+FFFD 则回退原名
- 面试一句话：*"multipart 文件名编码是经典坑：multer 默认 Latin-1，浏览器发 UTF-8，需要手动转码并检测替换字符做兜底"*

**坑 10：扫描版 PDF 提取出空文本，入库垃圾数据**
- 现象：上传《大气污染物综合排放标准》PDF（扫描件），分块全是空字符串，检索命中但内容空白无法回答
- 根因：unpdf 只能提取文字型 PDF，扫描件（图片型）提取出的全是空文本
- 解法：分块后过滤 `text.trim().length === 0` 的 chunk；若全部为空则返回 400 并提示"该 PDF 可能是扫描件，请使用文字版或转 MD/TXT"
- 面试一句话：*"PDF 解析必须做空文本检测——扫描件会静默产生空向量，污染知识库且检索返回空白内容"*

**坑 11：Pinecone serverless 最终一致性，刚入库就查不到**
- 现象：上传成功后立即刷新文档列表，有时看不到刚上传的文档，用户以为没成功又传一次导致重复
- 根因：Pinecone serverless 索引有最终一致性延迟（通常几百毫秒），upsert 后立即 list 可能查不到
- 解法：上传全部完成后 `setTimeout(fetchKnowledgeDocs, 500)` 延迟刷新，规避一致性窗口
- 面试一句话：*"serverless 向量库是最终一致性的，写入后立即读取可能查不到，需要短暂延迟或轮询重试"*

**坑 12：RAG 相似度阈值 0.3 过高导致漏召回**
- 现象：知识库有相关文档但检索返回 0 条，LLM 回答"知识库暂无相关内容"
- 根因：BGE-large-zh-v1.5 的相关文档相似度分数常在 0.2-0.5 区间，0.3 阈值会漏掉边界相关的片段
- 解法：阈值从 0.3 调低到 0.15，宁可多召回也不漏掉；同时返回诊断信息（原始命中数+最高分）帮助排查
- 面试一句话：*"相似度阈值要根据实际 embedding 模型的分数分布调参，不能凭直觉设 0.5/0.7——BGE 中文模型相关分数普遍在 0.2-0.5"*

**坑 13：同毫秒多文件上传 docId 碰撞导致向量覆盖**
- 现象：一次选多个文件快速上传时，部分文件的向量被覆盖（docId = Date.now() 同毫秒相同）
- 根因：`docId = String(Date.now())` 精度只到毫秒，串行上传快的文件可能同毫秒
- 解法：`docId = \`${Date.now()}_${Math.random().toString(36).slice(2,8)}\``，加 6 位随机后缀
- 面试一句话：*"时间戳作为唯一 ID 在高并发/快速串行场景下会碰撞，必须加随机后缀或用 UUID"*

### 📐 设计偏差（PLAN 没想到的）
1. **embedding 不走 LangChain 封装，直接 fetch 调硅基流动**：项目风格是"手写循环、去封装"，embedding 本质是一次 HTTP 调用，直接 fetch 零额外依赖且可控
2. **向量库用原生 Pinecone SDK 而非 @langchain/pinecone**：自己写 `upsertChunks`/`queryChunks`，面试能讲清"embedding → Pinecone 存/查"每一步
3. **分块器自写而非引入 @langchain/textsplitters**：langchain 1.x 路径变更 + 自写可控，还能讲清递归分隔符优先级算法
4. **Pinecone index 维度与 embedding 模型绑定**：硅基流动 BGE 是 1024 维，建 index 时 dimension 必须填 1024，建错要重建
5. **上传接口同步处理 + 120s 超时**：政策 PDF 几十页，解析+embedding+入库约 5-30s，同步够用但必须有超时防连接挂死
6. **推理链路是面试演示的核心卖点**：不仅要"能调工具"，还要展示调了什么工具、返回了什么数据、数据来自哪个文件哪一页——可解释性是 Agent 类项目的差异化亮点
7. **GIS 工具和 RAG 工具的可视化策略不同**：RAG 展示"命中来源"（文件名+页码+相似度），GIS 展示"数据摘要"（行业分布/AQI 范围/超标率），都是为了让非技术面试官一眼看懂工具返回了什么

---

## Day 4（2026-10-09）报告导出工具 + map_render SSE 协议 + MapPanel 骨架

### ✅ 完成事项
- **reportTool 执法报告导出**：`server/lib/tools/report.ts` 拼装结构化 Markdown 执法报告（报告编号/检查依据/数据统计/检查发现/处置建议），Zod schema 强制 `findings.min(1)` 防止空报告，文件名清理不安全字符
- **report 全链路打通**：agent.ts `onReport` 回调 → chat.ts SSE `report` 事件 → useSSE.ts handler → chat store 挂载到消息 + 工具事件 → MessageItem.vue / ReasoningPanel.vue 双下载入口，用户点击下载（非自动触发）
- **report P1 漏洞修复（4 个）**：
  - P1-1：报告编号改纯数字 `202610091430`（符合公文规范），文件名保留连字符 `20261009-1430`（可读性）
  - P1-2：删除 `ReportResult.total` 死字段
  - P1-3：`regenerate()` 丢报告——加注释说明"重新生成=旧交付物作废"的合理语义
  - P1-4：`onToolEnd` fallback 数组为空时报错——加 `toolEvents.length > 0` 判空保护
- **map_render SSE 事件协议（Day 4 核心）**：
  - 定义 `MapPoint` 类型（6 类枚举：air/water/solid/airStation/waterStation/vehicle），前后端镜像
  - 4 个有坐标的工具（gis/air/water/vehicle）返回 `mapPoints[]` + `viewport` bounding box
  - agent.ts 解析 `parsed.mapPoints` → `onMapRender` 回调，空点位不触发（避免 Day 6 地图闪空视图）
  - chat.ts 桥接 SSE `map_render` 事件，useSSE.ts 加 `onMapRender` handler
  - chat store 加 `mapPoints`/`viewport` 状态，多轮工具调用点位累加，sendMessage/regenerate/clear 统一清空
- **mock 数据补坐标**：`AirStation` 和 `VehicleSensingPoint` 原先缺 lon/lat，补齐后 4 类点位全部可渲染
- **MapPanel.vue 骨架**：替换 Workbench.vue 右下角 el-empty 占位，骨架阶段用列表验证协议通了（按类型分组 + 状态色 + 视口四至展示），Day 6 接 OpenLayers 时直接读 store.mapPoints
- **端到端验证**：问"沙圪堵镇超标废气企业" → 收到 map_render 事件，3 个点位，viewport `[111.19, 39.82, 111.31, 39.91]`，点位结构完整

### 🕳 踩坑记录

**坑 1：报告自动下载 vs 用户主动下载**
- 现象：报告生成后浏览器直接下载 .md 文件，用户没点下载就弹下载框
- 根因：最初在 onReport 里直接调 `triggerDownload`，不管用户是否需要
- 解法：改成挂载到消息 + 工具事件，MessageItem/ReasoningPanel 各放一个"下载报告"按钮，用户点击才下载
- 面试一句话：*"生成交付物和下载交付物要分离——Agent 生成是自动的，但下载是用户主动行为，不能替用户做决定"*

**坑 2：报告编号带连字符不符合公文规范**
- 现象：报告编号 `环监检〔20261009-1430〕号`，连字符在公文编号里不合规
- 根因：日期格式化函数只有一个，文件名和报告编号共用导致连字符进了编号
- 解法：拆成 `fmtReportNo`（纯数字 202610091430）和 `fmtFileDate`（带连字符 20261009-1430），各走各的
- 面试一句话：*"文件名要可读，公文编号要规范——同一个日期两种格式，不能图省事共用一个格式化函数"*

**坑 3：AirStation 和 VehicleSensingPoint 缺坐标**
- 现象：做 map_render 协议时发现空气监测站和机动车遥测点没有 lon/lat 字段，无法渲染到地图
- 根因：Day 2+ 扩展工具时只顾业务字段（AQI/超标率），没预留地图字段
- 解法：mock-monitoring.ts 的 interface 和基准数据补 lon/lat，坐标基于准格尔旗各乡镇实际位置
- 面试一句话：*"数据模型设计要前置考虑下游消费方——即便 Day 6 才接地图，Day 4 定协议时就得让数据带坐标，否则协议定了也没数据可传"*

**坑 4：WaterSite.status 与 MapPoint.status 枚举不匹配**
- 现象：tsc 报 `'"达标"' is not assignable to '"正常"|"超标"'`
- 根因：水环境业务用"达标/超标"，地图点位统一用"正常/超标"，枚举值不一致
- 解法：water.ts 的 toMapPoints 里显式映射 `s.status === '超标' ? '超标' : '正常'`
- 面试一句话：*"不同数据域的状态枚举要归一化——水环境"达标"和污染源"正常"在地图上应该是同一种颜色，归一化不能假设枚举值天然一致"*

**坑 5：onToolEnd fallback 数组为空时报错**
- 现象：toolEvents 为空时 `this.toolEvents[this.toolEvents.length - 1]` 返回 undefined，后续 `.status` 访问报错
- 根因：fallback 逻辑没有判空保护
- 解法：加 `this.toolEvents.length > 0 ?` 前置判断
- 面试一句话：*"数组索引访问必须先判 length，即便是 fallback 路径——undefined.status 是前端最常见的运行时崩溃来源"*

### 📐 设计偏差（PLAN 没想到的）
1. **viewport 用 bounding box 而非 center+zoom**：多点查询时点位分散在多个乡镇，fitBounds 比手动算中心点+缩放级别更合理，Day 6 OpenLayers 的 `view.fit(extent)` 直接吃 bbox
2. **数据归一化放在工具层而非 agent.ts**：4 个有坐标的工具字段名不一致（gis 用 name/type、air 用 siteName/level），让每个工具自己映射成 MapPoint，agent.ts 只透传——避免 agent.ts 出现 if/else 工具名分支，符合单一职责
3. **mapPoints 累加而非覆盖**：一次提问可能多轮工具调用（先查污染源再查空气质量），点位累加让多个工具的结果在同一张图上叠加展示，比每轮覆盖更符合"一次提问一张图"的语义
4. **MapPanel 骨架用列表而非空白占位**：Day 4 不装 OpenLayers，但用列表展示点位数据能验证协议全链路通了（type/status/lon/lat/viewport 都有值），Day 6 接地图时只需替换列表为 ol.Map 渲染，store 数据层零改动
5. **MapPoint.type 6 类枚举覆盖全部点位类型**：Plan 里只说"点位渲染/状态色"，没定义具体类型。实际拆成 6 类（3 种企业污染源 + 2 种环境质量站 + 1 种遥测点），Day 6 可用 6 种图标分组，比单一"污染源"类型更专业

### 🔑 Day 4 参数修正
- **Plan Day 4 原列 5 项任务全部完成**：monitorTool（Day 2+ 提前落地为 3 工具）、reportTool、四工具接入（实际 6 工具）、callbacks→SSE 桥接、AgentTrace.vue 骨架（实际叫 ReasoningPanel.vue，Day 3 已完成）
- **新增任务**：map_render SSE 协议 + MapPanel.vue 骨架（Plan §4 定义了协议但没排进 Day 4 任务列表，实际是 Day 4 核心交付物）

---

## Day 5（2026-10-09）推理链路可视化完整实现

### ✅ 完成事项
- **思考卡片（黄色）**：采用"前端拦截移动文本"方案 — 模型在工具调用前生成的文本先流式显示在聊天区（保留实时体验），`onToolStart` 触发时将该文本从 `reply.content` 移出，作为黄色思考卡片插入 `toolEvents` 数组（排在工具卡片之前），然后清空 `reply.content`。无需改 SSE 协议，仅改 chat store 的 `onToolStart` handler 约 10 行
- **卡片四色分类**：基于 `type` + `dataSummary` + `error` 自动判定 — 思考(黄 `--el-color-warning`) / 工具(蓝 `--el-color-primary`) / 数据(绿 `--el-color-success`) / 异常(红 `--el-color-danger`)，用 `border-left: 3px solid` + 浅色背景实现
- **垂直时间轴**：`.timeline::before` 绘制竖线贯穿所有卡片，步骤编号圆从卡片内部移到时间轴线上（`position: absolute`），思考卡片用小圆点替代数字，工具步骤编号仅统计 `type === 'tool'` 跳过思考卡片
- **JSON 入参/返回折叠展示**：入参从 `key=value` 字符串改为 `JSON.stringify(args, null, 2)` 格式化展示在 `<pre>` 块中，默认折叠点击展开；新增"返回"折叠区块，将 dataSummary / sources / report 三个独立区块统一收拢，默认展开（返回信息比入参更重要）
- **面板可折叠**：Workbench.vue 两个面板标题栏可点击折叠/展开，`flex` 动态调整（折叠时 `flex: 0 0 auto`，另一面板自动撑满），`collapse-icon` 旋转动画
- **"在地图查看"按钮联动**：`map_render` SSE 事件增加 `toolId` 字段（agent.ts → chat.ts → useSSE.ts → chat store 全链路贯通），前端标记对应 `ToolEvent.hasMapPoints = true`，按钮 `emit('focus-map')` → Workbench 折叠推理面板 + 展开地图面板 + 闪烁高亮 1.5s
- **类型检查 + 构建通过**，浏览器端到端验证：黄色思考卡片 → 绿色数据工具卡片 → 时间轴连线 → "在地图查看"按钮联动 → 面板折叠全部 OK

### 🕳 踩坑记录

**坑 1：思考卡片方案选型 — 服务端 agent_thought 事件 vs 前端拦截移动文本**
- 现象：plan.md §4 定义了 `agent_thought` SSE 事件但从未实现，Day 5 需要决定如何实现思考卡片
- 根因：服务端方案需要改造 agent.ts 缓冲模型文本，有 tool_calls 时发 `agent_thought` 而非 `message`，但会丢失实时流式体验（文本需等模型响应结束才一次性显示）；且 DeepSeek 工具调用前通常无文本输出，思考卡片经常为空
- 解法：选前端拦截方案 — 文本先流式显示在聊天区（保留实时体验），`onToolStart` 触发时将文本移入思考卡片并清空 `reply.content`。仅改 chat store 1 个 handler，零服务端事件协议改动
- 面试一句话：*"Agent 推理可视化要在'实时性'和'结构化'之间取舍——服务端缓冲能精确分类但丢流式体验，前端拦截两者兼得但文本会从聊天区'移走'，视觉上有短暂的文本消失"*

**坑 2：map_render 事件不携带 toolId，"在地图查看"按钮无法关联工具步骤**
- 现象：Day 4 设计 `map_render` 事件时只有 `points + viewport`，Day 5 的"在地图查看"按钮需要知道哪个工具步骤产生了点位
- 根因：SSE 事件设计时只考虑了"传什么数据"，没考虑"前端如何回溯关联到具体步骤"
- 解法：agent.ts `onMapRender` 回调增加 `toolId` 参数，chat.ts SSE 事件加 `id` 字段，useSSE.ts handler 签名加 `toolId`，chat store `onMapRender` 用 `toolId` 查 `toolEvents` 标记 `hasMapPoints = true`
- 面试一句话：*"SSE 事件设计要预留上下文关联字段——不仅要传'发生了什么'，还要传'是谁产生的'，否则前端无法做事件溯源和交互回溯"*

**坑 3：工具步骤编号在思考卡片插入后错位**
- 现象：思考卡片插入 `toolEvents` 数组后，工具卡片的步骤编号如果用 `idx + 1` 会把思考卡片也算进去，导致工具编号不连续
- 根因：`v-for` 的 `idx` 是数组全量索引，包含 thought 和 tool 两种类型
- 解法：`toolStepNo(idx)` 函数用 `store.toolEvents.slice(0, idx + 1).filter(e => e.type === 'tool').length` 只统计 tool 类型，思考卡片用小圆点替代编号
- 面试一句话：*"混合类型列表的步骤编号不能直接用数组索引——要么按类型分别编号，要么用 filter 计数，否则插入非步骤项后编号会错位"*

### 📐 设计偏差（PLAN 没想到的）
1. **卡片颜色基于 dataSummary 有无而非工具类型**：原计划按工具类型分色，实际实现中"数据绿"和"工具蓝"的区分基于 `dataSummary` 字段是否存在 — 有数据摘要的 GIS 工具显示绿色，无数据摘要的工具（如纯 RAG 检索）显示蓝色。更符合"一眼看出这步工具返回了什么类型的数据"的语义
2. **思考卡片用前端拦截而非服务端 agent_thought 事件**：plan.md §4 定义了 `agent_thought` 事件，但前端拦截方案更轻量（仅改 store 1 个 handler）且保留流式体验，代价是文本会从聊天区"移走"（视觉上有短暂的文本消失再出现在推理面板）。DeepSeek 工具调用前通常无文本，思考卡片出现频率低，视觉影响小
3. **"在地图查看"按钮联动只做面板展开 + 闪烁高亮**：Day 6 接 OpenLayers 后，按钮可进一步 `view.fit(extent)` zoom 到对应点位，Day 5 先搭好 `toolId` 关联 + `emit('focus-map')` + Workbench 联动的框架
4. **入参默认折叠、返回默认展开**：用户更关心工具返回了什么数据而非传了什么参数，入参 JSON 默认折叠节省纵向空间，返回区块默认展开突出可解释性
5. **面板折叠用 flex 而非 v-if**：折叠时 `flex: 0 0 auto` + `v-show` 隐藏内容区（保留 DOM），而非 `v-if` 销毁重建。过渡动画用 `transition: flex 0.3s ease` 实现平滑收展

### 🔑 Day 5 参数修正
- **Plan Day 5 原列 5 项任务全部完成**：卡片四色分类、JSON 入参/返回折叠 + 垂直时间轴 + 自动滚动、面板可折叠 + 异常红色卡片、trace"在地图查看"按钮联动、四工具全流程链路完整展示验收
- **额外完成**：思考卡片（plan §4 定义的 agent_thought 事件的轻量替代方案）、map_render 事件增加 toolId 全链路贯通

---

## Day 6（2026-10-09）OpenLayers 10 地图接入 MapPanel

### ✅ 完成事项
- **依赖与配置**：接入 ol@10；`vite.config.ts` 补 `optimizeDeps.include: ['ol']`；新建 `src/vite-env.d.ts` 声明 `ImportMetaEnv` 类型；`.env` 增加前端可见的 `VITE_TIAN_DI_TU_KEY`
- **底图双源**：天地图 vec_w（矢量底图）+ cva_w（矢量注记）双图层叠加；无 Key 时优雅回退 OSM，克隆项目零配置可跑
- **边界层**：zger.json（准格尔旗边界）GeoJSON 矢量层，4326→3857 投影转换后渲染
- **点位渲染**：12 个点位 VectorLayer，按 status 染色（超标 `#f5222d` / 正常 `#52c41a`）+ 名称文本标注
- **Overlay 弹窗**：`bottom-center` 定位 + offset 挂锚点上方，点击点位展示详情，点空白/×关闭
- **视口联动**：`viewport` bounding box 经 `transformExtent`（4326→3857）后 `view.fit(extent, { maxZoom: 14 })`
- **响应式机制**：watch store 的 mapPoints/viewport 响应式重绘；ResizeObserver 监听容器调 `map.updateSize()`，尺寸 0→非0（v-show 折叠再展开）时重新 fit；rAF 兜底一帧后再 updateSize
- **调试钩子**：dev-only 挂 `window.__map`，验收期可在 console 直接操作 map 实例
- 端到端验收：12 点位渲染 / 弹窗交互 / 面板折叠后展开恢复，全部通过
- 涉及文件：`.env`、`vite.config.ts`、`src/vite-env.d.ts`（新建）、`MapPanel.vue`（重写）、`Workbench.vue`（flex-basis:0 修高度挤压）

### 🕳 踩坑记录

**坑 1：ol/style barrel 不导出 StyleFunction 类型（TS2305）**
- 现象：`import type { StyleFunction } from 'ol/style'` 报 TS2305，样式回调参数退化为 any
- 根因：OL v10 的 `ol/style` barrel 只导出 9 个运行时值，`StyleFunction` 这类纯类型不在其中
- 解法：从 `ol/style/Style` 深路径 import type
- 面试一句话：*"barrel 文件往往只 re-export 运行时值，纯类型导入要走深路径，否则 TS2305 或隐式 any"*

**坑 2：地图面板被挤到只剩 96px 高（Flex 高度链经典坑）**
- 现象：MapPanel 设置 `height: 100%` 但实际渲染高度只剩 96px
- 根因：父容器 flex 布局用默认 `flex: auto`（basis=content），MapPanel 内容基准≈0，负剩余空间分配时被兄弟面板挤到 min-height 地板
- 解法：面板写 `flex: 2 1 0` / `flex: 1 1 0`（basis:0 让比例脱离内容高度）+ `min-height: 0`
- 面试一句话：*"flex 内嵌百分比高度子组件，basis:0 + min-height:0 是标准解法——让比例分配脱离内容基准，高度链每层都要确定"*

**坑 3：OpenLayers 只监听 window resize，v-show 折叠再展开后地图尺寸错乱**
- 现象：面板折叠（display:none）再展开，地图画布尺寸不对
- 根因：OL 内部只监听 window resize，容器自身尺寸变化感知不到
- 解法：ResizeObserver 监听容器调 `map.updateSize()`，尺寸 0→非0 时重新 fit 视口；rAF 兜底
- 面试一句话：*"canvas 类库（OpenLayers/ECharts）普遍只监听 window resize，容器级尺寸变化要自己上 ResizeObserver"*

**坑 4：TS 闭包窄化陷阱——forEachFeatureAtPixel 回调里赋值的变量被推断为 never**
- 现象：`let hit = null` 后在 `forEachFeatureAtPixel` 回调里赋值，回调外 `if (hit)` 处 TS 报 hit 为 never
- 根因：TS 控制流分析不跨闭包边界，不分析闭包调用时序，声明处的 null 类型永远不会被"回调内赋值"收窄
- 解法：改用 const 数组 push 后取 `[0]`
- 面试一句话：*"TS 不追踪闭包内的赋值时序——回调内给外部 let 赋值无法收窄类型，用容器收集结果是标准 workaround"*

**坑 5：Vite 前端读不到服务端环境变量**
- 现象：`.env` 里的 `TIAN_DI_TU_KEY` 前端 `import.meta.env` 取值为 undefined
- 根因：Vite 只把 `VITE_` 前缀的变量注入前端，服务端变量对浏览器不可见（这也是安全边界的设计）
- 解法：`.env` 增加 `VITE_TIAN_DI_TU_KEY`；`vite-env.d.ts` 声明 `ImportMetaEnv` 合并类型
- 面试一句话：*"Vite 的 VITE_ 前缀是前端可见性边界，服务端密钥天然不进前端 bundle——服务端/前端双 Key 分离是有意设计"*

### 📐 设计偏差（PLAN 没想到的）
1. **底图双源回退**：天地图 Key 缺失时回退 OSM，克隆项目零配置可跑；同时认清一个事实——`VITE_` Key 会打进前端 bundle，防滥用要靠天地图控制台的域名白名单
2. **Overlay 弹窗用 bottom-center 而非默认 top-left**：弹窗出现在锚点正上方，符合"点哪儿弹哪儿上方"的空间直觉
3. **dev-only window.__map**：仅开发构建挂载，生产构建剔除，验收效率与生产安全兼得

---

## Day 7（2026-10-09 ~ 10-10）布局交互优化 + 会话历史 + 图例图标落地

### ✅ 完成事项
- **左右栏 50/50**：工作台左右栏默认均分比例
- **推理/地图面板三档模式切换**：双显 / 仅推理 / 仅地图，加可拖拽分隔条自由分配空间
- **地图点位 ↔ 对话上下文双向绑定**：
  - 对话→地图：Agent 返回点位自动弹窗居中（`focusedPoint`，MapPanel watch 消费后清除）
  - 地图→对话：Overlay 弹窗加「询问此点位」按钮 → `pendingInput` → ChatPanel watch 填入输入框，消费后清除
- **空态快捷问题业务化**：4 个真实执法场景 suggestion + 输入框占位文案替换
- **会话历史侧栏**：localStorage 持久化，新建/切换/重命名/删除；首条用户消息截断作标题；仅存 messages 不含运行时状态
- **地图图例 + 6 类点位专属图标（Day 7 收尾）**：
  - 启用闲置的 `src/assets/gis/map-icon/` 资产：6 类点位各配一张语义匹配的定位针 PNG（`import url` 静态导入，自动 hash 进打包产物）
  - 点位样式改三段式 Style 数组：定位针（`anchor: [0.5, 1]`、`scale: 0.55`）+ 右上角状态角标（CircleStyle `displacement: [10, 20]`，超标红/正常绿）+ 上方名称标注（`offsetY: -32`，超标红/正常深灰）
  - Overlay offset `[0, -12]` → `[0, -40]`，避免弹窗遮挡图标与名称
  - 左下角可折叠图例浮层：6 类图标 + 状态色说明，`z-index: 2` 避让 OL 内置缩放/版权控件
- `vue-tsc` 0 错误 + Vite 生产构建通过
- 涉及文件：`src/stores/chat.ts`、`Workbench.vue`、`ChatPanel.vue`、`MapPanel.vue`

### 🕳 踩坑记录

**坑 1：Icon displacement 方向语义靠猜不可靠**
- 现象：状态角标想放定位针右上角，displacement 取值方向拿不准
- 根因：文档未明说坐标轴语义，经验猜测容易返工
- 解法：直接读 `node_modules/ol/style/Icon.js` 的 `getAnchor()` 实现，确认 x 正值=右移、y 正值=上移
- 面试一句话：*"API 语义拿不准时读 node_modules 源码五分钟，比反复改参数盲试可靠得多"*

**坑 2：PNG 图标无法像 CircleStyle 那样动态染色**
- 现象：点位超标/正常状态需要颜色区分，但 PNG 图标是静态资源，运行时改不了色
- 根因：位图不接收 fill 参数，一个 Icon 实例只有一种外观
- 解法：状态用「右上角角标圆点 + 名称文字颜色」双重编码传递，图标本身保留类型辨识度
- 面试一句话：*"位图图标 + 动态状态的组合，要么备两套色图，要么用辅助元素（角标/文字色）承载状态编码"*

### 📐 设计偏差（PLAN 没想到的）
1. **状态三重编码（图标形状 + 角标颜色 + 文字颜色）**：不只靠颜色区分状态，色弱用户与黑白截图场景也能分辨——演示项目也要考虑可访问性
2. **图例用 HTML 浮层而非 OL 内置 Control**：HTML 浮层样式可控、折叠交互好写，z-index:2 即可不与缩放/版权条打架
3. **会话持久化只存 messages**：toolEvents/mapPoints 等运行时状态不落盘，恢复会话时保持"历史可读、状态重置"的干净语义

---

## Day 8（2026-10-10）CI/CD 自动化部署上线（阿里云 ECS + GitHub Actions）

### 🏗 部署架构（最终形态）

```
开发者: git push origin main
  ↓
GitHub Actions（海外 runner，免费）:
  checkout → pnpm install --frozen-lockfile → vite build（注入 VITE_TIAN_DI_TU_KEY）
  → rsync 产物（dist/ + server/ + 配置文件）→ ssh 远程: 服务器装依赖 + pm2 reload + 循环健康检查
  ↓
阿里云 ECS（8.138.104.215，宝塔面板管理）:
  nginx（宝塔配 SSL + 强制 HTTPS + 全站反代）→ 127.0.0.1:3000
  → pm2 常驻 Express（NODE_ENV=production 自托管 dist + SPA fallback）
  ↓
面试官访问 https://ai.heyi.pub（域名已备案，cert 由宝塔管理）
```

### ✅ 完成事项
- **架构决策：nginx 全站反代 → Node 3000，而非「nginx 托管静态 + 反代 /api」**
  - 依据：`index.ts` 的 `NODE_ENV=production` 分支已实现 dist 静态托管 + SPA fallback（Day 1 埋的伏笔）；宝塔用户一条反代配置即可全通，且站点根目录不指向服务器源码目录，天然规避 `.env` 被静态服务泄露的风险
- **目录结构**：`/www/wwwroot/ai.heyi.pub/` = `{dist/, server/, .env, package.json, pnpm-lock.yaml, ecosystem.config.cjs}`；`.env` 只存在于服务器，rsync 永远不触碰
- **CI 工作流**（`.github/workflows/deploy.yml`）：仅 push main 触发 + `workflow_dispatch` 手动兜底 + `concurrency` 单例防并发部署
- **密钥分层策略**（安全设计，面试可讲）：
  - 前端构建期密钥 `VITE_TIAN_DI_TU_KEY` → GitHub Secrets（构建时注入，本来就进 bundle）
  - 服务端运行时密钥（DeepSeek/硅基流动/Pinecone）→ 只放服务器 `.env`，**不进 CI、不进仓库**
  - SSH 部署专用密钥对（ed25519，无口令）→ 独立于日常 key，公钥进服务器 authorized_keys，私钥进 GitHub Secrets
- **pm2 进程管理**：`ecosystem.config.cjs`（cwd 指向站点根，`import 'dotenv/config'` 读根目录 `.env`，与开发环境布局一致）；`max_memory_restart: 512M` 兜底
- **宝塔 nginx 反代要点**：`proxy_buffering off`（SSE 生死线）、`proxy_http_version 1.1`、`Connection $connection_upgrade`（宝塔 map 变量，普通请求=空、WebSocket=upgrade，两相宜）、`Host $host`（透传真实域名）
- **服务器环境**：nvm 管理的 Node v20.20.2（unofficial-builds glibc-217 兼容构建）+ pnpm@10 + pm2，全部系统级 PATH 可用
- **端到端验收全通过**：/api/health 探活 ✓ → 首页 SSE 流式打字机 ✓ → GIS 工具地图点位渲染 ✓
- **日常上线的最终体验**：`git push origin main` = 部署，约 1-2 分钟全自动完成

### 🕳 踩坑记录（按「发现 → 排查 → 根因 → 解法」完整链路）

**坑 1：SSH 追加公钥报 `Connection closed by ... port 22`，疑似被服务器封禁**
- 现象：`Get-Content pub | ssh root@host "cat >> authorized_keys"` 在密码提示后连接被断开
- 排查：先排除环境问题——单独 `ssh root@host` 用密码登录，**成功**，证明没有 fail2ban/防爆破封 IP、没有端口限制
- 根因：上一条命令密码输错（认证失败被断开）
- 解法：不退出已登录会话，直接就地 `echo "公钥" >> ~/.ssh/authorized_keys`，绕开再次走 SSH 认证
- 面试一句话：*"SSH 连不上先分层排查——网络层（ping/端口）、认证层（单独登录验证）、授权层（公钥内容），一条失败的复合命令不能定位根因"*

**坑 2：初始化脚本只检查 node「存在性」不检查「版本」，pnpm@10 撞墙 Node 16**
- 现象：`pnpm -v` 报 `This version of pnpm requires at least Node.js v18.12. The current version is v16.20.2`
- 根因：脚本写的 `if ! command -v node`——服务器有宝塔/前人装的 Node 16 就跳过了安装 Node 20；**幂等脚本只查存在性不查版本是个逻辑漏洞**
- 解法：先 `which node` 确认来源（发现是 nvm），改用 nvm 安装 v20
- 面试一句话：*"环境初始化脚本要检查'版本满足'而非'命令存在'——旧环境的存在恰恰是最常见的部署陷阱"*

**坑 3：nvm install 成功后 node/npm 全部 `command not found`（npm prefix 冲突）**
- 现象：`nvm is not compatible with the npm "config" "prefix" option: currently set to ""`，然后 node/npm 找不到
- 根因：`~/.npmrc` 里残留了一行**空的** `prefix=` 配置；nvm 激活脚本检测到 prefix 就拒绝把版本 bin 目录注入 PATH（防全局包混乱的安全设计）
- 排查：报错信息直接点名 prefix → `cat ~/.npmrc` 确认 → 按 nvm 提示处理
- 解法：`nvm use --delete-prefix v20.20.2`（或直接删 `~/.npmrc`）+ `nvm alias default 20`
- 面试一句话：*"nvm 的版本切换本质是 PATH 注入，任何 npm prefix 残留都会让注入失败——报错信息里 'currently set to \"\"' 说明空值也会触发校验"*

**坑 4（本日最大）：Node 20 二进制报 `GLIBC_2.28 not found`，段错误前夜**
- 现象：nvm 激活成功后 `node -v` 报 `GLIBC_2.28/GLIBC_2.27/GLIBCXX_3.4.21 not found (required by node)`
- 排查：`ldd --version` → **glibc 2.17**（Alibaba Cloud Linux 2 / CentOS 7 世代）；官方 Node **18 起要求 glibc ≥ 2.28**，RHEL7 系官方二进制天花板就是 Node 16——这解释了服务器为什么一直躺着一个 Node 16
- 决策：两条路——① 重装系统（ACL3/Ubuntu 22.04，glibc 2.32+，但宝塔面板+已签 SSL 证书全部重置，代价大）② **unofficial-builds**（nodejs 官方组织维护的旧 glibc 兼容构建，glibc-217 变体）
- 解法：下载 `node-v20.20.2-linux-x64-glibc-217.tar.xz` → 解压到 `~/.nvm/versions/node/` → 重命名目录让 nvm 识别为 v20.20.2
- 面试一句话：*"老系统跑新 Node 不是死路——官方 unofficial-builds 提供 glibc-217 兼容构建；GLIBC 报错的本质是二进制动态链接的符号版本要求超出系统 libc"*

**坑 5：手动安装 unofficial-builds 后 `nvm use` 报 need to install（目录名少个前缀）**
- 现象：解压+移动后 nvm 说 "You need to run nvm install node-v20.20.2-linux-x64-glibc-217"，node 找不到
- 排查：`ls ~/.nvm/versions/node/` 发现目录还叫 `node-v20.20.2-linux-x64-glibc-217`——**我的 mv 命令源路径漏写了 `node-` 前缀**，mv 静默失败（当时没注意返回值）
- 解法：按实际目录名重新 `mv` 成 `v20.20.2`，nvm 即识别
- 教训：mv/tar 这类静默命令要 `&&` 串联或立即 `ls` 验证，不能假设成功

**坑 6：重装后 `node -v` 段错误（Segmentation fault），但 SHA256 校验一致**
- 现象：目录结构对了、nvm use 成功，node 一跑就 Segmentation fault
- 排查链：`ldd bin/node | grep "not found"` → 报 `bin/node: No such file or directory` → 说明 **bin 目录是空的**——第一次解压发生在 curl 下载中断之后，tar 对截断的 xz 文件解到一半停止，目录结构建了、二进制没落盘
- 解法：wget 重新下载（带进度条）→ 与官方 `SHASUMS256.txt` 比对 SHA256（一致）→ `rm -rf` 重解压 → `node -v` 正常
- 面试一句话：*"Segmentation fault 排查三板斧——ldd 看动态链接、校验和看文件完整性、换版本排除兼容性；下载中断的静默破坏比报错更危险"*

**坑 7：CI 的 ssh 是非交互会话，nvm 不加载，node/pnpm/pm2 全找不到**
- 根因：nvm 的加载写在 `~/.bashrc` 且被非交互判断短路；GitHub Actions 的 `ssh host 'cmd'` 不产生交互 shell
- 解法：远程命令首行显式 `source ~/.nvm/nvm.sh`
- 面试一句话：*"CI 走 SSH 执行远程命令时，环境变量的加载路径和登录 shell 完全不同——bashrc 的非交互短路是 nvm 用户部署 CI 的必踩坑"*

**坑 8（exit 7 连环排查）：CI 健康检查连接拒绝 → pm2 应用根本没起来**
- 现象：Actions 失败 `exit code 7`
- 排查思路：**exit 7 是 curl 的"Failed to connect"**（ssh 连接失败才是 255）→ 定位到 `curl 127.0.0.1:3000` 被拒 → 登录服务器 `pm2 ls` 显示 online 但 27MB 内存不对劲 → `pm2 logs` 看到真相：

```
node_modules/.bin/tsx:2
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")
SyntaxError: missing ) after argument list
```

- 根因：`.bin/tsx` 是 pnpm 生成的 **shell wrapper 脚本**，而 pm2 fork 模式默认用 **node** 解释 script 字段、不尊重 shebang——node 把 shell 语法当 JS 解析直接炸
- 解法：ecosystem 的 script 从 `node_modules/.bin/tsx` 改为**真实 JS 入口** `node_modules/tsx/dist/cli.mjs`
- 面试一句话：*"pm2 的 script 字段会被 node 解释执行，pnpm 的 .bin wrapper 是 shell 脚本——两者相遇必炸，要指向包的真实 JS 入口；'online' 状态只代表进程活着，不代表应用能服务"*

**坑 9：修复后 CI exit 2——服务器 curl 7.29 太老不认 `--retry-connrefused`**
- 现象：日志 `curl: option --retry-connrefused: is unknown`，exit 2
- 排查：CI 日志直接点名参数未知 → 服务器 curl 版本 7.29（CentOS 7 世代），该参数 curl 7.52 才引入
- 解法：不用 curl 自带重试，改写 shell 循环（`for i in $(seq 1 15); do curl ... && break; sleep 2; done`），兼容任何版本
- 面试一句话：*"给老系统写 CI 脚本要按最低版本能力写——curl 参数级别的兼容性问题，shell 循环永远是最稳的兜底"*

**坑 10：git 推送的网络分裂——不开代理打不开 GitHub，开了代理 push 报错**
- 现象：浏览器能开 GitHub（走系统代理），git push 报 `Empty reply from server`（TLS 被掐）
- 根因：**git 命令行不读系统代理设置**；代理开着但 git 仍在裸连
- 解法：`git config --global http.proxy http://127.0.0.1:32595`（端口按代理软件实际）；代理关闭时必须 `--unset`，否则 git 撞死在本地端口上
- 进阶：改成 `$env:HTTPS_PROXY=...; git push` 按次注入，配置表保持干净，开/不开代理都有路走
- 面试一句话：*"系统代理只对遵循系统设置的软件生效，git/curl 这类工具要显式配置；反过来工具级代理配置在代理软件关闭时会变成新的故障点"*

### 🔧 排查方法论沉淀（exit code 速查，本次实战验证）

| 退出码 | 来源 | 含义 |
|---|---|---|
| 7 | curl | 连接失败/拒绝（服务没起、端口不对） |
| 2 | curl / bash | 参数解析错误 / 脚本语法错误 |
| 255 | ssh | SSH 连接/认证失败 |
| 23/24 | rsync | 部分传输失败 / 文件消失 |

方法论：**复合命令的失败先拆分验证**（坑 1）；**从退出码反查是哪条命令、哪个层级的失败**（坑 8/9）；**环境类问题先问"版本是多少"再问"装没装"**（坑 2/4）；**静默命令执行后必须显式验证结果**（坑 5/6）。

### 📐 设计偏差（PLAN 没想到的）
1. **nginx 全站反代而非托管静态**：利用 Day 1 埋的 `NODE_ENV=production` 自托管分支，宝塔侧只配一条反代，配置面最小、`.env` 零暴露
2. **unofficial-builds 而非重装系统**：保留宝塔+证书现状，用官方组织的 glibc-217 构建解决老系统跑新 Node；代价是构建非官方默认渠道（记录在案，Demo 场景可接受）
3. **健康检查放在 CI 最后一步而非浏览器验收**：`/api/health`（Day 2 加的探活接口）成为部署自动化的"上线判据"，CI 红绿即部署成败，无人工确认环节

---

## Day 8+（2026-10-10）上线后安全加固（P1 漏洞修复）

### ✅ 完成事项
- 全项目安全排查：0 个 P0、3 个 P1、3 个 P2，P1 全部当日修复
- **chat.ts 消息限制**：`MAX_HISTORY_MESSAGES=50`（超出截取最近 N 条，对齐 ChatGPT 上下文窗口管理行为）+ `MAX_MESSAGE_LENGTH=10_000`（单条超限直接 400 拒绝）
- **错误信息脱敏**：chat.ts / upload.ts 共 4 处 500 响应，生产环境只返回通用提示（完整错误只进服务端日志），开发环境保留 `err.message` 便于调试；upload.ts 提取 `errMsg()` 本地助手统一处理
- **上传超时竞态修复**：入库前检查 `timedOut` 放弃写入；入库后发现已超时则 `deleteByDocId` 回滚；catch 补中途失败回滚（upsertChunks 分批写入，批次间失败会残留部分向量）。修复后语义统一为"报错即未入库"
- 验证：服务端 `tsc --noEmit` 通过 + `pnpm build` 通过

### 🕳 踩坑记录

**坑 1：对话接口裸奔——无消息数量/长度限制，token 成本完全不可控**
- 现象：排查发现 `/api/chat` 只校验 messages 是数组，客户端可发几百条超长消息
- 根因：公网部署后，任何访客都能构造超长历史请求推高 DeepSeek token 消耗，属于"能被刷钱"级别的接口暴露
- 解法：双层限制——历史条数静默截断（不影响正常长对话），单条长度硬拒绝（防粘贴整篇文档）
- 面试一句话：*"LLM 应用的接口限流有两层：调用频率层（rate limit）和 token 消耗层（消息数×长度），后者常被忽略但直接等于钱"*

**坑 2：err.message 直接发前端——错误响应成了信息泄露通道**
- 现象：chat/upload 路由把 `err.message` 原样写进响应，Pinecone/DeepSeek 的报错文本可能含 index 名、API 地址甚至 key 片段
- 根因：开发期这么写是为了调试方便，但代码直接带进了生产
- 解法：按 `NODE_ENV` 分流——生产只回通用提示，详细错误只进服务端日志；upload.ts 提取 `errMsg()` 助手消除三处重复
- 面试一句话：*"错误响应是对外接口，要按'最小信息披露'原则设计；调试便利性应该体现在日志里，而不是响应体里"*

**坑 3：上传超时返回 504，但文档已悄悄入库（幽灵文档）**
- 现象：120s 超时后用户看到"处理超时"，但异步流程继续跑完 upsert，刷新知识库列表文档赫然在列——用户以为没传上又传一遍，数据重复
- 根因：超时逻辑只做了"响应一次"，没有中断后续写入；且 upsertChunks 分批写入，批次间失败还会残留半篇文档
- 解法：三个闸门——①入库前查 timedOut 放弃写入 ②入库后发现已超时则 deleteByDocId 回滚 ③catch 统一回滚中途失败的分批残留。为此把 docId 声明提升到 try 块外（catch 要能引用）
- 面试一句话：*"异步任务+超时响应的组合必须回答'超时后任务到哪一步了'——要么超时即中断，要么完成后回滚，保证'报错即未生效'的最终一致性"*

---

<!--
每日小节模板（复制使用）：

## Day X（YYYY-MM-DD）<主题>

### ✅ 完成事项
-

### 🕳 踩坑记录
**坑 N：<标题>**
- 现象：
- 根因：
- 解法：
- 面试一句话：*"..."*
-->

