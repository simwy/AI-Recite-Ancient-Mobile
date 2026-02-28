<template>
  <view class="container">
    <view class="top-tabs">
      <view
        v-for="tab in topTabs"
        :key="tab.key"
        class="top-tab-item"
        :class="{ active: activeTab === tab.key }"
        @tap="switchTab(tab.key)"
      >
        <text class="top-tab-text">{{ tab.label }}</text>
      </view>
    </view>

    <view v-if="!hasLogin" class="login-empty">
      <text class="login-empty-title">登录后可查看复盘内容</text>
      <text class="login-empty-desc">包含学习记录、收藏文章和收藏合集</text>
      <button class="login-btn" @tap="goLogin">去登录</button>
    </view>

    <view v-else class="list-wrapper">
      <view v-if="currentList.length > 0" class="list">
        <view
          v-for="item in currentList"
          :key="item._id"
          class="list-item"
          @tap="onTapItem(item)"
        >
          <view class="item-header">
            <text class="item-title">{{ getItemTitle(item) }}</text>
            <text v-if="activeTab === 'records'" class="item-badge">{{ getModeText(item.practice_mode) }}</text>
          </view>
          <view class="item-meta">
            <text>{{ getItemMeta(item) }}</text>
            <text>{{ formatTime(item.created_at) }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="!currentLoading" class="empty">
        <text>{{ getEmptyText() }}</text>
      </view>

      <view v-if="currentLoading" class="loading">
        <text>加载中...</text>
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
      topTabs: [
        { key: 'records', label: '学习记录' },
        { key: 'articleFavorites', label: '收藏文章' },
        { key: 'collectionFavorites', label: '收藏合集' }
      ],
      activeTab: 'records',
      pageSize: 20,
      lists: {
        records: [],
        articleFavorites: [],
        collectionFavorites: []
      },
      pageMap: {
        records: 1,
        articleFavorites: 1,
        collectionFavorites: 1
      },
      totalMap: {
        records: 0,
        articleFavorites: 0,
        collectionFavorites: 0
      },
      loadingMap: {
        records: false,
        articleFavorites: false,
        collectionFavorites: false
      }
    }
  },
  computed: {
    hasLogin() {
      return store.hasLogin
    },
    currentList() {
      return this.lists[this.activeTab] || []
    },
    currentLoading() {
      return !!this.loadingMap[this.activeTab]
    }
  },
  onShow() {
    this.refreshCurrentTab()
  },
  onPullDownRefresh() {
    this.refreshCurrentTab().finally(() => uni.stopPullDownRefresh())
  },
  onReachBottom() {
    const tab = this.activeTab
    if (this.currentLoading) return
    if (this.currentList.length >= (this.totalMap[tab] || 0)) return
    this.pageMap[tab] += 1
    this.loadTab(tab, true)
  },
  methods: {
    async refreshCurrentTab() {
      if (!this.hasLogin) {
        this.resetTab(this.activeTab)
        return
      }
      await this.loadTab(this.activeTab, false)
    },
    switchTab(tabKey) {
      if (this.activeTab === tabKey) return
      this.activeTab = tabKey
      this.refreshCurrentTab()
    },
    resetTab(tab) {
      this.pageMap[tab] = 1
      this.totalMap[tab] = 0
      this.lists[tab] = []
    },
    async loadTab(tab, append) {
      if (!append) {
        this.pageMap[tab] = 1
      }
      this.loadingMap[tab] = true
      try {
        if (tab === 'records') {
          await this.loadRecords(append)
          return
        }
        if (tab === 'articleFavorites') {
          await this.loadArticleFavorites(append)
          return
        }
        await this.loadCollectionFavorites(append)
      } catch (e) {
        uni.showToast({
          title: (e && e.message) || '加载失败',
          icon: 'none'
        })
      } finally {
        this.loadingMap[tab] = false
      }
    },
    async loadRecords(append) {
      const page = this.pageMap.records
      const res = await uniCloud.callFunction({
        name: 'gw_recite-record',
        data: {
          action: 'list',
          data: {
            page,
            pageSize: this.pageSize
          }
        }
      })
      const result = (res && res.result) || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '学习记录加载失败')
      }
      const list = result.data.list || []
      this.lists.records = append ? [...this.lists.records, ...list] : list
      this.totalMap.records = Number(result.data.total) || 0
    },
    async loadArticleFavorites(append) {
      const page = this.pageMap.articleFavorites
      const skip = (page - 1) * this.pageSize
      const [countRes, listRes] = await Promise.all([
        db.collection('gw-ancient-favorites').count(),
        db.collection('gw-ancient-favorites')
          .orderBy('created_at', 'desc')
          .skip(skip)
          .limit(this.pageSize)
          .get()
      ])
      const total = (((countRes || {}).result || {}).total) || 0
      const list = (((listRes || {}).result || {}).data) || []
      this.lists.articleFavorites = append ? [...this.lists.articleFavorites, ...list] : list
      this.totalMap.articleFavorites = total
    },
    async loadCollectionFavorites(append) {
      const page = this.pageMap.collectionFavorites
      const skip = (page - 1) * this.pageSize
      const [countRes, listRes] = await Promise.all([
        db.collection('gw-square-sub-favorites').count(),
        db.collection('gw-square-sub-favorites')
          .orderBy('created_at', 'desc')
          .skip(skip)
          .limit(this.pageSize)
          .get()
      ])
      const total = (((countRes || {}).result || {}).total) || 0
      const list = (((listRes || {}).result || {}).data) || []
      this.lists.collectionFavorites = append ? [...this.lists.collectionFavorites, ...list] : list
      this.totalMap.collectionFavorites = total
    },
    getModeText(mode) {
      if (mode === 'read') return '朗读'
      if (mode === 'dictation') return '默写'
      return '背诵'
    },
    getItemTitle(item) {
      if (this.activeTab === 'collectionFavorites') {
        return item.subcollection_name || '未命名合集'
      }
      return item.text_title || '未命名文章'
    },
    getItemMeta(item) {
      if (this.activeTab === 'records') {
        const accuracy = Number(item.accuracy) || 0
        return `准确率 ${accuracy}%`
      }
      if (this.activeTab === 'articleFavorites') {
        const dynasty = item.text_dynasty || ''
        const author = item.text_author || ''
        return `${dynasty}${dynasty && author ? ' · ' : ''}${author}`
      }
      return '广场专题合集'
    },
    getEmptyText() {
      if (this.activeTab === 'records') {
        return '暂无学习记录'
      }
      if (this.activeTab === 'articleFavorites') {
        return '暂无收藏文章'
      }
      return '暂无收藏合集'
    },
    onTapItem(item) {
      if (!item) return
      if (this.activeTab === 'collectionFavorites') {
        if (!item.subcollection_id) return
        const query = [
          `categoryId=${encodeURIComponent(item.category_id || '')}`,
          `subcollectionId=${encodeURIComponent(item.subcollection_id)}`,
          `categoryName=${encodeURIComponent(item.category_name || '')}`,
          `subcollectionName=${encodeURIComponent(item.subcollection_name || '')}`
        ].join('&')
        uni.navigateTo({
          url: `/pages/square/list?${query}`
        })
        return
      }
      if (!item.text_id) return
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = {
        _id: item.text_id,
        title: item.text_title || '',
        author: item.text_author || '',
        dynasty: item.text_dynasty || ''
      }
      uni.navigateTo({
        url: `/pages/ancient/detail?id=${item.text_id}&title=${encodeURIComponent(item.text_title || '')}`
      })
    },
    goLogin() {
      uni.navigateTo({
        url: '/uni_modules/uni-id-pages/pages/login/login-withoutpwd'
      })
    },
    formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
}

.top-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 24rpx;
  background: #fff;
  border-bottom: 1rpx solid #eceff4;
}

.top-tab-item {
  flex: 1;
  text-align: center;
  padding: 12rpx 0;
}

.top-tab-text {
  font-size: 28rpx;
  color: #666;
}

.top-tab-item.active .top-tab-text {
  color: #1677ff;
  font-weight: 600;
}

.list-wrapper {
  padding: 20rpx;
}

.list-item {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.item-title {
  flex: 1;
  font-size: 32rpx;
  color: #1f2329;
  font-weight: 600;
  margin-right: 20rpx;
}

.item-badge {
  font-size: 22rpx;
  color: #1677ff;
  background: #e8f3ff;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  color: #86909c;
}

.empty,
.loading {
  text-align: center;
  color: #999;
  font-size: 28rpx;
  padding: 120rpx 0;
}

.login-empty {
  padding: 140rpx 48rpx;
  text-align: center;
}

.login-empty-title {
  font-size: 34rpx;
  color: #1f2329;
  font-weight: 600;
  margin-bottom: 18rpx;
}

.login-empty-desc {
  font-size: 26rpx;
  color: #86909c;
  line-height: 1.6;
  margin-bottom: 36rpx;
}

.login-btn {
  width: 280rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  color: #fff;
  background: #1677ff;
}
</style>
