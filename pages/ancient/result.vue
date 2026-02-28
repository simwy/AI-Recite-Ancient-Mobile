<template>
  <view class="container">
    <view class="header">
      <text class="title">{{ textData.title }}</text>
      <view class="stats">
        <view class="stat-item">
          <text class="stat-value">{{ accuracy }}%</text>
          <text class="stat-label">正确率</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ hintCount }}</text>
          <text class="stat-label">提示次数</text>
        </view>
      </view>
    </view>

    <view class="diff-area">
      <view class="diff-label">对比结果：</view>
      <view class="diff-content">
        <text
          v-for="(item, idx) in diffResult"
          :key="idx"
          :class="['diff-char', 'diff-' + item.status]"
        >{{ item.char }}</text>
      </view>
    </view>

    <view class="legend">
      <text class="legend-correct">● 正确</text>
      <text class="legend-missing">● 遗漏/错误</text>
    </view>

    <view class="recognized-area" v-if="recognizedText">
      <view class="diff-label">识别文字：</view>
      <text class="recognized-text">{{ recognizedText }}</text>
    </view>

    <view class="action-area">
      <button type="primary" class="btn" @click="goReciteAgain">
        再背一次
      </button>
      <button class="btn btn-secondary" @click="goHistory">
        查看历史
      </button>
    </view>
  </view>
</template>

<script>
import { diffChars, calcAccuracy } from '@/common/diff.js'

export default {
  data() {
    return {
      id: '',
      textData: {},
      recognizedText: '',
      hintCount: 0,
      duration: 0,
      diffResult: [],
      accuracy: 0,
      saved: false
    }
  },
  onLoad(options) {
    this.id = options.id
    const app = getApp()
    const result = app.globalData && app.globalData.reciteResult
    if (result) {
      this.textData = result.textData
      this.recognizedText = result.recognizedText
      this.hintCount = result.hintCount
      this.duration = Number(result.duration) || 0
    }
    this.doDiff()
    this.saveRecord()
  },
  methods: {
    doDiff() {
      if (!this.textData.content) return
      this.diffResult = diffChars(
        this.textData.content,
        this.recognizedText
      )
      this.accuracy = calcAccuracy(this.diffResult)
    },
    async saveRecord() {
      if (this.saved) return
      try {
        await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'save',
            data: {
              text_id: this.id,
              text_title: this.textData.title,
              hint_count: this.hintCount,
              duration_seconds: this.duration,
              recognized_text: this.recognizedText,
              diff_result: this.diffResult,
              accuracy: this.accuracy
            }
          }
        })
        this.saved = true
      } catch (e) {
        console.error('保存记录失败:', e)
      }
    },
    goReciteAgain() {
      uni.redirectTo({
        url: `/pages/ancient/recite?id=${this.id}`
      })
    },
    goHistory() {
      uni.switchTab({
        url: '/pages/ancient/history'
      })
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
.header {
  text-align: center;
  margin-bottom: 40rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
}
.stats {
  display: flex;
  justify-content: center;
  gap: 80rpx;
}
.stat-item {
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.stat-label {
  font-size: 24rpx;
  color: #999;
}
.diff-area {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.diff-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 16rpx;
}
.diff-content {
  line-height: 2.2;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-punctuation {
  color: #666;
}
.diff-missing, .diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.legend {
  display: flex;
  gap: 40rpx;
  margin-bottom: 24rpx;
  padding: 0 10rpx;
}
.legend-correct {
  font-size: 24rpx;
  color: #52c41a;
}
.legend-missing {
  font-size: 24rpx;
  color: #f5222d;
}
.recognized-area {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 40rpx;
}
.recognized-text {
  font-size: 30rpx;
  color: #666;
  line-height: 1.8;
}
.action-area {
  padding: 20rpx 0;
}
.btn {
  width: 100%;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
