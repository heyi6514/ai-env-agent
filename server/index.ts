import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import chatRouter from './routes/chat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use('/api', chatRouter)

// 未知 API 路由返回 404（必须放在业务路由之后）
app.use('/api', (_req, res) => {
  res.status(404).json({ message: '接口不存在' })
})

// 统一错误处理：Express 4 不会自动捕获异步异常，各路由需自行 try/catch 后 next(err)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // body-parser 等中间件抛出的错误自带 statusCode（如非法 JSON → 400），按其状态码返回
  const status =
    typeof err === 'object' && err && 'status' in err
      ? Number((err as { status: number }).status) || 500
      : 500
  if (status >= 500) console.error('[server]', err)
  if (!res.headersSent) res.status(status).json({ message: status === 400 ? '请求体格式错误' : '服务器内部错误' })
})

// 生产环境托管前端构建产物（nginx 可替代，这里保留以便直接 node 访问）
if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(__dirname, '../dist')
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`[server] API ready at http://localhost:${port}`)
})
