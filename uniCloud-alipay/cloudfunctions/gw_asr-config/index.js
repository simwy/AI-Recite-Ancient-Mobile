'use strict'

const crypto = require('crypto')
const { nls } = require('config')

let cachedToken = ''
let cachedTokenExpiresAt = 0

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
}

function buildSortedQueryString(params) {
  return Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
}

function signRequest(params, accessKeySecret) {
  const canonicalQuery = buildSortedQueryString(params)
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalQuery)}`
  const signature = crypto
    .createHmac('sha1', accessKeySecret + '&')
    .update(stringToSign)
    .digest('base64')
  return { canonicalQuery, signature }
}

async function createNlsToken() {
  if (!nls || !nls.accessKeyId) {
    throw new Error('请配置环境变量 NLS_ACCESS_KEY_ID、NLS_ACCESS_KEY_SECRET、NLS_APPKEY，或创建 common/config/config.local.js')
  }

  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedTokenExpiresAt - now > 30) {
    return { token: cachedToken, expireTime: cachedTokenExpiresAt }
  }

  const params = {
    AccessKeyId: nls.accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: String(Date.now()) + String(Math.random()).slice(2, 8),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    Version: '2019-02-28'
  }

  const { canonicalQuery, signature } = signRequest(params, nls.accessKeySecret)
  const url = `https://nls-meta.cn-shanghai.aliyuncs.com/?${canonicalQuery}&Signature=${percentEncode(signature)}`

  const response = await uniCloud.httpclient.request(url, {
    method: 'GET',
    dataType: 'json',
    timeout: 10000
  })

  const data = response.data
  console.log('[asr-config] CreateToken response:', JSON.stringify(data))
  if (!data || !data.Token || !data.Token.Id) {
    const errMsg = (data && data.Message) || '获取 NLS Token 失败'
    throw new Error(errMsg)
  }

  cachedToken = data.Token.Id
  cachedTokenExpiresAt = data.Token.ExpireTime || (now + 600)

  return { token: cachedToken, expireTime: cachedTokenExpiresAt }
}

exports.main = async (event = {}) => {
  try {
    const { token, expireTime } = await createNlsToken()
    console.log('[asr-config] returning token length:', token ? token.length : 0, 'appkey:', nls.appkey ? nls.appkey.substring(0, 6) + '...' : 'EMPTY', 'wsUrl:', nls.wsUrl)
    return {
      code: 0,
      data: {
        token,
        appkey: nls.appkey,
        wsUrl: nls.wsUrl,
        expireTime
      }
    }
  } catch (error) {
    console.error('[asr-config] error:', error.message)
    return {
      code: -1,
      msg: error.message || '语音配置获取失败'
    }
  }
}
