// 本文件为配置项说明，请勿提交真实密钥。
// 云函数配置方式二选一：
//
// 方式一：在 uniCloud Web 控制台为各云函数设置「环境变量」：
//   NLS_ACCESS_KEY_ID、NLS_ACCESS_KEY_SECRET、NLS_APPKEY
//   IFLYTEK_TTS_APP_ID、IFLYTEK_TTS_API_KEY、IFLYTEK_TTS_API_SECRET、IFLYTEK_TTS_ENDPOINT
//   BAILIAN_API_KEY
//   OCR_ACCESS_KEY_ID、OCR_ACCESS_KEY_SECRET（可选，不配则复用 NLS 的 AK/SK）
//
// 方式二：本地开发时复制为 config.local.js（已加入 .gitignore），
//   在 config.local.js 中 export 与 index.js 同结构的对象（可直接写死键值），
//   并在 index.js 中优先 require('./config.local')（若存在）。

module.exports = {
  nls: {
    accessKeyId: 'YOUR_ALIYUN_ACCESS_KEY_ID',
    accessKeySecret: 'YOUR_ALIYUN_ACCESS_KEY_SECRET',
    appkey: 'YOUR_NLS_APPKEY',
    wsUrl: 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1',
    tokenExpireSeconds: 600
  },
  iflytekTts: {
    appId: 'YOUR_IFLYTEK_APP_ID',
    apiKey: 'YOUR_IFLYTEK_API_KEY',
    apiSecret: 'YOUR_IFLYTEK_API_SECRET',
    endpoint: 'wss://xxx.cn-huabei-1.xf-yun.com/v1/private/xxx',
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
    apiKey: 'YOUR_BAILIAN_API_KEY',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    timeout: 20000
  },
  bailianVision: {
    apiKey: 'YOUR_BAILIAN_API_KEY',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    timeout: 60000
  },
  ocr: {
    accessKeyId: 'YOUR_ALIYUN_ACCESS_KEY_ID',
    accessKeySecret: 'YOUR_ALIYUN_ACCESS_KEY_SECRET',
    endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com',
    timeout: 30000
  }
}
