'use strict'
const db = uniCloud.database()
const collection = db.collection('gw-ancient-favorites')
const uniID = require('uni-id-common')

exports.main = async (event, context) => {
  const { action, data = {} } = event
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

  if (!uid) {
    return { code: -1, msg: '请先登录' }
  }

  try {
    switch (action) {
      case 'list': {
        const page = Math.max(1, Number(data.page) || 1)
        const pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20))
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
        return { code: 0, data: { list, total } }
      }
      case 'check': {
        if (!data.text_id) return { code: -1, msg: '缺少古文ID' }
        const res = await collection.where({ user_id: uid, text_id: data.text_id }).limit(1).get()
        const favorited = !!(res.data && res.data.length > 0)
        return { code: 0, data: { favorited } }
      }
      case 'toggle': {
        if (!data.text_id) return { code: -1, msg: '缺少古文ID' }
        const queryRes = await collection.where({ user_id: uid, text_id: data.text_id }).limit(1).get()
        const favorite = queryRes.data && queryRes.data[0]
        if (favorite && favorite._id) {
          await collection.doc(favorite._id).remove()
          return { code: 0, msg: '已取消收藏', data: { favorited: false } }
        }

        await collection.add({
          user_id: uid,
          text_id: data.text_id,
          text_title: data.text_title || '',
          text_author: data.text_author || '',
          text_dynasty: data.text_dynasty || '',
          created_at: Date.now()
        })
        return { code: 0, msg: '已收藏', data: { favorited: true } }
      }
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (e) {
    // 唯一索引冲突兜底，避免并发点击产生重复收藏
    if (String((e && e.message) || '').includes('duplicate key')) {
      return { code: 0, msg: '已收藏', data: { favorited: true } }
    }
    return { code: -1, msg: (e && e.message) || '操作失败' }
  }
}
