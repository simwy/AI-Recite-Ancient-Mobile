'use strict';
const db = uniCloud.database()
const collection = db.collection('ancient-texts')

exports.main = async (event, context) => {
  const { keyword = '', page = 1, pageSize = 20 } = event

  const skip = (page - 1) * pageSize

  let where = {}
  if (keyword) {
    const reg = new RegExp(keyword, 'i')
    where = db.command.or([
      { title: reg },
      { content: reg }
    ])
  }

  const countRes = await collection.where(where).count()
  const total = countRes.total

  const listRes = await collection
    .where(where)
    .skip(skip)
    .limit(pageSize)
    .get()

  return {
    code: 0,
    data: {
      list: listRes.data,
      total,
      page,
      pageSize
    }
  }
}
