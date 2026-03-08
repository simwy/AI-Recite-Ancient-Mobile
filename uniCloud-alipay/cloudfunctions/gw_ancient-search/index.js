'use strict';
const db = uniCloud.database()
const collection = db.collection('gw-ancient-texts')
const categoryCollection = db.collection('gw-square-categories')
const subcollectionCollection = db.collection('gw-square-subcollections')
const relationCollection = db.collection('gw-square-text-relations')
const subcollectionGroupCollection = db.collection('gw-square-subcollections-group')
const subcollectionFavoriteCollection = db.collection('gw-square-sub-favorites')
const summaryCollection = db.collection('gw-user-text-summary')
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

/** 计算两字符串相似度，返回 0~1，用于约 80% 模糊匹配 */
function similarity(a, b) {
  const sa = normalizeText(a)
  const sb = normalizeText(b)
  if (sa === sb) return 1
  if (!sa || !sb) return sb ? 0 : 1
  if (sa.includes(sb) || sb.includes(sa)) return Math.min(sa.length, sb.length) / Math.max(sa.length, sb.length) || 1
  const longer = sa.length >= sb.length ? sa : sb
  const shorter = sa.length < sb.length ? sa : sb
  let matchCount = 0
  for (let i = 0; i <= longer.length - shorter.length; i++) {
    let same = 0
    for (let j = 0; j < shorter.length; j++) {
      if (longer[i + j] === shorter[j]) same++
    }
    matchCount = Math.max(matchCount, same)
  }
  return matchCount / Math.max(longer.length, 1)
}

const FUZZY_MATCH_THRESHOLD = 0.8

function isFuzzyTitleAuthorMatch(candidate, title, author) {
  const cTitle = normalizeText(candidate.title)
  const cAuthor = normalizeText(candidate.author)
  if (!cTitle || !title) return false
  if (similarity(cTitle, title) < FUZZY_MATCH_THRESHOLD) return false
  if (!author) return true
  if (!cAuthor) return true
  return similarity(cAuthor, author) >= FUZZY_MATCH_THRESHOLD
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTimeoutError(error) {
  const msg = (error && error.message) || ''
  return msg.includes('Response timeout') || msg.includes('ETIMEDOUT')
}

function isCollectionNotFoundError(error) {
  const msg = String((error && error.message) || '')
  return msg.includes('not found collection')
}

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

async function findExactInDB(title, author) {
  if (author) {
    const existedRes = await collection.where({ title, author }).limit(1).get()
    return existedRes.data && existedRes.data[0]
  }
  const existedRes = await collection.where({ title }).limit(1).get()
  return existedRes.data && existedRes.data[0]
}

async function requestPoemsFromBailian(title, author) {
  if (!bailianPoemSearch || !bailianPoemSearch.apiKey) {
    throw new Error('请先配置百炼 API Key')
  }

  const endpoint = bailianPoemSearch.endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  const authorHint = author ? `，作者或出处=${author}` : '（作者或出处未提供，可填未知或出处）'
  const requestBody = {
    model: bailianPoemSearch.model || 'qwen-plus',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是古诗文检索助手。根据标题（必选）和作者或出处（可选）检索古诗文。标题需高度一致，作者或出处可模糊（同名、别称、出处均可）。仅输出 JSON。若存在多个版本（如异文、不同断句），可返回多条。'
      },
      {
        role: 'user',
        content: `请检索古诗文。标题=${title}${authorHint}。\n要求：\n1) 返回 JSON 格式：{"found":boolean,"items":[{"title":"","author":"","dynasty":"","content":""}]}。\n2) author 字段填作者名或出处（如无作者可填“未知”或出处来源）。\n3) 标题一致或高度相似即 found=true；作者/出处大致相符即可，不必完全一致。\n4) 即使 found=false 也请返回最接近的候选 items（最多 5 条）。\n5) content 必须是可背诵的完整正文，保留常见标点。`
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
    if (!isFuzzyTitleAuthorMatch(candidate, title, author)) return
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
      return command.or([{ title: reg }, { author: reg }])
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
  if (!title) {
    return { code: -1, msg: '请填写古文名称' }
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
    return { code: -1, msg: '未检索到匹配的古文（标题约 80% 匹配，作者或出处选填）' }
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
  const subcollectionId = normalizeText(data.subcollectionId || data.subcollection_id)
  const safePage = Number(data.page) > 0 ? Number(data.page) : 1
  const safePageSize = Number(data.pageSize) > 0 ? Number(data.pageSize) : 20
  const skip = (safePage - 1) * safePageSize

  if (!subcollectionId) {
    return { code: -1, msg: '缺少子合集ID' }
  }

  const relationWhere = { enabled: true, subcollection_id: subcollectionId }
  const relationCountRes = await relationCollection.where(relationWhere).count()
  if (relationCountRes.total === 0) {
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

  const relationRes = await relationCollection
    .where(relationWhere)
    .orderBy('sort', 'asc')
    .skip(skip)
    .limit(safePageSize)
    .get()
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

/** 按分组返回子合集下的古文列表，用于广场列表页分组展示 */
async function getTextsBySubcollectionGrouped(data = {}) {
  const command = db.command
  const inner = data.data || data
  const subcollectionId = normalizeText(inner.subcollectionId || inner.subcollection_id || data.subcollectionId || data.subcollection_id)
  const maxRelations = Math.min(Number(data.limit) || 500, 500)

  if (!subcollectionId) {
    return { code: -1, msg: '缺少子合集ID' }
  }

  const subcollectionRes = await subcollectionCollection.doc(subcollectionId).get()
  const subcollectionDoc = subcollectionRes.data && subcollectionRes.data[0]
  const intro = (subcollectionDoc && subcollectionDoc.intro) ? String(subcollectionDoc.intro).trim() : ''

  const [groupsRes, relationRes] = await Promise.all([
    subcollectionGroupCollection
      .where({ subcollection_id: subcollectionId, enabled: true })
      .orderBy('sort', 'asc')
      .get(),
    relationCollection
      .where({ subcollection_id: subcollectionId, enabled: true })
      .orderBy('sort', 'asc')
      .limit(maxRelations)
      .get()
  ])

  const groups = groupsRes.data || []
  const relationList = relationRes.data || []

  const groupMap = {}
  groups.forEach((g) => {
    groupMap[g._id] = { _id: g._id, name: g.name, sort: g.sort, list: [] }
  })
  const ungroupedRels = []

  const textIds = new Set()
  relationList.forEach((rel) => {
    if (rel.group_id && groupMap[rel.group_id]) {
      groupMap[rel.group_id].list.push(rel)
    } else {
      ungroupedRels.push(rel)
    }
    if (rel.text_id) textIds.add(rel.text_id)
  })

  const textIdArr = [...textIds]
  if (textIdArr.length === 0) {
    return {
      code: 0,
      data: {
        groups: groups.map((g) => ({ _id: g._id, name: g.name, sort: g.sort, list: [] })),
        ungrouped: [],
        intro
      }
    }
  }

  const textRes = await collection.where({ _id: command.in(textIdArr) }).get()
  const textMap = {}
  ;(textRes.data || []).forEach((item) => {
    textMap[item._id] = item
  })

  const pickOrdered = (rels) => rels.map((r) => textMap[r.text_id]).filter(Boolean)
  const resultGroups = groups.map((g) => ({
    _id: g._id,
    name: g.name,
    sort: g.sort,
    list: pickOrdered(groupMap[g._id].list)
  }))
  const resultUngrouped = pickOrdered(ungroupedRels)

  return {
    code: 0,
    data: {
      groups: resultGroups,
      ungrouped: resultUngrouped,
      intro
    }
  }
}

async function getSubcollectionFavoriteStatus(event, data = {}, context) {
  const uid = await getAuthUid(event, context)
  const subcollectionId = normalizeText(data.subcollectionId || data.subcollection_id)
  if (!subcollectionId) {
    return { code: -1, msg: '缺少子合集ID' }
  }
  if (!uid) {
    return {
      code: 0,
      data: {
        favorited: false,
        needLogin: true
      }
    }
  }

  let favoriteRes = { data: [] }
  try {
    favoriteRes = await subcollectionFavoriteCollection
      .where({ user_id: uid, subcollection_id: subcollectionId })
      .limit(1)
      .get()
  } catch (e) {
    if (!isCollectionNotFoundError(e)) {
      throw e
    }
  }
  return {
    code: 0,
    data: {
      favorited: !!(favoriteRes.data && favoriteRes.data.length > 0),
      needLogin: false
    }
  }
}

async function toggleSubcollectionFavorite(event, data = {}, context) {
  const uid = await getAuthUid(event, context)
  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  const categoryId = normalizeText(data.categoryId || data.category_id)
  const subcollectionId = normalizeText(data.subcollectionId || data.subcollection_id)
  const subcollectionName = normalizeText(data.subcollectionName || data.subcollection_name)
  if (!subcollectionId) {
    return { code: -1, msg: '缺少子合集ID' }
  }

  let favoriteRes = { data: [] }
  try {
    favoriteRes = await subcollectionFavoriteCollection
      .where({ user_id: uid, subcollection_id: subcollectionId })
      .limit(1)
      .get()
  } catch (e) {
    if (!isCollectionNotFoundError(e)) {
      throw e
    }
  }
  const existed = favoriteRes.data && favoriteRes.data[0]
  if (existed && existed._id) {
    await subcollectionFavoriteCollection.doc(existed._id).remove()
    return {
      code: 0,
      data: {
        favorited: false
      }
    }
  }

  await subcollectionFavoriteCollection.add({
    user_id: uid,
    category_id: categoryId,
    subcollection_id: subcollectionId,
    subcollection_name: subcollectionName,
    created_at: new Date(),
    updated_at: new Date()
  })
  return {
    code: 0,
    data: {
      favorited: true
    }
  }
}

const RECITE_PASS_SCORE = 90

/** 分页查询当前用户收藏的专题合集列表，供复盘页使用；每条附带加入时间、最近背诵时间、背诵通过篇数/总篇数 */
async function listSubcollectionFavorites(event, data = {}, context) {
  const uid = await getAuthUid(event, context)
  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }
  const page = Math.max(1, Number(data.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20))
  const skip = (page - 1) * pageSize
  const [countRes, listRes] = await Promise.all([
    subcollectionFavoriteCollection.where({ user_id: uid }).count(),
    subcollectionFavoriteCollection
      .where({ user_id: uid })
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ])
  const total = (countRes && countRes.total) || 0
  let list = (listRes && listRes.data) || []

  const subcollectionIds = list.map((x) => x.subcollection_id).filter(Boolean)
  if (subcollectionIds.length > 0) {
    const relationRes = await relationCollection
      .where({ subcollection_id: db.command.in(subcollectionIds), enabled: true })
      .field({ subcollection_id: true, text_id: true })
      .get()
    const relations = relationRes.data || []
    const subToTextIds = {}
    const allTextIds = new Set()
    relations.forEach((r) => {
      if (!r.subcollection_id || !r.text_id) return
      if (!subToTextIds[r.subcollection_id]) subToTextIds[r.subcollection_id] = []
      subToTextIds[r.subcollection_id].push(r.text_id)
      allTextIds.add(r.text_id)
    })
    const textIdArr = [...allTextIds]
    let summaryList = []
    if (textIdArr.length > 0) {
      const summaryRes = await summaryCollection
        .where({ user_id: uid, text_id: db.command.in(textIdArr) })
        .field({ text_id: true, recite_last_at: true, recite_best_score: true })
        .limit(500)
        .get()
      summaryList = summaryRes.data || []
    }
    const summaryByTextId = {}
    summaryList.forEach((s) => {
      if (s && s.text_id) summaryByTextId[s.text_id] = s
    })
    const toMs = (v) => {
      if (v == null) return 0
      if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
      if (v instanceof Date) return v.getTime()
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? 0 : d.getTime()
    }
    list = list.map((item) => {
      const textIds = subToTextIds[item.subcollection_id] || []
      const totalCount = textIds.length
      const summaries = textIds.map((id) => summaryByTextId[id]).filter(Boolean)
      let lastReciteAt = null
      let maxMs = 0
      summaries.forEach((s) => {
        const ms = toMs(s.recite_last_at)
        if (ms > maxMs) {
          maxMs = ms
          lastReciteAt = s.recite_last_at
        }
      })
      const passedCount = summaries.filter(
        (s) => typeof s.recite_best_score === 'number' && !Number.isNaN(s.recite_best_score) && s.recite_best_score >= RECITE_PASS_SCORE
      ).length
      return {
        ...item,
        last_recite_at: lastReciteAt,
        recite_passed_count: passedCount,
        recite_total_count: totalCount
      }
    })
  } else {
    list = list.map((item) => ({
      ...item,
      last_recite_at: null,
      recite_passed_count: 0,
      recite_total_count: 0
    }))
  }

  return { code: 0, data: { list, total } }
}

async function confirmAdd(event, data, context) {
  const uid = await getAuthUid(event, context)
  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  const title = normalizeText(data.title)
  const author = normalizeText(data.author) || ''
  const dynasty = normalizeText(data.dynasty)
  const content = normalizeText(data.content)

  if (!title || !content) {
    return { code: -1, msg: '缺少必要古文信息（标题与正文）' }
  }

  const existed = await findExactInDB(title, author || undefined)
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

/**
 * 批量初始化古文：只插入库中尚未存在的条目，缺失正文时通过百炼拉取。
 * 入参 data.list: [{ title, author }, ...]，data.source: 可选，默认 "100天背诵计划"
 */
async function batchInitPoems(event, data = {}, context) {
  const list = Array.isArray(data.list) ? data.list : []
  const source = normalizeText(data.source) || '100天背诵计划'
  const inserted = []
  const skipped = []
  const failed = []

  for (let i = 0; i < list.length; i++) {
    const title = normalizeText(list[i].title)
    const author = normalizeText(list[i].author) || ''
    if (!title) {
      failed.push({ index: i + 1, title: list[i].title, author, error: '标题为空' })
      continue
    }

    const existed = await findExactInDB(title, author || undefined)
    if (existed) {
      skipped.push({ title, author })
      continue
    }

    let candidates = []
    try {
      candidates = await requestPoemsFromBailian(title, author)
      await sleep(400)
    } catch (e) {
      failed.push({
        index: i + 1,
        title,
        author,
        error: (e && e.message) || String(e)
      })
      continue
    }

    const candidate = candidates && candidates[0]
    if (!candidate || !normalizeText(candidate.content)) {
      failed.push({
        index: i + 1,
        title,
        author,
        error: '百炼未返回可用正文'
      })
      continue
    }

    try {
      const addRes = await collection.add({
        title: candidate.title,
        author: candidate.author || author,
        dynasty: candidate.dynasty || '',
        content: candidate.content,
        created_at: new Date(),
        source
      })
      inserted.push({
        title: candidate.title,
        author: candidate.author || author,
        id: addRes.id
      })
    } catch (e) {
      failed.push({
        index: i + 1,
        title,
        author,
        error: (e && e.message) || String(e)
      })
    }
  }

  return {
    code: 0,
    data: {
      inserted: inserted.length,
      skipped: skipped.length,
      failed: failed.length,
      detail: { inserted, skipped, failed }
    }
  }
}

/**
 * 返回「数据库中尚未存在」的古文列表，格式为 init_data 可导入的数组，供写入 gw-ancient-texts.init_data.json 后自行上传。
 * 入参 data.list: [{ title, author }, ...]，data.source: 可选，默认 "100天背诵计划"
 * 返回 data.initData: 仅包含未在库中的条目（含百炼拉取的 content），data.skipped / data.failed 为数量与明细。
 */
async function getMissingInitData(event, data = {}, context) {
  const list = Array.isArray(data.list) ? data.list : []
  const source = normalizeText(data.source) || '100天背诵计划'
  const initData = []
  const skipped = []
  const failed = []
  let missingIndex = 0

  for (let i = 0; i < list.length; i++) {
    const title = normalizeText(list[i].title)
    const author = normalizeText(list[i].author) || ''
    if (!title) {
      failed.push({ index: i + 1, title: list[i].title, author, error: '标题为空' })
      continue
    }

    const existed = await findExactInDB(title, author || undefined)
    if (existed) {
      skipped.push({ title, author })
      continue
    }

    let candidates = []
    try {
      candidates = await requestPoemsFromBailian(title, author)
      await sleep(400)
    } catch (e) {
      failed.push({
        index: i + 1,
        title,
        author,
        error: (e && e.message) || String(e)
      })
      continue
    }

    const candidate = candidates && candidates[0]
    if (!candidate || !normalizeText(candidate.content)) {
      failed.push({
        index: i + 1,
        title,
        author,
        error: '百炼未返回可用正文'
      })
      continue
    }

    missingIndex += 1
    const idSuffix = String(missingIndex).padStart(3, '0')
    initData.push({
      _id: `gw-at-100day-${idSuffix}`,
      title: candidate.title,
      author: candidate.author || author,
      dynasty: candidate.dynasty || '',
      content: candidate.content,
      source
    })
  }

  return {
    code: 0,
    data: {
      initData,
      skipped: skipped.length,
      failed: failed.length,
      detail: { skipped, failed }
    }
  }
}

/** 返回表 gw-ancient-texts 中已有条目的 title+author 列表，用于本地从 init_data 中剔除已存在项 */
async function listExistingTitleAuthor() {
  const res = await collection.field({ title: true, author: true }).limit(5000).get()
  const list = (res.data || []).map((doc) => ({
    title: normalizeText(doc.title),
    author: normalizeText(doc.author) || ''
  }))
  return { code: 0, data: { list } }
}

/** 批量获取当前用户对指定古文的最新跟读/背诵/默写分数（用于列表展示） */
async function getUserTextSummaries(event, context) {
  const uid = await getAuthUid(event, context)
  if (!uid) {
    return { code: 0, data: { list: [] } }
  }
  const { data = {} } = event
  let textIds = Array.isArray(data.text_ids) ? data.text_ids : []
  if (textIds.length > 100) textIds = textIds.slice(0, 100)
  if (textIds.length === 0) {
    return { code: 0, data: { list: [] } }
  }
  const res = await summaryCollection
    .where({
      user_id: uid,
      text_id: db.command.in(textIds)
    })
    .field({
      text_id: true,
      follow_last_score: true,
      recite_last_score: true,
      recite_best_score: true,
      recite_best_at: true,
      dictation_last_score: true
    })
    .limit(100)
    .get()
  const list = (res.data || []).map((doc) => ({
    text_id: doc.text_id,
    follow_last_score: doc.follow_last_score,
    recite_last_score: doc.recite_last_score,
    recite_best_score: doc.recite_best_score,
    recite_best_at: doc.recite_best_at,
    dictation_last_score: doc.dictation_last_score
  }))
  return { code: 0, data: { list } }
}

exports.main = async (event, context) => {
  const raw = event || {}
  const action = raw.action || (raw.data && raw.data.action) || 'search'
  const data = (raw.data && raw.data.data !== undefined) ? raw.data.data : (raw.data || {})
  const keyword = raw.keyword || ''
  const page = raw.page || 1
  const pageSize = raw.pageSize || 20
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
      case 'getTextsBySubcollectionGrouped':
        return await getTextsBySubcollectionGrouped(data)
      case 'getSubcollectionFavoriteStatus':
        return await getSubcollectionFavoriteStatus(event, data, context)
      case 'toggleSubcollectionFavorite':
        return await toggleSubcollectionFavorite(event, data, context)
      case 'listSubcollectionFavorites':
        return await listSubcollectionFavorites(event, data, context)
      case 'confirmAdd':
        return await confirmAdd(event, data, context)
      case 'batchInitPoems':
        return await batchInitPoems(event, data, context)
      case 'getMissingInitData':
        return await getMissingInitData(event, data, context)
      case 'listExistingTitleAuthor':
        return await listExistingTitleAuthor()
      case 'getUserTextSummaries':
        return await getUserTextSummaries(event, context)
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
