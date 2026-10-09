import { Router } from 'express'
import multer from 'multer'
import { parsePdf, splitDocument } from '../lib/document'
import { upsertChunks, listDocuments, deleteByDocId } from '../lib/vector-store'

const router = Router()

/**
 * 文件上传配置：
 * - memoryStorage：文件暂存内存，不写磁盘，解析完即释放
 * - limits.fileSize：20MB，与前端校验一致
 * - 单文件字段名 file，与前端 el-upload 的 name="file" 对应
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const ALLOWED_EXT = /\.(pdf|md|txt)$/i

/** 文档处理整体超时（解析 + 分块 + embedding + 入库），大 PDF 可能较慢 */
const UPLOAD_TIMEOUT_MS = 120_000

/**
 * 生成 500 错误消息：生产环境隐藏内部详情（err.message 可能含 Pinecone/embedding 服务
 * 敏感信息），开发环境附带详情便于调试。完整错误始终记录到服务端日志。
 */
function errMsg(err: unknown, label: string): string {
  const detail = process.env.NODE_ENV === 'production' || !(err instanceof Error) ? '' : `：${err.message}`
  return `${label}${detail}`
}

/**
 * 修复 multer 中文文件名乱码。
 * multer 解析 multipart 的 filename 字段时默认用 Latin-1 解码，
 * 而浏览器实际上传的是 UTF-8 字节，导致中文变成「æ°´æ±¡」这类乱码。
 * 解法：把 Latin-1 字符串按字节转回 Buffer，再用 UTF-8 解码。
 * 若修复后出现替换字符 U+FFFD 说明原文件本身就是 ASCII/Latin-1，回退原名。
 */
function fixFilename(originalname: string): string {
  const utf8 = Buffer.from(originalname, 'latin1').toString('utf-8')
  // 修复后无替换字符且含中文 → 说明原确实是 UTF-8 被错解为 Latin-1
  if (!utf8.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(utf8)) {
    return utf8
  }
  return originalname
}

/**
 * 智能解码文本文件：优先 UTF-8，若出现乱码（U+FFFD 替换字符）则回退 GBK。
 * 中文 Windows 下的 .txt 常为 GBK 编码，直接 UTF-8 解码会乱码入库。
 */
function decodeTextFile(buffer: Buffer): string {
  // 有 UTF-8 BOM 直接当 UTF-8
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8')
  }
  const utf8 = buffer.toString('utf-8')
  // 无替换字符 → UTF-8 解码成功
  if (!utf8.includes('\uFFFD')) return utf8
  // 回退 GBK
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8
  }
}

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ message: '未收到文件' })
    return
  }

  const filename = fixFilename(file.originalname)
  if (!ALLOWED_EXT.test(filename)) {
    res.status(400).json({ message: '仅支持 PDF / Markdown / TXT 文件' })
    return
  }

  // 120s 超时保护：超时返回 504，避免大文件长时间挂起连接
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    if (!res.headersSent) {
      res.status(504).json({ message: '文档处理超时，请尝试较小的文件' })
    }
  }, UPLOAD_TIMEOUT_MS)

  // docId 用纯 ASCII（Pinecone vector ID 必须 ASCII）。
  // 时间戳 + 随机后缀，避免同毫秒上传多个文件时 docId 碰撞导致向量覆盖。
  // 声明在 try 外：catch 里的失败回滚需要引用它
  const docId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    const isPdf = /\.pdf$/i.test(filename)
    const source = filename

    let chunks
    if (isPdf) {
      const pages = await parsePdf(file.buffer)
      chunks = await splitDocument(pages, docId, source)
    } else {
      const text = decodeTextFile(file.buffer)
      chunks = await splitDocument(text, docId, source)
    }

    // 空文档（解析后无有效文本）不入库
    if (chunks.length === 0) {
      clearTimeout(timer)
      const hint = isPdf
        ? '未提取到有效文本，该 PDF 可能是扫描件/图片型。请使用文字版 PDF，或转为 Markdown / TXT 后重新上传。'
        : '文档内容为空，无法入库'
      res.status(400).json({ message: hint })
      return
    }

    // 入库前检查超时：若已超时则放弃写入，避免用户收到 504 但文档实际已入库的"幽灵文档"
    if (timedOut) return

    const inserted = await upsertChunks(chunks)

    clearTimeout(timer)
    if (timedOut) {
      // 超时发生在入库之后：回滚已写入向量，保证"报错即未入库"的一致性
      await deleteByDocId(docId).catch(e => console.error('[upload] 超时回滚失败:', e))
      return
    }
    res.json({ filename, chunks: inserted })
  } catch (err) {
    clearTimeout(timer)
    if (timedOut) return
    // upsertChunks 分批写入，中途失败可能残留部分向量：按 docId 回滚，保证"报错即未入库"
    await deleteByDocId(docId).catch(e => console.error('[upload] 失败回滚失败:', e))
    console.error('[upload] 处理失败:', err)
    res.status(500).json({ message: errMsg(err, '文档处理失败') })
  }
})

/**
 * 获取知识库文档列表（按文件名聚合分块数和页数）。
 * 前端知识库页面加载时调用，展示已有文档。
 */
router.get('/documents', async (_req, res) => {
  try {
    const docs = await listDocuments()
    res.json({ documents: docs })
  } catch (err) {
    console.error('[documents] 查询失败:', err)
    res.status(500).json({ message: errMsg(err, '查询文档列表失败') })
  }
})

/**
 * 删除知识库中的某文档（按 docId 删除其所有向量）。
 * 前端知识库页面点击删除按钮时调用。
 */
router.delete('/documents/:docId', async (req, res) => {
  const docId = req.params.docId
  if (!docId) {
    res.status(400).json({ message: '缺少 docId 参数' })
    return
  }
  try {
    const deleted = await deleteByDocId(docId)
    res.json({ deleted })
  } catch (err) {
    console.error('[documents] 删除失败:', err)
    res.status(500).json({ message: errMsg(err, '删除文档失败') })
  }
})

export default router