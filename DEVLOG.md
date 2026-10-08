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