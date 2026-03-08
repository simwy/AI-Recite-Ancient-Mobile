<template>
  <view class="container">
    <view class="top-tools">
      <view class="font-switch">
        <text class="font-item" :class="{ active: fontSize === 'large' }" @tap="setFontSize('large')">大</text>
        <text class="font-item" :class="{ active: fontSize === 'medium' }" @tap="setFontSize('medium')">中</text>
        <text class="font-item" :class="{ active: fontSize === 'small' }" @tap="setFontSize('small')">小</text>
      </view>
      <view class="right-tools">
        <view v-if="followTotalScore > 0" class="follow-score-badge">
          <text class="follow-score-num">{{ followTotalScore }}</text>
          <text class="follow-score-label">分 {{ followProgress }}</text>
        </view>
      </view>
    </view>

    <view class="article-card">
      <view class="header">
        <text class="title">{{ detail.title || '未命名文章' }}</text>
        <text class="meta">{{ detail.dynasty || '' }}{{ detail.dynasty && detail.author ? ' · ' : '' }}{{ detail.author || '' }}</text>
      </view>

      <scroll-view class="content-area" :class="`font-${fontSize}`" scroll-y scroll-with-animation :scroll-into-view="scrollIntoViewId">
        <view
          v-for="(unit, index) in playUnits"
          :id="`play-unit-${index}`"
          :key="unit.unitId"
          class="sentence-item"
          :class="{
            active: currentUnitIndex === index,
            loading: loadingUnitIndex === index,
            recording: getFollowState(index) === 'recording',
            'follow-done': getFollowState(index) === 'done'
          }"
          @tap="onTapSentence(index)"
        >
          <!-- 跟读完成：逐字着色 -->
          <view v-if="getFollowState(index) === 'done'" class="sentence-text diff-text">
            <text
              v-for="(ch, ci) in getFollowDiffResult(index)"
              :key="ci"
              :class="{
                'diff-correct': ch.status === 'correct' || ch.status === 'homophone',
                'diff-wrong': ch.status === 'wrong' || ch.status === 'missing',
                'diff-punctuation': ch.status === 'punctuation'
              }"
            >{{ ch.char }}</text>
            <text class="follow-accuracy">{{ getFollowAccuracy(index) }}%</text>
            <view v-if="getFollowAccuracy(index) < 80" class="follow-retry-hint">
              <text class="retry-hint-text">请重新朗读</text>
              <view class="follow-retry-btn" @tap.stop="startFollowUnit(index)">
                <text>重试</text>
              </view>
            </view>
          </view>
          <!-- 录音中 -->
          <view v-else-if="getFollowState(index) === 'recording'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-dot">●</text>
              <text class="recording-label">录音中...</text>
            </view>
          </view>
          <!-- 识别中 -->
          <view v-else-if="getFollowState(index) === 'recognizing'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-label">识别中...</text>
            </view>
          </view>
          <!-- 播放TTS中 -->
          <view v-else-if="getFollowState(index) === 'playing'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-label">播放中...</text>
            </view>
          </view>
          <!-- 默认 -->
          <view v-else class="sentence-text">{{ unit.text }}</view>
          <text v-if="loadingUnitIndex === index" class="sentence-tip">正在合成语音...</text>
          <view v-if="getFollowState(index) === 'recording'" class="follow-stop-btn" @tap.stop="stopFollowRecording">
            <text>跟读完成</text>
          </view>
        </view>
        <view v-if="playUnits.length === 0" class="empty-tip">
          <text>暂无可朗读内容</text>
        </view>
      </scroll-view>
    </view>

    <view class="bottom-bar">
      <view class="action-row">
        <view class="clear-btn" @tap="onClearReadProgress">
          <uni-icons type="reload" size="24" color="#4f46e5"></uni-icons>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { diffChars, calcAccuracy } from '@/common/diff.js'
import readBaseMixin from '@/common/readBaseMixin.js'

export default {
  mixins: [readBaseMixin],
  computed: {
    followTotalScore() {
      if (!this.playUnits.length) return 0
      const doneEntries = Object.values(this.followStates).filter(s => s.state === 'done')
      if (!doneEntries.length) return 0
      const sum = doneEntries.reduce((acc, s) => acc + (s.accuracy || 0), 0)
      return Math.round(sum / this.playUnits.length)
    },
    followProgress() {
      const done = Object.values(this.followStates).filter(s => s.state === 'done').length
      return `${done}/${this.playUnits.length}`
    }
  },
  data() {
    return {
      followingUnitIndex: -1,
      followStates: {},
      recording: false,
      stopping: false,
      recorderManager: null,
      useWebRecorder: false,
      webAudioContext: null,
      webMediaStream: null,
      webScriptProcessor: null,
      h5MediaRecorder: null,
      h5AudioChunks: [],
      h5StopPromiseResolver: null,
      asrConfig: null,
      socketTask: null,
      taskId: '',
      taskStarted: false,
      taskFinished: false,
      frameQueue: [],
      finalSentences: [],
      partialSentence: '',
      realtimeText: '',
      waitTaskFinishedResolver: null,
      followStartTime: 0,
      followRecordSaved: false,
      requestingPermission: false
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.initAudioContext()
    this.initRecorder()
    this.loadDetail()
  },
  onUnload() {
    this.stopActiveAudio()
    this.audioPlayResolver = null
    this.closeSocket()
    if (this.useWebRecorder) {
      this.stopWebRecorder()
      this.cleanupH5PcmRecorder()
    }
    if (this.recorderManager && this.recording) {
      try { this.recorderManager.stop() } catch (e) {}
    }
    if (this.audioContext) {
      try { this.audioContext.destroy() } catch (e) {}
      this.audioContext = null
    }
    if (!this.followRecordSaved) {
      this.saveFollowRecord()
    }
  },
  methods: {
    maybeAutoStartRead() {
      if (this.playUnits.length > 0) {
        this.$nextTick(() => { this.startFollowUnit(0) })
      }
    },
    onAudioEnded() {},
    onAudioError() {},
    onTapSentence(index) {
      if (index < 0 || index >= this.playUnits.length) return
      this.startFollowUnit(index)
    },
    onClearReadProgress() {
      this.abortCurrentFollowRecording()
      this.resetReadProgressState()
      this.followStates = {}
      uni.showToast({ title: '已清空跟读进度', icon: 'none' })
    },
    getFollowState(index) {
      return (this.followStates[index] && this.followStates[index].state) || ''
    },
    getFollowDiffResult(index) {
      return (this.followStates[index] && this.followStates[index].diffResult) || []
    },
    getFollowAccuracy(index) {
      return (this.followStates[index] && this.followStates[index].accuracy) || 0
    },

    // ===== 录音权限 =====
    ensureRecordPermission() {
      return new Promise((resolve, reject) => {
        // #ifdef H5
        resolve()
        return
        // #endif
        const doAuthorize = () => {
          uni.authorize({
            scope: 'scope.record',
            success: () => resolve(),
            fail: (err) => {
              const errStr = String((err && (err.errMsg || err.message)) || '')
              const isDenied = /auth deny|denied|拒绝|未授权|scope\.record/i.test(errStr)
              if (!isDenied) { reject(err || new Error('获取录音权限失败')); return }
              uni.showModal({
                title: '需要麦克风权限',
                content: '用于跟读语音识别，请允许使用麦克风。',
                confirmText: '去设置',
                cancelText: '取消',
                success: (res) => {
                  if (!res.confirm) { reject(new Error('未授权录音权限')); return }
                  uni.openSetting({
                    success: (settingRes) => {
                      if (settingRes.authSetting && settingRes.authSetting['scope.record']) { resolve() }
                      else { reject(new Error('未授权录音权限')) }
                    },
                    fail: () => reject(new Error('未授权录音权限'))
                  })
                }
              })
            }
          })
        }
        // #ifdef MP-WEIXIN
        uni.getSetting({
          success: (settingRes) => {
            if (settingRes.authSetting && settingRes.authSetting['scope.record'] === true) { resolve(); return }
            doAuthorize()
          },
          fail: () => doAuthorize()
        })
        // #endif
        // #ifndef MP-WEIXIN
        doAuthorize()
        // #endif
      })
    },

    // ===== 录音器初始化 =====
    initRecorder() {
      // #ifdef H5
      this.useWebRecorder = true
      return
      // #endif
      if (typeof uni.getRecorderManager !== 'function') { this.useWebRecorder = true; return }
      try { this.recorderManager = uni.getRecorderManager() } catch (e) { this.useWebRecorder = true; return }
      if (!this.recorderManager) { this.useWebRecorder = true; return }
      this.recorderManager.onFrameRecorded((res) => { this.sendAudioFrame(res.frameBuffer) })
      this.recorderManager.onStop(() => { this.recording = false; this.handleFollowRecorderStop() })
      this.recorderManager.onError((err) => {
        this.recording = false
        this.closeSocket()
        const msg = (err && err.errMsg) ? err.errMsg : '录音失败'
        uni.showToast({ title: msg.indexOf('record') !== -1 ? '请允许麦克风权限后重试' : '录音失败', icon: 'none', duration: 3000 })
      })
    },

    // ===== ASR 配置与 WebSocket =====
    async loadAsrConfig() {
      if (this.asrConfig) return
      const res = await uniCloud.callFunction({ name: 'gw_asr-config' })
      const result = res.result || {}
      if (result.code !== 0 || !result.data) throw new Error(result.msg || '获取语音配置失败')
      this.asrConfig = result.data
    },
    openSocket() {
      return new Promise((resolve, reject) => {
        let socketUrl = this.asrConfig.wsUrl
        let socketHeader = { Authorization: `${this.asrConfig.tokenType || 'bearer'} ${this.asrConfig.temporaryToken}` }
        // #ifdef H5
        if (!window.isSecureContext) { reject(new Error('H5 录音需要 HTTPS 或 localhost 安全上下文')); return }
        const fallbackRelayWsUrl = this.buildDefaultRelayWsUrl()
        const relayWsUrl = this.asrConfig.relayWsUrl || fallbackRelayWsUrl
        if (!relayWsUrl) { reject(new Error('H5 需要配置 relayWsUrl')); return }
        socketUrl = relayWsUrl
        socketHeader = {}
        // #endif
        this.taskId = this.createTaskId()
        this.socketTask = uni.connectSocket({ url: socketUrl, header: socketHeader, complete: () => {} })
        this.socketTask.onOpen(() => {
          this._openSocketResolver = resolve
          this._openSocketTimer = setTimeout(() => {
            if (this._openSocketResolver) { this._openSocketResolver(); this._openSocketResolver = null }
          }, 5000)
          this.sendRunTask()
        })
        this.socketTask.onMessage(({ data }) => { this.handleSocketMessage(data) })
        this.socketTask.onError((err) => {
          // #ifdef H5
          reject(new Error('H5 WebSocket 连接失败'))
          // #endif
          // #ifndef H5
          reject(err)
          // #endif
        })
        this.socketTask.onClose(() => { this.socketTask = null })
      })
    },
    sendRunTask() {
      if (!this.socketTask) return
      const payload = {
        header: { action: 'run-task', task_id: this.taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio', task: 'asr', function: 'recognition',
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
      this.socketTask.send({ data: JSON.stringify(payload) })
    },
    sendAudioFrame(frameBuffer) {
      if (!frameBuffer || !this.socketTask) return
      if (!this.taskStarted) { this.frameQueue.push(frameBuffer); return }
      this.socketTask.send({ data: frameBuffer })
    },
    flushFrameQueue() {
      if (!this.socketTask || !this.taskStarted || this.frameQueue.length === 0) return
      while (this.frameQueue.length > 0) { this.socketTask.send({ data: this.frameQueue.shift() }) }
    },
    handleSocketMessage(rawData) {
      const decoded = this.decodeSocketData(rawData)
      if (!decoded) return
      let message = decoded
      try { message = JSON.parse(decoded) } catch (e) { return }
      const header = message.header || {}
      const event = header.event
      if (event === 'task-started') {
        this.taskStarted = true
        this.flushFrameQueue()
        if (this._openSocketTimer) { clearTimeout(this._openSocketTimer); this._openSocketTimer = null }
        if (this._openSocketResolver) { this._openSocketResolver(); this._openSocketResolver = null }
        return
      }
      if (event === 'result-generated') {
        this.handleRecognizedSentence(message.payload && message.payload.output && message.payload.output.sentence)
        return
      }
      if (event === 'task-finished') {
        this.taskFinished = true
        if (this.waitTaskFinishedResolver) { this.waitTaskFinishedResolver(); this.waitTaskFinishedResolver = null }
        this.closeSocket()
        return
      }
      if (event === 'task-failed') {
        if (this.waitTaskFinishedResolver) { this.waitTaskFinishedResolver(); this.waitTaskFinishedResolver = null }
        this.closeSocket()
      }
    },
    decodeSocketData(rawData) {
      if (typeof rawData === 'string') return rawData
      if (!(rawData instanceof ArrayBuffer)) return ''
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(rawData)
      const bytes = new Uint8Array(rawData)
      let result = ''
      for (let i = 0; i < bytes.length; i++) { result += String.fromCharCode(bytes[i]) }
      return decodeURIComponent(escape(result))
    },
    handleRecognizedSentence(sentence) {
      if (!sentence || sentence.heartbeat) return
      const text = sentence.text || ''
      if (!text) return
      if (sentence.sentence_end) {
        this.finalSentences.push(text)
        this.partialSentence = ''
        this.realtimeText = this.finalSentences.join('')
        this.checkAutoStopFollow()
      } else {
        this.partialSentence = text
        this.realtimeText = `${this.finalSentences.join('')}${this.partialSentence}`
      }
    },
    checkAutoStopFollow() {
      if (!this.recording || this.followingUnitIndex < 0) return
      if (this._followRecordStartTime && (Date.now() - this._followRecordStartTime < 1500)) return
      this.stopFollowRecording()
    },
    finishTask() {
      return new Promise((resolve) => {
        if (!this.socketTask) { resolve(); return }
        if (this.taskStarted && !this.taskFinished) {
          this.socketTask.send({
            data: JSON.stringify({
              header: { action: 'finish-task', task_id: this.taskId, streaming: 'duplex' },
              payload: { input: {} }
            })
          })
        }
        const timer = setTimeout(() => { this.closeSocket(); resolve() }, 5000)
        this.waitTaskFinishedResolver = () => { clearTimeout(timer); resolve() }
      })
    },
    closeSocket() {
      if (!this.socketTask) return
      try { this.socketTask.close() } catch (e) {}
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('当前浏览器不支持录音')
      const targetSampleRate = this.asrConfig.sampleRate || 16000
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.webAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.webAudioContext.createMediaStreamSource(this.webMediaStream)
      this.webScriptProcessor = this.webAudioContext.createScriptProcessor(4096, 1, 1)
      this.webScriptProcessor.onaudioprocess = (event) => {
        if (!this.recording || !this.socketTask) return
        const inputData = event.inputBuffer.getChannelData(0)
        const pcmBuffer = this.convertFloat32To16kPcm(inputData, this.webAudioContext.sampleRate, targetSampleRate)
        if (pcmBuffer && pcmBuffer.byteLength > 0) this.sendAudioFrame(pcmBuffer)
      }
      source.connect(this.webScriptProcessor)
      this.webScriptProcessor.connect(this.webAudioContext.destination)
    },
    stopWebRecorder() {
      if (this.webScriptProcessor) { this.webScriptProcessor.disconnect(); this.webScriptProcessor.onaudioprocess = null }
      if (this.webMediaStream) { this.webMediaStream.getTracks().forEach(track => track.stop()) }
      if (this.webAudioContext) { this.webAudioContext.close() }
      this.webScriptProcessor = null
      this.webMediaStream = null
      this.webAudioContext = null
    },
    convertFloat32To16kPcm(float32Array, inputSampleRate, outputSampleRate) {
      if (!float32Array || float32Array.length === 0) return null
      const ratio = inputSampleRate / outputSampleRate
      const outputLength = Math.max(1, Math.floor(float32Array.length / ratio))
      const result = new Int16Array(outputLength)
      let offsetResult = 0, offsetBuffer = 0
      while (offsetResult < outputLength) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio)
        let accum = 0, count = 0
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) { accum += float32Array[i]; count++ }
        const sample = count > 0 ? accum / count : 0
        const clamped = Math.max(-1, Math.min(1, sample))
        result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
        offsetResult++
        offsetBuffer = nextOffsetBuffer
      }
      return result.buffer
    },
    async startH5PcmRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('当前浏览器不支持录音')
      if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持 MediaRecorder')
      this.h5AudioChunks = []
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.h5MediaRecorder = new MediaRecorder(this.webMediaStream, { mimeType: 'audio/webm' })
      this.h5MediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) this.h5AudioChunks.push(evt.data)
      }
      this.h5MediaRecorder.onstop = async () => {
        if (!this.stopping) return
        const idx = this.followingUnitIndex
        try {
          uni.showLoading({ title: '语音识别中...' })
          const audioBlob = new Blob(this.h5AudioChunks, { type: 'audio/webm' })
          const audioBase64 = await this.blobToBase64(audioBlob)
          const callRes = await uniCloud.callFunction({ name: 'gw_asr-file-recognize', data: { audioBase64, format: 'webm' } })
          const result = (callRes && callRes.result) || {}
          if (result.code !== 0) throw new Error(result.msg || '识别失败')
          const recognizedText = (result.data && result.data.text) || ''
          this.processFollowResult(idx, recognizedText)
        } catch (error) {
          uni.showToast({ title: error.message || '识别失败', icon: 'none' })
          this.followStates = { ...this.followStates, [idx]: { state: 'error' } }
        } finally {
          uni.hideLoading()
          this.cleanupH5PcmRecorder()
          if (this.h5StopPromiseResolver) { this.h5StopPromiseResolver(); this.h5StopPromiseResolver = null }
        }
      }
      this.h5MediaRecorder.start()
    },
    async stopH5PcmRecorder() {
      if (!this.h5MediaRecorder || this.h5MediaRecorder.state === 'inactive') { this.cleanupH5PcmRecorder(); return }
      await new Promise((resolve) => { this.h5StopPromiseResolver = resolve; this.h5MediaRecorder.stop() })
    },
    cleanupH5PcmRecorder() {
      if (this.webMediaStream) { this.webMediaStream.getTracks().forEach(track => track.stop()) }
      this.webMediaStream = null
      this.h5MediaRecorder = null
      this.h5AudioChunks = []
      this.h5StopPromiseResolver = null
    },
    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => { resolve(String(reader.result || '').split(',')[1] || '') }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    },
    handleFollowRecorderStop() {
      if (!this.stopping) return
      this.processFollowStopWithASR()
    },
    async processFollowStopWithASR() {
      const idx = this.followingUnitIndex
      try {
        uni.showLoading({ title: '正在结束识别...' })
        await this.finishTask()
        uni.hideLoading()
        this.processFollowResult(idx, this.realtimeText)
      } catch (e) {
        uni.hideLoading()
        this.followStates = { ...this.followStates, [idx]: { state: 'error' } }
        uni.showToast({ title: '识别失败', icon: 'none' })
      } finally {
        this.stopping = false
      }
    },
    async startFollowUnit(index) {
      if (!this.followStartTime) { this.followStartTime = Date.now() }
      if (this.recording) { await this.stopFollowRecording(); return }
      this.abortCurrentFollowRecording()
      this.followingUnitIndex = index
      this.followStates = { ...this.followStates, [index]: { state: 'playing' } }
      try {
        await this.playUnit(index)
        if (this.followingUnitIndex !== index) return
        await new Promise(r => setTimeout(r, 500))
        if (this.followingUnitIndex !== index) return
        await this.startFollowRecording(index)
      } catch (e) {
        if (this.followingUnitIndex === index) {
          this.followStates = { ...this.followStates, [index]: { state: 'error' } }
          uni.showToast({ title: e.message || '跟读失败', icon: 'none' })
        }
      }
    },
    async startFollowRecording(index) {
      this.followStates = { ...this.followStates, [index]: { state: 'recording' } }
      this.resetRealtimeState()
      try {
        await this.ensureRecordPermission()
        await this.loadAsrConfig()
        if (this.useWebRecorder) {
          await this.startH5PcmRecorder()
          this.recording = true
          this._followRecordStartTime = Date.now()
        } else {
          this.recording = true
          this._followRecordStartTime = Date.now()
          this.recorderManager.start({
            duration: 30000,
            sampleRate: this.asrConfig.sampleRate || 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'PCM',
            frameSize: 4
          })
          await this.openSocket()
        }
        this._followTimer = setTimeout(() => {
          if (this.recording && this.followingUnitIndex === index) this.stopFollowRecording()
        }, 30000)
        this._silenceTimer = setTimeout(() => {
          if (this.recording && this.followingUnitIndex === index && !this.realtimeText) this.stopFollowRecording()
        }, 8000)
      } catch (e) {
        this.recording = false
        try { this.recorderManager && this.recorderManager.stop() } catch (_) {}
        this.followStates = { ...this.followStates, [index]: { state: 'error' } }
        uni.showToast({ title: e.message || '录音启动失败', icon: 'none' })
      }
    },
    async stopFollowRecording() {
      if (!this.recording) return
      if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null }
      if (this._followTimer) { clearTimeout(this._followTimer); this._followTimer = null }
      this.stopping = true
      const idx = this.followingUnitIndex
      this.followStates = { ...this.followStates, [idx]: { state: 'recognizing' } }
      if (this.useWebRecorder) {
        this.recording = false
        await this.stopH5PcmRecorder()
        this.stopping = false
      } else {
        this.recorderManager.stop()
      }
    },
    abortCurrentFollowRecording() {
      if (this._autoAdvanceTimer) { clearTimeout(this._autoAdvanceTimer); this._autoAdvanceTimer = null }
      if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null }
      if (this._followTimer) { clearTimeout(this._followTimer); this._followTimer = null }
      if (this.recording) {
        this.stopping = false
        this.recording = false
        if (this.useWebRecorder) { this.stopWebRecorder(); this.cleanupH5PcmRecorder() }
        else { try { this.recorderManager.stop() } catch (e) {} }
      }
      this.closeSocket()
      this.resetRealtimeState()
      this.followingUnitIndex = -1
    },
    processFollowResult(index, recognizedText) {
      const unit = this.playUnits[index]
      if (!unit) return
      const originalText = unit.text
      if (!recognizedText || !recognizedText.trim()) {
        this.followStates = { ...this.followStates, [index]: { state: 'done', diffResult: [], accuracy: 0 } }
        return
      }
      const diffResult = diffChars(originalText, recognizedText)
      const accuracy = calcAccuracy(diffResult)
      this.followStates = { ...this.followStates, [index]: { state: 'done', diffResult, accuracy } }
      this.resetRealtimeState()
      if (accuracy >= 80) {
        const nextIndex = index + 1
        const nextState = this.followStates[nextIndex] && this.followStates[nextIndex].state
        if (nextIndex < this.playUnits.length && nextState !== 'done') {
          this._autoAdvanceTimer = setTimeout(() => {
            if (!this.recording) this.startFollowUnit(nextIndex)
          }, 800)
        }
      }
      const doneCount = Object.values(this.followStates).filter(s => s.state === 'done').length
      if (doneCount === this.playUnits.length) this.saveFollowRecord()
    },
    getUniIdToken() {
      const info = uniCloud.getCurrentUserInfo() || {}
      if (!info.token) return ''
      if (info.tokenExpired && info.tokenExpired < Date.now()) return ''
      return info.token
    },
    async saveFollowRecord() {
      if (this.followRecordSaved) return
      if (!this.id || !this.detail.title) return
      const doneEntries = Object.entries(this.followStates).filter(([_, s]) => s.state === 'done')
      if (!doneEntries.length) return
      const totalScore = this.followTotalScore
      const duration = Math.round((Date.now() - this.followStartTime) / 1000)
      const allDiff = []
      const sentenceDetails = []
      for (const [idx, s] of doneEntries) {
        const unit = this.playUnits[Number(idx)]
        allDiff.push(...(s.diffResult || []))
        const wrongChars = (s.diffResult || []).filter(d => d.status === 'wrong' || d.status === 'missing').map(d => d.char)
        sentenceDetails.push({ index: Number(idx), text: unit ? unit.text : '', accuracy: s.accuracy || 0, diff_result: s.diffResult || [], wrong_chars: wrongChars })
      }
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_follow-record',
          data: { action: 'save', uniIdToken, data: { text_id: this.id, text_title: this.detail.title, duration_seconds: duration, accuracy: totalScore, diff_result: allDiff, sentence_details: sentenceDetails } }
        })
        const result = (res && res.result) || {}
        if (result.code === 0) this.followRecordSaved = true
      } catch (e) {
        console.error('[跟读] 保存记录失败:', e)
      }
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.top-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.right-tools {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.font-switch {
  display: flex;
  align-items: center;
  padding: 0 8rpx;
  height: 48rpx;
  border-radius: 24rpx;
  background: #f5f7fa;
}
.font-item {
  min-width: 36rpx;
  text-align: center;
  font-size: 22rpx;
  line-height: 36rpx;
  color: #667085;
  border-radius: 18rpx;
  padding: 0 8rpx;
}
.font-item.active {
  background: #2f6fff;
  color: #fff;
}
.follow-score-badge {
  background: #eef2ff;
  border-radius: 24rpx;
  padding: 4rpx 16rpx;
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.follow-score-num {
  font-size: 28rpx;
  font-weight: 700;
  color: #4f46e5;
}
.follow-score-label {
  font-size: 22rpx;
  color: #667085;
}
.article-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 20rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  color: #1f2937;
  font-weight: 700;
  margin-bottom: 10rpx;
}
.meta {
  display: block;
  font-size: 24rpx;
  color: #667085;
}
.content-area {
  border-top: 1rpx solid #eef2f7;
  padding-top: 16rpx;
  height: 68vh;
}
.sentence-item {
  margin-bottom: 12rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  background: #f8fafc;
  border: 1rpx solid transparent;
}
.sentence-item.active {
  background: #eaf2ff;
  border-color: #9cc1ff;
}
.sentence-item.loading {
  border-color: #f2c94c;
}
.sentence-item.recording {
  border-left: 6rpx solid #fa8c16;
  background: #fff7e6;
}
.sentence-item.follow-done {
  border-left: 6rpx solid #52c41a;
  background: #f6ffed;
}
.sentence-text {
  color: #111827;
  line-height: 1.8;
  word-break: break-all;
}
.sentence-tip {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #b26a00;
}
.content-area.font-small .sentence-text {
  font-size: 30rpx;
}
.content-area.font-medium .sentence-text {
  font-size: 34rpx;
}
.content-area.font-large .sentence-text {
  font-size: 40rpx;
}
.diff-text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong {
  color: #ff4d4f;
  text-decoration: underline;
}
.diff-punctuation {
  color: #999;
}
.follow-accuracy {
  margin-left: 12rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #4f46e5;
}
.follow-retry-hint {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 8rpx;
}
.retry-hint-text {
  font-size: 22rpx;
  color: #ff4d4f;
}
.follow-retry-btn {
  font-size: 22rpx;
  color: #4f46e5;
  padding: 4rpx 16rpx;
  border: 1rpx solid #c7d2fe;
  border-radius: 16rpx;
  background: #eef2ff;
}
.follow-recording-hint {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 8rpx;
}
.recording-dot {
  color: #ff4d4f;
  font-size: 20rpx;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.recording-label {
  font-size: 22rpx;
  color: #fa8c16;
}
.follow-stop-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 12rpx;
  padding: 10rpx 28rpx;
  background: #4f46e5;
  color: #fff;
  font-size: 26rpx;
  border-radius: 28rpx;
}
.follow-stop-btn:active {
  opacity: 0.85;
}
.empty-tip {
  text-align: center;
  color: #98a2b3;
  font-size: 26rpx;
  padding: 32rpx 0;
}
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
}
.clear-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  border: 1rpx solid #c7d2fe;
}
</style>
