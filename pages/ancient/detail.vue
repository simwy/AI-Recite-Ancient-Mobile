<template>
  <view class="container">
    <view class="header">
      <view class="npm install @fontsource/noto-sans-sc-top">
        <view class="header-placeholder"></view>
        <view class="fav-icon-btn" @click="toggleFavorite">
          <uni-icons
            :type="isFavorited ? 'star-filled' : 'star'"
            size="16"
            :color="isFavorited ? '#d97706' : '#b45309'"
          />
          <text class="fav-icon-text">{{ isFavorited ? '已收藏' : '收藏' }}</text>
        </view>
      </view>
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
          <text>跟读</text>
        </button>
        <button class="action-btn btn-recite" @click="goRecite">
          <uni-icons type="mic" size="18" color="#0b57d0" />
          <text>背诵</text>
        </button>
        <button class="action-btn btn-dictation" @click="goDictation">
          <uni-icons type="compose" size="18" color="#2563eb" />
          <text>默写</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script>
import { store } from '@/uni_modules/uni-id-pages/common/store.js'

const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      detail: {},
      isFavorited: false,
      togglingFavorite: false
    }
  },
  onLoad(options) {
    this.id = options.id
    this.loadDetail()
    this.checkFavorite()
  },
  onShow() {
    this.checkFavorite()
  },
  computed: {
    hasLogin() {
      return store.hasLogin
    }
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
    },
    async checkFavorite() {
      if (!this.id || !this.hasLogin) {
        this.isFavorited = false
        return
      }
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_favorite',
          data: {
            action: 'check',
            data: { text_id: this.id }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0) {
          this.isFavorited = !!(result.data && result.data.favorited)
        }
      } catch (e) {
        console.error('检查收藏状态失败', e)
      }
    },
    async toggleFavorite() {
      if (!this.hasLogin) {
        uni.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      if (!this.id || this.togglingFavorite) return
      this.togglingFavorite = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_favorite',
          data: {
            action: 'toggle',
            data: {
              text_id: this.id,
              text_title: this.detail.title || '',
              text_author: this.detail.author || '',
              text_dynasty: this.detail.dynasty || ''
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || '操作失败')
        }
        this.isFavorited = !!(result.data && result.data.favorited)
        uni.showToast({
          title: this.isFavorited ? '已收藏' : '已取消收藏',
          icon: 'none'
        })
      } catch (e) {
        uni.showToast({
          title: (e && e.message) || '操作失败',
          icon: 'none'
        })
      } finally {
        this.togglingFavorite = false
      }
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
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30rpx;
}
.header-top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  margin-bottom: 4rpx;
}
.header-placeholder {
  width: 1rpx;
  height: 1rpx;
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
.fav-icon-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 1rpx 10rpx;
  border-radius: 18rpx;
  background: #fffbeb;
  border: 1rpx solid #fde68a;
}
.fav-icon-text {
  font-size: 20rpx;
  color: #b45309;
  line-height: 1.2;
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