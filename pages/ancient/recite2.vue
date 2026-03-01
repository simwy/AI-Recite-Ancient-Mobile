<template>
  <view class="container">
    <view class="title-bar">
      <text class="title">{{ textData.title }}</text>
      <text class="meta">{{ textData.dynasty }} · {{ textData.author }}</text>
    </view>

    <view class="content-box" v-if="textData.content">
      <template v-if="compareChars.length > 0">
        <text
          v-for="(item, index) in compareChars"
          :key="`${index}-${item.char}`"
          :class="['content', getCompareClass(item)]"
        >
          {{ item.char }}
        </text>
      </template>
      <text v-else class="content">{{ textData.content }}</text>
    </view>

    <view class="recognized-box" v-if="recognizedText">
      <text class="recognized-label">识别结果：</text>
      <text class="recognized-text">{{ recognizedText }}</text>
    </view>

    <view class="action-area">
      <button
        :type="isRecording ? 'warn' : 'primary'"
        class="btn"
        :disabled="isRecognizing"
        @click="onRecordButtonClick"
      >
        {{ isRecording ? '结束背诵' : '开始背诵' }}
      </button>
      <text class="status-text">{{ statusText }}</text>
    </view>
  </view>
</template>

<script>
import { diffChars } from '@/common/diff.js'

const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      textData: {},
      recorderManager: null,
      isRecording: false,
      isRecognizing: false,
      recognizedText: '',
      compareChars: []
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
    if (this.isRecording && this.recorderManager) {
      this.recorderManager.stop()
    }
  },
  computed: {
    statusText() {
      if (this.isRecognizing) return '语音识别中，请稍候...'
      if (this.isRecording) return '录音中，再次点击按钮结束'
      if (this.recognizedText) return '识别完成，可重新录音'
      return '点击按钮后开始录音'
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
    initRecorder() {
      if (typeof uni.getRecorderManager !== 'function') {
        uni.showToast({ title: '当前环境不支持录音', icon: 'none' })
        return
      }

      this.recorderManager = uni.getRecorderManager()
      this.recorderManager.onStop((res) => {
        this.isRecording = false
        const tempFilePath = res && res.tempFilePath
        if (!tempFilePath) {
          uni.showToast({ title: '录音文件生成失败', icon: 'none' })
          return
        }
        this.recognizeByIflytek(tempFilePath)
      })
      this.recorderManager.onError((err) => {
        this.isRecording = false
        uni.showToast({ title: '录音失败，请重试', icon: 'none' })
        console.error('录音失败:', err)
      })
    },
    onRecordButtonClick() {
      if (this.isRecognizing || !this.recorderManager) return
      if (this.isRecording) {
        this.recorderManager.stop()
        return
      }

      this.recognizedText = ''
      this.compareChars = []
      this.isRecording = true
      this.recorderManager.start({
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000
      })
    },
    async recognizeByIflytek(filePath) {
      this.isRecognizing = true
      uni.showLoading({ title: '识别中...', mask: true })
      try {
        const cloudPath = `recite-audio/${Date.now()}-${Math.floor(Math.random() * 100000)}.mp3`
        const uploadRes = await uniCloud.uploadFile({
          cloudPath,
          filePath
        })
        const fileID = uploadRes && uploadRes.fileID
        if (!fileID) {
          throw new Error('音频上传失败')
        }

        const callRes = await uniCloud.callFunction({
          name: 'gw_asr-file-recognize-iflytek',
          data: { fileID }
        })
        const result = (callRes && callRes.result) || {}
        if (Number(result.code) !== 0) {
          throw new Error(result.msg || '语音识别失败')
        }

        const text = ((result.data && result.data.text) || '').trim()
        this.recognizedText = text
        this.compareChars = diffChars(this.textData.content || '', text)
      } catch (error) {
        uni.showToast({ title: error.message || '识别失败', icon: 'none', duration: 2500 })
        console.error('讯飞识别失败:', error)
      } finally {
        this.isRecognizing = false
        uni.hideLoading()
      }
    },
    getCompareClass(item) {
      if (!item || item.status === 'punctuation') return ''
      return item.status === 'correct' ? 'char-correct' : 'char-wrong'
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

.content-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 36rpx 30rpx;
  margin-bottom: 36rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.content {
  font-size: 34rpx;
  color: #333;
  line-height: 2;
  letter-spacing: 1rpx;
}

.char-correct {
  color: #f5222d;
}

.char-wrong {
  color: #52c41a;
}

.recognized-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 36rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.recognized-label {
  display: block;
  font-size: 28rpx;
  color: #999;
  margin-bottom: 12rpx;
}

.recognized-text {
  font-size: 32rpx;
  line-height: 1.8;
  color: #333;
}

.action-area {
  padding: 0 20rpx;
  text-align: center;
}

.btn {
  width: 100%;
  margin-bottom: 24rpx;
  border-radius: 12rpx;
}

.status-text {
  font-size: 26rpx;
  color: #888;
}
</style>
