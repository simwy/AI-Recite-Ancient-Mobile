'use strict';
const db = uniCloud.database()
const collection = db.collection('gw-ancient-texts')
const categoryCollection = db.collection('gw-square-categories')
const subcollectionCollection = db.collection('gw-square-subcollections')
const relationCollection = db.collection('gw-square-text-relations')
const uniID = require('uni-id-common')
const { bailianPoemSearch } = require('config')

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toContentString(value) {
  if (Array.isArray(value)) {
    return value.map(item => (item && item.text) || '').join('')
  }
  if (typeof value === 'string') {
    return value
  }
  return ''
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    return null
  }
}

function isExactTitleAuthorMatch(candidate, title, author) {
  return normalizeText(candidate.title) === title && normalizeText(candidate.author) === author
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTimeoutError(error) {
  const msg = (error && error.message) || ''
  return msg.includes('Response timeout') || msg.includes('ETIMEDOUT')
}

async function getAuthUid(event, context) {
  const uniIdCommon = uniID.createInstance({ context })
  let uid = (context.auth && context.auth.uid) || ''
  if (!uid && event.uniIdToken) {
    const tokenRes = await uniIdCommon.checkToken(event.uniIdToken)
    if (tokenRes && tokenRes.code === 0 && tokenRes.uid) {
      uid = tokenRes.uid
    }
  }
  return uid
}

async function findExactInDB(title, author) {
  const existedRes = await collection.where({ title, author }).limit(1).get()
  return existedRes.data && existedRes.data[0]
}

async function requestPoemsFromBailian(title, author) {
  if (!bailianPoemSearch || !bailianPoemSearch.apiKey) {
    throw new Error('请先配置百炼 API Key')
  }

  const endpoint = bailianPoemSearch.endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  const requestBody = {
    model: bailianPoemSearch.model || 'qwen-plus',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是古诗文检索助手。必须严格检索“标题+作者同时精确匹配”的古诗文。仅输出 JSON，不要输出其他文字。若存在多个版本（如异文、不同断句），可以返回多条。'
      },
      {
        role: 'user',
        content: `请检索古诗文。标题=${title}，作者=${author}。\n要求：\n1) 返回 JSON 格式：{"found":boolean,"items":[{"title":"","author":"","dynasty":"","content":""}]}。\n2) 若你能确认“标题与作者都完全一致”，则 found=true。\n3) 即使 found=false，也请尽量返回你认为最接近的候选 items（最多 5 条），不要留空数组。\n4) content 必须是可背诵的完整正文，保留常见标点。`
      }
    ]
  }

  const maxAttempts = 2
  let response = null
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await uniCloud.httpclient.request(endpoint, {
        method: 'POST',
        timeout: Number(bailianPoemSearch.timeout || 20000),
        headers: {
          Authorization: `Bearer ${bailianPoemSearch.apiKey}`,
          'Content-Type': 'application/json'
        },
        dataType: 'json',
        data: requestBody
      })
      lastError = null
      break
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts && isTimeoutError(error)) {
        await sleep(400)
        continue
      }
      throw error
    }
  }

  if (lastError) {
    throw lastError
  }

  if (response.status !== 200 || !response.data) {
    throw new Error('百炼检索失败')
  }

  const choices = response.data.choices || []
  const rawContent = toContentString(
    choices[0] && choices[0].message && choices[0].message.content
  ).trim()
  const parsed = safeJsonParse(rawContent)
  if (!parsed) {
    return []
  }

  const rawItems = Array.isArray(parsed.items)
    ? parsed.items
    : [parsed]

  const uniq = new Set()
  const candidates = []
  rawItems.forEach(item => {
    const candidate = {
      title: normalizeText(item.title),
      author: normalizeText(item.author),
      dynasty: normalizeText(item.dynasty),
      content: normalizeText(item.content)
    }
    if (!candidate.content) return
    if (!isExactTitleAuthorMatch(candidate, title, author)) return
    const uniqueKey = `${candidate.title}::${candidate.author}::${candidate.content}`
    if (uniq.has(uniqueKey)) return
    uniq.add(uniqueKey)
    candidates.push(candidate)
  })

  return candidates
}

async function searchList(keyword, page, pageSize) {
  const safePage = Number(page) > 0 ? Number(page) : 1
  const safePageSize = Number(pageSize) > 0 ? Number(pageSize) : 20
  const skip = (safePage - 1) * safePageSize

  let where = {}
  const normalizedKeyword = normalizeText(keyword)
  if (normalizedKeyword) {
    const command = db.command
    const terms = normalizedKeyword.split(/\s+/).filter(Boolean)
    const buildTermOrCondition = (term) => {
      const reg = new RegExp(term, 'i')
      return command.or([{ title: reg }, { author: reg }, { content: reg }])
    }

    if (terms.length === 1) {
      where = buildTermOrCondition(terms[0])
    } else {
      where = command.and(terms.map(term => buildTermOrCondition(term)))
    }
  }

  const countRes = await collection.where(where).count()
  const listRes = await collection.where(where).skip(skip).limit(safePageSize).get()

  return {
    code: 0,
    data: {
      list: listRes.data,
      total: countRes.total,
      page: safePage,
      pageSize: safePageSize
    }
  }
}

async function aiSearch(data) {
  const title = normalizeText(data.title)
  const author = normalizeText(data.author)
  if (!title || !author) {
    return { code: -1, msg: '请填写古文名称和作者' }
  }

  const existed = await findExactInDB(title, author)
  if (existed) {
    return {
      code: 0,
      data: {
        existed: true,
        text: existed
      }
    }
  }

  const aiCandidates = await requestPoemsFromBailian(title, author)
  if (!aiCandidates || aiCandidates.length === 0) {
    return { code: -1, msg: '未检索到标题和作者同时精确匹配的古文' }
  }

  return {
    code: 0,
    data: {
      existed: false,
      candidates: aiCandidates
    }
  }
}

async function getSquareCategories() {
  const listRes = await categoryCollection.where({ enabled: true }).orderBy('sort', 'asc').get()
  return {
    code: 0,
    data: {
      list: listRes.data || []
    }
  }
}

async function getSubcollectionsByCategory(data = {}) {
  const categoryId = normalizeText(data.categoryId || data.category_id)
  if (!categoryId) {
    return { code: -1, msg: '缺少分类ID' }
  }
  const listRes = await subcollectionCollection
    .where({ category_id: categoryId, enabled: true })
    .orderBy('sort', 'asc')
    .get()
  return {
    code: 0,
    data: {
      list: listRes.data || []
    }
  }
}

async function getTextsBySubcollection(data = {}) {
  const command = db.command
  const categoryId = normalizeText(data.categoryId || data.category_id)
  const subcollectionId = normalizeText(data.subcollectionId || data.subcollection_id)
  const safePage = Number(data.page) > 0 ? Number(data.page) : 1
  const safePageSize = Number(data.pageSize) > 0 ? Number(data.pageSize) : 20
  const skip = (safePage - 1) * safePageSize

  if (!categoryId || !subcollectionId) {
    return { code: -1, msg: '缺少分类或子合集ID' }
  }

  const legacySubcollectionCode = subcollectionId.replace(/^sub_/, '')

  let relationWhere = { enabled: true }
  relationWhere.category_id = categoryId
  relationWhere.subcollection_id = subcollectionId

  let relationCountRes = await relationCollection.where(relationWhere).count()
  let relationRes = { data: [] }
  if (relationCountRes.total > 0) {
    relationRes = await relationCollection
      .where(relationWhere)
      .orderBy('sort', 'asc')
      .skip(skip)
      .limit(safePageSize)
      .get()
  } else {
    // 兼容历史关系数据（使用 code 字段而不是 id 字段）
    const legacyRelationWhere = {
      enabled: true,
      subcollection_code: legacySubcollectionCode
    }
    relationCountRes = await relationCollection.where(legacyRelationWhere).count()
    if (relationCountRes.total > 0) {
      relationRes = await relationCollection
        .where(legacyRelationWhere)
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(safePageSize)
        .get()
    }
  }

  if (relationCountRes.total > 0) {
    const relationList = relationRes.data || []
    const textIds = [...new Set(relationList.map(item => item.text_id).filter(Boolean))]

    if (textIds.length === 0) {
      return {
        code: 0,
        data: {
          list: [],
          total: relationCountRes.total || 0,
          page: safePage,
          pageSize: safePageSize
        }
      }
    }

    const textRes = await collection.where({ _id: command.in(textIds) }).get()
    const textMap = {}
    ;(textRes.data || []).forEach(item => {
      textMap[item._id] = item
    })

    const orderedList = textIds.map(id => textMap[id]).filter(Boolean)
    if (orderedList.length > 0) {
      return {
        code: 0,
        data: {
          list: orderedList,
          total: relationCountRes.total || 0,
          page: safePage,
          pageSize: safePageSize
        }
      }
    }

    // 兼容 text_id 与 gw-ancient-texts._id 不一致场景，回退到旧字段查询
    const legacyTextCountRes = await collection.where({ subcollection_code: legacySubcollectionCode }).count()
    const legacyTextRes = await collection
      .where({ subcollection_code: legacySubcollectionCode })
      .orderBy('title', 'asc')
      .skip(skip)
      .limit(safePageSize)
      .get()
    return {
      code: 0,
      data: {
        list: legacyTextRes.data || [],
        total: legacyTextCountRes.total || 0,
        page: safePage,
        pageSize: safePageSize
      }
    }
  }

  return {
    code: 0,
    data: {
      list: [],
      total: 0,
      page: safePage,
      pageSize: safePageSize
    }
  }
}

async function confirmAdd(event, data, context) {
  const uid = await getAuthUid(event, context)
  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  const title = normalizeText(data.title)
  const author = normalizeText(data.author)
  const dynasty = normalizeText(data.dynasty)
  const content = normalizeText(data.content)

  if (!title || !author || !content) {
    return { code: -1, msg: '缺少必要古文信息' }
  }

  const existed = await findExactInDB(title, author)
  if (existed) {
    return {
      code: 0,
      data: {
        existed: true,
        text: existed
      }
    }
  }

  const addRes = await collection.add({
    title,
    author,
    dynasty,
    content,
    created_by: uid,
    created_at: new Date(),
    source: `ai_bailian_${bailianPoemSearch.model || 'qwen-plus'}`
  })

  const detailRes = await collection.doc(addRes.id).get()
  return {
    code: 0,
    data: {
      existed: false,
      id: addRes.id,
      text: detailRes.data && detailRes.data[0]
    }
  }
}

exports.main = async (event, context) => {
  const { action = 'search', keyword = '', page = 1, pageSize = 20, data = {} } = event || {}
  try {
    switch (action) {
      case 'search':
        return await searchList(keyword, page, pageSize)
      case 'aiSearch':
        return await aiSearch(data)
      case 'getSquareCategories':
        return await getSquareCategories()
      case 'getSubcollectionsByCategory':
        return await getSubcollectionsByCategory(data)
      case 'getTextsBySubcollection':
        return await getTextsBySubcollection(data)
      case 'confirmAdd':
        return await confirmAdd(event, data, context)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '古文检索失败'
    }
  }
}
