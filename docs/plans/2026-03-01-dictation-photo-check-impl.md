# 默写拍照检查 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用户拍照上传手写默写纸，大模型识别图片中古文ID与手写文字，查询原文逐字比对批改，标注正误并存入数据库。

**Architecture:** 客户端压缩图片后 base64 传到云函数 `gw_dictation-check`，云端调用 Qwen3.5-Plus 视觉模型识别，查数据库比对，结果存入独立集合 `gw-dictation-checks`，前端新页面 `dictation-result` 展示批改结果。

**Tech Stack:** uni-app (Vue 3), uniCloud 云函数 (Alipay), Qwen3.5-Plus 视觉模型 (DashScope API), uniCloud 云存储

---

### Task 1: 添加视觉模型配置到 config

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/common/config/index.js`

**Step 1: 在 config 中新增 `bailianVision` 配置段**

在 `bailianPoemSearch` 之后添加：

```javascript
  bailianVision: {
    apiKey: 'sk-2a5626f893bf4455825b04cee41a879d',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    timeout: 60000
  }
```

注意：视觉模型处理耗时较长，timeout 设为 60 秒。

**Step 2: Commit**

```bash
git add uniCloud-alipay/cloudfunctions/common/config/index.js
git commit -m "feat: 添加视觉模型 bailianVision 配置"
```

---

### Task 2: 创建云函数 gw_dictation-check

**Files:**
- Create: `uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`
- Create: `uniCloud-alipay/cloudfunctions/gw_dictation-check/package.json`

**Step 1: 创建 package.json**

```json
{
  "name": "gw_dictation-check",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {}
}
```

**Step 2: 创建 index.js — 主体框架**

完整文件内容：

```javascript
'use strict'
const db = uniCloud.database()
const textsCollection = db.collection('gw-ancient-texts')
const checksCollection = db.collection('gw-dictation-checks')
const uniID = require('uni-id-common')
const { bailianVision } = require('config')

// ---- 工具函数 ----

async function getAuthUid(event, context) {
  const uniIdCommon = uniID.createInstance({ context })
  let uid = (context.auth && context.auth.uid) || ''
  const token =
    (event && event.uniIdToken) ||
    (event && event.uni_id_token) ||
    (event && event.data && (event.data.uniIdToken || event.data.uni_id_token)) ||
    ''
  if (!uid && token) {
    const tokenRes = await uniIdCommon.checkToken(token)
    if (tokenRes && tokenRes.code === 0 && tokenRes.uid) {
      uid = tokenRes.uid
    }
  }
  return uid
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    // 尝试从文本中提取 JSON 块
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch (e2) {
        return null
      }
    }
    return null
  }
}

const PUNCTUATION_REG = /[，。、；：？！""''（）《》〈〉【】「」『』〔〕…—\s\n\r,.;:?!'"()\[\]{}]/

function isPunctuation(char) {
  return PUNCTUATION_REG.test(char)
}

/**
 * 逐字比对原文和识别文字（简化版，不含同音字检测）
 * 使用 LCS 算法
 */
function diffChars(original, recognized) {
  // 过滤标点，保留原始索引
  function normalize(text) {
    const chars = String(text || '').split('')
    const filtered = []
    chars.forEach((char, index) => {
      if (!isPunctuation(char)) {
        filtered.push({ char, index })
      }
    })
    return { chars, filtered }
  }

  const source = normalize(original)
  const target = normalize(recognized)
  const a = source.filtered
  const b = target.filtered

  // 构建 LCS 表
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].char === b[j - 1].char) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 初始化结果：标点为 punctuation，其余默认 missing
  const result = source.chars.map(char => ({
    char,
    status: isPunctuation(char) ? 'punctuation' : 'missing'
  }))

  // 回溯 LCS，找出匹配位置
  let i = m
  let j = n
  const matchedOriginal = new Set()
  const matchedTarget = new Set()
  while (i > 0 && j > 0) {
    if (a[i - 1].char === b[j - 1].char) {
      matchedOriginal.add(a[i - 1].index)
      matchedTarget.add(b[j - 1].index)
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  // 标记正确字符
  source.chars.forEach((char, index) => {
    if (!isPunctuation(char) && matchedOriginal.has(index)) {
      result[index] = { char, status: 'correct' }
    }
  })

  // 找出识别文字中不在 LCS 里的字符（错字）,记录到 wrong 状态
  // 对原文中 missing 的字符，尝试找到对应的错字
  const wrongChars = []
  b.forEach((item, idx) => {
    if (!matchedTarget.has(item.index)) {
      wrongChars.push(item.char)
    }
  })

  // 为 missing 的字匹配对应的错字
  let wrongIdx = 0
  result.forEach((item, idx) => {
    if (item.status === 'missing' && wrongIdx < wrongChars.length) {
      result[idx] = {
        char: item.char,
        status: 'wrong',
        recognized: wrongChars[wrongIdx]
      }
      wrongIdx++
    }
  })

  return result
}

function calcAccuracy(diffResult) {
  if (!diffResult || diffResult.length === 0) return 0
  const compareChars = diffResult.filter(d => d.status !== 'punctuation')
  if (compareChars.length === 0) return 0
  const correct = compareChars.filter(d => d.status === 'correct').length
  return Math.round((correct / compareChars.length) * 100 * 10) / 10
}

// ---- 大模型调用 ----

async function callVisionModel(imageBase64) {
  if (!bailianVision || !bailianVision.apiKey) {
    throw new Error('未配置视觉模型 API Key')
  }

  const endpoint = bailianVision.endpoint
  const requestBody = {
    model: bailianVision.model || 'qwen-vl-plus',
    messages: [
      {
        role: 'system',
        content: '你是一个古文默写纸图片识别助手。你的任务是严格按照手写内容原样识别文字，绝对不能进行任何形式的智能纠错、校准或替换。'
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageBase64
            }
          },
          {
            type: 'text',
            text: `请仔细看这张手写默写纸的照片，完成以下任务：

1. 找到纸上印刷的"文章ID"，提取其值
2. 逐字识别手写的正文内容

重要规则（必须严格遵守）：
- 必须严格按照手写内容原样识别，绝对不要进行任何智能纠错或校准
- 如果写的是错别字，就原样输出错别字，绝对不要替换为正确的字
- 如果某个字无法辨认，用"□"替代
- 忽略标点符号，只识别汉字
- 不要添加原文中没有手写的内容

请以JSON格式返回（不要包含markdown代码块标记）：
{"articleId": "识别到的文章ID", "handwrittenText": "逐字识别的手写内容"}`
          }
        ]
      }
    ],
    temperature: 0.1
  }

  const response = await uniCloud.httpclient.request(endpoint, {
    method: 'POST',
    timeout: Number(bailianVision.timeout || 60000),
    headers: {
      Authorization: `Bearer ${bailianVision.apiKey}`,
      'Content-Type': 'application/json'
    },
    dataType: 'json',
    data: requestBody
  })

  if (response.status !== 200 || !response.data) {
    throw new Error('视觉模型调用失败: HTTP ' + response.status)
  }

  const choices = response.data.choices || []
  const rawContent = (
    choices[0] && choices[0].message && choices[0].message.content
  ) || ''

  const parsed = safeJsonParse(rawContent.trim())
  if (!parsed || !parsed.articleId) {
    throw new Error('视觉模型返回格式异常，无法解析识别结果')
  }

  return {
    articleId: String(parsed.articleId).trim(),
    handwrittenText: String(parsed.handwrittenText || '').trim()
  }
}

// ---- action 处理 ----

async function handleCheck(uid, data) {
  const { imageBase64, difficulty } = data
  if (!imageBase64) {
    return { code: -1, msg: '缺少图片数据' }
  }

  // 1. 调用视觉模型识别
  const recognition = await callVisionModel(imageBase64)

  // 2. 查询原文
  const articleId = recognition.articleId
  let textDoc = null
  // 先按 _id 查
  try {
    const res = await textsCollection.doc(articleId).get()
    textDoc = res.data && res.data[0]
  } catch (e) {
    // doc 查询失败，忽略
  }

  if (!textDoc) {
    return {
      code: -1,
      msg: `未找到文章ID "${articleId}" 对应的原文，请确认默写纸上的文章ID是否正确`
    }
  }

  // 3. 逐字比对
  const originalText = String(textDoc.content || '')
  const recognizedText = recognition.handwrittenText
  const diffResult = diffChars(originalText, recognizedText)
  const accuracy = calcAccuracy(diffResult)

  // 4. 提取错字列表
  const wrongChars = diffResult
    .filter(d => d.status === 'wrong' || d.status === 'missing')
    .map(d => d.recognized || d.char)

  // 5. 上传图片到云存储
  let imageFileId = ''
  let imageUrl = ''
  try {
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const cloudPath = `dictation-checks/${Date.now()}-${uid}.jpg`
    const uploadRes = await uniCloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })
    imageFileId = uploadRes.fileID || ''
    // 获取临时访问URL
    if (imageFileId) {
      const urlRes = await uniCloud.getTempFileURL({ fileList: [imageFileId] })
      imageUrl = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || ''
    }
  } catch (e) {
    console.error('图片上传失败:', e)
    // 不阻断流程，只是不保存图片
  }

  // 6. 存入数据库
  const record = {
    user_id: uid,
    article_id: articleId,
    text_title: textDoc.title || '',
    text_author: textDoc.author || '',
    text_dynasty: textDoc.dynasty || '',
    original_text: originalText,
    recognized_text: recognizedText,
    difficulty: difficulty || '',
    diff_result: diffResult,
    accuracy,
    wrong_chars: wrongChars,
    image_file_id: imageFileId,
    image_url: imageUrl,
    created_at: Date.now()
  }
  const addRes = await checksCollection.add(record)

  return {
    code: 0,
    data: {
      recordId: addRes.id,
      articleId,
      title: textDoc.title || '',
      author: textDoc.author || '',
      dynasty: textDoc.dynasty || '',
      originalText,
      recognizedText,
      diffResult,
      accuracy,
      wrongChars,
      imageUrl
    }
  }
}

async function handleList(uid, data) {
  const { page = 1, pageSize = 20 } = data
  const skip = (page - 1) * pageSize

  const countRes = await checksCollection.where({ user_id: uid }).count()
  const listRes = await checksCollection
    .where({ user_id: uid })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .field({
      text_title: true,
      text_author: true,
      accuracy: true,
      difficulty: true,
      image_url: true,
      created_at: true
    })
    .get()

  return {
    code: 0,
    data: {
      list: listRes.data,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function handleDetail(uid, data) {
  if (!data.id) {
    return { code: -1, msg: '缺少记录ID' }
  }
  const res = await checksCollection.doc(data.id).get()
  const record = res.data && res.data[0]
  if (!record || record.user_id !== uid) {
    return { code: -1, msg: '记录不存在' }
  }
  return { code: 0, data: record }
}

// ---- 主入口 ----

exports.main = async (event, context) => {
  const { action, data = {} } = event

  let uid = ''
  try {
    uid = await getAuthUid(event, context)
  } catch (e) {
    // 鉴权失败不阻断
  }

  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  try {
    switch (action) {
      case 'check':
        return await handleCheck(uid, data)
      case 'list':
        return await handleList(uid, data)
      case 'detail':
        return await handleDetail(uid, data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('gw_dictation-check error:', error)
    return {
      code: -1,
      msg: error.message || '批改服务异常'
    }
  }
}
```

**Step 3: Commit**

```bash
git add uniCloud-alipay/cloudfunctions/gw_dictation-check/
git commit -m "feat: 新建云函数 gw_dictation-check（拍照批改/历史/详情）"
```

---

### Task 3: 添加 pages.json 路由

**Files:**
- Modify: `pages.json`

**Step 1: 在 `pages/ancient/result` 路由之后添加新路由**

在 `pages.json` 的 `pages` 数组中，`pages/ancient/result` 条目之后插入：

```json
{
  "path": "pages/ancient/dictation-result",
  "style": {
    "navigationBarTitleText": "默写批改结果"
  }
}
```

插入位置：在 `result` 路由对象的 `}` 之后、`pages/square/index` 之前。

**Step 2: Commit**

```bash
git add pages.json
git commit -m "feat: 添加 dictation-result 页面路由"
```

---

### Task 4: 修改 dictation.vue — 实现 openPhotoEntry()

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1: 替换 openPhotoEntry() 方法**

将 `openPhotoEntry()` 方法（第 191-196 行）替换为完整实现：

```javascript
    openPhotoEntry() {
      uni.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        success: (res) => {
          const tempFilePath = res.tempFilePaths[0]
          this.compressAndCheck(tempFilePath)
        }
      })
    },
    compressAndCheck(filePath) {
      uni.showLoading({ title: 'AI批改中...', mask: true })
      // #ifdef APP-PLUS
      this.compressImageApp(filePath).then(compressedPath => {
        this.readAndUpload(compressedPath)
      }).catch(err => {
        uni.hideLoading()
        uni.showToast({ title: '图片压缩失败', icon: 'none' })
      })
      // #endif
      // #ifdef H5
      this.compressImageH5(filePath).then(base64 => {
        this.callCheckFunction(base64)
      }).catch(err => {
        uni.hideLoading()
        uni.showToast({ title: '图片压缩失败', icon: 'none' })
      })
      // #endif
      // #ifdef MP-WEIXIN
      this.compressImageApp(filePath).then(compressedPath => {
        this.readAndUpload(compressedPath)
      }).catch(err => {
        uni.hideLoading()
        uni.showToast({ title: '图片压缩失败', icon: 'none' })
      })
      // #endif
    },
    compressImageApp(filePath) {
      return new Promise((resolve, reject) => {
        uni.compressImage({
          src: filePath,
          quality: 65,
          width: 'auto',
          height: 'auto',
          compressedWidth: 1080,
          rotate: 0,
          success: (res) => {
            resolve(res.tempFilePath)
          },
          fail: (err) => {
            // 压缩失败则使用原图
            resolve(filePath)
          }
        })
      })
    },
    compressImageH5(filePath) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          const maxSide = 1080
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.round(height * maxSide / width)
              width = maxSide
            } else {
              width = Math.round(width * maxSide / height)
              height = maxSide
            }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          const base64 = canvas.toDataURL('image/jpeg', 0.65)
          resolve(base64)
        }
        img.onerror = reject
        img.src = filePath
      })
    },
    readAndUpload(filePath) {
      // 将文件读取为 base64
      // #ifdef APP-PLUS
      plus.io.resolveLocalFileSystemURL(filePath, (entry) => {
        entry.file((file) => {
          const reader = new plus.io.FileReader()
          reader.onloadend = (e) => {
            const base64 = e.target.result
            this.callCheckFunction(base64)
          }
          reader.onerror = () => {
            uni.hideLoading()
            uni.showToast({ title: '读取图片失败', icon: 'none' })
          }
          reader.readAsDataURL(file)
        })
      }, () => {
        uni.hideLoading()
        uni.showToast({ title: '读取图片失败', icon: 'none' })
      })
      // #endif
      // #ifdef MP-WEIXIN
      const fs = uni.getFileSystemManager()
      const base64Data = fs.readFileSync(filePath, 'base64')
      const base64 = 'data:image/jpeg;base64,' + base64Data
      this.callCheckFunction(base64)
      // #endif
    },
    getUniIdToken() {
      const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
      if (!currentUserInfo.token) return ''
      if (currentUserInfo.tokenExpired && currentUserInfo.tokenExpired < Date.now()) return ''
      return currentUserInfo.token
    },
    async callCheckFunction(imageBase64) {
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: {
            action: 'check',
            uniIdToken,
            data: {
              imageBase64,
              difficulty: this.selectedDifficulty
            }
          }
        })
        uni.hideLoading()
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          uni.showToast({ title: result.msg || '批改失败', icon: 'none' })
          return
        }
        // 存入 globalData，跳转结果页
        const app = getApp()
        app.globalData = app.globalData || {}
        app.globalData.dictationCheckResult = result.data
        uni.navigateTo({
          url: '/pages/ancient/dictation-result'
        })
      } catch (e) {
        uni.hideLoading()
        console.error('拍照检查失败:', e)
        uni.showToast({ title: '批改服务异常', icon: 'none' })
      }
    },
```

注意替换范围：将原 `openPhotoEntry()` 方法删除（第 191-196 行），替换为上述全部方法。新增方法放在 `openPhotoEntry` 之后、`safeText` 之前。

**Step 2: Commit**

```bash
git add pages/ancient/dictation.vue
git commit -m "feat: 实现拍照检查功能（图片选择、压缩、云函数调用）"
```

---

### Task 5: 新建 dictation-result.vue 结果页

**Files:**
- Create: `pages/ancient/dictation-result.vue`

**Step 1: 创建完整页面文件**

```vue
<template>
  <view class="container">
    <!-- 头部信息 -->
    <view class="header">
      <text class="title">{{ title }}</text>
      <text class="author" v-if="author">{{ dynasty ? dynasty + ' · ' : '' }}{{ author }}</text>
    </view>

    <!-- 准确率 -->
    <view class="accuracy-card">
      <view class="accuracy-row">
        <text class="accuracy-label">准确率</text>
        <text class="accuracy-value">{{ accuracy }}%</text>
      </view>
      <view class="progress-bar">
        <view class="progress-fill" :style="{ width: accuracy + '%' }"></view>
      </view>
    </view>

    <!-- 拍照原图 -->
    <view class="section-card" v-if="imageUrl">
      <view class="section-label">默写照片</view>
      <image
        class="photo-preview"
        :src="imageUrl"
        mode="widthFix"
        @tap="previewImage"
      />
    </view>

    <!-- 逐字批改 -->
    <view class="section-card">
      <view class="section-label">批改详情</view>
      <view class="diff-content">
        <text
          v-for="(item, idx) in diffResult"
          :key="idx"
          :class="['diff-char', 'diff-' + item.status]"
        >{{ item.status === 'missing' ? '＿' : item.char }}</text>
      </view>
      <view class="legend">
        <text class="legend-correct">● 正确</text>
        <text class="legend-wrong">● 错误</text>
        <text class="legend-missing">● 漏写</text>
      </view>
    </view>

    <!-- 错字详情 -->
    <view class="section-card" v-if="wrongDetails.length > 0">
      <view class="section-label">错字详情</view>
      <view class="wrong-list">
        <view class="wrong-item" v-for="(item, idx) in wrongDetails" :key="idx">
          <text class="wrong-original">{{ item.char }}</text>
          <text class="wrong-arrow">→</text>
          <text class="wrong-written">{{ item.recognized }}</text>
        </view>
      </view>
    </view>

    <!-- 识别文字 -->
    <view class="section-card">
      <view class="section-label">识别文字</view>
      <text class="recognized-text">{{ recognizedText || '（无识别内容）' }}</text>
    </view>

    <!-- 操作按钮 -->
    <view class="action-area">
      <button class="btn btn-primary" @tap="checkAgain">再次检查</button>
      <button class="btn btn-secondary" @tap="goBack">返回默写</button>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      title: '',
      author: '',
      dynasty: '',
      originalText: '',
      recognizedText: '',
      diffResult: [],
      accuracy: 0,
      imageUrl: '',
      articleId: ''
    }
  },
  computed: {
    wrongDetails() {
      return this.diffResult.filter(d => d.status === 'wrong' && d.recognized)
    }
  },
  onLoad() {
    const app = getApp()
    const result = app.globalData && app.globalData.dictationCheckResult
    if (!result) {
      uni.showToast({ title: '无批改数据', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 1500)
      return
    }
    this.title = result.title || ''
    this.author = result.author || ''
    this.dynasty = result.dynasty || ''
    this.originalText = result.originalText || ''
    this.recognizedText = result.recognizedText || ''
    this.diffResult = result.diffResult || []
    this.accuracy = result.accuracy || 0
    this.imageUrl = result.imageUrl || ''
    this.articleId = result.articleId || ''
  },
  methods: {
    previewImage() {
      if (!this.imageUrl) return
      uni.previewImage({
        urls: [this.imageUrl],
        current: this.imageUrl
      })
    },
    checkAgain() {
      uni.navigateBack()
    },
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style scoped>
.container {
  padding: 24rpx;
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}
.header {
  text-align: center;
  margin-bottom: 24rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}
.author {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-top: 8rpx;
}
.accuracy-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.accuracy-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.accuracy-label {
  font-size: 28rpx;
  color: #666;
}
.accuracy-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.progress-bar {
  height: 12rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  border-radius: 6rpx;
  transition: width 0.5s ease;
}
.section-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.section-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 16rpx;
}
.photo-preview {
  width: 100%;
  border-radius: 8rpx;
}
.diff-content {
  line-height: 2.4;
  margin-bottom: 16rpx;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.diff-missing {
  color: #f5222d;
  text-decoration: underline;
}
.diff-punctuation {
  color: #666;
}
.legend {
  display: flex;
  gap: 30rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.legend-correct {
  font-size: 24rpx;
  color: #52c41a;
}
.legend-wrong {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-missing {
  font-size: 24rpx;
  color: #f5222d;
}
.wrong-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.wrong-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  background: #fff2f0;
  border-radius: 8rpx;
}
.wrong-original {
  font-size: 30rpx;
  color: #52c41a;
  font-weight: bold;
}
.wrong-arrow {
  font-size: 24rpx;
  color: #999;
}
.wrong-written {
  font-size: 30rpx;
  color: #f5222d;
  font-weight: bold;
}
.recognized-text {
  font-size: 28rpx;
  color: #666;
  line-height: 1.8;
}
.action-area {
  padding: 20rpx 0;
}
.btn {
  width: 100%;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
}
.btn-primary {
  background: #2f6fff;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
```

**Step 2: Commit**

```bash
git add pages/ancient/dictation-result.vue
git commit -m "feat: 新建默写批改结果页 dictation-result.vue"
```

---

### Task 6: 验证与部署

**Step 1: 检查所有文件就绪**

确认以下文件存在且正确：
- `uniCloud-alipay/cloudfunctions/common/config/index.js` — 含 `bailianVision`
- `uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js` — 云函数
- `uniCloud-alipay/cloudfunctions/gw_dictation-check/package.json`
- `pages/ancient/dictation.vue` — openPhotoEntry 已实现
- `pages/ancient/dictation-result.vue` — 结果页
- `pages.json` — 含 dictation-result 路由

**Step 2: 部署云函数**

在 HBuilderX 中：
1. 右键 `uniCloud-alipay/cloudfunctions/common` → 上传公共模块
2. 右键 `uniCloud-alipay/cloudfunctions/gw_dictation-check` → 上传部署

**Step 3: 在 uniCloud 控制台创建数据库集合**

在 uniCloud 控制台中手动创建集合 `gw-dictation-checks`。

**Step 4: 运行测试**

在 HBuilderX 中运行到真机/模拟器，进入默写页面，点击"拍照检查"，拍一张默写纸照片验证全流程。
