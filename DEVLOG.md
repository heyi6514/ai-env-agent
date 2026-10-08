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

## Day 2（待开）LangChain Agent + GIS 单工具

### 待办
- [ ] 读 DeepSeek Function Calling 文档 30 分钟（Day 2 硬前置，尚未完成）
- [ ] LangChain Agent 最小闭环（ChatDeepSeek）
- [ ] 工具 1：GIS 污染源查询（mock 30 条点位）
- [ ] 推理链路面板雏形

### 🕳 踩坑记录
（待填）

### 📐 设计偏差
（待填）

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

### 📐 设计偏差（PLAN 没想到的）
1. 原设计：xxx → 实际：xxx，原因：xxx
-->