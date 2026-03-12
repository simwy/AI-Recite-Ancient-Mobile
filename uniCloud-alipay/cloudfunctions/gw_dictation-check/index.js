'use strict'
const db = uniCloud.database()
const textsCollection = db.collection('gw-ancient-texts')
const checksCollection = db.collection('gw-dictation-checks')
const summaryCollection = db.collection('gw-user-text-summary')
const uniID = require('uni-id-common')
const { ocr: ocrConfig } = require('config')

/** 拍照默写保存后更新用户古文汇总表 */
async function updateSummaryAfterDictation(uid, textId, textTitle, recordId, accuracy, createdAt) {
  const lastFields = {
    dictation_last_at: createdAt,
    dictation_last_score: accuracy,
    dictation_last_record_id: recordId
  }
  const existRes = await summaryCollection.where({ user_id: uid, text_id: textId }).limit(1).get()
  const existing = (existRes.data && existRes.data[0]) || null
  const bestScore = existing ? (Number(existing.dictation_best_score) || -1) : -1
  const updates = {
    ...lastFields,
    text_title: textTitle || (existing && existing.text_title) || '',
    updated_at: createdAt
  }
  if (accuracy >= bestScore) {
    updates.dictation_best_at = createdAt
    updates.dictation_best_score = accuracy
    updates.dictation_best_record_id = recordId
  }
  if (existing && existing._id) {
    await summaryCollection.doc(existing._id).update(updates)
  } else {
    await summaryCollection.add({
      user_id: uid,
      text_id: textId,
      text_title: textTitle || '',
      print_count: 0,
      ...updates
    })
  }
}

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

// 工具函数已移至前端（LCS 比较在前端执行）

// ---- OCR 手写体识别 ----

const OcrApi = require('@alicloud/ocr-api20210707')
const OpenApi = require('@alicloud/openapi-client')
const Util = require('@alicloud/tea-util')

function createOcrClient() {
  const config = new OpenApi.Config({
    accessKeyId: ocrConfig.accessKeyId,
    accessKeySecret: ocrConfig.accessKeySecret,
    endpoint: ocrConfig.endpoint || 'ocr-api.cn-hangzhou.aliyuncs.com'
  })
  return new OcrApi.default(config)
}

/**
 * 从 OCR 全文中提取文章ID
 * 默写纸上印刷格式为 “文章ID：xxxxxxxx”
 */
function extractArticleId(ocrText) {
  const match = ocrText.match(/文章\s*ID[：:]\s*(\S+)/)
  return match ? match[1].trim() : ''
}

/**
 * 从 OCR 全文中提取手写内容（含标题、作者、正文），用于与原文逐字比对
 * 默写纸格式：标题：xxx / 作者：xxx / 文章ID：xxx / 正文：xxx
 */
function extractHandwrittenText(ocrText) {
  const lines = ocrText.split(/\n/)
  let titlePart = ''
  let authorPart = ''
  const bodyParts = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const titleMatch = trimmed.match(/^标题[：:]\s*(.*)$/)
    if (titleMatch) {
      titlePart = titleMatch[1].trim()
      continue
    }
    const authorMatch = trimmed.match(/^作者[：:]\s*(.*)$/)
    if (authorMatch) {
      authorPart = authorMatch[1].trim()
      continue
    }
    if (/^文章\s*ID[：:]/.test(trimmed)) continue
    if (/^正文[：:]$/.test(trimmed)) continue
    bodyParts.push(trimmed)
  }
  return (titlePart + authorPart + bodyParts.join('')).replace(/\s+/g, '')
}

async function callOcrHandwriting(imageBase64) {
  if (!ocrConfig || !ocrConfig.accessKeyId) {
    throw new Error('未配置 OCR AccessKey')
  }

  // 去掉 data:image/xxx;base64, 前缀
  const base64Body = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  const client = createOcrClient()
  const request = new OcrApi.RecognizeHandwritingRequest({
    body: require('stream').Readable.from(Buffer.from(base64Body, 'base64')),
    needRotate: true,
    outputCharInfo: false,
    outputTable: false
  })
  const runtime = new Util.RuntimeOptions({
    readTimeout: ocrConfig.timeout || 30000,
    connectTimeout: 10000
  })

  const response = await client.recognizeHandwritingWithOptions(request, runtime)
  const body = response.body || {}
  if (!body.data) {
    throw new Error('OCR 识别返回为空，请求ID: ' + (body.requestId || ''))
  }

  let ocrText = typeof body.data === 'string' ? body.data : (body.data.content || '')
  // 若 OCR 返回的是 JSON 字符串（如 {"content":"识别的文字"}），则只取 content 参与提取与比对
  if (typeof ocrText === 'string') {
    try {
      const parsed = JSON.parse(ocrText)
      if (parsed && typeof parsed.content === 'string') ocrText = parsed.content
    } catch (e) {}
  }
  return {
    articleId: extractArticleId(ocrText),
    handwrittenText: extractHandwrittenText(ocrText)
  }
}

// ---- action 处理 ----

async function handleCheck(uid, data) {
  const { imageBase64, difficulty, articleId: passedArticleId } = data
  if (!imageBase64) {
    return { code: -1, msg: '缺少图片数据' }
  }

  // 1. 调用 OCR 手写体识别
  const recognition = await callOcrHandwriting(imageBase64)

  // 2. 查询原文：优先使用调用方传入的 articleId（默写页用当前页ID），否则用照片识别的
  const articleId = (passedArticleId && String(passedArticleId).trim()) || recognition.articleId
  let textDoc = null
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

  // 3. 逐字比对（原文包含标题、作者、正文，与默写纸手写内容一致）
  const authorDisplay = textDoc.dynasty && textDoc.author
    ? (String(textDoc.dynasty || '') + '·' + String(textDoc.author || ''))
    : (String(textDoc.author || textDoc.dynasty || ''))
  const originalText = (
    (textDoc.title || '') +
    authorDisplay +
    (textDoc.content || '')
  ).replace(/\s+/g, '')
  const recognizedText = recognition.handwrittenText

  // 前端负责比较，云函数只做 OCR + 存储

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
    if (imageFileId) {
      const urlRes = await uniCloud.getTempFileURL({ fileList: [imageFileId] })
      imageUrl = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || ''
    }
  } catch (e) {
    console.error('图片上传失败:', e)
  }

  // 6. 存入数据库
  const record = {
    user_id: uid,
    article_id: articleId,
    text_title: textDoc.title || '',
    text_author: textDoc.author || '',
    text_dynasty: textDoc.dynasty || '',
    text_content: textDoc.content || '',
    original_text: originalText,
    recognized_text: recognizedText,
    difficulty: difficulty || '',
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
      content: textDoc.content || '',
      originalText,
      recognizedText,
      imageUrl
    }
  }
}

async function handleList(uid, data) {
  const { page = 1, pageSize = 20, article_id: rawArticleId } = data
  const skip = (page - 1) * pageSize
  const where = { user_id: uid }
  // 按当前古文筛选默写记录（详情页传入 article_id）
  const article_id = rawArticleId != null ? String(rawArticleId).trim() : ''
  if (article_id) where.article_id = article_id

  const countRes = await checksCollection.where(where).count()
  const listRes = await checksCollection
    .where(where)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .field({
      article_id: true,
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
  // 兼容直接传 { action, data } 或通过 event.data 包装
  const payload = event && event.data && typeof event.data === 'object' && event.data.action != null ? event.data : event
  const { action, data = {} } = payload

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
