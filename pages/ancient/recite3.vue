<template>
  <view class="container">
    <view class="title-bar">
      <text class="title">{{ textData.title }}</text>
      <text class="meta">{{ textData.dynasty }} · {{ textData.author }}</text>
    </view>

    <view class="content-box" v-if="textData.content">
      <text class="content">{{ textData.content }}</text>
    </view>

    <view class="action-area">
      <button type="primary" class="btn" @click="onFeaturePending">开始背诵</button>
      <button type="warn" class="btn" @click="onFeaturePending">背诵结束</button>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      textData: {}
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
    onFeaturePending() {
      uni.showToast({ title: '暂未开发本功能', icon: 'none' })
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

.action-area {
  padding: 0 20rpx;
}

.btn {
  width: 100%;
  margin-bottom: 24rpx;
  border-radius: 12rpx;
}
</style>
