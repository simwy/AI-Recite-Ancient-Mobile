<template>
  <view class="container">
    <view class="header">
      <text class="title">{{ detail.title }}</text>
      <text class="meta">{{ detail.dynasty }} · {{ detail.author }}</text>
    </view>

    <view class="content-box">
      <text class="content">{{ detail.content }}</text>
    </view>

    <view class="action-bar">
      <view class="action-row">
        <button class="action-btn btn-read" @click="goRead">
          <uni-icons type="eye" size="18" color="#4f46e5" />
          <text>读文章</text>
        </button>
        <button class="action-btn btn-recite" @click="goRecite">
          <uni-icons type="mic" size="18" color="#0b57d0" />
          <text>背文章</text>
        </button>
        <button class="action-btn btn-dictation" @click="goDictation">
          <uni-icons type="compose" size="18" color="#2563eb" />
          <text>默文章</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      detail: {}
    }
  },
  onLoad(options) {
    this.id = options.id
    this.loadDetail()
  },
  methods: {
    async loadDetail() {
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0]
        }
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    goRecite() {
      // 将古文数据存到全局，避免重复请求
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/recite?id=${this.id}`
      })
    },
    goDictation() {
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/dictation?id=${this.id}`
      })
    },
    goRead() {
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/read?id=${this.id}`
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
  font-size: 44rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
}
.meta {
  font-size: 28rpx;
  color: #888;
}
.content-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.content {
  font-size: 34rpx;
  color: #333;
  line-height: 2;
  letter-spacing: 2rpx;
}
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx 40rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.action-row {
  display: flex;
  gap: 20rpx;
}
.action-btn {
  flex: 1;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: 28rpx;
  padding: 0;
  line-height: 1;
  height: 84rpx;
}
.btn-read {
  color: #4f46e5;
  background: #eef2ff;
  border: 2rpx solid #c7d2fe;
}
.btn-recite {
  color: #0b57d0;
  background: #e8f1ff;
  border: 2rpx solid #bdd5ff;
}
.btn-dictation {
  color: #2563eb;
  background: #eef4ff;
  border: 2rpx solid #c9dcff;
}
</style>