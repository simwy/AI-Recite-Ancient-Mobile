'use strict';
const db = uniCloud.database()
const collection = db.collection('gw-follow-records')
const summaryCollection = db.collection('gw-user-text-summary')
const uniID = require('uni-id-common')

/** 跟读保存后更新用户古文汇总表 */
async function updateSummaryAfterFollow(uid, textId, textTitle, recordId, accuracy, createdAt) {
  const lastFields = {
    follow_last_at: createdAt,
    follow_last_score: accuracy,
    follow_last_record_id: recordId
  }
  const existRes = await summaryCollection.where({ user_id: uid, text_id: textId }).limit(1).get()
  const existing = (existRes.data && existRes.data[0]) || null
  const bestScore = existing ? (Number(existing.follow_best_score) || -1) : -1
  const updates = {
    ...lastFields,
    text_title: textTitle || (existing && existing.text_title) || '',
    updated_at: createdAt
  }
  if (accuracy >= bestScore) {
    updates.follow_best_at = createdAt
    updates.follow_best_score = accuracy
    updates.follow_best_record_id = recordId
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

  switch (action) {
    case 'save': {
      const record = {
        user_id: uid,
        text_id: data.text_id,
        text_title: data.text_title,
        duration_seconds: Number(data.duration_seconds) || 0,
        diff_result: data.diff_result || [],
        accuracy: data.accuracy || 0,
        wrong_chars: Array.isArray(data.wrong_chars) ? data.wrong_chars : [],
        sentence_details: Array.isArray(data.sentence_details) ? data.sentence_details : [],
        attempt_no: Number(data.attempt_no) || 0,
        created_at: Date.now()
      }
      const res = await collection.add(record)
      try {
        await updateSummaryAfterFollow(uid, record.text_id, record.text_title, res.id, record.accuracy, record.created_at)
      } catch (e) {
        console.error('gw_follow-record updateSummaryAfterFollow error:', e)
      }
      return { code: 0, data: { id: res.id } }
    }

    case 'list': {
      const { page = 1, pageSize = 20, text_id } = data
      const skip = (page - 1) * pageSize
      const where = { user_id: uid }
      if (text_id) where.text_id = text_id
      const countRes = await collection.where(where).count()
      const listRes = await collection
        .where(where)
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
      return {
        code: 0,
        data: { list: listRes.data, total: countRes.total, page, pageSize }
      }
    }

    case 'detail': {
      const res = await collection.doc(data.id).get()
      const record = res.data && res.data[0]
      if (!record || record.user_id !== uid) {
        return { code: -1, msg: '记录不存在' }
      }
      return { code: 0, data: record }
    }

    case 'delete': {
      if (!data.id) {
        return { code: -1, msg: '缺少记录ID' }
      }
      const res = await collection.doc(data.id).get()
      const record = res.data && res.data[0]
      if (!record || record.user_id !== uid) {
        return { code: -1, msg: '记录不存在' }
      }
      await collection.doc(data.id).remove()
      return { code: 0 }
    }

    default:
      return { code: -1, msg: '未知操作' }
  }
}
