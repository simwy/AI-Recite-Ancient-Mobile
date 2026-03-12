'use strict'
const db = uniCloud.database()
const textsCollection = db.collection('gw-ancient-texts')
const checksCollection = db.collection('gw-dictation-checks')
const summaryCollection = db.collection('gw-user-text-summary')
const uniID = require('uni-id-common')
const { ocr: ocrConfig, bailianDictationCheck } = require('config')

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

const PUNCTUATION_REG = /[，。、；：？！""''（）《》〈〉【】「」『』〔〕…—\s\n\r,.;:?!'"()\[\]{}]/

function isPunctuation(char) {
  return PUNCTUATION_REG.test(char)
}

/**
 * 逐字比对原文和识别文字（LCS 算法）
 */
function diffChars(original, recognized) {
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

  const result = source.chars.map(char => ({
    char,
    status: isPunctuation(char) ? 'punctuation' : 'missing'
  }))

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

  source.chars.forEach((char, index) => {
    if (!isPunctuation(char) && matchedOriginal.has(index)) {
      result[index] = { char, status: 'correct' }
    }
  })

  // 收集识别文字中不在 LCS 里的字符（写错的字）
  const wrongChars = []
  b.forEach((item) => {
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

// ---- 大模型校验 ----

const LLM_SYSTEM_PROMPT = `你是古文默写批改专家。对比原文和学生默写内容，找出所有错误。

重要规则：
1. 标点符号忽略，不参与校验
2. 古文通假字不算错误，标记为 tongjiazi
3. 只返回错误部分，正确内容不要返回
4. 输出严格 JSON 格式
5. 【关键】如果学生完全没有默写某段原文内容（整句或整段缺失），必须将这些缺失的文字全部标记为 missing 错误。不能遗漏任何未默写的原文内容。
6. 【关键】逐字检查原文中的每个字是否在学生默写中出现，未出现的必须标记为 missing。

错误类型：
- wrong：写错字（含 errorType: homophone 同音字 / similar 形近字 / other 其他）
- missing：漏写（原文有但未写出）
- extra：多写（写了原文没有的字句）
- reversed：字句写反（前后顺序颠倒）
- tongjiazi：通假字（不算错，但需标注）

输出格式：
{
  "accuracy": 数字(0-100，正确字数/原文总字数*100，标点不计),
  "errors": [
    {"type":"wrong","original":"原字","context":"含原字的上下文片段","written":"实际写的字","errorType":"homophone|similar|other"},
    {"type":"missing","original":"漏写的字","context":"含漏写字的上下文片段"},
    {"type":"extra","written":"多写的字","afterOriginal":"在原文哪段文字之后出现","context":"附近的原文上下文"},
    {"type":"reversed","original":"正确顺序","context":"含写反部分的上下文片段","written":"实际写的顺序"},
    {"type":"tongjiazi","original":"原字","context":"上下文片段","written":"实际写的字","note":"通假说明"}
  ]
}

注意：context 字段提供3-5个字的上下文片段，用于精确定位错误在原文中的位置。`

async function callLLMCheck(originalText, recognizedText) {
  if (!bailianDictationCheck || !bailianDictationCheck.apiKey) {
    console.warn('[LLM批改] 未配置百炼默写校验 API Key，使用 fallback')
    return { error: '未配置百炼默写校验 API Key' }
  }

  const endpoint = bailianDictationCheck.endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  const requestBody = {
    model: bailianDictationCheck.model || 'qwen3-max',
    temperature: 0.1,
    messages: [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `原文：${originalText}\n\n学生默写内容：${recognizedText}\n\n请对比并返回JSON格式的批改结果。注意：只输出JSON，不要输出任何其他文字。`
      }
    ]
  }

  let contentStr = ''
  try {
    console.log('[LLM批改] 开始调用, 模型:', requestBody.model, '端点:', endpoint)
    console.log('[LLM批改] apiKey前8位:', String(bailianDictationCheck.apiKey).slice(0, 8))
    const response = await uniCloud.httpclient.request(endpoint, {
      method: 'POST',
      timeout: Number(bailianDictationCheck.timeout || 30000),
      headers: {
        Authorization: `Bearer ${bailianDictationCheck.apiKey}`,
        'Content-Type': 'application/json'
      },
      dataType: 'json',
      data: requestBody
    })

    console.log('[LLM批改] 响应状态:', response.status)
    if (response.status !== 200 || !response.data) {
      const errMsg = '请求失败, status:' + response.status + ', data:' + JSON.stringify(response.data || '').slice(0, 500)
      console.error('[LLM批改]', errMsg)
      return { error: errMsg }
    }

    const choices = response.data.choices || []
    const rawContent = (choices[0] && choices[0].message && choices[0].message.content) || ''
    contentStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
    // 去除可能的 markdown 代码块包裹
    contentStr = contentStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    // 去除 Qwen3.5 思考模式的 <think>...</think> 标签
    contentStr = contentStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    const parsed = JSON.parse(contentStr)
    if (typeof parsed.accuracy !== 'number' || !Array.isArray(parsed.errors)) {
      const errMsg = '返回格式异常:' + contentStr.slice(0, 500)
      console.error('[LLM批改]', errMsg)
      return { error: errMsg }
    }

    console.log('[LLM批改] 模型:', requestBody.model)
    console.log('[LLM批改] 输入原文:', originalText)
    console.log('[LLM批改] 识别文本:', recognizedText)
    console.log('[LLM批改] 返回结果:', JSON.stringify(parsed))
    return parsed
  } catch (e) {
    const errMsg = '调用异常:' + (e.message || e) + ', 原始返回:' + (contentStr || '无')
    console.error('[LLM批改]', errMsg)
    return { error: errMsg }
  }
}

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

  // 优先使用大模型校验，失败时 fallback 到 LCS diff
  let diffResult, accuracy, wrongChars
  let llmModel = '', llmRawResult = null, llmError = ''
  const llmResult = await callLLMCheck(originalText, recognizedText)
  if (llmResult && !llmResult.error && Array.isArray(llmResult.errors)) {
    diffResult = { errors: llmResult.errors, version: 2 }
    accuracy = llmResult.accuracy
    wrongChars = llmResult.errors
      .filter(e => e.type === 'wrong' || e.type === 'missing')
      .map(e => e.written || e.original)
    llmModel = bailianDictationCheck.model || 'qwen-plus'
    llmRawResult = llmResult
  } else {
    // 记录大模型错误信息
    if (llmResult && llmResult.error) {
      llmError = llmResult.error
      llmModel = bailianDictationCheck.model || 'qwen-plus'
      console.error('[LLM批改] fallback到LCS, 错误:', llmError)
    }
    const oldDiff = diffChars(originalText, recognizedText)
    diffResult = oldDiff
    accuracy = calcAccuracy(oldDiff)
    wrongChars = oldDiff
      .filter(d => d.status === 'wrong' || d.status === 'missing')
      .map(d => d.recognized || d.char)
  }

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
    original_text: originalText,
    recognized_text: recognizedText,
    difficulty: difficulty || '',
    diff_result: diffResult,
    accuracy,
    wrong_chars: wrongChars,
    llm_model: llmModel,
    llm_raw_result: llmRawResult,
    llm_error: llmError || '',
    image_file_id: imageFileId,
    image_url: imageUrl,
    created_at: Date.now()
  }
  const addRes = await checksCollection.add(record)
  try {
    await updateSummaryAfterDictation(
      uid,
      articleId,
      record.text_title,
      addRes.id,
      accuracy,
      record.created_at
    )
  } catch (e) {
    console.error('gw_dictation-check updateSummaryAfterDictation error:', e)
  }

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
