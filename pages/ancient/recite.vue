<template>
  <view class="container">
    <view class="title-bar">
      <text class="title">{{ textData.title }}</text>
      <text class="meta">{{ textData.dynasty }} · {{ textData.author }}</text>
    </view>

    <!-- 提示区域 -->
    <view class="hint-area" v-if="hints.length > 0">
      <view class="hint-label">提示内容：</view>
      <view class="hint-content">
        <text v-for="(h, idx) in hints" :key="idx" class="hint-text">
          {{ h }}
        </text>
      </view>
    </view>

    <!-- 录音状态 -->
    <view class="status-area">
      <view v-if="recording" class="recording-indicator">
        <text class="recording-dot">●</text>
        <text class="recording-text">录音中... {{ formatTime(duration) }}</text>
      </view>
      <view v-else-if="!started" class="status-text">
        <text>准备好后点击开始背诵</text>
      </view>
      <view v-else class="status-text">
        <text>正在处理录音...</text>
      </view>
    </view>

    <view class="recognized-area" v-if="started">
      <view class="recognized-label">实时识别：</view>
      <text class="recognized-text">{{ realtimeText || '等待识别结果...' }}</text>
    </view>

    <!-- 操作按钮 -->
    <view class="action-area">
      <button
        v-if="!started"
        type="primary"
        class="btn"
        @click="startRecite"
      >开始背诵</button>

      <template v-if="recording">
        <!-- <button class="btn btn-hint" @click="showHint">
          提醒我（已用 {{ hintCount }} 次）
        </button> -->
        <button type="warn" class="btn" @click="stopRecite">
          背诵结束
        </button>
      </template>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      id: '',
      textData: {},
      started: false,
      recording: false,
      duration: 0,
      durationTimer: null,
      hintCount: 0,
      hintCharCount: 0,
      hints: [],
      recorderManager: null,
      socketTask: null,
      asrConfig: null,
      taskId: '',
      taskStarted: false,
      taskFinished: false,
      frameQueue: [],
      finalSentences: [],
      partialSentence: '',
      realtimeText: '',
      stopping: false,
      waitTaskFinishedResolver: null,
      useWebRecorder: false,
      webAudioContext: null,
      webMediaStream: null,
      webScriptProcessor: null,
      h5MediaRecorder: null,
      h5AudioChunks: [],
      h5StopPromiseResolver: null
    }
  },
  onLoad(options) {
    this.id = options.id
    const app = getApp()
    if (app.globalData && app.globalData.currentText) {
      this.textData = app.globalData.currentText
    }
    this.initRecorder()
  },
  onUnload() {
    clearInterval(this.durationTimer)
    // #ifdef H5
    this.cleanupH5PcmRecorder()
    // #endif

    if (this.recording) {
      if (this.useWebRecorder) {
        this.stopWebRecorder()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
    }
    this.closeSocket()
    this.destroyWebRecorder()
  },
  methods: {
    initRecorder() {
      // #ifdef H5
      this.useWebRecorder = true
      return
      // #endif

      if (typeof uni.getRecorderManager !== 'function') {
        this.useWebRecorder = true
        return
      }

      try {
        this.recorderManager = uni.getRecorderManager()
      } catch (e) {
        this.useWebRecorder = true
        return
      }

      if (!this.recorderManager) {
        this.useWebRecorder = true
        return
      }

      this.recorderManager.onFrameRecorded((res) => {
        this.sendAudioFrame(res.frameBuffer)
      })
      this.recorderManager.onStop((res) => {
        this.recording = false
        clearInterval(this.durationTimer)
        this.handleRecorderStop()
      })
      this.recorderManager.onError((err) => {
        this.recording = false
        clearInterval(this.durationTimer)
        this.closeSocket()
        uni.showToast({ title: '录音失败', icon: 'none' })
        console.error('录音错误:', err)
      })
    },
    async startRecite() {
      if (this.recording) return
      try {
        this.resetRealtimeState()
        // #ifdef H5
        this.started = true
        this.recording = true
        this.stopping = false
        this.duration = 0
        this.durationTimer = setInterval(() => {
          this.duration++
        }, 1000)
        await this.startH5PcmRecorder()
        return
        // #endif

        await this.loadAsrConfig()
        await this.openSocket()

        this.started = true
        this.recording = true
        this.stopping = false
        this.duration = 0
        this.durationTimer = setInterval(() => {
          this.duration++
        }, 1000)

        if (this.useWebRecorder) {
          await this.startWebRecorder()
        } else {
          this.recorderManager.start({
            format: this.asrConfig.format || 'pcm',
            sampleRate: this.asrConfig.sampleRate || 16000,
            numberOfChannels: 1,
            frameSize: 5
          })
        }
      } catch (err) {
        this.closeSocket()
        uni.showToast({ title: err.message || '启动识别失败', icon: 'none', duration: 3000 })
        console.error('启动实时识别失败:', err)
      }
    },
    showHint() {
      const hintChars = this.getHintChars()
      if (hintChars.length === 0) return
      if (this.hintCharCount >= hintChars.length) {
        uni.showToast({ title: '已无更多提示', icon: 'none' })
        return
      }

      this.hintCharCount++
      const hintText = hintChars.slice(0, this.hintCharCount).join('') + '...'
      this.hints = [hintText]
      this.hintCount++
    },
    getHintChars() {
      const content = this.textData.content || ''
      return [...content].filter(char => /[\u4e00-\u9fff]/.test(char))
    },
    stopRecite() {
      this.stopping = true
      // #ifdef H5
      this.recording = false
      clearInterval(this.durationTimer)
      this.stopH5PcmRecorder()
      return
      // #endif

      if (this.useWebRecorder) {
        this.recording = false
        clearInterval(this.durationTimer)
        this.handleRecorderStop()
        this.stopWebRecorder()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
    },
    async handleRecorderStop() {
      if (!this.stopping) return
      uni.showLoading({ title: '正在结束识别...' })
      await this.finishTask()
      uni.hideLoading()
      this.goResult(this.realtimeText)
    },
    async loadAsrConfig() {
      const res = await uniCloud.callFunction({
        name: 'asr-config'
      })
      const result = res.result || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '获取语音配置失败')
      }
      this.asrConfig = result.data
    },
    openSocket() {
      return new Promise((resolve, reject) => {
        let socketUrl = this.asrConfig.wsUrl
        let socketHeader = {
          Authorization: `${this.asrConfig.tokenType || 'bearer'} ${this.asrConfig.temporaryToken}`
        }

        // #ifdef H5
        if (!window.isSecureContext) {
          reject(new Error('H5 录音需要 HTTPS 或 localhost 安全上下文'))
          return
        }

        const fallbackRelayWsUrl = this.buildDefaultRelayWsUrl()
        const relayWsUrl = this.asrConfig.relayWsUrl || fallbackRelayWsUrl
        if (!relayWsUrl) {
          reject(new Error('H5 需要配置 relayWsUrl，或确保当前站点可用 /asr-relay'))
          return
        }
        socketUrl = relayWsUrl
        socketHeader = {}
        // #endif

        this.taskId = this.createTaskId()
        this.socketTask = uni.connectSocket({
          url: socketUrl,
          header: socketHeader,
          complete: () => {}
        })

        this.socketTask.onOpen(() => {
          this.sendRunTask()
          resolve()
        })

        this.socketTask.onMessage(({ data }) => {
          this.handleSocketMessage(data)
        })

        this.socketTask.onError((err) => {
          // #ifdef H5
          reject(new Error('H5 WebSocket 连接失败，请检查临时Token是否有效，以及当前浏览器是否允许在握手中携带鉴权头'))
          // #endif
          // #ifndef H5
          reject(err)
          // #endif
        })

        this.socketTask.onClose(() => {
          this.socketTask = null
        })
      })
    },
    sendRunTask() {
      if (!this.socketTask) return
      const payload = {
        header: {
          action: 'run-task',
          task_id: this.taskId,
          streaming: 'duplex'
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: this.asrConfig.model || 'paraformer-realtime-v2',
          parameters: {
            format: this.asrConfig.format || 'pcm',
            sample_rate: this.asrConfig.sampleRate || 16000,
            language_hints: this.asrConfig.languageHints || ['zh'],
            punctuation_prediction_enabled: this.asrConfig.punctuationPredictionEnabled !== false,
            inverse_text_normalization_enabled: this.asrConfig.inverseTextNormalizationEnabled !== false
          },
          input: {}
        }
      }
      this.socketTask.send({
        data: JSON.stringify(payload)
      })
    },
    sendAudioFrame(frameBuffer) {
      if (!frameBuffer || !this.socketTask) return
      if (!this.taskStarted) {
        this.frameQueue.push(frameBuffer)
        return
      }
      this.socketTask.send({
        data: frameBuffer
      })
    },
    flushFrameQueue() {
      if (!this.socketTask || !this.taskStarted || this.frameQueue.length === 0) return
      while (this.frameQueue.length > 0) {
        const frame = this.frameQueue.shift()
        this.socketTask.send({ data: frame })
      }
    },
    handleSocketMessage(rawData) {
      const decoded = this.decodeSocketData(rawData)
      if (!decoded) return
      let message = decoded
      try {
        message = JSON.parse(decoded)
      } catch (e) {
        return
      }
      const header = message.header || {}
      const event = header.event

      if (event === 'task-started') {
        this.taskStarted = true
        this.flushFrameQueue()
        return
      }

      if (event === 'result-generated') {
        this.handleRecognizedSentence(message.payload && message.payload.output && message.payload.output.sentence)
        return
      }

      if (event === 'task-finished') {
        this.taskFinished = true
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver()
          this.waitTaskFinishedResolver = null
        }
        this.closeSocket()
        return
      }

      if (event === 'task-failed') {
        console.error('任务失败:', header.error_message || '未知错误')
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver()
          this.waitTaskFinishedResolver = null
        }
        this.closeSocket()
      }
    },
    decodeSocketData(rawData) {
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
    },
    handleRecognizedSentence(sentence) {
      if (!sentence || sentence.heartbeat) return
      const text = sentence.text || ''
      if (!text) return

      if (sentence.sentence_end) {
        this.finalSentences.push(text)
        this.partialSentence = ''
      } else {
        this.partialSentence = text
      }

      this.realtimeText = `${this.finalSentences.join('')}${this.partialSentence}`
    },
    finishTask() {
      return new Promise((resolve) => {
        if (!this.socketTask) {
          resolve()
          return
        }

        if (this.taskStarted && !this.taskFinished) {
          this.socketTask.send({
            data: JSON.stringify({
              header: {
                action: 'finish-task',
                task_id: this.taskId,
                streaming: 'duplex'
              },
              payload: {
                input: {}
              }
            })
          })
        }

        const timer = setTimeout(() => {
          this.closeSocket()
          resolve()
        }, 5000)

        this.waitTaskFinishedResolver = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    },
    closeSocket() {
      if (!this.socketTask) return
      try {
        this.socketTask.close({})
      } catch (e) {
        console.error('关闭 socket 失败:', e)
      }
      this.socketTask = null
    },
    resetRealtimeState() {
      this.taskId = ''
      this.taskStarted = false
      this.taskFinished = false
      this.frameQueue = []
      this.finalSentences = []
      this.partialSentence = ''
      this.realtimeText = ''
      this.waitTaskFinishedResolver = null
    },
    createTaskId() {
      return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    },
    buildDefaultRelayWsUrl() {
      // #ifdef H5
      if (!window.location || !window.location.host) return ''
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProtocol}//${window.location.host}/asr-relay`
      // #endif
      // #ifndef H5
      return ''
      // #endif
    },
    async startWebRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音')
      }

      const targetSampleRate = this.asrConfig.sampleRate || 16000
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.webAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.webAudioContext.createMediaStreamSource(this.webMediaStream)
      this.webScriptProcessor = this.webAudioContext.createScriptProcessor(4096, 1, 1)

      this.webScriptProcessor.onaudioprocess = (event) => {
        if (!this.recording || !this.socketTask) return
        const inputData = event.inputBuffer.getChannelData(0)
        const pcmBuffer = this.convertFloat32To16kPcm(inputData, this.webAudioContext.sampleRate, targetSampleRate)
        if (pcmBuffer && pcmBuffer.byteLength > 0) {
          this.sendAudioFrame(pcmBuffer)
        }
      }

      source.connect(this.webScriptProcessor)
      this.webScriptProcessor.connect(this.webAudioContext.destination)
    },
    async startH5PcmRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音')
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('当前浏览器不支持 MediaRecorder')
      }

      this.h5AudioChunks = []
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })

      this.h5MediaRecorder = new MediaRecorder(this.webMediaStream, {
        mimeType: 'audio/webm'
      })
      this.h5MediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          this.h5AudioChunks.push(evt.data)
        }
      }
      this.h5MediaRecorder.onstop = async () => {
        if (!this.stopping) return
        try {
          uni.showLoading({ title: '语音识别中...' })
          const audioBlob = new Blob(this.h5AudioChunks, { type: 'audio/webm' })
          const audioBase64 = await this.blobToBase64(audioBlob)
          const callRes = await uniCloud.callFunction({
            name: 'asr-file-recognize',
            data: {
              audioBase64,
              format: 'webm'
            }
          })
          const result = callRes.result || {}
          if (result.code !== 0) {
            throw new Error(result.msg || '识别失败')
          }
          this.realtimeText = (result.data && result.data.text) || ''
          this.goResult(this.realtimeText)
        } catch (error) {
          uni.showToast({ title: error.message || '识别失败', icon: 'none' })
          console.error('H5 文件识别失败:', error)
        } finally {
          uni.hideLoading()
          this.cleanupH5PcmRecorder()
          if (this.h5StopPromiseResolver) {
            this.h5StopPromiseResolver()
            this.h5StopPromiseResolver = null
          }
        }
      }
      this.h5MediaRecorder.start()
    },
    async stopH5PcmRecorder() {
      if (!this.h5MediaRecorder || this.h5MediaRecorder.state === 'inactive') {
        this.cleanupH5PcmRecorder()
        return
      }
      await new Promise((resolve) => {
        this.h5StopPromiseResolver = resolve
        this.h5MediaRecorder.stop()
      })
    },
    cleanupH5PcmRecorder() {
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach(track => track.stop())
      }
      this.webMediaStream = null
      this.h5MediaRecorder = null
      this.h5AudioChunks = []
      this.h5StopPromiseResolver = null
    },
    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result || ''
          const base64 = String(result).split(',')[1] || ''
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    },
    stopWebRecorder() {
      if (this.webScriptProcessor) {
        this.webScriptProcessor.disconnect()
        this.webScriptProcessor.onaudioprocess = null
      }
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach(track => track.stop())
      }
      if (this.webAudioContext) {
        this.webAudioContext.close()
      }
      this.webScriptProcessor = null
      this.webMediaStream = null
      this.webAudioContext = null
    },
    destroyWebRecorder() {
      this.stopWebRecorder()
    },
    convertFloat32To16kPcm(float32Array, inputSampleRate, outputSampleRate) {
      if (!float32Array || float32Array.length === 0) return null
      const ratio = inputSampleRate / outputSampleRate
      const outputLength = Math.max(1, Math.floor(float32Array.length / ratio))
      const result = new Int16Array(outputLength)
      let offsetResult = 0
      let offsetBuffer = 0

      while (offsetResult < outputLength) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio)
        let accum = 0
        let count = 0
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
          accum += float32Array[i]
          count++
        }
        const sample = count > 0 ? accum / count : 0
        const clamped = Math.max(-1, Math.min(1, sample))
        result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
        offsetResult++
        offsetBuffer = nextOffsetBuffer
      }

      return result.buffer
    },
    goResult(recognizedText) {
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.reciteResult = {
        textData: this.textData,
        recognizedText,
        hintCount: this.hintCount,
        duration: Number(this.duration) || 0
      }
      uni.redirectTo({
        url: `/pages/ancient/result?id=${this.id}`
      })
    },
    formatTime(seconds) {
      const m = Math.floor(seconds / 60)
      const s = seconds % 60
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
  }
}
</script>

<style scoped>
.container {
  padding: 40rpx;
  min-height: 100vh;
  background: #f5f5f5;
}
.title-bar {
  text-align: center;
  margin-bottom: 60rpx;
}
.title {
  display: block;
  font-size: 44rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}
.meta {
  font-size: 28rpx;
  color: #888;
}
.hint-area {
  background: #fffbe6;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 40rpx;
  border-left: 6rpx solid #faad14;
}
.hint-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 12rpx;
}
.hint-text {
  display: block;
  font-size: 32rpx;
  color: #333;
  line-height: 1.8;
}
.status-area {
  text-align: center;
  margin-bottom: 60rpx;
  padding: 40rpx 0;
}
.recording-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}
.recording-dot {
  color: #e74c3c;
  font-size: 40rpx;
  margin-right: 12rpx;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.recording-text {
  font-size: 32rpx;
  color: #333;
}
.status-text {
  font-size: 30rpx;
  color: #999;
}
.recognized-area {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 30rpx;
}
.recognized-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 12rpx;
}
.recognized-text {
  display: block;
  font-size: 30rpx;
  color: #333;
  line-height: 1.8;
  min-height: 80rpx;
}
.action-area {
  padding: 0 20rpx;
}
.btn {
  width: 100%;
  margin-bottom: 24rpx;
  border-radius: 12rpx;
}
.btn-hint {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
