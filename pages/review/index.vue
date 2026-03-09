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
      <text class="login-empty-desc">包含我的活动、我的古文和学习日志</text>
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
          <view v-if="activeTab === 'collectionFavorites'" class="item-days-row">
            <text class="item-days-text">{{ joinDaysText(item) }}</text>
            <text class="item-progress-tag">{{ (item.recite_passed_count ?? 0) }}/{{ item.recite_total_count ?? 0 }} 篇</text>
          </view>
          <view v-if="activeTab === 'records' && item.record_type" class="item-brief">
            <text class="item-brief-line">{{ getRecordBriefLine(item) }}</text>
            <text v-if="item.recognized_snippet" class="item-snippet">{{ item.recognized_snippet }}</text>
          </view>
          <view v-if="activeTab === 'collectionFavorites'" class="item-activity-stats">
            <view class="item-activity-row">
              <text class="item-activity-label">加入时间</text>
              <text class="item-activity-value">{{ formatTime(item.created_at) || '—' }}</text>
            </view>
            <view class="item-activity-row">
              <text class="item-activity-label">最近背诵</text>
              <text class="item-activity-value">{{ item.last_recite_at ? formatTime(item.last_recite_at) : '暂无' }}</text>
            </view>
          </view>
          <view v-else-if="activeTab === 'articleFavorites'" class="item-meta">
            <text>{{ getItemMeta(item) }}</text>
            <view class="item-meta-right">
              <text>{{ formatTime(item.created_at) }}</text>
              <text class="item-delete-btn" @tap.stop="onDeleteFavorite(item)">删除</text>
            </view>
          </view>
          <view v-else-if="activeTab === 'records'" class="item-meta">
            <text>{{ formatTime(item.created_at) }}</text>
            <text class="item-delete-btn" @tap.stop="onDeleteRecord(item)">删除</text>
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

export default {
  data() {
    return {
      topTabs: [
        { key: 'collectionFavorites', label: '我的活动' },
        { key: 'articleFavorites', label: '我的古文' },
        { key: 'records', label: '学习日志' }
      ],
      activeTab: 'collectionFavorites',
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
    getUniIdToken() {
      const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
      return (currentUserInfo && currentUserInfo.token) ? currentUserInfo.token : ''
    },
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
        name: 'gw_learning-records',
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
      const uniIdToken = this.getUniIdToken()
      const res = await uniCloud.callFunction({
        name: 'gw_favorite',
        data: {
          action: 'list',
          data: { page, pageSize: this.pageSize },
          uniIdToken
        }
      })
      const result = (res && res.result) || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '收藏文章加载失败')
      }
      const list = result.data.list || []
      const total = Number(result.data.total) || 0
      this.lists.articleFavorites = append ? [...this.lists.articleFavorites, ...list] : list
      this.totalMap.articleFavorites = total
    },
    async loadCollectionFavorites(append) {
      const page = this.pageMap.collectionFavorites
      const uniIdToken = this.getUniIdToken()
      const res = await uniCloud.callFunction({
        name: 'gw_ancient-search',
        data: {
          action: 'listSubcollectionFavorites',
          data: { page, pageSize: this.pageSize },
          uniIdToken
        }
      })
      const result = (res && res.result) || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '收藏合集加载失败')
      }
      const list = result.data.list || []
      const total = Number(result.data.total) || 0
      this.lists.collectionFavorites = append ? [...this.lists.collectionFavorites, ...list] : list
      this.totalMap.collectionFavorites = total
    },
    getModeText(mode) {
      if (mode === 'follow') return '跟读'
      if (mode === 'read') return '朗读'
      if (mode === 'dictation') return '默写'
      return '背诵'
    },
    getRecordBriefLine(item) {
      const acc = Number(item.accuracy) || 0
      if (item.record_type === 'dictation') {
        const n = Number(item.wrong_count) || 0
        return `准确率 ${acc}%${n > 0 ? ` · 错 ${n} 字` : ''}`
      }
      if (item.record_type === 'follow') {
        const sec = Number(item.duration_seconds) || 0
        const min = Math.floor(sec / 60)
        const s = sec % 60
        const timeStr = min > 0 ? `${min}分${s}秒` : `${s}秒`
        return `准确率 ${acc}% · ${timeStr}`
      }
      const hint = Number(item.hint_count) || 0
      const sec = Number(item.duration_seconds) || 0
      const min = Math.floor(sec / 60)
      const s = sec % 60
      const timeStr = min > 0 ? `${min}分${s}秒` : `${s}秒`
      return `准确率 ${acc}% · 提示 ${hint} 次 · ${timeStr}`
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
        return '暂无学习日志'
      }
      if (this.activeTab === 'articleFavorites') {
        return '暂无我的古文'
      }
      return '暂无我的活动'
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
      if (this.activeTab === 'records' && item.record_type) {
        if (item.record_type === 'recite') {
          uni.navigateTo({
            url: `/pages/ancient/recite-result?recordId=${item._id}`
          })
          return
        }
        if (item.record_type === 'follow') {
          uni.navigateTo({
            url: `/pages/ancient/recite-result?recordId=${item._id}&type=follow`
          })
          return
        }
        if (item.record_type === 'dictation') {
          uni.navigateTo({
            url: `/pages/ancient/dictation-result?recordId=${item._id}`
          })
          return
        }
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
    joinDays(item) {
      if (!item || item.created_at == null) return 0
      const t = typeof item.created_at === 'number' && item.created_at < 1e12 ? item.created_at * 1000 : item.created_at
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) return 0
      const today = new Date()
      d.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)
      const diff = Math.floor((today - d) / 86400000)
      return diff < 0 ? 0 : diff
    },
    joinDaysText(item) {
      const join = this.joinDays(item)
      const recite = item.recite_days_count ?? 0
      return `加入 ${join} 天 · 背诵 ${recite} 天`
    },
    formatTime(ts) {
      if (ts == null) return ''
      const t = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    onDeleteRecord(item) {
      if (!item || !item._id || !item.record_type) return
      uni.showModal({
        title: '确认删除',
        content: '确定要删除这条学习日志吗？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const result = await uniCloud.callFunction({
              name: 'gw_learning-records',
              data: {
                action: 'delete',
                data: { id: item._id, record_type: item.record_type }
              }
            })
            const ret = (result && result.result) || {}
            if (ret.code !== 0) {
              uni.showToast({ title: ret.msg || '删除失败', icon: 'none' })
              return
            }
            this.lists.records = this.lists.records.filter((r) => r._id !== item._id)
            this.totalMap.records = Math.max(0, (this.totalMap.records || 1) - 1)
            uni.showToast({ title: '已删除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
          }
        }
      })
    },
    onDeleteFavorite(item) {
      if (!item || !item.text_id) return
      uni.showModal({
        title: '确认删除',
        content: '确定从学习清单中移除这篇古文吗？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const uniIdToken = this.getUniIdToken()
            const result = await uniCloud.callFunction({
              name: 'gw_favorite',
              data: {
                action: 'toggle',
                data: { text_id: item.text_id },
                uniIdToken
              }
            })
            const ret = (result && result.result) || {}
            if (ret.code !== 0) {
              uni.showToast({ title: ret.msg || '移除失败', icon: 'none' })
              return
            }
            this.lists.articleFavorites = this.lists.articleFavorites.filter((f) => f.text_id !== item.text_id)
            this.totalMap.articleFavorites = Math.max(0, (this.totalMap.articleFavorites || 1) - 1)
            uni.showToast({ title: '已移除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '移除失败', icon: 'none' })
          }
        }
      })
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-badge {
  font-size: 22rpx;
  color: #1677ff;
  background: #e8f3ff;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.item-days-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}
.item-days-text {
  font-size: 26rpx;
  color: #1677ff;
  font-weight: 500;
}

.item-brief {
  margin-bottom: 10rpx;
}
.item-brief-line {
  display: block;
  font-size: 24rpx;
  color: #1677ff;
  margin-bottom: 6rpx;
}
.item-snippet {
  display: block;
  font-size: 24rpx;
  color: #86909c;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  color: #86909c;
}
.item-meta-right {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.item-delete-btn {
  font-size: 24rpx;
  color: #f53f3f;
  padding: 4rpx 8rpx;
}

.item-activity-stats {
  margin-top: 8rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.item-activity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  color: #86909c;
  margin-bottom: 6rpx;
}
.item-activity-row:last-child {
  margin-bottom: 0;
}
.item-activity-label {
  color: #86909c;
}
.item-activity-value {
  color: #1f2329;
}
.item-progress-tag {
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2329;
  background: #f2f3f5;
  border-radius: 8rpx;
  padding: 8rpx 16rpx;
  flex-shrink: 0;
}
.item-activity-recite {
  font-weight: 600;
  color: #1677ff;
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
