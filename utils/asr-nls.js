/**
 * Aliyun ISI NLS Real-time Speech Recognition Client
 * 封装阿里云智能语音交互 (NLS) 实时语音识别 WebSocket 协议
 */

const NAMESPACE = 'SpeechTranscriber'

const STATE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  TRANSCRIBING: 'transcribing',
  STOPPING: 'stopping',
  CLOSED: 'closed'
}

function uuid32() {
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) {
    s += hex.charAt(Math.floor(Math.random() * 16))
  }
  return s
}

function buildDirective(name, taskId, appkey, payload) {
  return JSON.stringify({
    header: {
      message_id: uuid32(),
      task_id: taskId,
      namespace: NAMESPACE,
      name,
      appkey
    },
    payload: payload || {}
  })
}

class NlsAsrClient {
  /**
   * @param {Object} options
   * @param {string} options.url - NLS WebSocket URL (含 token 参数)
   * @param {string} options.appkey - NLS appkey
   * @param {Object} [options.params] - StartTranscription 额外参数
   * @param {Function} [options.onStarted] - TranscriptionStarted 回调
   * @param {Function} [options.onResultChanged] - 中间识别结果回调 (text, payload)
   * @param {Function} [options.onSentenceEnd] - 一句话结束回调 (text, payload)
   * @param {Function} [options.onCompleted] - TranscriptionCompleted 回调
   * @param {Function} [options.onError] - 错误回调 (error)
   * @param {Function} [options.onClose] - 连接关闭回调
   */
  constructor(options) {
    this._url = options.url
    this._appkey = options.appkey
    this._params = Object.assign({
      format: 'pcm',
      sample_rate: 16000,
      enable_intermediate_result: true,
      enable_punctuation_prediction: true,
      enable_inverse_text_normalization: true,
      max_sentence_silence: 800
    }, options.params || {})

    this._onStarted = options.onStarted || (() => {})
    this._onResultChanged = options.onResultChanged || (() => {})
    this._onSentenceEnd = options.onSentenceEnd || (() => {})
    this._onCompleted = options.onCompleted || (() => {})
    this._onError = options.onError || (() => {})
    this._onClose = options.onClose || (() => {})

    this._state = STATE.IDLE
    this._taskId = uuid32()
    this._socketTask = null
    this._frameQueue = []
    this._startResolver = null
    this._startRejector = null
    this._stopResolver = null
    this._stopTimer = null
    this._startTimer = null
  }

  get state() {
    return this._state
  }

  /**
   * 建立 WebSocket 连接并发送 StartTranscription
   * @returns {Promise<void>} TranscriptionStarted 后 resolve
   */
  start() {
    if (this._state !== STATE.IDLE) {
      return Promise.reject(new Error(`Cannot start in state: ${this._state}`))
    }
    this._state = STATE.CONNECTING

    return new Promise((resolve, reject) => {
      this._startResolver = resolve
      this._startRejector = reject

      console.log('[NlsAsrClient] connecting to:', this._url ? this._url.substring(0, 80) + '...' : 'EMPTY URL')
      this._socketTask = uni.connectSocket({
        url: this._url,
        complete: () => {}
      })

      this._socketTask.onOpen(() => {
        this._state = STATE.CONNECTED
        this._sendStartTranscription()
        // 10s 超时等待 TranscriptionStarted
        this._startTimer = setTimeout(() => {
          if (this._startResolver) {
            this._startRejector(new Error('StartTranscription timeout'))
            this._startResolver = null
            this._startRejector = null
            this.destroy()
          }
        }, 10000)
      })

      this._socketTask.onMessage(({ data }) => {
        this._handleMessage(data)
      })

      this._socketTask.onError((err) => {
        console.error('[NlsAsrClient] WebSocket error:', JSON.stringify(err))
        if (this._startRejector) {
          this._startRejector(err || new Error('WebSocket connection failed'))
          this._startResolver = null
          this._startRejector = null
        }
        this._state = STATE.CLOSED
        this._onError(err)
      })

      this._socketTask.onClose(() => {
        this._socketTask = null
        if (this._state !== STATE.CLOSED) {
          this._state = STATE.CLOSED
          this._onClose()
        }
      })
    })
  }

  /**
   * 发送 StopTranscription，等待 TranscriptionCompleted
   * @returns {Promise<void>}
   */
  stop() {
    if (this._state !== STATE.TRANSCRIBING) {
      return Promise.resolve()
    }
    this._state = STATE.STOPPING

    return new Promise((resolve) => {
      this._stopResolver = resolve
      this._sendStopTranscription()
      // 5s 超时
      this._stopTimer = setTimeout(() => {
        if (this._stopResolver) {
          this._stopResolver()
          this._stopResolver = null
        }
        this._close()
      }, 5000)
    })
  }

  /** 强制关闭，释放资源 */
  destroy() {
    this._clearTimers()
    this._frameQueue = []
    this._startResolver = null
    this._startRejector = null
    if (this._stopResolver) {
      this._stopResolver()
      this._stopResolver = null
    }
    this._close()
  }

  /**
   * 发送 PCM 音频帧
   * @param {ArrayBuffer} arrayBuffer
   */
  sendAudio(arrayBuffer) {
    if (!arrayBuffer) return
    if (this._state === STATE.TRANSCRIBING) {
      this._sendBinary(arrayBuffer)
    } else if (this._state === STATE.CONNECTED) {
      // 还在等 TranscriptionStarted，先排队
      this._frameQueue.push(arrayBuffer)
    }
  }

  // ---- Private methods ----

  _sendStartTranscription() {
    const msg = buildDirective('StartTranscription', this._taskId, this._appkey, this._params)
    this._sendText(msg)
  }

  _sendStopTranscription() {
    const msg = buildDirective('StopTranscription', this._taskId, this._appkey)
    this._sendText(msg)
  }

  _flushFrameQueue() {
    while (this._frameQueue.length > 0) {
      this._sendBinary(this._frameQueue.shift())
    }
  }

  _sendText(data) {
    if (!this._socketTask) return
    try { this._socketTask.send({ data }) } catch (e) { /* ignore */ }
  }

  _sendBinary(data) {
    if (!this._socketTask) return
    try { this._socketTask.send({ data }) } catch (e) { /* ignore */ }
  }

  _handleMessage(rawData) {
    const text = this._decodeData(rawData)
    if (!text) return
    let message
    try { message = JSON.parse(text) } catch (e) { return }

    const header = message.header || {}
    const name = header.name
    const payload = message.payload || {}

    if (name === 'TranscriptionStarted') {
      this._state = STATE.TRANSCRIBING
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null }
      this._flushFrameQueue()
      if (this._startResolver) {
        this._startResolver()
        this._startResolver = null
        this._startRejector = null
      }
      this._onStarted(header.task_id)
      return
    }

    if (name === 'TranscriptionResultChanged') {
      const result = payload.result || ''
      this._onResultChanged(result, payload)
      return
    }

    if (name === 'SentenceEnd') {
      const result = payload.result || ''
      this._onSentenceEnd(result, payload)
      return
    }

    if (name === 'TranscriptionCompleted') {
      if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null }
      if (this._stopResolver) {
        this._stopResolver()
        this._stopResolver = null
      }
      this._onCompleted()
      this._close()
      return
    }

    if (name === 'TaskFailed') {
      const errMsg = header.status_text || payload.status_text || 'ASR task failed'
      this._onError(new Error(errMsg))
      if (this._startRejector) {
        this._startRejector(new Error(errMsg))
        this._startResolver = null
        this._startRejector = null
      }
      if (this._stopResolver) {
        this._stopResolver()
        this._stopResolver = null
      }
      this._close()
    }
  }

  _decodeData(rawData) {
    if (typeof rawData === 'string') return rawData
    if (!(rawData instanceof ArrayBuffer)) return ''
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(rawData)
    }
    const bytes = new Uint8Array(rawData)
    let result = ''
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i])
    }
    return decodeURIComponent(escape(result))
  }

  _close() {
    this._clearTimers()
    if (this._socketTask) {
      try { this._socketTask.close() } catch (e) { /* ignore */ }
      this._socketTask = null
    }
    if (this._state !== STATE.CLOSED) {
      this._state = STATE.CLOSED
      this._onClose()
    }
  }

  _clearTimers() {
    if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null }
    if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null }
  }
}

export default NlsAsrClient
