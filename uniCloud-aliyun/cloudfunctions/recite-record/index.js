'use strict';
const db = uniCloud.database()
const collection = db.collection('recite-records')

exports.main = async (event, context) => {
  const { action, data = {} } = event

  // 从 token 获取 user_id
  const { uid } = context.auth || {}
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

    default:
      return { code: -1, msg: '未知操作' }
  }
}
