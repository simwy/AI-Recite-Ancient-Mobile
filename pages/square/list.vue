<template>
  <view class="container">
    <view v-if="hasIntro" class="top-tabs">
      <view
        :class="['tab-item', currentTab === 'list' ? 'active' : '']"
        @click="currentTab = 'list'"
      >
        <text>列表</text>
        <text v-if="totalReciteCount > 0" class="tab-recite-badge" :class="{ 'tab-recite-badge--all': totalRecitePassed === totalReciteCount }">
          背诵 {{ totalRecitePassed }}/{{ totalReciteCount }}
        </text>
      </view>
      <view
        :class="['tab-item', currentTab === 'intro' ? 'active' : '']"
        @click="currentTab = 'intro'"
      >介绍</view>
    </view>

    <view v-show="currentTab === 'list'">
    <view class="search-bar">
      <uni-search-bar
        v-model="keyword"
        placeholder="在本合集中搜索标题、作者或内容"
        @confirm="onSearch"
        @clear="onClear"
      />
    </view>

    <view class="list" v-if="hasFilteredContent">
      <view v-for="group in filteredGroups" :key="group._id" class="group-section">
        <view class="section-title" @click="toggleGroup(group._id)">
          <text>{{ group.name }}</text>
          <text class="section-recite-badge" :class="{ 'section-recite-badge--all': getGroupRecitePassed(group.list) === group.list.length && group.list.length > 0 }">
            背诵 {{ getGroupRecitePassed(group.list) }}/{{ group.list.length }}
          </text>
          <uni-icons :type="isGroupExpanded(group._id) ? 'arrowdown' : 'arrowright'" size="14" color="#999" class="section-arrow" />
        </view>
        <view v-show="isGroupExpanded(group._id)" class="section-body">
          <view v-if="group.list.length === 0" class="group-empty"><text>暂无古文</text></view>
          <template v-else>
            <view class="list-item" v-for="item in group.list" :key="item._id" @click="goDetail(item)">
            <view class="item-header">
              <view class="item-title">{{ item.title }}</view>
              <view class="item-status-wrap">
                <text :class="['item-status', getReciteStatusClass(item)]">{{ getReciteStatusLabel(item) }}</text>
                <text v-if="formatReciteBestTime(item)" class="item-status-time">{{ formatReciteBestTime(item) }}</text>
              </view>
            </view>
            <view class="item-meta">
              <text class="item-author">{{ item.dynasty }} · {{ item.author }}</text>
            </view>
            <view class="item-preview">{{ item.intro || getPreview(item.content, 40) }}</view>
            </view>
          </template>
        </view>
      </view>
      <view class="group-section">
        <view class="section-title" @click="toggleUngrouped">
          <text>未分组</text>
          <text class="section-recite-badge" :class="{ 'section-recite-badge--all': getGroupRecitePassed(filteredUngrouped) === filteredUngrouped.length && filteredUngrouped.length > 0 }">
            背诵 {{ getGroupRecitePassed(filteredUngrouped) }}/{{ filteredUngrouped.length }}
          </text>
          <uni-icons :type="ungroupedExpanded ? 'arrowdown' : 'arrowright'" size="14" color="#999" class="section-arrow" />
        </view>
        <view v-show="ungroupedExpanded" class="section-body">
          <view v-if="filteredUngrouped.length === 0" class="group-empty"><text>暂无古文</text></view>
          <template v-else>
            <view class="list-item" v-for="item in filteredUngrouped" :key="item._id" @click="goDetail(item)">
              <view class="item-header">
                <view class="item-title">{{ item.title }}</view>
                <view class="item-status-wrap">
                  <text :class="['item-status', getReciteStatusClass(item)]">{{ getReciteStatusLabel(item) }}</text>
                  <text v-if="formatReciteBestTime(item)" class="item-status-time">{{ formatReciteBestTime(item) }}</text>
                </view>
              </view>
              <view class="item-meta">
                <text class="item-author">{{ item.dynasty }} · {{ item.author }}</text>
              </view>
              <view class="item-preview">{{ item.intro || getPreview(item.content, 40) }}</view>
            </view>
          </template>
        </view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-text">{{ keyword ? '未找到匹配的古文' : '该子合集暂无古文' }}</text>
    </view>

    <view class="loading" v-if="loading">
      <text>加载中...</text>
    </view>
    </view>

    <view v-show="currentTab === 'intro'" v-if="hasIntro" class="intro-panel">
      <scroll-view scroll-y class="intro-content">
        <view class="intro-richtext"><rich-text :nodes="introHtml"></rich-text></view>
      </scroll-view>
    </view>

    <view class="action-bar">
      <view class="favorite-action" @click="toggleSubcollectionFavorite">
        <uni-icons
          :type="subcollectionFavorited ? 'star-filled' : 'star'"
          size="20"
          :color="subcollectionFavorited ? '#f59e0b' : '#86909c'"
        />
        <text :class="['favorite-text', subcollectionFavorited ? 'active' : '']">
          {{ subcollectionFavorited ? '已参加活动' : '参加活动' }}
        </text>
      </view>
    </view>
  </view>
</template>

<script>
import { marked } from 'marked'

/** 背诵得分 ≥ 此值视为通过 */
const RECITE_PASS_SCORE = 90

export default {
  data() {
    return {
      keyword: '',
      categoryId: '',
      subcollectionId: '',
      categoryName: '',
      subcollectionName: '',
      subcollectionIntro: '',
      currentTab: 'list',
      groups: [],
      ungrouped: [],
      groupExpanded: {},
      ungroupedExpanded: true,
      subcollectionFavorited: false,
      favoriteLoading: false,
      loading: false
    }
  },
  computed: {
    hasIntro() {
      return !!(this.subcollectionIntro && this.subcollectionIntro.trim())
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
      return this.groups.length > 0 || this.ungrouped.length > 0
    },
    introHtml() {
      if (!this.subcollectionIntro || !this.subcollectionIntro.trim()) return ''
      try {
        marked.setOptions({ breaks: true })
        return marked.parse(this.subcollectionIntro.trim())
      } catch (e) {
        return this.subcollectionIntro
      }
    },
    /** 整个子合集背诵通过篇数（≥90 分） */
    totalRecitePassed() {
      let n = 0
      ;(this.groups || []).forEach((g) => { n += this.getGroupRecitePassed(g.list) })
      n += this.getGroupRecitePassed(this.ungrouped || [])
      return n
    },
    /** 整个子合集总篇数 */
    totalReciteCount() {
      let n = 0
      ;(this.groups || []).forEach((g) => { n += (g.list && g.list.length) || 0 })
      n += (this.ungrouped && this.ungrouped.length) || 0
      return n
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
        this.subcollectionIntro = result.data.intro || ''
        await this.mergeReciteScores()
        const saved = this.loadExpandState()
        if (saved) {
          this.groupExpanded = saved.groupExpanded || {}
          this.ungroupedExpanded = saved.ungroupedExpanded !== false
        } else {
          // 默认第一组展开，其余收起
          const groups = this.groups || []
          this.groupExpanded = groups.reduce((acc, g, i) => {
            acc[g._id] = i === 0
            return acc
          }, {})
          this.ungroupedExpanded = true
        }
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
    /** 拉取当前用户背诵分数并合并到 groups/ungrouped 的每一项 */
    async mergeReciteScores() {
      const allIds = []
      ;(this.groups || []).forEach((g) => g.list.forEach((t) => t._id && allIds.push(t._id)))
      ;(this.ungrouped || []).forEach((t) => t._id && allIds.push(t._id))
      if (allIds.length === 0) return
      const uniqueIds = [...new Set(allIds)]
      const batchSize = 100
      const summaryMap = {}
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const chunk = uniqueIds.slice(i, i + batchSize)
        try {
          const res = await uniCloud.callFunction({
            name: 'gw_ancient-search',
            data: { action: 'getUserTextSummaries', data: { text_ids: chunk } }
          })
          const result = (res && res.result) || {}
          if (result.code === 0 && result.data && result.data.list) {
            result.data.list.forEach((s) => {
              if (s && s.text_id) summaryMap[s.text_id] = s
            })
          }
        } catch (e) {}
      }
      const setScore = (item) => {
        if (!item || !item._id) return
        const s = summaryMap[item._id]
        item.recite_last_score = s && typeof s.recite_last_score === 'number' && !Number.isNaN(s.recite_last_score) ? s.recite_last_score : null
        item.recite_best_score = s && typeof s.recite_best_score === 'number' && !Number.isNaN(s.recite_best_score) ? s.recite_best_score : null
        item.recite_best_at = s && (s.recite_best_at != null) ? s.recite_best_at : null
      }
      ;(this.groups || []).forEach((g) => g.list.forEach(setScore))
      ;(this.ungrouped || []).forEach(setScore)
    },
    /** 列表中背诵通过的篇数（按最高分 ≥90 视为通过） */
    getGroupRecitePassed(list) {
      if (!Array.isArray(list)) return 0
      return list.filter((item) => {
        const s = item && item.recite_best_score
        return typeof s === 'number' && !Number.isNaN(s) && s >= RECITE_PASS_SCORE
      }).length
    },
    /** 标签文案：显示最高分 + 已通过/未通过，无记录为未背诵 */
    getReciteStatusLabel(item) {
      if (!item) return '未背诵'
      const s = item.recite_best_score
      if (typeof s === 'number' && !Number.isNaN(s)) {
        return s >= RECITE_PASS_SCORE ? `${Math.round(s)}分 已通过` : `${Math.round(s)}分 未通过`
      }
      return '未背诵'
    },
    /** 标签样式：通过绿、未通过红、未背诵默认灰 */
    getReciteStatusClass(item) {
      if (!item) return ''
      const s = item.recite_best_score
      if (typeof s === 'number' && !Number.isNaN(s)) {
        return s >= RECITE_PASS_SCORE ? 'item-status--pass' : 'item-status--fail'
      }
      return ''
    },
    /** 最高分背诵时间，格式：M月D日 HH:mm */
    formatReciteBestTime(item) {
      if (!item || item.recite_best_at == null) return ''
      const t = item.recite_best_at
      const date = t instanceof Date ? t : new Date(typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : t)
      if (Number.isNaN(date.getTime())) return ''
      const M = date.getMonth() + 1
      const D = date.getDate()
      const h = date.getHours()
      const m = date.getMinutes()
      return `${M}月${D}日 ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
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
            uni.showToast({ title: '请先登录后参加活动', icon: 'none' })
            return
          }
          throw new Error(result.msg || '操作失败')
        }
        this.subcollectionFavorited = !!result.data.favorited
        uni.showToast({
          title: this.subcollectionFavorited ? '参加成功' : '已退出活动',
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
    getExpandStorageKey() {
      return this.subcollectionId ? `square_list_expand_${this.subcollectionId}` : ''
    },
    loadExpandState() {
      const key = this.getExpandStorageKey()
      if (!key) return null
      try {
        const raw = uni.getStorageSync(key)
        if (!raw) return null
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw
        const groups = this.groups || []
        const groupExpanded = {}
        groups.forEach((g, i) => {
          if (data.groupExpanded && data.groupExpanded[g._id] !== undefined) {
            groupExpanded[g._id] = data.groupExpanded[g._id]
          } else {
            groupExpanded[g._id] = false
          }
        })
        return {
          groupExpanded,
          ungroupedExpanded: data.ungroupedExpanded !== false
        }
      } catch (e) {
        return null
      }
    },
    saveExpandState() {
      const key = this.getExpandStorageKey()
      if (!key) return
      try {
        uni.setStorageSync(key, JSON.stringify({
          groupExpanded: this.groupExpanded,
          ungroupedExpanded: this.ungroupedExpanded
        }))
      } catch (e) {}
    },
    toggleGroup(groupId) {
      const next = !this.groupExpanded[groupId]
      this.groupExpanded = { ...this.groupExpanded, [groupId]: next }
      this.saveExpandState()
    },
    toggleUngrouped() {
      this.ungroupedExpanded = !this.ungroupedExpanded
      this.saveExpandState()
    },
    isGroupExpanded(groupId) {
      return this.groupExpanded[groupId] !== false
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

.top-tabs {
  display: flex;
  margin-bottom: 24rpx;
  border-bottom: 2rpx solid #eee;
}
.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 20rpx 0;
  font-size: 30rpx;
  color: #999;
}
.tab-item.active {
  color: #333;
  font-weight: 600;
  border-bottom: 4rpx solid #1d4ed8;
  margin-bottom: -2rpx;
}
.tab-recite-badge {
  font-size: 22rpx;
  font-weight: 700;
  color: #1d4ed8;
  padding: 4rpx 10rpx;
  background: #eff6ff;
  border-radius: 999rpx;
}
.tab-recite-badge--all {
  color: #059669;
  background: #ecfdf5;
}
.intro-panel {
  min-height: 60vh;
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
}
.intro-content {
  max-height: 70vh;
}

.intro-richtext {
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
  word-break: break-word;
}

.search-bar {
  margin-bottom: 20rpx;
}

.group-section {
  margin-bottom: 32rpx;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  padding: 16rpx 0;
  user-select: none;
}
.section-title:active {
  opacity: 0.7;
}

.section-recite-badge {
  margin-left: auto;
  font-size: 26rpx;
  font-weight: 700;
  color: #1d4ed8;
  padding: 6rpx 14rpx;
  background: #eff6ff;
  border-radius: 999rpx;
  margin-right: 8rpx;
}
.section-recite-badge--all {
  color: #059669;
  background: #ecfdf5;
}

.section-arrow {
  flex-shrink: 0;
}

.section-body {
  margin-top: 8rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #eee;
}

.group-empty {
  font-size: 26rpx;
  color: #888;
  padding: 16rpx 0;
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

.item-status-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}
.item-status {
  font-size: 24rpx;
  font-weight: 600;
  color: #86909c;
  background: #f2f3f5;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
}
.item-status--pass {
  color: #059669;
  background: #ecfdf5;
}
.item-status--fail {
  color: #dc2626;
  background: #fef2f2;
}
.item-status-time {
  font-size: 20rpx;
  color: #94a3b8;
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
