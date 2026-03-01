module.exports = {
  aliyunParaformer: {
    wsUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
    relayWsUrl: '',
    apiKey: 'sk-2a5626f893bf4455825b04cee41a879d',
    tokenExpireSeconds: 600,
    model: 'paraformer-realtime-v2',
    sampleRate: 16000,
    format: 'pcm',
    languageHints: ['zh'],
    punctuationPredictionEnabled: true,
    inverseTextNormalizationEnabled: true
  },
  iflytekAsr: {
    // 默认使用实时语音转写标准版，保留大模型版配置用于后续切换
    useStandardRtasr: false,
    standard: {
      endpoint: 'wss://rtasr.xfyun.cn/v1/ws',
      appId: '43758daa',
      apiKey: '06df65940f5b99c189f5b08f58557880',
      lang: 'cn',
      punc: 1,
      frameBytes: 1280,
      frameIntervalMs: 40,
      sampleRate: 16000,
      timeout: 20000
    },
    llm: {
      endpoint: 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1',
      appId: '43758daa',
      apiKey: '42e35e0d9251ad92ce0090d8bb84e3f8',
      apiSecret: 'ZjE4ZmJhOTFhYjhjYzE5NTk2NGViZjIy',
      uuidPrefix: 'gw-read',
      sampleRate: 16000,
      audioEncode: 'pcm_s16le',
      lang: 'autodialect',
      frameBytes: 1280,
      frameIntervalMs: 40,
      timeout: 20000,
      utcOffset: '+0800'
    }
  },
  iflytekTts: {
    appId: '43758daa',
    apiKey: '42e35e0d9251ad92ce0090d8bb84e3f8',
    apiSecret: 'ZjE4ZmJhOTFhYjhjYzE5NTk2NGViZjIy',
    endpoint: 'wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6',
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
    apiKey: 'sk-2a5626f893bf4455825b04cee41a879d',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    timeout: 20000
  }
}
