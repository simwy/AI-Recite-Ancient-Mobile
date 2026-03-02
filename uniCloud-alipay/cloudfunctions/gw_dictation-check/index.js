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
        content: '你是一个OCR文字识别工具，只做纯粹的图像文字识别，不具备任何语义理解或纠错能力。你绝对不知道这些文字的含义、来源或正确写法。你只能识别图片中实际存在的笔画和字形，然后输出对应的汉字。如果一个字的字形看起来像"小"，你必须输出"小"，即使它出现在"春眠不觉"后面。你没有任何古诗文知识，不知道原文应该是什么。'
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
            text: `你是一个纯OCR工具。请对这张图片进行文字识别：

任务：
1. 找到纸上印刷的"文章ID"，提取其值
2. 逐字识别手写的正文内容

【最高优先级规则 - 违反将导致严重错误】：
- 你是OCR工具，只识别字形，不理解语义
- 绝对禁止根据上下文猜测或纠正任何文字
- 每个字必须独立识别，不能参考前后文推断
- 如果手写的字形是"小"，输出必须是"小"，不能因为你猜测原文是"晓"就输出"晓"
- 如果手写的字形是"以"，输出必须是"以"，不能因为你猜测原文是"已"就输出"已"
- 错别字必须原样输出，这是默写检查，需要保留所有错误
- 如果某个字完全无法辨认，用"□"替代
- 只识别汉字，忽略标点符号

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
  const { page = 1, pageSize = 20, article_id } = data
  const skip = (page - 1) * pageSize
  const where = { user_id: uid }
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
