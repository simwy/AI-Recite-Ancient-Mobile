<template>
  <view class="container">
    <view class="title-bar-top">
      <view class="correction-btn" @click="goCorrection">
        <uni-icons type="compose" size="16" color="#666" />
        <text class="correction-text">纠错</text>
      </view>
    </view>
    <view class="title-bar">
      <text class="title">{{ textData.title }}</text>
      <text class="meta">{{ textData.dynasty }} · {{ textData.author }}</text>
    </view>

    <view class="content-box" v-if="showArticleContent && textData.content">
      <view class="content-inner" :class="{ collapsed: needExpand && !expanded }">
        <text class="content">{{ textData.content }}</text>
      </view>
      <view v-if="needExpand" class="expand-wrap">
        <text class="expand-btn" @click="expanded = !expanded">{{ expanded ? '收起' : '展开全文' }}</text>
      </view>
    </view>

    <!-- 录音状态 -->
    <view class="status-area">
      <view v-if="recording" class="recording-indicator">
        <text class="recording-dot">●</text>
        <text class="recording-text">录音中... {{ formatTime(duration) }}</text>
      </view>
      <view v-else-if="paused" class="status-text">
        <text>背诵已暂停 {{ formatTime(duration) }}</text>
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
      <!-- 提示区域 -->
      <view class="hint-wrapper">
        <view class="hint-area" v-show="hints.length > 0">
          <view class="hint-label">提示内容：</view>
          <view class="hint-content">
            <text v-for="(h, idx) in hints" :key="idx" class="hint-text">
              {{ h }}
            </text>
          </view>
        </view>
      </view>

      <button
        v-if="!started"
        type="primary"
        class="btn"
        :disabled="requestingPermission"
        @click="startRecite"
      >{{ requestingPermission ? '授权中...' : '开始背诵' }}</button>

      <template v-if="recording">
        <button class="btn btn-hint" @click="showHint">
          提醒我（已用 {{ hintCount }} 次）
        </button>
        <button type="warn" class="btn" @click="stopRecite">
          背诵结束
        </button>
      </template>

      <template v-if="paused">
        <button type="primary" class="btn" @click="resumeRecite">继续背诵</button>
        <button type="warn" class="btn" @click="endFromPause">结束背诵</button>
      </template>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

export default {
  data() {
    return {
      id: '',
      textData: {},
      showArticleContent: true,
      started: false,
      recording: false,
      duration: 0,
      durationTimer: null,
      hintCount: 0,
      hintCharCount: 0,
      hintStartIndex: -1,
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
      h5StopPromiseResolver: null,
      /** 微信等：正在等待用户授权，未真正开始录音，按钮仍为「开始背诵」 */
      requestingPermission: false,
      expanded: false,
      /** 背诵已暂停（静默超时触发），等待用户继续或结束 */
      paused: false,
      /** 静默检测：最后一次收到识别文本的时间戳 */
      lastSpeechTime: 0,
      silenceTimer: null
    }
  },
  computed: {
    needExpand() {
      const content = (this.textData && this.textData.content) || ''
      return content.length > 80
    }
  },
  watch: {
    realtimeText(newVal) {
      if (this.hintStartIndex < 0 || this.hints.length === 0) return
      const originalChars = this.getOriginalChars()
      const hintChars = originalChars.slice(this.hintStartIndex, this.hintStartIndex + this.hintCharCount)
      if (hintChars.length === 0) return

      const realtimeChars = [...(newVal || '')].filter(c => /[\u4e00-\u9fff]/.test(c))
      const hintStr = hintChars.join('')
      const realtimeStr = realtimeChars.join('')

      // 检查 realtimeText 尾部是否包含提示字
      if (realtimeStr.endsWith(hintStr) || realtimeStr.includes(hintStr)) {
        this.hintStartIndex = -1
        this.hintCharCount = 0
        this.hints = []
      }
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    const app = getApp()
    const currentText = app.globalData && app.globalData.currentText
    if (currentText && currentText._id === this.id) {
      this.textData = currentText
    }
    this.loadTextData()
    this.initRecorder()
  },
  onUnload() {
    clearInterval(this.durationTimer)
    this.stopSilenceDetection()
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
    async loadTextData() {
      if (this.textData && this.textData.content) return
      if (!this.id) return
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        const list = (res.result && res.result.data) || []
        if (list.length > 0) {
          this.textData = list[0]
          getApp().globalData = getApp().globalData || {}
          getApp().globalData.currentText = this.textData
        }
      } catch (e) {
        uni.showToast({ title: '文章加载失败', icon: 'none' })
      }
    },
    /** 真机录音前必须已授权麦克风，否则 RecorderManager.start 会报 operateRecorder:fail:start record fail */
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
              if (!isDenied) {
                reject(err || new Error('获取录音权限失败'))
                return
              }
              uni.showModal({
                title: '需要麦克风权限',
                content: '用于实时语音识别与背诵评分，请允许使用麦克风。',
                confirmText: '去设置',
                cancelText: '取消',
                success: (res) => {
                  if (!res.confirm) {
                    reject(new Error('未授权录音权限'))
                    return
                  }
                  uni.openSetting({
                    success: (settingRes) => {
                      if (settingRes.authSetting && settingRes.authSetting['scope.record']) {
                        resolve()
                      } else {
                        reject(new Error('未授权录音权限'))
                      }
                    },
                    fail: () => reject(new Error('未授权录音权限'))
                  })
                }
              })
            }
          })
        }
        // #ifdef MP-WEIXIN
        // 先查是否已授权，避免重复弹窗；已授权时直接 resolve 可减少「授权后仍报请允许麦克风」的时序问题
        uni.getSetting({
          success: (settingRes) => {
            if (settingRes.authSetting && settingRes.authSetting['scope.record'] === true) {
              resolve()
              return
            }
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

      // #ifdef MP-WEIXIN
      console.log('[recite] 使用 RecorderManager（微信原生录音），停止时会调用 stop() 释放麦克风')
      // #endif

      this.recorderManager.onFrameRecorded((res) => {
        this.sendAudioFrame(res.frameBuffer)
      })
      this.recorderManager.onStop((res) => {
        // #ifdef MP-WEIXIN
        console.log('[recite] RecorderManager onStop 已触发，麦克风应已释放')
        // #endif
        this.recording = false
        clearInterval(this.durationTimer)
        this.handleRecorderStop()
      })
      this.recorderManager.onError((err) => {
        this.recording = false
        this.started = false
        clearInterval(this.durationTimer)
        this.closeSocket()
        const msg = (err && err.errMsg) ? err.errMsg : '录音失败'
        uni.showToast({ title: msg.indexOf('record') !== -1 ? '请允许麦克风权限后重试' : '录音失败', icon: 'none', duration: 3000 })
        console.error('录音错误:', err)
      })
    },
    /** 点击「开始背诵」：先仅请求麦克风权限，用户点「允许」后才执行拉配置、建连、开录音，并变为「背诵结束」按钮 */
    async startRecite() {
      if (this.recording) return
      this.showArticleContent = false
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
        this.startSilenceDetection()
        return
        // #endif

        this.requestingPermission = true
        await this.ensureRecordPermission()
        this.requestingPermission = false
        // 用户同意授权后才真正开始：拉配置、建连、开录音，此时按钮会变为「背诵结束」
        await this.doRealStartRecite()
      } catch (err) {
        this.requestingPermission = false
        this.started = false
        this.recording = false
        clearInterval(this.durationTimer)
        this.closeSocket()
        const msg = (err && (err.errMsg || err.message)) || '启动识别失败'
        uni.showToast({ title: msg, icon: 'none', duration: 3000 })
        console.error('启动实时识别失败:', err)
        // #ifdef MP-WEIXIN
        if (/domain|url|合法|request:fail/i.test(String(msg))) {
          console.warn('微信小程序真机 WebSocket 失败时，请到 微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名 → socket合法域名 中添加 ASR 服务域名')
        }
        // #endif
      }
    },
    /** 仅在用户已同意麦克风权限后调用：拉配置、建连、开录音，并置为录音中（按钮变为「背诵结束」） */
    async doRealStartRecite() {
      // #ifdef MP-WEIXIN
      await new Promise(r => setTimeout(r, 200))
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
          frameSize: 5,
          duration: 600000
        })
      }
      this.startSilenceDetection()
    },
    showHint() {
      const originalChars = this.getOriginalChars()
      if (originalChars.length === 0) return

      const pos = this.findRecitePosition()
      if (pos >= originalChars.length) {
        uni.showToast({ title: '已到末尾', icon: 'none' })
        return
      }

      // 同一位置继续追加提示字，不重复计数
      if (this.hintStartIndex === pos) {
        this.hintCharCount++
      } else {
        // 新位置，重置提示
        this.hintStartIndex = pos
        this.hintCharCount = 1
        this.hintCount++
      }

      // 不超过剩余字数
      const maxChars = originalChars.length - pos
      if (this.hintCharCount > maxChars) {
        this.hintCharCount = maxChars
      }

      const hintText = originalChars.slice(pos, pos + this.hintCharCount).join('')
      this.hints = [hintText]
    },
    getOriginalChars() {
      const content = this.textData.content || ''
      return [...content].filter(char => /[\u4e00-\u9fff]/.test(char))
    },
    findRecitePosition() {
      const originalChars = this.getOriginalChars()
      const realtimeChars = [...(this.realtimeText || '')].filter(c => /[\u4e00-\u9fff]/.test(c))
      if (realtimeChars.length === 0) return 0
      if (originalChars.length === 0) return 0

      // 尾部匹配：取 realtimeText 尾部子串，在原文中搜索
      const origStr = originalChars.join('')
      const maxTail = Math.min(realtimeChars.length, 10)
      for (let tailLen = maxTail; tailLen >= 1; tailLen--) {
        const tail = realtimeChars.slice(-tailLen).join('')
        const idx = origStr.lastIndexOf(tail)
        if (idx !== -1) {
          return idx + tailLen
        }
      }
      // 完全匹配不到，回退到 realtimeChars 长度作为粗略位置
      return Math.min(realtimeChars.length, originalChars.length)
    },
    stopRecite() {
      this.stopping = true
      this.stopSilenceDetection()
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
        // #ifdef MP-WEIXIN
        console.log('[recite] 调用 recorderManager.stop()，主动释放麦克风')
        // #endif
        this.recording = false
        clearInterval(this.durationTimer)
        this.recorderManager.stop()
      }
    },
    async handleRecorderStop() {
      if (!this.stopping) return
      uni.showLoading({ title: '正在结束识别...' })
      await this.finishTask()
      uni.hideLoading()
      // #ifdef MP-WEIXIN
      // 再次调用 stop 确保释放麦克风（部分机型 onStop 延迟或未触发时右上角麦克风图标仍会闪）
      if (this.recorderManager) {
        try { this.recorderManager.stop() } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 300))
      // #endif
      this.goResult(this.realtimeText)
    },
    async loadAsrConfig() {
      const res = await uniCloud.callFunction({
        name: 'gw_asr-config'
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

      this.lastSpeechTime = Date.now()

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
      this.hintStartIndex = -1
      this.hintCharCount = 0
      this.hints = []
      this.lastSpeechTime = 0
      this.paused = false
    },
    startSilenceDetection() {
      this.lastSpeechTime = Date.now()
      this.stopSilenceDetection()
      this.silenceTimer = setInterval(() => {
        if (!this.recording || !this.lastSpeechTime) return
        if (Date.now() - this.lastSpeechTime >= 10000) {
          this.handleSilenceTimeout()
        }
      }, 2000)
    },
    stopSilenceDetection() {
      if (this.silenceTimer) {
        clearInterval(this.silenceTimer)
        this.silenceTimer = null
      }
    },
    handleSilenceTimeout() {
      if (!this.recording) return
      this.stopSilenceDetection()
      uni.showToast({ title: '10秒未检测到语音，已自动暂停', icon: 'none', duration: 3000 })
      this.pauseRecite()
    },
    /** 暂停背诵：停录音、关 WebSocket、停计时，但保留已识别文本 */
    pauseRecite() {
      this.stopSilenceDetection()
      clearInterval(this.durationTimer)

      // #ifdef H5
      if (this.h5MediaRecorder && this.h5MediaRecorder.state !== 'inactive') {
        this.h5MediaRecorder.stop()
      }
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach(track => track.stop())
        this.webMediaStream = null
      }
      this.h5MediaRecorder = null
      // #endif

      // #ifndef H5
      if (this.useWebRecorder) {
        this.stopWebRecorder()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
      // #endif

      this.finishTask()
      this.closeSocket()
      this.recording = false
      this.paused = true
    },
    /** 继续背诵：重新建连、开录音，保留已识别文本 */
    async resumeRecite() {
      try {
        // 重置 WebSocket 相关状态，但保留 finalSentences / realtimeText
        this.taskId = ''
        this.taskStarted = false
        this.taskFinished = false
        this.frameQueue = []
        this.waitTaskFinishedResolver = null
        this.paused = false

        // #ifdef H5
        this.recording = true
        this.stopping = false
        this.durationTimer = setInterval(() => { this.duration++ }, 1000)
        await this.startH5PcmRecorder()
        this.startSilenceDetection()
        return
        // #endif

        await this.loadAsrConfig()
        await this.openSocket()
        this.recording = true
        this.stopping = false
        this.durationTimer = setInterval(() => { this.duration++ }, 1000)
        if (this.useWebRecorder) {
          await this.startWebRecorder()
        } else {
          this.recorderManager.start({
            format: this.asrConfig.format || 'pcm',
            sampleRate: this.asrConfig.sampleRate || 16000,
            numberOfChannels: 1,
            frameSize: 5,
            duration: 600000
          })
        }
        this.startSilenceDetection()
      } catch (err) {
        this.recording = false
        this.paused = true
        this.closeSocket()
        const msg = (err && (err.errMsg || err.message)) || '恢复识别失败'
        uni.showToast({ title: msg, icon: 'none', duration: 3000 })
        console.error('恢复背诵失败:', err)
      }
    },
    /** 暂停状态下用户主动结束背诵 */
    endFromPause() {
      this.paused = false
      this.goResult(this.realtimeText)
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
            name: 'gw_asr-file-recognize',
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
    goCorrection() {
      const id = this.id || (this.textData && this.textData._id) || ''
      const title = (this.textData && this.textData.title) || ''
      uni.navigateTo({ url: getFeedbackUrl({ id, title, type: 'recite' }) })
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
  padding-bottom: 360rpx;
  min-height: 100vh;
  background: #f5f5f5;
}
.title-bar-top {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}
.correction-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  background: #f5f5f5;
  border: 1rpx solid #e5e5e5;
}
.correction-text {
  font-size: 22rpx;
  color: #666;
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
.content-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 36rpx 30rpx;
  margin-bottom: 36rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.content-inner {
  overflow: hidden;
}
.content-inner.collapsed {
  max-height: 20vh;
}
.expand-wrap {
  margin-top: 24rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eee;
  text-align: center;
}
.expand-btn {
  font-size: 26rpx;
  color: #4f46e5;
  padding: 8rpx 24rpx;
  background: #eef2ff;
  border-radius: 24rpx;
}
.content {
  font-size: 34rpx;
  color: #333;
  line-height: 2;
  letter-spacing: 1rpx;
}
.hint-wrapper {
  overflow: hidden;
}
.hint-area {
  background: #fffbe6;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
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
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #f5f5f5;
  padding: 20rpx 40rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
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
