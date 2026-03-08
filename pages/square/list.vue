<template>
  <view class="container">
    <view class="search-bar">
      <uni-search-bar
        v-model="keyword"
        placeholder="在本合集中搜索标题、作者或内容"
        @confirm="onSearch"
        @clear="onClear"
      />
    </view>

    <view class="list" v-if="hasFilteredContent">
      <template v-for="group in filteredGroups" :key="group._id">
        <view v-if="group.list.length > 0" class="group-section">
          <view class="group-title">{{ group.name }}</view>
          <view class="list-item" v-for="item in group.list" :key="item._id" @click="goDetail(item)">
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
      </template>
      <view v-if="filteredUngrouped.length > 0" class="group-section">
        <view class="group-title" v-if="filteredGroups.some(g => g.list.length)">未分组</view>
        <view class="list-item" v-for="item in filteredUngrouped" :key="item._id" @click="goDetail(item)">
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
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-text">{{ keyword ? '未找到匹配的古文' : '该子合集暂无古文' }}</text>
    </view>

    <view class="loading" v-if="loading">
      <text>加载中...</text>
    </view>

    <view class="action-bar">
      <view class="favorite-action" @click="toggleSubcollectionFavorite">
        <uni-icons
          :type="subcollectionFavorited ? 'star-filled' : 'star'"
          size="20"
          :color="subcollectionFavorited ? '#f59e0b' : '#86909c'"
        />
        <text :class="['favorite-text', subcollectionFavorited ? 'active' : '']">
          {{ subcollectionFavorited ? '已收藏该合集' : '收藏该合集' }}
        </text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      keyword: '',
      categoryId: '',
      subcollectionId: '',
      categoryName: '',
      subcollectionName: '',
      groups: [],
      ungrouped: [],
      subcollectionFavorited: false,
      favoriteLoading: false,
      loading: false
    }
  },
  computed: {
    filterByKeyword(list) {
      const k = (this.keyword || '').trim()
      if (!k) return list
      const lower = k.toLowerCase()
      return list.filter((item) => {
        const title = (item.title || '').toLowerCase()
        const author = (item.author || '').toLowerCase()
        const dynasty = (item.dynasty || '').toLowerCase()
        const content = (item.content || '').toLowerCase()
        const intro = (item.intro || '').toLowerCase()
        return (
          title.includes(lower) ||
          author.includes(lower) ||
          dynasty.includes(lower) ||
          content.includes(lower) ||
          intro.includes(lower)
        )
      })
    },
    filteredGroups() {
      return this.groups.map((g) => ({
        ...g,
        list: this.filterByKeyword(g.list)
      }))
    },
    filteredUngrouped() {
      return this.filterByKeyword(this.ungrouped)
    },
    hasFilteredContent() {
      return this.filteredGroups.some((g) => g.list.length > 0) || this.filteredUngrouped.length > 0
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
    this.loadSubcollectionFavoriteStatus()
    this.loadData()
  },
  onShow() {
    this.loadSubcollectionFavoriteStatus()
  },
  onPullDownRefresh() {
    this.loadData().then(() => uni.stopPullDownRefresh())
  },
  methods: {
    onSearch() {
      // 使用 computed filteredList，无需额外操作
    },
    onClear() {
      this.keyword = ''
    },
    getUniIdToken() {
      const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
      if (!currentUserInfo.token) return ''
      if (currentUserInfo.tokenExpired && currentUserInfo.tokenExpired < Date.now()) {
        return ''
      }
      return currentUserInfo.token
    },
    async loadData() {
      this.loading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_ancient-search',
          data: {
            action: 'getTextsBySubcollectionGrouped',
            data: {
              subcollectionId: this.subcollectionId
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || '加载失败')
        }
        this.groups = result.data.groups || []
        this.ungrouped = result.data.ungrouped || []
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
    async loadSubcollectionFavoriteStatus() {
      if (!this.subcollectionId) return
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_ancient-search',
          data: {
            action: 'getSubcollectionFavoriteStatus',
            data: {
              subcollectionId: this.subcollectionId,
              uniIdToken
            },
            uniIdToken
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0 && result.data) {
          this.subcollectionFavorited = !!result.data.favorited
        }
      } catch (e) {
        this.subcollectionFavorited = false
      }
    },
    async toggleSubcollectionFavorite() {
      if (this.favoriteLoading || !this.subcollectionId) return
      this.favoriteLoading = true
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_ancient-search',
          data: {
            action: 'toggleSubcollectionFavorite',
            data: {
              categoryId: this.categoryId,
              subcollectionId: this.subcollectionId,
              subcollectionName: this.subcollectionName,
              uniIdToken
            },
            uniIdToken
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          if (result.msg === '请先登录') {
            uni.showToast({ title: '请先登录后收藏', icon: 'none' })
            return
          }
          throw new Error(result.msg || '操作失败')
        }
        this.subcollectionFavorited = !!result.data.favorited
        uni.showToast({
          title: this.subcollectionFavorited ? '收藏成功' : '已取消收藏',
          icon: 'none'
        })
      } catch (e) {
        uni.showToast({
          title: e.message || '操作失败',
          icon: 'none'
        })
      } finally {
        this.favoriteLoading = false
      }
    },
    goDetail(item) {
      if (!item || !item._id) return
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = item
      uni.navigateTo({
        url: `/pages/ancient/detail?id=${item._id}&title=${encodeURIComponent(item.title || '')}`
      })
    }
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  background: #f5f5f5;
}

.search-bar {
  margin-bottom: 20rpx;
}

.group-section {
  margin-bottom: 32rpx;
}

.group-title {
  font-size: 28rpx;
  color: #666;
  padding: 16rpx 0 12rpx;
  font-weight: 600;
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

.favorite-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 0;
  border-radius: 12rpx;
  background: #fff7e6;
  border: 2rpx solid #ffe6b0;
}

.favorite-text {
  font-size: 24rpx;
  color: #86909c;
}

.favorite-text.active {
  color: #f59e0b;
  font-weight: 600;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 20rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
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
