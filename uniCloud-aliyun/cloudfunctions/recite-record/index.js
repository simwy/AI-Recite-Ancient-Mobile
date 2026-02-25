'use strict';
const db = uniCloud.database()
const collection = db.collection('recite-records')
const uniID = require('uni-id-common')

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
        recognized_text: data.recognized_text || '',
        diff_result: data.diff_result || [],
        accuracy: data.accuracy || 0,
        created_at: Date.now()
      }
      const res = await collection.add(record)
      return { code: 0, data: { id: res.id } }
    }

    case 'list': {
      const { page = 1, pageSize = 20 } = data
      const skip = (page - 1) * pageSize

      const countRes = await collection.where({ user_id: uid }).count()
      const listRes = await collection
        .where({ user_id: uid })
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

    default:
      return { code: -1, msg: '未知操作' }
  }
}
