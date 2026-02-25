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
  }
}
