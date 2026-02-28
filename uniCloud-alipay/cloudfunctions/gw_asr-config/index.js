'use strict'

const crypto = require('crypto')
const { aliyunParaformer, iflytekAsr } = require('config')

let cachedTemporaryToken = ''
let cachedTokenExpiresAt = 0

async function getTemporaryToken() {
  if (!aliyunParaformer || !aliyunParaformer.apiKey || aliyunParaformer.apiKey === 'YOUR_DASHSCOPE_API_KEY') {
    throw new Error('请先在 uniCloud-aliyun/cloudfunctions/common/config/index.js 中配置阿里云 API Key')
  }

  const now = Math.floor(Date.now() / 1000)
  if (cachedTemporaryToken && cachedTokenExpiresAt - now > 30) {
    return cachedTemporaryToken
  }

  const rawExpire = Number(aliyunParaformer.tokenExpireSeconds || 600)
  const expireInSeconds = Math.max(1, Math.min(1800, rawExpire))
  const tokenUrl = `https://dashscope.aliyuncs.com/api/v1/tokens?expire_in_seconds=${expireInSeconds}`

  const response = await uniCloud.httpclient.request(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${aliyunParaformer.apiKey}`
    },
    dataType: 'json'
  })

  if (response.status !== 200 || !response.data || !response.data.token) {
    const errorMessage = response.data && response.data.message ? response.data.message : '获取临时Token失败'
    throw new Error(errorMessage)
  }

  cachedTemporaryToken = response.data.token
  if (!cachedTemporaryToken.startsWith('st-')) {
    throw new Error('获取到的不是临时Token，请检查配置')
  }
  cachedTokenExpiresAt = Number(response.data.expires_at || now + expireInSeconds)

  return cachedTemporaryToken
}

exports.main = async (event = {}) => {
  const provider = event.provider || 'aliyun-paraformer'
  if (provider === 'iflytek-rtasr') {
    try {
      const data = buildIflytekConfig(event)
      return { code: 0, data }
    } catch (error) {
      return {
        code: -1,
        msg: error.message || '语音配置获取失败'
      }
    }
  }

  try {
    const temporaryToken = await getTemporaryToken()

    return {
      code: 0,
      data: {
        wsUrl: aliyunParaformer.wsUrl,
        relayWsUrl: aliyunParaformer.relayWsUrl || '',
        temporaryToken,
        tokenType: 'bearer',
        tokenExpiresAt: cachedTokenExpiresAt,
        model: aliyunParaformer.model,
        sampleRate: aliyunParaformer.sampleRate,
        format: aliyunParaformer.format,
        languageHints: aliyunParaformer.languageHints || ['zh'],
        punctuationPredictionEnabled: aliyunParaformer.punctuationPredictionEnabled !== false,
        inverseTextNormalizationEnabled: aliyunParaformer.inverseTextNormalizationEnabled !== false
      }
    }
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '语音配置获取失败'
    }
  }
}

function buildIflytekConfig(event) {
  if (!iflytekAsr || !iflytekAsr.endpoint || !iflytekAsr.appId || !iflytekAsr.apiKey || !iflytekAsr.apiSecret) {
    throw new Error('请先在 uniCloud-alipay/cloudfunctions/common/config/index.js 中配置讯飞实时识别参数')
  }
  const endpoint = String(iflytekAsr.endpoint).trim()
  const appId = String(iflytekAsr.appId).trim()
  const apiKey = String(iflytekAsr.apiKey).trim()
  const apiSecret = String(iflytekAsr.apiSecret).trim()
  const lang = String(iflytekAsr.lang || 'autodialect').trim()
  const audioEncode = String(iflytekAsr.audioEncode || 'pcm_s16le').trim()
  const sampleRate = Number(iflytekAsr.sampleRate || 16000) || 16000
  const utcOffset = String(iflytekAsr.utcOffset || '+0800').trim()
  const uuidPrefix = String(iflytekAsr.uuidPrefix || 'gw-read').trim()
  const uuid = String(event.uuid || `${uuidPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`)
  const utc = buildUtcString(utcOffset)

  const sortedQuery = {
    accessKeyId: apiKey,
    appId,
    audio_encode: audioEncode,
    lang,
    samplerate: sampleRate,
    utc,
    uuid
  }
  const baseString = buildSortedQueryString(sortedQuery)
  const signature = crypto.createHmac('sha1', apiSecret).update(baseString).digest('base64')
  const wsUrl = `${endpoint}?${baseString}&signature=${encodeURIComponent(signature)}`

  return {
    provider: 'iflytek-rtasr',
    wsUrl,
    appId,
    apiKey,
    sampleRate,
    format: 'pcm',
    audioEncode,
    lang,
    frameBytes: Number(iflytekAsr.frameBytes || 1280) || 1280,
    frameIntervalMs: Number(iflytekAsr.frameIntervalMs || 40) || 40,
    timeout: Number(iflytekAsr.timeout || 20000) || 20000
  }
}

function buildSortedQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

function buildUtcString(offset) {
  const now = new Date()
  const Y = now.getFullYear()
  const M = String(now.getMonth() + 1).padStart(2, '0')
  const D = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const normalizedOffset = /^[-+]\d{4}$/.test(offset) ? offset : '+0800'
  return `${Y}-${M}-${D}T${h}:${m}:${s}${normalizedOffset}`
}
