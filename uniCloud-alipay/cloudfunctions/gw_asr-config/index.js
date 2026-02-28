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
  const forceMode = String(event.asrMode || '').trim().toLowerCase()
  if (forceMode === 'standard') {
    return buildIflytekStandardConfig()
  }
  if (forceMode === 'llm') {
    return buildIflytekLlmConfig(event)
  }
  const useStandardRtasr = !iflytekAsr || iflytekAsr.useStandardRtasr !== false
  return useStandardRtasr ? buildIflytekStandardConfig() : buildIflytekLlmConfig(event)
}

function buildIflytekStandardConfig() {
  const config = (iflytekAsr && iflytekAsr.standard) || {}
  if (!config.endpoint || !config.appId || !config.apiKey) {
    throw new Error('请先在 common/config/index.js 中配置讯飞实时语音转写标准版参数')
  }
  const endpoint = String(config.endpoint).trim()
  const appId = String(config.appId).trim()
  const apiKey = String(config.apiKey).trim()
  const ts = String(Math.floor(Date.now() / 1000))
  const signa = buildIflytekStandardSigna(appId, ts, apiKey)
  const query = {
    appid: appId,
    ts,
    signa
  }
  if (config.lang) query.lang = String(config.lang).trim()
  if (config.punc !== undefined && config.punc !== null && String(config.punc) !== '') {
    query.punc = String(config.punc)
  }
  if (config.pd) query.pd = String(config.pd).trim()
  if (config.vadMdn !== undefined && config.vadMdn !== null && String(config.vadMdn) !== '') {
    query.vadMdn = String(config.vadMdn)
  }
  if (config.roleType !== undefined && config.roleType !== null && String(config.roleType) !== '') {
    query.roleType = String(config.roleType)
  }
  if (config.engLangType !== undefined && config.engLangType !== null && String(config.engLangType) !== '') {
    query.engLangType = String(config.engLangType)
  }
  const wsUrl = `${endpoint}?${buildSortedQueryString(query)}`
  return {
    provider: 'iflytek-rtasr',
    asrMode: 'standard',
    wsUrl,
    appId,
    sampleRate: Number(config.sampleRate || 16000) || 16000,
    format: 'pcm',
    lang: query.lang || 'cn',
    frameBytes: Number(config.frameBytes || 1280) || 1280,
    frameIntervalMs: Number(config.frameIntervalMs || 40) || 40,
    timeout: Number(config.timeout || 20000) || 20000
  }
}

function buildIflytekLlmConfig(event) {
  const config = (iflytekAsr && iflytekAsr.llm) || {}
  if (!config.endpoint || !config.appId || !config.apiKey || !config.apiSecret) {
    throw new Error('请先在 common/config/index.js 中配置讯飞实时语音转写大模型参数')
  }
  const endpoint = String(config.endpoint).trim()
  const appId = String(config.appId).trim()
  const apiKey = String(config.apiKey).trim()
  const apiSecret = String(config.apiSecret).trim()
  const lang = String(config.lang || 'autodialect').trim()
  const audioEncode = String(config.audioEncode || 'pcm_s16le').trim()
  const sampleRate = Number(config.sampleRate || 16000) || 16000
  const utcOffset = String(config.utcOffset || '+0800').trim()
  const uuidPrefix = String(config.uuidPrefix || 'gw-read').trim()
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
    asrMode: 'llm',
    wsUrl,
    appId,
    sampleRate,
    format: 'pcm',
    audioEncode,
    lang,
    frameBytes: Number(config.frameBytes || 1280) || 1280,
    frameIntervalMs: Number(config.frameIntervalMs || 40) || 40,
    timeout: Number(config.timeout || 20000) || 20000
  }
}

function buildIflytekStandardSigna(appId, ts, apiKey) {
  const md5Base = crypto.createHash('md5').update(`${appId}${ts}`).digest('hex')
  return crypto.createHmac('sha1', apiKey).update(md5Base).digest('base64')
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
