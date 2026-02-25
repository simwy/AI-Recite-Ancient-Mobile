'use strict'

const { aliyunParaformer } = require('../../common/config')

let cachedTemporaryToken = ''
let cachedTokenExpiresAt = 0

async function getTemporaryToken() {
  if (!aliyunParaformer || !aliyunParaformer.apiKey || aliyunParaformer.apiKey === 'YOUR_DASHSCOPE_API_KEY') {
    throw new Error('请先在 uniCloud-aliyun/common/config.js 中配置阿里云 API Key')
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

exports.main = async () => {
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
