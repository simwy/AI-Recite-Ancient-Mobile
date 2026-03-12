// 敏感配置从环境变量读取，请在 uniCloud 控制台为云函数配置环境变量。
// 本地开发可创建 config.local.js（已 gitignore）导出同结构对象，会优先使用。
// 参考 config.example.js 中的环境变量名。

function env(key, fallback = '') {
  return (typeof process !== 'undefined' && process.env && process.env[key]) || fallback
}

try {
  const local = require('./config.local.js')
  if (local && typeof local === 'object') {
    module.exports = local
    return
  }
} catch (e) { /* 无 config.local.js 时使用下方 env 配置 */ }

module.exports = {
  nls: {
    get accessKeyId() { return env('NLS_ACCESS_KEY_ID') },
    get accessKeySecret() { return env('NLS_ACCESS_KEY_SECRET') },
    get appkey() { return env('NLS_APPKEY') },
    wsUrl: 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1',
    tokenExpireSeconds: 600
  },
  iflytekTts: {
    get appId() { return env('IFLYTEK_TTS_APP_ID') },
    get apiKey() { return env('IFLYTEK_TTS_API_KEY') },
    get apiSecret() { return env('IFLYTEK_TTS_API_SECRET') },
    get endpoint() { return env('IFLYTEK_TTS_ENDPOINT', 'wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/xxx') },
    defaultVoice: 'x6_lingyufei_pro',
    defaultSpeed: 50,
    defaultPitch: 50,
    defaultVolume: 50,
    defaultOralLevel: 'mid',
    defaultSparkAssist: 1,
    defaultStopSplit: 0,
    defaultRemain: 0,
    defaultBgs: 0,
    defaultReg: 0,
    defaultRdn: 0,
    defaultRhy: 0,
    defaultWatermark: 0,
    defaultImplicitWatermark: false,
    defaultEncoding: 'lame',
    defaultSampleRate: 24000,
    defaultChannels: 1,
    defaultBitDepth: 16,
    defaultFrameSize: 0,
    timeout: 20000
  },
  bailianPoemSearch: {
    get apiKey() { return env('BAILIAN_API_KEY') },
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    timeout: 20000
  },
  bailianVision: {
    get apiKey() { return env('BAILIAN_API_KEY') },
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    timeout: 60000
  }
}
