<template>
  <view class="container">
    <!-- 头部信息 -->
    <view class="header">
      <text class="title">{{ title }}</text>
      <text class="author" v-if="author">{{ dynasty ? dynasty + ' · ' : '' }}{{ author }}</text>
    </view>

    <!-- 准确率 -->
    <view class="accuracy-card">
      <view class="accuracy-row">
        <text class="accuracy-label">准确率</text>
        <text class="accuracy-value">{{ accuracy }}%</text>
      </view>
      <view class="progress-bar">
        <view class="progress-fill" :style="{ width: accuracy + '%' }"></view>
      </view>
    </view>

    <!-- 拍照原图（横向展示） -->
    <view class="section-card" v-if="imageUrl">
      <view class="section-label">默写照片（点击查看大图）</view>
      <scroll-view class="photo-scroll" scroll-x>
        <image
          class="photo-preview"
          :src="imageUrl"
          mode="heightFix"
          @tap="previewImage"
        />
      </scroll-view>
    </view>

    <!-- 逐字批改 -->
    <view class="section-card">
      <view class="section-label">批改详情</view>
      <view class="diff-content">
        <text
          v-for="(item, idx) in diffResult"
          :key="idx"
          :class="['diff-char', 'diff-' + item.status]"
        >{{ item.status === 'missing' ? '＿' : item.char }}</text>
      </view>
      <view class="legend">
        <text class="legend-correct">● 正确</text>
        <text class="legend-wrong">● 错误</text>
        <text class="legend-missing">● 漏写</text>
      </view>
    </view>

    <!-- 错字详情 -->
    <view class="section-card" v-if="wrongDetails.length > 0">
      <view class="section-label">错字详情</view>
      <view class="wrong-list">
        <view class="wrong-item" v-for="(item, idx) in wrongDetails" :key="idx">
          <text class="wrong-original">{{ item.char }}</text>
          <text class="wrong-arrow">→</text>
          <text class="wrong-written">{{ item.recognized }}</text>
        </view>
      </view>
    </view>

    <!-- 识别文字 -->
    <view class="section-card">
      <view class="section-label">识别文字</view>
      <text class="recognized-text">{{ recognizedText || '（无识别内容）' }}</text>
    </view>

    <!-- 操作按钮 -->
    <view class="action-area">
      <button class="btn btn-primary" @tap="checkAgain">再次检查</button>
      <button class="btn btn-secondary" @tap="goBack">返回默写</button>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      title: '',
      author: '',
      dynasty: '',
      originalText: '',
      recognizedText: '',
      diffResult: [],
      accuracy: 0,
      imageUrl: '',
      articleId: ''
    }
  },
  computed: {
    wrongDetails() {
      return this.diffResult.filter(d => d.status === 'wrong' && d.recognized)
    }
  },
  onLoad(options) {
    if (options.recordId) {
      this.loadRecordDetail(options.recordId)
      return
    }
    const app = getApp()
    const result = app.globalData && app.globalData.dictationCheckResult
    if (!result) {
      uni.showToast({ title: '无批改数据', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 1500)
      return
    }
    this.title = result.title || ''
    this.author = result.author || ''
    this.dynasty = result.dynasty || ''
    this.originalText = result.originalText || ''
    this.recognizedText = result.recognizedText || ''
    this.diffResult = result.diffResult || []
    this.accuracy = result.accuracy || 0
    this.imageUrl = result.imageUrl || ''
    this.articleId = result.articleId || ''
  },
  methods: {
    async loadRecordDetail(recordId) {
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: { action: 'detail', data: { id: recordId } }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          uni.showToast({ title: result.msg || '记录加载失败', icon: 'none' })
          setTimeout(() => uni.navigateBack(), 1500)
          return
        }
        const r = result.data
        this.title = r.text_title || ''
        this.author = r.text_author || ''
        this.dynasty = r.text_dynasty || ''
        this.originalText = r.original_text || ''
        this.recognizedText = r.recognized_text || ''
        this.diffResult = Array.isArray(r.diff_result) ? r.diff_result : []
        this.accuracy = Number(r.accuracy) || 0
        this.imageUrl = r.image_url || ''
        this.articleId = r.article_id || ''
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 1500)
      }
    },
    previewImage() {
      if (!this.imageUrl) return
      uni.previewImage({
        urls: [this.imageUrl],
        current: this.imageUrl
      })
    },
    checkAgain() {
      uni.navigateBack()
    },
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style scoped>
.container {
  padding: 24rpx;
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}
.header {
  text-align: center;
  margin-bottom: 24rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}
.author {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-top: 8rpx;
}
.accuracy-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.accuracy-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.accuracy-label {
  font-size: 28rpx;
  color: #666;
}
.accuracy-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.progress-bar {
  height: 12rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  border-radius: 6rpx;
  transition: width 0.5s ease;
}
.section-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.section-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 16rpx;
}
.photo-scroll {
  width: 100%;
  white-space: nowrap;
  border-radius: 8rpx;
}
.photo-preview {
  height: 400rpx;
  border-radius: 8rpx;
}
.diff-content {
  line-height: 2.4;
  margin-bottom: 16rpx;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.diff-missing {
  color: #f5222d;
  text-decoration: underline;
}
.diff-punctuation {
  color: #666;
}
.legend {
  display: flex;
  gap: 30rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.legend-correct {
  font-size: 24rpx;
  color: #52c41a;
}
.legend-wrong {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-missing {
  font-size: 24rpx;
  color: #f5222d;
}
.wrong-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.wrong-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  background: #fff2f0;
  border-radius: 8rpx;
}
.wrong-original {
  font-size: 30rpx;
  color: #52c41a;
  font-weight: bold;
}
.wrong-arrow {
  font-size: 24rpx;
  color: #999;
}
.wrong-written {
  font-size: 30rpx;
  color: #f5222d;
  font-weight: bold;
}
.recognized-text {
  font-size: 28rpx;
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
.btn-primary {
  background: #2f6fff;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
