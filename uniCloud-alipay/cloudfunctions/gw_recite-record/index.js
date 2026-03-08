'use strict';
const db = uniCloud.database()
const collection = db.collection('gw-recite-records')
const summaryCollection = db.collection('gw-user-text-summary')
const uniID = require('uni-id-common')

/** 背诵保存后更新用户古文汇总表 */
async function updateSummaryAfterRecite(uid, textId, textTitle, recordId, accuracy, createdAt) {
  const lastFields = {
    recite_last_at: createdAt,
    recite_last_score: accuracy,
    recite_last_record_id: recordId
  }
  const existRes = await summaryCollection.where({ user_id: uid, text_id: textId }).limit(1).get()
  const existing = (existRes.data && existRes.data[0]) || null
  const bestScore = existing ? (Number(existing.recite_best_score) || -1) : -1
  const updates = {
    ...lastFields,
    text_title: textTitle || (existing && existing.text_title) || '',
    updated_at: createdAt
  }
  if (accuracy >= bestScore) {
    updates.recite_best_at = createdAt
    updates.recite_best_score = accuracy
    updates.recite_best_record_id = recordId
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

  // 兼容两种鉴权来源：
  // 1) 平台自动注入 context.auth.uid
  // 2) 客户端自动携带的 event.uniIdToken（普通云函数场景）
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
        hint_count: data.hint_count || 0,
        duration_seconds: Number(data.duration_seconds) || 0,
        recognized_text: data.recognized_text || '',
        diff_result: data.diff_result || [],
        accuracy: data.accuracy || 0,
        sentence_index: Number.isInteger(data.sentence_index) ? data.sentence_index : -1,
        sentence_text: data.sentence_text || '',
        sentence_accuracy: Number(data.sentence_accuracy) || 0,
        wrong_chars: Array.isArray(data.wrong_chars) ? data.wrong_chars : [],
        sentence_details: Array.isArray(data.sentence_details) ? data.sentence_details : [],
        attempt_no: Number(data.attempt_no) || 0,
        created_at: Date.now()
      }
      const res = await collection.add(record)
      try {
        await updateSummaryAfterRecite(
          uid,
          record.text_id,
          record.text_title,
          res.id,
          record.accuracy,
          record.created_at
        )
      } catch (e) {
        console.error('gw_recite-record updateSummaryAfterRecite error:', e)
      }
      return { code: 0, data: { id: res.id } }
    }

    case 'list': {
      const { page = 1, pageSize = 20, text_id } = data
      const skip = (page - 1) * pageSize
      const where = { user_id: uid, practice_mode: db.command.neq('follow') }
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
        data: {
          list: listRes.data,
          total: countRes.total,
          page,
          pageSize
        }
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

    /** 批量查询各古文第一次背诵通过的记录（accuracy>=90），用于日历展示完成日（完成日=首次通过日+1天） */
    case 'getFirstPassByTextIds': {
      const textIds = data.text_ids
      if (!Array.isArray(textIds) || textIds.length === 0) {
        return { code: 0, data: { list: [] } }
      }
      const limit = Math.min(textIds.length * 50, 2000) // 每篇最多约 50 条记录
      const where = {
        user_id: uid,
        text_id: db.command.in(textIds),
        accuracy: db.command.gte(90)
      }
      // 与 list 一致：排除跟读
      where.practice_mode = db.command.neq('follow')
      const listRes = await collection
        .where(where)
        .orderBy('created_at', 'asc')
        .limit(limit)
        .get()
      const firstByText = {}
      for (const r of (listRes.data || [])) {
        const tid = r.text_id
        if (tid && firstByText[tid] == null) {
          firstByText[tid] = {
            text_id: tid,
            text_title: r.text_title || '',
            first_pass_at: r.created_at
          }
        }
      }
      const list = Object.values(firstByText)
      return { code: 0, data: { list } }
    }

    default:
      return { code: -1, msg: '未知操作' }
  }
}
