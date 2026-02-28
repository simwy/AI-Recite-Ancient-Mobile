'use strict'

const crypto = require('crypto')
const WebSocket = require('ws')
const { iflytekTts } = require('config')
const db = uniCloud.database()
const ttsCacheCollection = db.collection('gw-tts-cache')
const GENERATING_LOCK_TTL_MS = 45000
const DEFAULT_RETRY_AFTER_MS = 800

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function ensureConfig() {
  if (!iflytekTts || !iflytekTts.appId || !iflytekTts.apiKey || !iflytekTts.apiSecret) {
    throw new Error('请先在 common/config/index.js 中配置科大讯飞 TTS 参数')
  }
}

function looksLikeBase64(value) {
  const text = String(value || '').trim()
  if (!text || text.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/=]+$/.test(text)
}

function normalizeCredential(rawValue) {
  const value = String(rawValue || '').trim()
  if (!looksLikeBase64(value)) return value
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8').trim()
    // 仅当解码后是可见ASCII并且长度合理时，才用解码值
    if (decoded && /^[\x20-\x7E]+$/.test(decoded) && decoded.length >= 16 && decoded.length <= 128) {
      return decoded
    }
  } catch (e) {}
  return value
}

function toSafeNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function toSafeInt(value, fallback) {
  return toSafeNumber(value, fallback, 0, 9999999)
}

function toSafeBooleanInt(value, fallback) {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  return fallback ? 1 : 0
}

function buildSentenceHash(text, options) {
  const payload = [
    normalizeText(text),
    options.voice || iflytekTts.defaultVoice || 'x6_lingyufei_pro',
    toSafeNumber(options.speed, iflytekTts.defaultSpeed || 50, 0, 100),
    toSafeNumber(options.pitch, iflytekTts.defaultPitch || 50, 0, 100),
    toSafeNumber(options.volume, iflytekTts.defaultVolume || 50, 0, 100),
    options.encoding || iflytekTts.defaultEncoding || 'lame',
    toSafeNumber(options.sampleRate, iflytekTts.defaultSampleRate || 24000, 8000, 24000),
    'v2'
  ].join('|')
  return crypto.createHash('sha1').update(payload).digest('hex')
}

function buildCredentialCandidates(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return []
  const decoded = normalizeCredential(raw)
  if (!decoded || decoded === raw) return [raw]
  return [raw, decoded]
}

function buildSignedWsUrl(rawUrl, credential) {
  const apiKey = credential.apiKey
  const apiSecret = credential.apiSecret
  const urlObj = new URL(rawUrl)
  const host = urlObj.host
  const path = urlObj.pathname
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString('base64')
  urlObj.searchParams.set('host', host)
  urlObj.searchParams.set('date', date)
  urlObj.searchParams.set('authorization', authorization)
  return urlObj.toString()
}

function buildWsRequest(text, options) {
  const voice = options.voice || iflytekTts.defaultVoice || 'x6_lingyufei_pro'
  const encoding = options.encoding || iflytekTts.defaultEncoding || 'lame'
  const sampleRate = toSafeNumber(options.sampleRate, iflytekTts.defaultSampleRate || 24000, 8000, 24000)
  const channels = toSafeNumber(options.channels, iflytekTts.defaultChannels || 1, 1, 1)
  const bitDepth = toSafeNumber(options.bitDepth, iflytekTts.defaultBitDepth || 16, 16, 16)
  const frameSize = toSafeNumber(options.frameSize, iflytekTts.defaultFrameSize || 0, 0, 1024)

  return {
    header: {
      app_id: iflytekTts.appId,
      status: 2
    },
    parameter: {
      oral: {
        oral_level: options.oralLevel || iflytekTts.defaultOralLevel || 'mid',
        spark_assist: toSafeBooleanInt(options.sparkAssist, Number(iflytekTts.defaultSparkAssist || 1) === 1),
        stop_split: toSafeBooleanInt(options.stopSplit, Number(iflytekTts.defaultStopSplit || 0) === 1),
        remain: toSafeBooleanInt(options.remain, Number(iflytekTts.defaultRemain || 0) === 1)
      },
      tts: {
        vcn: voice,
        speed: toSafeNumber(options.speed, iflytekTts.defaultSpeed || 50, 0, 100),
        volume: toSafeNumber(options.volume, iflytekTts.defaultVolume || 50, 0, 100),
        pitch: toSafeNumber(options.pitch, iflytekTts.defaultPitch || 50, 0, 100),
        bgs: toSafeInt(options.bgs, iflytekTts.defaultBgs || 0),
        reg: toSafeInt(options.reg, iflytekTts.defaultReg || 0),
        rdn: toSafeInt(options.rdn, iflytekTts.defaultRdn || 0),
        rhy: toSafeInt(options.rhy, iflytekTts.defaultRhy || 0),
        watermask: toSafeInt(options.watermask, iflytekTts.defaultWatermark || 0),
        implicit_watermark: options.implicitWatermark != null
          ? Boolean(options.implicitWatermark)
          : Boolean(iflytekTts.defaultImplicitWatermark),
        audio: {
          encoding,
          sample_rate: sampleRate,
          channels,
          bit_depth: bitDepth,
          frame_size: frameSize
        }
      }
    },
    payload: {
      text: {
        encoding: 'utf8',
        compress: 'raw',
        format: 'plain',
        status: 2,
        seq: 0,
        text: Buffer.from(text, 'utf8').toString('base64')
      }
    }
  }
}

function toResponseFormat(encoding) {
  if (encoding === 'lame') return 'mp3'
  if (encoding === 'raw') return 'pcm'
  return encoding || 'mp3'
}

async function getReadyCache(sentenceHash) {
  const res = await ttsCacheCollection.where({
    sentence_hash: sentenceHash,
    status: 'ready'
  }).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function getCacheByHash(sentenceHash) {
  const res = await ttsCacheCollection.where({
    sentence_hash: sentenceHash
  }).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function getTempAudioUrl(fileId) {
  if (!fileId) return ''
  const tempRes = await uniCloud.getTempFileURL({
    fileList: [fileId]
  })
  const file = tempRes.fileList && tempRes.fileList[0]
  return (file && file.tempFileURL) || ''
}

async function uploadAudioToCloud(audioBase64, sentenceHash, format) {
  const cloudPath = `tts/local/${sentenceHash}.${format || 'mp3'}`
  const fileContent = Buffer.from(audioBase64, 'base64')
  const uploadRes = await uniCloud.uploadFile({
    cloudPath,
    fileContent
  })
  return uploadRes.fileID
}

async function upsertCacheDoc(payload) {
  const now = new Date()
  const current = await ttsCacheCollection.where({
    sentence_hash: payload.sentence_hash
  }).limit(1).get()
  const existed = current.data && current.data[0]
  if (existed) {
    await ttsCacheCollection.doc(existed._id).update({
      ...payload,
      updated_at: now
    })
    return existed._id
  }
  const addRes = await ttsCacheCollection.add({
    ...payload,
    created_at: now,
    updated_at: now
  })
  return addRes.id
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function getTimestampMs(value) {
  if (!value) return 0
  const d = new Date(value)
  const ts = d.getTime()
  return Number.isFinite(ts) ? ts : 0
}

async function tryAcquireGeneratingLock(sentenceHash, payload, requestId) {
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const lockExpireAt = new Date(nowMs + GENERATING_LOCK_TTL_MS)
  const current = await getCacheByHash(sentenceHash)
  if (!current) {
    await upsertCacheDoc({
      ...payload,
      status: 'generating',
      lock_owner: requestId,
      lock_expire_at: lockExpireAt
    })
    return { type: 'acquired' }
  }

  if (current.status === 'ready' && current.audio_file_id) {
    return { type: 'ready', doc: current }
  }

  if (current.status === 'generating') {
    const expireAtMs = getTimestampMs(current.lock_expire_at)
    if (expireAtMs > nowMs) {
      return { type: 'pending' }
    }
  }

  await ttsCacheCollection.doc(current._id).update({
    ...payload,
    status: 'generating',
    lock_owner: requestId,
    lock_expire_at: lockExpireAt,
    updated_at: now
  })
  return { type: 'acquired' }
}

async function markCacheHit(doc) {
  if (!doc || !doc._id) return
  await ttsCacheCollection.doc(doc._id).update({
    hit_count: Number(doc.hit_count || 0) + 1,
    updated_at: new Date()
  })
}

function synthesizeByWebSocket(text, options) {
  const apiKeyCandidates = buildCredentialCandidates(iflytekTts.apiKey)
  const apiSecretCandidates = buildCredentialCandidates(iflytekTts.apiSecret)
  const credentialPairs = []
  apiKeyCandidates.forEach((apiKey) => {
    apiSecretCandidates.forEach((apiSecret) => {
      credentialPairs.push({ apiKey, apiSecret })
    })
  })
  const fallbackPair = {
    apiKey: String(iflytekTts.apiKey || '').trim(),
    apiSecret: String(iflytekTts.apiSecret || '').trim()
  }
  const pairs = credentialPairs.length ? credentialPairs : [fallbackPair]

  const run = async () => {
    let lastError = null
    for (let i = 0; i < pairs.length; i++) {
      try {
        return await synthesizeByWebSocketWithCredential(text, options, pairs[i])
      } catch (error) {
        lastError = error
        const msg = (error && error.message) || ''
        if (!msg.includes('401')) {
          break
        }
      }
    }
    throw lastError || new Error('语音合成失败')
  }
  return run()
}

function synthesizeByWebSocketWithCredential(text, options, credential) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number(iflytekTts.timeout || 20000)
    const wsUrl = buildSignedWsUrl(iflytekTts.endpoint, credential)
    const requestBody = buildWsRequest(text, options || {})
    const audioChunks = []
    let resolved = false
    let responseEncoding = requestBody.parameter.tts.audio.encoding

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      try {
        ws.close()
      } catch (e) {}
      reject(new Error('语音合成超时，请稍后重试'))
    }, timeoutMs)

    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      ws.send(JSON.stringify(requestBody))
    })

    ws.on('message', (rawData) => {
      if (resolved) return
      let message
      try {
        message = JSON.parse(Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData))
      } catch (e) {
        return
      }

      const header = message.header || {}
      if (Number(header.code) !== 0) {
        resolved = true
        clearTimeout(timer)
        ws.close()
        reject(new Error(header.message || `讯飞错误码 ${header.code}`))
        return
      }

      const payload = message.payload || {}
      const audioPayload = payload.audio || {}
      if (audioPayload.encoding) {
        responseEncoding = audioPayload.encoding
      }
      if (audioPayload.audio) {
        try {
          audioChunks.push(Buffer.from(audioPayload.audio, 'base64'))
        } catch (e) {}
      }

      const headerStatus = Number(header.status)
      const audioStatus = Number(audioPayload.status)
      if (headerStatus === 2 || audioStatus === 2) {
        resolved = true
        clearTimeout(timer)
        ws.close()
        resolve({
          audioBase64: Buffer.concat(audioChunks).toString('base64'),
          encoding: responseEncoding
        })
      }
    })

    ws.on('error', (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      reject(new Error((err && err.message) || 'WebSocket 连接失败'))
    })
    ws.on('unexpected-response', (request, response) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').trim()
        reject(new Error(body || `Unexpected server response: ${response.statusCode}`))
      })
      response.on('error', () => {
        reject(new Error(`Unexpected server response: ${response.statusCode}`))
      })
    })

    ws.on('close', () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      if (audioChunks.length > 0) {
        resolve({
          audioBase64: Buffer.concat(audioChunks).toString('base64'),
          encoding: responseEncoding
        })
      } else {
        reject(new Error('讯飞连接已关闭，未收到音频数据'))
      }
    })
  })
}

exports.main = async (event) => {
  try {
    ensureConfig()

    const options = event || {}
    const text = normalizeText(options.text)
    if (!text) {
      return { code: -1, msg: '缺少 text 参数' }
    }

    const sentenceHash = buildSentenceHash(text, options)
    const requestId = createRequestId()
    const cachePayload = {
      sentence_hash: sentenceHash,
      text,
      voice: options.voice || iflytekTts.defaultVoice || 'x6_lingyufei_pro',
      speed: toSafeNumber(options.speed, iflytekTts.defaultSpeed || 50, 0, 100),
      pitch: toSafeNumber(options.pitch, iflytekTts.defaultPitch || 50, 0, 100),
      volume: toSafeNumber(options.volume, iflytekTts.defaultVolume || 50, 0, 100),
      storage_type: 'local'
    }

    const cachedDoc = await getReadyCache(sentenceHash)
    if (cachedDoc && cachedDoc.audio_file_id) {
      const tempUrl = await getTempAudioUrl(cachedDoc.audio_file_id)
      if (tempUrl) {
        await markCacheHit(cachedDoc)
        return {
          code: 0,
          data: {
            text,
            sentenceHash,
            format: cachedDoc.format || 'mp3',
            encoding: cachedDoc.encoding || 'lame',
            audioUrl: tempUrl,
            cached: true
          }
        }
      }
    }

    const lockState = await tryAcquireGeneratingLock(sentenceHash, cachePayload, requestId)
    if (lockState.type === 'ready' && lockState.doc && lockState.doc.audio_file_id) {
      const readyTempUrl = await getTempAudioUrl(lockState.doc.audio_file_id)
      if (readyTempUrl) {
        await markCacheHit(lockState.doc)
        return {
          code: 0,
          data: {
            text,
            sentenceHash,
            format: lockState.doc.format || 'mp3',
            encoding: lockState.doc.encoding || 'lame',
            audioUrl: readyTempUrl,
            cached: true
          }
        }
      }
    }
    if (lockState.type === 'pending') {
      return {
        code: 0,
        data: {
          text,
          sentenceHash,
          status: 'pending',
          retryAfter: DEFAULT_RETRY_AFTER_MS
        }
      }
    }

    const wsRes = await synthesizeByWebSocket(text, options)
    if (!wsRes || !wsRes.audioBase64) {
      return {
        code: -1,
        msg: '讯飞未返回有效音频数据'
      }
    }

    const format = toResponseFormat(wsRes.encoding)
    const fileId = await uploadAudioToCloud(wsRes.audioBase64, sentenceHash, format)
    const tempUrl = await getTempAudioUrl(fileId)

    await upsertCacheDoc({
      ...cachePayload,
      encoding: wsRes.encoding,
      format,
      status: 'ready',
      audio_file_id: fileId,
      audio_url: tempUrl || '',
      audio_size: wsRes.audioBase64.length,
      hit_count: 1,
      last_error: '',
      lock_owner: '',
      lock_expire_at: new Date(0)
    })

    return {
      code: 0,
      data: {
        text,
        sentenceHash,
        encoding: wsRes.encoding,
        format,
        audioBase64: wsRes.audioBase64,
        audioUrl: tempUrl || '',
        cached: false
      }
    }
  } catch (error) {
    try {
      const options = event || {}
      const text = normalizeText(options.text)
      if (text) {
        const sentenceHash = buildSentenceHash(text, event || {})
        const failPayload = {
          sentence_hash: sentenceHash,
          text,
          voice: options.voice || iflytekTts.defaultVoice || 'x6_lingyufei_pro',
          speed: toSafeNumber(options.speed, iflytekTts.defaultSpeed || 50, 0, 100),
          pitch: toSafeNumber(options.pitch, iflytekTts.defaultPitch || 50, 0, 100),
          volume: toSafeNumber(options.volume, iflytekTts.defaultVolume || 50, 0, 100),
          storage_type: 'local'
        }
        await upsertCacheDoc({
          ...failPayload,
          status: 'failed',
          last_error: error.message || '未知错误',
          lock_owner: '',
          lock_expire_at: new Date(0)
        })
      }
    } catch (e) {}
    return {
      code: -1,
      msg: error.message || '语音合成失败'
    }
  }
}
