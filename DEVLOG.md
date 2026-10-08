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

-->