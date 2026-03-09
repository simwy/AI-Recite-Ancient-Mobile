'use strict'
const db = uniCloud.database()
const reciteCollection = db.collection('gw-recite-records')
const followCollection = db.collection('gw-follow-records')
const dictationCollection = db.collection('gw-dictation-checks')
const uniID = require('uni-id-common')

exports.main = async (event, context) => {
  const { action, data = {} } = event
  const uniIdCommon = uniID.createInstance({ context })

  let uid = (context.auth && context.auth.uid) || ''
  if (!uid && event.uniIdToken) {
    const tokenRes = await uniIdCommon.checkToken(event.uniIdToken)
    if (tokenRes && tokenRes.code === 0 && tokenRes.uid) {
      uid = tokenRes.uid
    }
  }

  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  if (action === 'delete') {
    const { id, record_type } = data
    if (!id || !record_type) return { code: -1, msg: '缺少记录ID或类型' }
    const collMap = {
      recite: reciteCollection,
      follow: followCollection,
      dictation: dictationCollection
    }
    const coll = collMap[record_type]
    if (!coll) return { code: -1, msg: '未知记录类型' }
    const res = await coll.doc(id).get()
    const record = res.data && res.data[0]
    if (!record || record.user_id !== uid) {
      return { code: -1, msg: '记录不存在' }
    }
    await coll.doc(id).remove()
    return { code: 0, msg: '已删除' }
  }

  if (action !== 'list') {
    return { code: -1, msg: '未知操作' }
  }

  const { page = 1, pageSize = 20 } = data
  const need = page * pageSize

  const [reciteCountRes, followCountRes, dictationCountRes, reciteListRes, followListRes, dictationListRes] = await Promise.all([
    reciteCollection.where({ user_id: uid, practice_mode: db.command.neq('follow') }).count(),
    followCollection.where({ user_id: uid }).count(),
    dictationCollection.where({ user_id: uid }).count(),
    reciteCollection
      .where({ user_id: uid, practice_mode: db.command.neq('follow') })
      .orderBy('created_at', 'desc')
      .limit(need)
      .field({
        _id: true,
        text_id: true,
        text_title: true,
        text_author: true,
        text_dynasty: true,
        practice_mode: true,
        accuracy: true,
        hint_count: true,
        duration_seconds: true,
        recognized_text: true,
        created_at: true
      })
      .get(),
    followCollection
      .where({ user_id: uid })
      .orderBy('created_at', 'desc')
      .limit(need)
      .field({
        _id: true,
        text_id: true,
        text_title: true,
        accuracy: true,
        duration_seconds: true,
        created_at: true
      })
      .get(),
    dictationCollection
      .where({ user_id: uid })
      .orderBy('created_at', 'desc')
      .limit(need)
      .field({
        _id: true,
        article_id: true,
        text_title: true,
        text_author: true,
        text_dynasty: true,
        accuracy: true,
        wrong_chars: true,
        recognized_text: true,
        created_at: true
      })
      .get()
  ])

  const reciteTotal = (reciteCountRes && reciteCountRes.total) || 0
  const followTotal = (followCountRes && followCountRes.total) || 0
  const dictationTotal = (dictationCountRes && dictationCountRes.total) || 0
  const total = reciteTotal + followTotal + dictationTotal

  const reciteList = (reciteListRes && reciteListRes.data) || []
  const followList = (followListRes && followListRes.data) || []
  const dictationList = (dictationListRes && dictationListRes.data) || []

  const snippet = (str, maxLen = 36) => {
    if (!str || typeof str !== 'string') return ''
    const t = str.replace(/\s+/g, ' ').trim()
    return t.length <= maxLen ? t : t.slice(0, maxLen) + '…'
  }

  const reciteItems = reciteList.map((r) => ({
    _id: r._id,
    record_type: 'recite',
    text_id: r.text_id,
    text_title: r.text_title,
    text_author: r.text_author,
    text_dynasty: r.text_dynasty,
    practice_mode: r.practice_mode || 'recite',
    accuracy: r.accuracy,
    hint_count: r.hint_count || 0,
    duration_seconds: Number(r.duration_seconds) || 0,
    recognized_text: r.recognized_text || '',
    recognized_snippet: snippet(r.recognized_text),
    created_at: r.created_at
  }))

  const dictationItems = dictationList.map((d) => {
    const wrongList = Array.isArray(d.wrong_chars) ? d.wrong_chars : []
    return {
      _id: d._id,
      record_type: 'dictation',
      text_id: d.article_id,
      text_title: d.text_title,
      text_author: d.text_author,
      text_dynasty: d.text_dynasty,
      practice_mode: 'dictation',
      accuracy: d.accuracy,
      wrong_count: wrongList.length,
      recognized_text: d.recognized_text || '',
      recognized_snippet: snippet(d.recognized_text),
      created_at: d.created_at
    }
  })

  const followItems = followList.map((f) => ({
    _id: f._id,
    record_type: 'follow',
    text_id: f.text_id,
    text_title: f.text_title,
    practice_mode: 'follow',
    accuracy: f.accuracy,
    duration_seconds: Number(f.duration_seconds) || 0,
    created_at: f.created_at
  }))

  const merged = [...reciteItems, ...followItems, ...dictationItems].sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0)
  )

  const start = (page - 1) * pageSize
  const list = merged.slice(start, start + pageSize)

  return {
    code: 0,
    data: {
      list,
      total,
      page,
      pageSize
    }
  }
}
