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
  bailianPoemSearch: {
    apiKey: 'sk-2a5626f893bf4455825b04cee41a879d',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    timeout: 20000
  }
}
