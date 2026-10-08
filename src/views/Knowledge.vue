<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'

/** 本次会话上传记录 */
interface UploadedDoc {
  name: string
  size: number
  chunks: number
  status: 'success' | 'error'
  message?: string
}

/** 知识库已有文档（来自 Pinecone） */
interface KnowledgeDoc {
  docId: string
  source: string
  chunks: number
  pages?: number
  uploadedAt: string
}

const uploaded = ref<UploadedDoc[]>([])
const knowledgeDocs = ref<KnowledgeDoc[]>([])
const loadingDocs = ref(false)
const uploading = ref(false)
/** 当前正在上传的文件名，用于 loading 提示 */
const uploadingName = ref('')
/** 上传队列（多文件串行处理） */
const uploadQueue = ref<UploadFile[]>([])

const ACCEPT = '.pdf,.md,.txt'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 拉取知识库已有文档列表 */
async function fetchKnowledgeDocs() {
  loadingDocs.value = true
  try {
    const res = await fetch('/api/documents')
    const data = await res.json()
    knowledgeDocs.value = data.documents ?? []
  } catch {
    ElMessage.error('获取文档列表失败')
  } finally {
    loadingDocs.value = false
  }
}

/** 删除知识库文档 */
async function deleteDoc(row: KnowledgeDoc) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.source}」？删除后无法恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(row.docId)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '删除失败')
    ElMessage.success(`已删除「${row.source}」，共 ${data.deleted} 个分块`)
    fetchKnowledgeDocs()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

/** 校验单个文件 */
function validateFile(file: UploadFile): string | null {
  if (!/\.(pdf|md|txt)$/i.test(file.name)) return '仅支持 PDF / Markdown / TXT 文件'
  if ((file.size ?? 0) > 20 * 1024 * 1024) return '文件大小不能超过 20MB'
  return null
}

/** 串行上传单个文件（用 fetch 手动控制，避免并发触发 embedding QPS 限流） */
async function uploadFile(file: UploadFile): Promise<void> {
  const formData = new FormData()
  formData.append('file', file.raw as File)
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '上传失败')
    uploaded.value.unshift({
      name: data.filename ?? file.name,
      size: file.size ?? 0,
      chunks: data.chunks ?? 0,
      status: 'success',
    })
    ElMessage.success(`「${file.name}」入库成功，共 ${data.chunks} 个分块`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误'
    uploaded.value.unshift({
      name: file.name,
      size: file.size ?? 0,
      chunks: 0,
      status: 'error',
      message: msg,
    })
    ElMessage.error(`「${file.name}」上传失败：${msg}`)
  }
}

/** 处理上传队列：逐个串行上传，全部完成后刷新列表 */
async function processQueue() {
  if (uploading.value) return
  uploading.value = true
  try {
    while (uploadQueue.value.length > 0) {
      const file = uploadQueue.value.shift()!
      uploadingName.value = file.name
      await uploadFile(file)
    }
  } finally {
    uploadingName.value = ''
    uploading.value = false
    // Pinecone serverless 有最终一致性延迟，等 500ms 再拉列表，避免刚入库就查不到
    setTimeout(fetchKnowledgeDocs, 500)
  }
}

/** 选择/拖拽文件后触发：校验 → 入队 → 触发队列处理 */
function handleFileChange(file: UploadFile) {
  const err = validateFile(file)
  if (err) {
    ElMessage.error(`「${file.name}」${err}`)
    return
  }
  uploadQueue.value.push(file)
  processQueue()
}

/** 清空本次上传记录（仅前端，不删后端数据） */
function clearList() {
  uploaded.value = []
}

onMounted(fetchKnowledgeDocs)
</script>

<template>
  <div class="knowledge">
    <div class="page-header">
      <h2 class="page-title">环保法规知识库</h2>
      <p class="page-desc">上传政策法规文件（PDF / MD / TXT），系统自动分块并建立向量索引，供对话检索引用。</p>
    </div>

    <div class="upload-card">
      <el-upload
        drag
        multiple
        :limit="5"
        :accept="ACCEPT"
        :show-file-list="false"
        :auto-upload="false"
        :on-change="handleFileChange"
        :disabled="uploading"
      >
        <template v-if="uploading">
          <el-icon class="upload-icon is-loading"><Loading /></el-icon>
          <div class="upload-text">正在上传「{{ uploadingName }}」...</div>
          <div class="upload-hint">解析 → 分块 → 生成向量 → 入库，可能需要数秒到十几秒</div>
        </template>
        <template v-else>
          <el-icon class="upload-icon"><upload-filled /></el-icon>
          <div class="upload-text">拖拽文件到此处，或<em>点击选择</em></div>
          <div class="upload-hint">支持 PDF / Markdown / TXT，单文件不超过 20MB，一次最多 5 个</div>
        </template>
        <template #tip>
          <div class="upload-tip">上传后将自动解析 → 分块 → 生成向量 → 入库，可能需要数秒到十几秒</div>
        </template>
      </el-upload>
    </div>

    <!-- 知识库已有文档（持久化，来自 Pinecone） -->
    <div class="list-header">
      <span class="list-title">知识库文档（{{ knowledgeDocs.length }}）</span>
      <el-button text size="small" :loading="loadingDocs" @click="fetchKnowledgeDocs">刷新</el-button>
    </div>

    <el-empty v-if="!loadingDocs && !knowledgeDocs.length" description="知识库暂无文档，请先上传" :image-size="80" />

    <el-table v-else :data="knowledgeDocs" v-loading="loadingDocs" stripe size="small" style="width: 100%">
      <el-table-column prop="source" label="文件名" min-width="200" show-overflow-tooltip />
      <el-table-column prop="chunks" label="分块数" width="90" />
      <el-table-column label="页数" width="80">
        <template #default="{ row }">{{ row.pages ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="uploadedAt" label="上传时间" width="170" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default>
          <el-tag type="success" size="small">已入库</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button type="danger" link size="small" @click="deleteDoc(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 本次会话上传记录（临时反馈） -->
    <template v-if="uploaded.length">
      <div class="list-header" style="margin-top: 24px">
        <span class="list-title">本次上传记录</span>
        <el-button text size="small" @click="clearList">清空</el-button>
      </div>
      <el-table :data="uploaded" stripe size="small" style="width: 100%">
        <el-table-column prop="name" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="分块数" width="100">
          <template #default="{ row }">
            <span v-if="row.status === 'success'">{{ row.chunks }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '已入库' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.status === 'success'">可在对话中检索引用</span>
            <span v-else class="error-msg">{{ row.message }}</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.knowledge {
  height: 100%;
  padding: 24px 32px;
  box-sizing: border-box;
  overflow-y: auto;
}
.page-header {
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--el-text-color-primary);
}
.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.upload-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}
.upload-icon {
  font-size: 48px;
  color: var(--el-color-primary);
}
.upload-icon.is-loading {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.upload-text {
  margin-top: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.upload-text em {
  color: var(--el-color-primary);
  font-style: normal;
}
.upload-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.upload-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.list-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.error-msg {
  color: var(--el-color-danger);
}
</style>
