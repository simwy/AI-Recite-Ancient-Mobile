'use strict'

const crypto = require('crypto')
const db = uniCloud.database()
const snapshotCollection = db.collection('gw-ancient-sentence-snapshots')

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim()
}

function hashContent(content) {
  return crypto.createHash('sha1').update(content || '').digest('hex')
}

function sanitizeSentences(sentences) {
  if (!Array.isArray(sentences)) return []
  return sentences
    .map((item, idx) => ({
      index: Number(item.index != null ? item.index : idx),
      sentence_id: String(item.sentence_id || '').trim(),
      text: String(item.text || ''),
      start_offset: Number(item.start_offset || 0),
      end_offset: Number(item.end_offset || 0),
      play_units: Array.isArray(item.play_units)
        ? item.play_units.map((unit, uidx) => ({
            sub_index: Number(unit.sub_index != null ? unit.sub_index : uidx),
            unit_id: String(unit.unit_id || '').trim(),
            text: String(unit.text || '')
          }))
        : []
    }))
    .filter(item => item.sentence_id && item.text)
}

async function getSnapshot(data) {
  const textId = String((data && data.text_id) || '').trim()
  const splitVersion = String((data && data.split_version) || 'v1').trim()
  if (!textId) {
    return { code: -1, msg: '缺少 text_id' }
  }
  const res = await snapshotCollection.where({
    text_id: textId,
    split_version: splitVersion
  }).limit(1).get()
  return {
    code: 0,
    data: (res.data && res.data[0]) || null
  }
}

async function upsertSnapshot(data) {
  const textId = String((data && data.text_id) || '').trim()
  const splitVersion = String((data && data.split_version) || 'v1').trim()
  const content = normalizeText(data && data.content)
  const contentHash = String((data && data.content_hash) || hashContent(content))
  const sentences = sanitizeSentences(data && data.sentences)

  if (!textId) {
    return { code: -1, msg: '缺少 text_id' }
  }
  if (!sentences.length) {
    return { code: -1, msg: '缺少有效分句数据' }
  }

  const now = new Date()
  const existed = await snapshotCollection.where({
    text_id: textId,
    split_version: splitVersion
  }).limit(1).get()
  const current = existed.data && existed.data[0]
  if (current) {
    await snapshotCollection.doc(current._id).update({
      content_hash: contentHash,
      sentences,
      updated_at: now
    })
    return {
      code: 0,
      data: {
        _id: current._id,
        updated: true
      }
    }
  }

  const addRes = await snapshotCollection.add({
    text_id: textId,
    split_version: splitVersion,
    content_hash: contentHash,
    sentences,
    created_at: now,
    updated_at: now
  })
  return {
    code: 0,
    data: {
      _id: addRes.id,
      updated: false
    }
  }
}

exports.main = async (event) => {
  try {
    const action = (event && event.action) || 'get'
    const data = (event && event.data) || {}
    if (action === 'upsert') {
      return await upsertSnapshot(data)
    }
    return await getSnapshot(data)
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '分句快照处理失败'
    }
  }
}
