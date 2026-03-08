'use strict'
const db = uniCloud.database()
const collection = db.collection('gw-dictation-print-records')
const summaryCollection = db.collection('gw-user-text-summary')
const uniID = require('uni-id-common')

/** 打印记录保存后更新用户古文汇总表（打印次数+1） */
async function updateSummaryAfterPrint(uid, textId, textTitle) {
  const now = Date.now()
  const existRes = await summaryCollection.where({ user_id: uid, text_id: textId }).limit(1).get()
  const existing = (existRes.data && existRes.data[0]) || null
  if (existing && existing._id) {
    await summaryCollection.doc(existing._id).update({
      text_title: textTitle || existing.text_title || '',
      print_count: (existing.print_count || 0) + 1,
      updated_at: now
    })
  } else {
    await summaryCollection.add({
      user_id: uid,
      text_id: textId,
      text_title: textTitle || '',
      print_count: 1,
      updated_at: now
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

  switch (action) {
    case 'save': {
      if (!uid) {
        return { code: 0, data: { skipped: true, msg: '未登录不记录' } }
      }
      const payload = data.data || data
      const record = {
        user_id: uid,
        article_id: String(payload.articleId || payload.article_id || '').trim(),
        text_title: String(payload.title || '').trim(),
        text_dynasty: String(payload.dynasty || '').trim(),
        text_author: String(payload.author || '').trim(),
        difficulty: String(payload.difficulty || 'junior').trim(),
        difficulty_label: String(payload.difficultyLabel || payload.difficulty_label || '').trim(),
        font_size: String(payload.fontSize || payload.font_size || 'medium').trim(),
        file_name: String(payload.fileName || payload.file_name || '').trim(),
        created_at: Date.now()
      }
      const res = await collection.add(record)
      if (record.article_id) {
        try {
          await updateSummaryAfterPrint(uid, record.article_id, record.text_title)
        } catch (e) {
          console.error('gw_dictation-print-record updateSummaryAfterPrint error:', e)
        }
      }
      return { code: 0, data: { id: res.id } }
    }

    case 'list': {
      if (!uid) {
        return { code: 0, data: { list: [], total: 0, page: 1, pageSize: 20 } }
      }
      const { page = 1, pageSize = 20 } = data
      const skip = (page - 1) * pageSize

      const [countRes, listRes] = await Promise.all([
        collection.where({ user_id: uid }).count(),
        collection
          .where({ user_id: uid })
          .orderBy('created_at', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()
      ])
      const total = (countRes && countRes.total) || 0
      const list = (listRes && listRes.data) || []

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

    default:
      return { code: -1, msg: '未知操作' }
  }
}
