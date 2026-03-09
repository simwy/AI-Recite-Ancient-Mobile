<template>
  <view class="container">
    <view v-if="hasIntro" class="top-tabs">
      <view
        :class="['tab-item', currentTab === 'list' ? 'active' : '']"
        @click="currentTab = 'list'"
      >
        <text>列表</text>
        <text class="tab-recite-count">背诵 {{ totalRecitePassed }}/{{ totalReciteCount }}</text>
      </view>
      <view
        :class="['tab-item', currentTab === 'intro' ? 'active' : '']"
        @click="currentTab = 'intro'"
      >介绍</view>
    </view>

    <view v-show="currentTab === 'list'">
    <view class="search-bar">
      <view class="search-bar-row">
        <view class="correction-btn" @click="goCorrection">
          <uni-icons type="compose" size="16" color="#666" />
          <text class="correction-text">纠错</text>
        </view>
        <view class="search-bar-input-wrap">
          <uni-search-bar
            v-model="keyword"
            placeholder="在本合集中搜索标题、作者或内容"
            @confirm="onSearch"
            @clear="onClear"
          />
        </view>
      </view>
    </view>

    <view class="list" v-if="hasFilteredContent">
      <view v-for="group in filteredGroups" :key="group._id" class="group-section">
        <view class="section-title" @click="toggleGroup(group._id)">
          <text>{{ group.name }}</text>
          <text class="section-recite-badge" :class="{ 'section-recite-badge--all': getGroupRecitePassed(group.list) === group.list.length && group.list.length > 0 }">
            背诵 {{ getGroupRecitePassed(group.list) }}/{{ group.list.length }}
          </text>
          <uni-icons :type="isGroupExpanded(group._id) ? 'arrowup' : 'arrowright'" size="16" :color="isGroupExpanded(group._id) ? '#1d4ed8' : '#999'" class="section-arrow" />
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
            <view class="item-preview">{{ getPreview(item.content, 80) }}</view>
            </view>
          </template>
        </view>
      </view>
      <view v-if="filteredUngrouped.length > 0" class="group-section">
        <view class="section-title" @click="toggleUngrouped">
          <text>未分组</text>
          <text class="section-recite-badge" :class="{ 'section-recite-badge--all': getGroupRecitePassed(filteredUngrouped) === filteredUngrouped.length && filteredUngrouped.length > 0 }">
            背诵 {{ getGroupRecitePassed(filteredUngrouped) }}/{{ filteredUngrouped.length }}
          </text>
          <uni-icons :type="ungroupedExpanded ? 'arrowup' : 'arrowright'" size="16" :color="ungroupedExpanded ? '#1d4ed8' : '#999'" class="section-arrow" />
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
              <view class="item-preview">{{ getPreview(item.content, 80) }}</view>
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
      <view class="action-btn action-btn--left" @click="toggleSubcollectionFavorite">
        <uni-icons
          :type="subcollectionFavorited ? 'star-filled' : 'star'"
          size="20"
          :color="subcollectionFavorited ? '#f59e0b' : '#86909c'"
        />
        <text class="action-btn-text">我要参加活动</text>
      </view>
      <view class="action-btn action-btn--right" @click="openCalendar">
        <uni-icons type="calendar" size="20" color="#1d4ed8" />
        <text class="action-btn-text">背诵打卡日历</text>
      </view>
    </view>

    <!-- 背诵完成日历弹层 -->
    <view v-if="calendarVisible" class="calendar-mask" @click="closeCalendar">
      <view class="calendar-popup" @click.stop>
        <view class="calendar-popup-header">
          <text class="calendar-popup-title">背诵完成日历</text>
          <view class="calendar-popup-close" @click="closeCalendar">
            <uni-icons type="closeempty" size="20" color="#666" />
          </view>
        </view>
        <view class="calendar-month-bar">
          <view class="calendar-month-btn" @click="calendarPrevMonth">
            <uni-icons type="back" size="16" color="#333" />
          </view>
          <text class="calendar-month-text">{{ calendarYear }}年{{ calendarMonth }}月</text>
          <view class="calendar-month-btn" @click="calendarNextMonth">
            <uni-icons type="right" size="16" color="#333" />
          </view>
        </view>
        <view class="calendar-weekdays">
          <text class="calendar-weekday">日</text>
          <text class="calendar-weekday">一</text>
          <text class="calendar-weekday">二</text>
          <text class="calendar-weekday">三</text>
          <text class="calendar-weekday">四</text>
          <text class="calendar-weekday">五</text>
          <text class="calendar-weekday">六</text>
        </view>
        <view class="calendar-days">
          <view
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            :class="['calendar-day-cell', { 'calendar-day--other': cell.other, 'calendar-day--has': cell.hasPass }]"
            @click="cell.hasPass ? onCalendarDayClick(cell.dateKey) : null"
          >
            <text class="calendar-day-num">{{ cell.day }}</text>
            <view v-if="cell.hasPass" class="calendar-day-dot"></view>
          </view>
        </view>
        <view v-if="calendarLoading" class="calendar-loading">加载中...</view>
      </view>
    </view>

    <!-- 某日背诵通过的古文标题浮层 -->
    <view v-if="selectedDayTitles.length > 0" class="day-titles-mask" @click="selectedDayTitles = []">
      <view class="day-titles-popup" @click.stop>
        <view class="day-titles-header">
          <text class="day-titles-title">{{ selectedDayDateLabel }} 背诵通过</text>
          <view @click="selectedDayTitles = []">
            <uni-icons type="closeempty" size="18" color="#666" />
          </view>
        </view>
        <scroll-view scroll-y class="day-titles-list">
          <view v-for="(t, i) in selectedDayTitles" :key="i" class="day-titles-item">{{ t }}</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
import { marked } from 'marked'
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

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
      loading: false,
      calendarVisible: false,
      calendarYear: 0,
      calendarMonth: 0,
      calendarLoading: false,
      firstPassList: [],
      selectedDayTitles: [],
      selectedDayDateLabel: ''
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
    },
    /** 完成日 -> 该日背诵通过的古文标题列表。完成日 = 该古文第一次得分≥90 的次日 */
    completionMap() {
      const map = {}
      for (const item of this.firstPassList) {
        const t = item.first_pass_at
        const ts = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : (t && t.getTime ? t.getTime() : 0)
        if (!ts) continue
        const d = new Date(ts)
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
        if (!map[key]) map[key] = []
        map[key].push(item.text_title || '')
      }
      return map
    },
    /** 当前日历月对应的格子（含上月/下月占位），每格 { day, other, dateKey, hasPass } */
    calendarDays() {
      const y = this.calendarYear
      const m = this.calendarMonth
      if (!y || !m) return []
      const first = new Date(y, m - 1, 1)
      const last = new Date(y, m, 0)
      const firstWeekday = first.getDay()
      const totalDays = last.getDate()
      const cells = []
      for (let i = 0; i < firstWeekday; i++) {
        const d = new Date(y, m - 1, -firstWeekday + i + 1)
        cells.push({
          day: d.getDate(),
          other: true,
          dateKey: this.dateToKey(d),
          hasPass: !!this.completionMap[this.dateToKey(d)]
        })
      }
      for (let d = 1; d <= totalDays; d++) {
        const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        cells.push({
          day: d,
          other: false,
          dateKey,
          hasPass: !!this.completionMap[dateKey]
        })
      }
      const rest = 42 - cells.length
      for (let i = 1; i <= rest; i++) {
        const d = new Date(y, m, i)
        cells.push({
          day: d.getDate(),
          other: true,
          dateKey: this.dateToKey(d),
          hasPass: !!this.completionMap[this.dateToKey(d)]
        })
      }
      return cells
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
      const k = (this.keyword || '').trim()
      if (k) {
        this.saveSearchLog({
          content: k,
          scene: 'square_subcollection',
          category_id: this.categoryId || '',
          subcollection_id: this.subcollectionId || '',
          category_name: this.categoryName || '',
          subcollection_name: this.subcollectionName || ''
        })
      }
    },
    onClear() {
      this.keyword = ''
    },
    /** 跳转意见反馈页，预填当前合集信息，用于反馈收录少了、收录错了等问题 */
    goCorrection() {
      const url = getFeedbackUrl({
        id: this.subcollectionId || '',
        title: this.subcollectionName || '',
        type: 'collection'
      })
      uni.navigateTo({ url })
    },
    /** 记录搜索日志（静默，不阻塞列表） */
    saveSearchLog(payload) {
      const uniIdToken = this.getUniIdToken()
      uniCloud.callFunction({
        name: 'gw_ancient-search',
        data: {
          action: 'saveSearchLog',
          data: payload,
          uniIdToken
        }
      }).catch(() => {})
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
    },
    dateToKey(d) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    },
    openCalendar() {
      const now = new Date()
      this.calendarYear = now.getFullYear()
      this.calendarMonth = now.getMonth() + 1
      this.calendarVisible = true
      this.loadFirstPassForCalendar()
    },
    closeCalendar() {
      this.calendarVisible = false
      this.selectedDayTitles = []
    },
    async loadFirstPassForCalendar() {
      const allIds = []
      ;(this.groups || []).forEach((g) => g.list.forEach((t) => t._id && allIds.push(t._id)))
      ;(this.ungrouped || []).forEach((t) => t._id && allIds.push(t._id))
      const uniqueIds = [...new Set(allIds)]
      if (uniqueIds.length === 0) {
        this.calendarLoading = false
        return
      }
      this.calendarLoading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'getFirstPassByTextIds',
            data: { text_ids: uniqueIds }
          },
          uniIdToken: this.getUniIdToken()
        })
        const result = (res && res.result) || {}
        if (result.code === 0 && result.data && result.data.list) {
          this.firstPassList = result.data.list
        } else {
          this.firstPassList = []
        }
      } catch (e) {
        this.firstPassList = []
      } finally {
        this.calendarLoading = false
      }
    },
    calendarPrevMonth() {
      if (this.calendarMonth <= 1) {
        this.calendarYear--
        this.calendarMonth = 12
      } else {
        this.calendarMonth--
      }
    },
    calendarNextMonth() {
      if (this.calendarMonth >= 12) {
        this.calendarYear++
        this.calendarMonth = 1
      } else {
        this.calendarMonth++
      }
    },
    onCalendarDayClick(dateKey) {
      const titles = this.completionMap[dateKey] || []
      if (titles.length === 0) return
      const [y, m, d] = dateKey.split('-')
      this.selectedDayDateLabel = `${parseInt(m, 10)}月${parseInt(d, 10)}日`
      this.selectedDayTitles = titles
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
  display: flex;
  flex-direction: column;
}

.top-tabs {
  display: flex;
  margin-bottom: 12rpx;
  border-bottom: 2rpx solid #eee;
}
.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 14rpx 0;
  font-size: 30rpx;
  color: #999;
}
.tab-item.active {
  color: #333;
  font-weight: 600;
  border-bottom: 4rpx solid #1d4ed8;
  margin-bottom: -2rpx;
}
.tab-recite-count {
  margin-left: 8rpx;
  font-size: 24rpx;
  font-weight: normal;
  color: #1d4ed8;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #eff6ff;
}
.tab-item.active .tab-recite-count {
  color: #1d4ed8;
  background: #eff6ff;
}
.tab-item:not(.active) .tab-recite-count {
  color: #64748b;
  background: #f1f5f9;
}
.intro-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
}
.intro-content {
  flex: 1;
  min-height: 0;
}

.intro-richtext {
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
  word-break: break-word;
  padding-bottom: 48rpx;
}

.search-bar {
  margin-bottom: 10rpx;
}
.search-bar-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.search-bar-input-wrap {
  flex: 1;
  min-width: 0;
}
.correction-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  background: #f5f5f5;
  border: 1rpx solid #e5e5e5;
  flex-shrink: 0;
}
.correction-text {
  font-size: 22rpx;
  color: #666;
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
  margin-left: 4rpx;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
}
.action-btn:active {
  opacity: 0.85;
}
.action-btn--left {
  background: #f2f3f5;
  border: 2rpx solid #e5e6eb;
}
.action-btn--right {
  background: #fff7e6;
  border: 2rpx solid #ffe6b0;
}
.action-btn-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.calendar-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.calendar-popup {
  width: 100%;
  max-width: 640rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  max-height: 85vh;
}

.calendar-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.calendar-popup-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}
.calendar-popup-close {
  padding: 8rpx;
}

.calendar-month-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.calendar-month-btn {
  padding: 12rpx;
}
.calendar-month-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.calendar-weekdays {
  display: flex;
  flex-direction: row;
  margin-bottom: 12rpx;
}
.calendar-weekday {
  flex: 1;
  text-align: center;
  font-size: 22rpx;
  color: #86909c;
}

.calendar-days {
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
}
.calendar-day-cell {
  width: 14.28%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-size: 26rpx;
  color: #333;
}
.calendar-day-cell:active {
  opacity: 0.8;
}
.calendar-day--other {
  color: #c9cdd4;
}
.calendar-day--has {
  color: #059669;
  font-weight: 600;
}
.calendar-day-dot {
  position: absolute;
  bottom: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: #059669;
}

.calendar-loading {
  text-align: center;
  padding: 24rpx;
  font-size: 26rpx;
  color: #86909c;
}

.day-titles-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60rpx;
}

.day-titles-popup {
  width: 100%;
  max-width: 560rpx;
  max-height: 60vh;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.day-titles-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border-bottom: 1rpx solid #eee;
}
.day-titles-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.day-titles-list {
  max-height: 400rpx;
  padding: 16rpx;
}
.day-titles-item {
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
  border-bottom: 1rpx solid #f2f3f5;
}
.day-titles-item:last-child {
  border-bottom: none;
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
