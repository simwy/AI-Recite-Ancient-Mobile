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

    <!-- 操作按钮 -->
    <view class="action-area">
      <button
        v-if="!started"
        type="primary"
        class="btn"
        @click="startRecite"
      >开始背诵</button>

      <template v-if="recording">
        <button class="btn btn-hint" @click="showHint">
          提醒我（已用 {{ hintCount }} 次）
        </button>
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
      hintIndex: 0,
      hintCharCount: 0,
      hints: [],
      recorderManager: null
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
    if (this.recording && this.recorderManager) {
      this.recorderManager.stop()
    }
  },
  methods: {
    initRecorder() {
      this.recorderManager = uni.getRecorderManager()
      this.recorderManager.onStop((res) => {
        this.recording = false
        clearInterval(this.durationTimer)
        this.processRecording(res.tempFilePath)
      })
      this.recorderManager.onError((err) => {
        this.recording = false
        clearInterval(this.durationTimer)
        uni.showToast({ title: '录音失败', icon: 'none' })
        console.error('录音错误:', err)
      })
    },
    startRecite() {
      this.started = true
      this.recording = true
      this.duration = 0
      this.durationTimer = setInterval(() => {
        this.duration++
      }, 1000)
      this.recorderManager.start({
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1
      })
    },
    showHint() {
      const paragraphs = this.textData.paragraphs || []
      if (paragraphs.length === 0) return

      if (this.hintIndex >= paragraphs.length) {
        uni.showToast({ title: '已无更多提示', icon: 'none' })
        return
      }

      const currentSentence = paragraphs[this.hintIndex]
      this.hintCharCount++

      if (this.hintCharCount > currentSentence.length) {
        this.hintIndex++
        this.hintCharCount = 1
        if (this.hintIndex >= paragraphs.length) {
          this.hintCount++
          return
        }
        const nextSentence = paragraphs[this.hintIndex]
        this.hints.push(nextSentence.slice(0, 1) + '...')
      } else {
        const hintText = currentSentence.slice(0, this.hintCharCount) + '...'
        if (this.hints.length > 0 && this.hintIndex === this.hints.length - 1 + (this.hintCharCount > 1 ? 0 : 1)) {
          // 更新当前句的提示
          const lastIdx = this.hints.length - 1
          if (lastIdx >= 0) {
            this.hints[lastIdx] = hintText
            this.hints = [...this.hints]
          }
        } else {
          this.hints.push(hintText)
        }
      }
      this.hintCount++
    },
    stopRecite() {
      this.recorderManager.stop()
    },
    processRecording(filePath) {
      uni.showLoading({ title: '语音识别中...' })
      // #ifdef APP-PLUS
      this.appSpeechRecognize(filePath)
      // #endif
      // #ifdef MP-WEIXIN
      this.wxSpeechRecognize(filePath)
      // #endif
    },
    appSpeechRecognize(filePath) {
      if (plus.speech) {
        plus.speech.startRecognize({
          engine: 'iFly',
          lang: 'zh-cn',
          'userInterface': false,
          nbest: 1
        }, (text) => {
          uni.hideLoading()
          this.goResult(text)
        }, (err) => {
          uni.hideLoading()
          uni.showToast({ title: '识别失败', icon: 'none' })
          console.error('语音识别错误:', err)
        })
      }
    },
    wxSpeechRecognize(filePath) {
      const plugin = requirePlugin('WechatSI')
      plugin.manager = plugin.getRecordRecognitionManager()
      // 微信同声传译：直接用文件识别
      uni.uploadFile({
        url: '', // 需配置实际地址或使用插件
        filePath,
        name: 'file',
        success: () => {
          uni.hideLoading()
          // fallback: 暂用空文本
          this.goResult('')
        },
        fail: () => {
          uni.hideLoading()
          this.goResult('')
        }
      })
    },
    goResult(recognizedText) {
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.reciteResult = {
        textData: this.textData,
        recognizedText,
        hintCount: this.hintCount
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
