<template>
  <view class="container">
    <view class="list" v-if="list.length > 0">
      <view class="list-item" v-for="item in list" :key="item._id" @click="goRecite(item)">
        <view class="item-header">
          <view class="item-title">{{ item.title }}</view>
          <text class="item-status">{{ getReciteStatus(item) }}</text>
        </view>
        <view class="item-meta">
          <text class="item-author">{{ item.dynasty }} · {{ item.author }}</text>
        </view>
        <view class="item-preview">{{ item.intro || getPreview(item.content, 40) }}</view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-text">该子合集暂无古文</text>
    </view>

    <view class="loading" v-if="loading">
      <text>加载中...</text>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      categoryId: '',
      subcollectionId: '',
      categoryName: '',
      subcollectionName: '',
      list: [],
      loading: false,
      page: 1,
      pageSize: 20,
      total: 0
    }
  },
  onLoad(options) {
    this.categoryId = decodeURIComponent(options.categoryId || '')
    this.subcollectionId = decodeURIComponent(options.subcollectionId || '')
    this.categoryName = decodeURIComponent(options.categoryName || '')
    this.subcollectionName = decodeURIComponent(options.subcollectionName || '')

    if (this.subcollectionName) {
      uni.setNavigationBarTitle({
        title: this.subcollectionName
      })
    }
    this.loadData()
  },
  onPullDownRefresh() {
    this.page = 1
    this.loadData().then(() => uni.stopPullDownRefresh())
  },
  onReachBottom() {
    if (this.list.length < this.total) {
      this.page += 1
      this.loadData(true)
    }
  },
  methods: {
    async loadData(append = false) {
      this.loading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'ancient-search',
          data: {
            action: 'getTextsBySubcollection',
            data: {
              categoryId: this.categoryId,
              subcollectionId: this.subcollectionId,
              page: this.page,
              pageSize: this.pageSize
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || '加载失败')
        }
        const dataList = result.data.list || []
        this.list = append ? [...this.list, ...dataList] : dataList
        this.total = result.data.total || 0
      } catch (e) {
        uni.showToast({
          title: e.message || '加载失败',
          icon: 'none'
        })
      } finally {
        this.loading = false
      }
    },
    getPreview(content, len = 30) {
      if (!content) return ''
      return content.length > len ? `${content.slice(0, len)}...` : content
    },
    getReciteStatus(item) {
      return item && item.recite_status ? item.recite_status : '未背诵'
    },
    goRecite(item) {
      if (!item || !item._id) return
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = item
      uni.navigateTo({
        url: `/pages/ancient/recite?id=${item._id}`
      })
    }
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  min-height: 100vh;
  background: #f5f5f5;
}

.list-item {
  padding: 24rpx;
  margin-bottom: 16rpx;
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.item-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #333;
}

.item-status {
  font-size: 24rpx;
  color: #86909c;
  background: #f2f3f5;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
}

.item-meta {
  margin-bottom: 12rpx;
}

.item-author {
  font-size: 26rpx;
  color: #888;
}

.item-preview {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.empty,
.loading {
  text-align: center;
  padding: 100rpx 0;
  color: #999;
  font-size: 28rpx;
}

.empty-text {
  color: #8a8a8a;
}
</style>
