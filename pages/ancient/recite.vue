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
import NlsAsrClient from '@/utils/asr-nls.js'

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
      /** 所有被提示过的原文字符索引（去标点后的索引） */
      hintedIndices: [],
      recorderManager: null,
      asrClient: null,
      asrConfig: null,
      finalSentences: [],
      partialSentence: '',
      realtimeText: '',
      stopping: false,
      useWebRecorder: false,
      webAudioContext: null,
      webMediaStream: null,
      webScriptProcessor: null,
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
    if (this.recording) {
      // #ifdef H5
      this.stopWebRecorder()
      // #endif
      // #ifndef H5
      if (this.useWebRecorder) {
        this.stopWebRecorder()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
      // #endif
    }
    if (this.asrClient) {
      this.asrClient.destroy()
      this.asrClient = null
    }
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

      this.recorderManager.onFrameRecorded((res) => {
        if (this.asrClient) {
          this.asrClient.sendAudio(res.frameBuffer)
        }
      })
      this.recorderManager.onStop((res) => {
        this.recording = false
        clearInterval(this.durationTimer)
        if (this.paused) return
        this.handleRecorderStop()
      })
      this.recorderManager.onError((err) => {
        this.recording = false
        clearInterval(this.durationTimer)
        if (this.asrClient) { this.asrClient.destroy(); this.asrClient = null }
        if (this.paused) return
        this.started = false
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
        this.durationTimer = setInterval(() => { this.duration++ }, 1000)
        await this.loadAsrConfig()
        await this.startAsrClient()
        await this.startWebRecorder()
        this.startSilenceDetection()
        return
        // #endif

        this.requestingPermission = true
        await this.ensureRecordPermission()
        this.requestingPermission = false
        await this.doRealStartRecite()
      } catch (err) {
        this.requestingPermission = false
        this.started = false
        this.recording = false
        clearInterval(this.durationTimer)
        if (this.asrClient) { this.asrClient.destroy(); this.asrClient = null }
        const msg = (err && (err.errMsg || err.message)) || '启动识别失败'
        uni.showToast({ title: msg, icon: 'none', duration: 3000 })
        console.error('启动实时识别失败:', err)
      }
    },
    async doRealStartRecite() {
      // #ifdef MP-WEIXIN
      await new Promise(r => setTimeout(r, 200))
      // #endif
      await this.loadAsrConfig()
      await this.startAsrClient()

      this.started = true
      this.recording = true
      this.stopping = false
      this.duration = 0
      this.durationTimer = setInterval(() => { this.duration++ }, 1000)

      if (this.useWebRecorder) {
        await this.startWebRecorder()
      } else {
        this.recorderManager.start({
          format: 'PCM',
          sampleRate: 16000,
          numberOfChannels: 1,
          frameSize: 5,
          duration: 600000
        })
      }
      this.startSilenceDetection()
    },
    async startAsrClient() {
      const config = this.asrConfig
      this.asrClient = new NlsAsrClient({
        url: `${config.wsUrl}?token=${config.token}`,
        appkey: config.appkey,
        onResultChanged: (text) => {
          this.partialSentence = text
          this.realtimeText = `${this.finalSentences.join('')}${this.partialSentence}`
          this.lastSpeechTime = Date.now()
        },
        onSentenceEnd: (text) => {
          // 优先使用最后一次中间结果（原始转写），而非 SentenceEnd 的语言模型纠正结果
          // 例：用户说"百里"，中间结果正确为"百里"，但 SentenceEnd 会纠正为"千里"
          const rawText = this.partialSentence || text
          this.finalSentences.push(rawText)
          this.partialSentence = ''
          this.realtimeText = this.finalSentences.join('')
          this.lastSpeechTime = Date.now()
        },
        onError: (err) => {
          console.error('ASR error:', err)
        }
      })
      await this.asrClient.start()
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
      // 记录被提示过的原文字符索引
      for (let i = pos; i < pos + this.hintCharCount; i++) {
        if (this.hintedIndices.indexOf(i) === -1) {
          this.hintedIndices.push(i)
        }
      }
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

      const origStr = originalChars.join('')
      // 预期位置：已识别字数（粗略估计当前背到哪里了）
      const expectedPos = Math.min(realtimeChars.length, originalChars.length)
      const maxTail = Math.min(realtimeChars.length, 10)

      for (let tailLen = maxTail; tailLen >= 1; tailLen--) {
        const tail = realtimeChars.slice(-tailLen).join('')
        // 找所有匹配位置，选离预期位置最近的
        let bestIdx = -1
        let bestDist = Infinity
        let searchFrom = 0
        while (true) {
          const idx = origStr.indexOf(tail, searchFrom)
          if (idx === -1) break
          const endPos = idx + tailLen
          const dist = Math.abs(endPos - expectedPos)
          if (dist < bestDist) {
            bestDist = dist
            bestIdx = idx
          }
          searchFrom = idx + 1
        }
        if (bestIdx !== -1) {
          return bestIdx + tailLen
        }
      }
      return expectedPos
    },
    stopRecite() {
      this.stopping = true
      this.stopSilenceDetection()
      this.recording = false
      clearInterval(this.durationTimer)

      // #ifdef H5
      this.stopWebRecorder()
      this.handleRecorderStop()
      return
      // #endif

      if (this.useWebRecorder) {
        this.stopWebRecorder()
        this.handleRecorderStop()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
    },
    async handleRecorderStop() {
      if (!this.stopping) return
      uni.showLoading({ title: '正在结束识别...' })
      if (this.asrClient) {
        await this.asrClient.stop()
        this.asrClient = null
      }
      uni.hideLoading()
      this.goResult(this.realtimeText)
    },
    async loadAsrConfig() {
      const res = await uniCloud.callFunction({ name: 'gw_asr-config' })
      const result = res.result || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '获取语音配置失败')
      }
      this.asrConfig = result.data
    },
    resetRealtimeState() {
      if (this.asrClient) { this.asrClient.destroy(); this.asrClient = null }
      this.finalSentences = []
      this.partialSentence = ''
      this.realtimeText = ''
      this.hintStartIndex = -1
      this.hintCharCount = 0
      this.hints = []
      this.hintedIndices = []
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
    /** 暂停背诵：停录音、关 ASR、停计时，但保留已识别文本 */
    pauseRecite() {
      this.stopSilenceDetection()
      clearInterval(this.durationTimer)

      // #ifdef H5
      this.stopWebRecorder()
      // #endif

      // #ifndef H5
      if (this.useWebRecorder) {
        this.stopWebRecorder()
      } else if (this.recorderManager) {
        this.recorderManager.stop()
      }
      // #endif

      if (this.asrClient) { this.asrClient.destroy(); this.asrClient = null }
      this.recording = false
      this.paused = true
    },
    /** 继续背诵：重新建连、开录音，保留已识别文本 */
    async resumeRecite() {
      try {
        this.paused = false
        await this.loadAsrConfig()
        await this.startAsrClient()

        this.recording = true
        this.stopping = false
        this.durationTimer = setInterval(() => { this.duration++ }, 1000)

        // #ifdef H5
        await this.startWebRecorder()
        this.startSilenceDetection()
        return
        // #endif

        if (this.useWebRecorder) {
          await this.startWebRecorder()
        } else {
          this.recorderManager.start({
            format: 'PCM',
            sampleRate: 16000,
            numberOfChannels: 1,
            frameSize: 5,
            duration: 600000
          })
        }
        this.startSilenceDetection()
      } catch (err) {
        this.recording = false
        this.paused = true
        if (this.asrClient) { this.asrClient.destroy(); this.asrClient = null }
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
    async startWebRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音')
      }

      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.webAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.webAudioContext.createMediaStreamSource(this.webMediaStream)
      this.webScriptProcessor = this.webAudioContext.createScriptProcessor(4096, 1, 1)

      this.webScriptProcessor.onaudioprocess = (event) => {
        if (!this.recording || !this.asrClient) return
        const inputData = event.inputBuffer.getChannelData(0)
        const pcmBuffer = this.convertFloat32To16kPcm(inputData, this.webAudioContext.sampleRate, 16000)
        if (pcmBuffer && pcmBuffer.byteLength > 0) {
          this.asrClient.sendAudio(pcmBuffer)
        }
      }

      source.connect(this.webScriptProcessor)
      this.webScriptProcessor.connect(this.webAudioContext.destination)
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
        duration: Number(this.duration) || 0,
        hintedIndices: this.hintedIndices
      }
      uni.redirectTo({
        url: `/pages/ancient/recite-result?id=${this.id}`
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
