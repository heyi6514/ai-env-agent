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
