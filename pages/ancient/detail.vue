<template>
  <view class="container">
    <view class="header" @click="goReadFromStart">
      <view class="header-top">
        <view class="header-left">
          <view class="correction-btn" @click.stop="goCorrection">
            <uni-icons type="compose" size="16" color="#666" />
            <text class="correction-text">纠错</text>
          </view>
        </view>
        <view class="header-right"></view>
      </view>
      <view class="title-row">
        <text class="title">{{ detail.title }}</text>
        <view class="read-hint" @click.stop="goReadFromStart">
          <uni-icons type="sound" size="18" color="#4f46e5" />
          <text class="read-hint-text">点击朗读</text>
        </view>
      </view>
      <text class="meta">{{ detail.dynasty }} · {{ detail.author }}</text>
    </view>

    <view class="content-box">
      <view class="content-inner" :class="{ collapsed: needExpand && !expanded }">
        <view class="sentence-list">
          <view
            v-for="(unit, index) in sentenceUnits"
            :key="index"
            class="sentence-item"
            @click="goReadFromSentence(index)"
          >
            <text class="sentence-text">{{ unit.text }}</text>
          </view>
        </view>
      </view>
      <view v-if="needExpand" class="expand-wrap">
        <text class="expand-btn" @click="expanded = !expanded">{{ expanded ? '收起' : '展开全文' }}</text>
      </view>
      <view class="content-tip">
        <text class="tip-text">点击句子可从该句开始朗读</text>
      </view>
    </view>

    <!-- 学习记录：跟读记录、背诵记录、默写记录（可折叠，默认收缩，右侧显示最近一次得分） -->
    <view class="learning-records" v-if="hasLogin">
      <view class="records-section">
        <view class="section-title section-title--clickable" @click="followExpanded = !followExpanded">
          <uni-icons type="eye" size="14" color="#4f46e5" />
          <text>跟读记录</text>
          <text v-if="followList.length > 0" class="section-count">({{ followList.length }})</text>
          <view class="section-right">
            <text v-if="followList.length > 0" class="section-latest">最近 {{ followList[0].accuracy || 0 }}%</text>
            <uni-icons :type="followExpanded ? 'arrowup' : 'arrowright'" size="14" :color="followExpanded ? '#4f46e5' : '#999'" class="section-arrow" />
          </view>
        </view>
        <view v-show="followExpanded" class="section-body">
          <view v-if="followLoading" class="records-loading"><text>加载中...</text></view>
          <view v-else-if="followList.length === 0" class="records-empty"><text>暂无跟读记录</text></view>
          <view v-else class="records-list">
            <view
              v-for="item in followList"
              :key="item._id"
              class="record-item"
              @click="goFollowResult(item._id)"
            >
              <text class="record-accuracy">{{ item.accuracy || 0 }}%</text>
              <text class="record-meta">跟读 · {{ formatDuration(item.duration_seconds) }}</text>
              <text class="record-time">{{ formatTime(item.created_at) }}</text>
              <text class="record-delete-btn" @tap.stop="onDeleteFollow(item)">删除</text>
            </view>
          </view>
        </view>
      </view>
      <view class="records-section">
        <view class="section-title section-title--clickable" @click="reciteExpanded = !reciteExpanded">
          <uni-icons type="mic" size="14" color="#0b57d0" />
          <text>背诵记录</text>
          <text v-if="reciteList.length > 0" class="section-count">({{ reciteList.length }})</text>
          <view class="section-right">
            <text v-if="reciteList.length > 0" class="section-latest">最近 {{ reciteList[0].accuracy || 0 }}%</text>
            <uni-icons :type="reciteExpanded ? 'arrowup' : 'arrowright'" size="14" :color="reciteExpanded ? '#0b57d0' : '#999'" class="section-arrow" />
          </view>
        </view>
        <view v-show="reciteExpanded" class="section-body">
          <view v-if="reciteLoading" class="records-loading"><text>加载中...</text></view>
          <view v-else-if="reciteList.length === 0" class="records-empty"><text>暂无背诵记录</text></view>
          <view v-else class="records-list">
            <view
              v-for="item in reciteList"
              :key="item._id"
              class="record-item"
              @click="goReciteResult(item._id)"
            >
              <text class="record-accuracy">{{ item.accuracy || 0 }}%</text>
              <text class="record-meta">提示 {{ item.hint_count || 0 }} 次 · {{ formatDuration(item.duration_seconds) }}</text>
              <text class="record-time">{{ formatTime(item.created_at) }}</text>
              <text class="record-delete-btn" @tap.stop="onDeleteRecite(item)">删除</text>
            </view>
          </view>
        </view>
      </view>
      <view class="records-section">
        <view class="section-title section-title--clickable" @click="dictationExpanded = !dictationExpanded">
          <uni-icons type="compose" size="14" color="#2563eb" />
          <text>默写记录</text>
          <text v-if="dictationList.length > 0" class="section-count">({{ dictationList.length }})</text>
          <view class="section-right">
            <text v-if="dictationList.length > 0" class="section-latest">最近 {{ dictationList[0].accuracy || 0 }}%</text>
            <uni-icons :type="dictationExpanded ? 'arrowup' : 'arrowright'" size="14" :color="dictationExpanded ? '#2563eb' : '#999'" class="section-arrow" />
          </view>
        </view>
        <view v-show="dictationExpanded" class="section-body">
          <view v-if="dictationLoading" class="records-loading"><text>加载中...</text></view>
          <view v-else-if="dictationList.length === 0" class="records-empty"><text>暂无默写记录</text></view>
          <view v-else class="records-list">
            <view
              v-for="item in dictationList"
              :key="item._id"
              class="record-item"
              @click="goDictationResult(item._id)"
            >
              <text class="record-accuracy">{{ item.accuracy || 0 }}%</text>
              <text class="record-meta">{{ item.difficulty ? difficultyLabel(item.difficulty) : '默写' }}</text>
              <text class="record-time">{{ formatTime(item.created_at) }}</text>
              <text class="record-delete-btn" @tap.stop="onDeleteDictation(item)">删除</text>
            </view>
          </view>
        </view>
      </view>
    </view>
    <view class="learning-records login-tip" v-else>
      <text>登录后可查看背诵与默写记录</text>
    </view>

    <view class="action-bar">
      <view class="action-row">
        <button class="action-btn btn-fav" @click="toggleFavorite">
          <view class="btn-fav-inner">
            <uni-icons
              :type="isFavorited ? 'star-filled' : 'star'"
              size="22"
              :color="isFavorited ? '#d97706' : '#666'"
            />
            <text class="btn-fav-label">{{ isFavorited ? '已加入' : '加入学习' }}</text>
          </view>
        </button>
        <view class="action-group">
          <button class="action-btn btn-read" @click="goRead">跟读</button>
          <button class="action-btn btn-recite" @click="goRecite">背诵</button>
          <button class="action-btn btn-dictation" @click="goDictation">默写</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { store } from '@/uni_modules/uni-id-pages/common/store.js'
import { buildPlayUnits } from '@/common/playUnits.js'
import ttsService from '@/common/ttsService.js'
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      detail: {},
      isFavorited: false,
      togglingFavorite: false,
      expanded: false,
      reciteList: [],
      followList: [],
      dictationList: [],
      reciteLoading: false,
      followLoading: false,
      dictationLoading: false,
      // 三个记录区块默认收缩
      reciteExpanded: false,
      followExpanded: false,
      dictationExpanded: false
    }
  },
  onLoad(options) {
    this.id = options.id
    this.loadDetail()
    this.checkFavorite()
  },
  onShow() {
    this.checkFavorite()
    if (this.id && this.hasLogin) {
      this.loadReciteRecords()
      this.loadFollowRecords()
      this.loadDictationRecords()
    } else {
      this.reciteList = []
      this.followList = []
      this.dictationList = []
    }
  },
  computed: {
    hasLogin() {
      return store.hasLogin
    },
    needExpand() {
      const content = (this.detail && this.detail.content) || ''
      return content.length > 80
    },
    sentenceUnits() {
      const content = (this.detail && this.detail.content) || ''
      return buildPlayUnits(content)
    }
  },
  methods: {
    async loadDetail() {
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0]
          this.preloadTts()
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
      if (!this.detail || !this.detail.content) {
        uni.showToast({ title: '暂无可跟读内容', icon: 'none' })
        return
      }
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/follow?id=${this.id}`
      })
    },
    /** 跳转意见反馈页并预填纠错信息（id、标题），供用户补充纠错类型与内容 */
    goCorrection() {
      const id = this.id || (this.detail && this.detail._id) || ''
      const title = (this.detail && this.detail.title) || ''
      const url = getFeedbackUrl({ id, title, type: 'correction' })
      uni.navigateTo({ url })
    },
    /** 从首句开始朗读：进入朗读页并自动从头播放 */
    goReadFromStart() {
      if (!this.detail || !this.detail.content) {
        uni.showToast({ title: '暂无可朗读内容', icon: 'none' })
        return
      }
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/read?id=${this.id}&startIndex=0`
      })
    },
    /** 从指定句开始朗读：进入朗读页并从该句开始播放 */
    goReadFromSentence(index) {
      if (!this.detail || !this.detail.content) return
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/read?id=${this.id}&startIndex=${index}`
      })
    },
    async loadReciteRecords() {
      if (!this.id || !this.hasLogin) return
      this.reciteLoading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'list',
            data: { page: 1, pageSize: 10, text_id: this.id }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0 && result.data && result.data.list) {
          this.reciteList = result.data.list
        } else {
          this.reciteList = []
        }
      } catch (e) {
        console.error('加载背诵记录失败', e)
        this.reciteList = []
      } finally {
        this.reciteLoading = false
      }
    },
    async loadFollowRecords() {
      if (!this.id || !this.hasLogin) return
      this.followLoading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_follow-record',
          data: {
            action: 'list',
            data: { page: 1, pageSize: 10, text_id: this.id }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0 && result.data && result.data.list) {
          this.followList = result.data.list
        } else {
          this.followList = []
        }
      } catch (e) {
        console.error('加载跟读记录失败', e)
        this.followList = []
      } finally {
        this.followLoading = false
      }
    },
    async loadDictationRecords() {
      if (!this.id || !this.hasLogin) return
      this.dictationLoading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: {
            action: 'list',
            data: { page: 1, pageSize: 10, article_id: this.id }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0 && result.data && result.data.list) {
          this.dictationList = result.data.list
        } else {
          this.dictationList = []
        }
      } catch (e) {
        console.error('加载默写记录失败', e)
        this.dictationList = []
      } finally {
        this.dictationLoading = false
      }
    },
    formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    formatDuration(seconds) {
      const s = Number(seconds) || 0
      const min = Math.floor(s / 60)
      const sec = s % 60
      return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
    },
    difficultyLabel(v) {
      const map = { junior: '初级', middle: '中级', advanced: '高级' }
      return map[v] || v || '默写'
    },
    goReciteResult(recordId) {
      uni.navigateTo({ url: `/pages/ancient/recite-result?recordId=${recordId}` })
    },
    goFollowResult(recordId) {
      uni.navigateTo({ url: `/pages/ancient/recite-result?recordId=${recordId}&type=follow` })
    },
    goDictationResult(recordId) {
      uni.navigateTo({ url: `/pages/ancient/dictation-result?recordId=${recordId}` })
    },
    onDeleteFollow(item) {
      if (!item || !item._id) return
      uni.showModal({
        title: '确认删除',
        content: '确定要删除这条跟读记录吗？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const result = await uniCloud.callFunction({
              name: 'gw_follow-record',
              data: { action: 'delete', data: { id: item._id } }
            })
            const ret = (result && result.result) || {}
            if (ret.code !== 0) {
              uni.showToast({ title: ret.msg || '删除失败', icon: 'none' })
              return
            }
            this.followList = this.followList.filter((r) => r._id !== item._id)
            uni.showToast({ title: '已删除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
          }
        }
      })
    },
    onDeleteRecite(item) {
      if (!item || !item._id) return
      uni.showModal({
        title: '确认删除',
        content: '确定要删除这条背诵记录吗？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const result = await uniCloud.callFunction({
              name: 'gw_recite-record',
              data: { action: 'delete', data: { id: item._id } }
            })
            const ret = (result && result.result) || {}
            if (ret.code !== 0) {
              uni.showToast({ title: ret.msg || '删除失败', icon: 'none' })
              return
            }
            this.reciteList = this.reciteList.filter((r) => r._id !== item._id)
            uni.showToast({ title: '已删除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
          }
        }
      })
    },
    onDeleteDictation(item) {
      if (!item || !item._id) return
      uni.showModal({
        title: '确认删除',
        content: '确定要删除这条默写记录吗？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const result = await uniCloud.callFunction({
              name: 'gw_learning-records',
              data: {
                action: 'delete',
                data: { id: item._id, record_type: 'dictation' }
              }
            })
            const ret = (result && result.result) || {}
            if (ret.code !== 0) {
              uni.showToast({ title: ret.msg || '删除失败', icon: 'none' })
              return
            }
            this.dictationList = this.dictationList.filter((r) => r._id !== item._id)
            uni.showToast({ title: '已删除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
          }
        }
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
        console.error('检查学习列表状态失败', e)
      }
    },
    preloadTts() {
      const content = (this.detail && this.detail.content) || ''
      if (!content) return
      const units = buildPlayUnits(content)
      const unitsWithHash = units.map(item => ({
        ...item,
        hash: ttsService.buildUnitHash(item.text)
      }))
      ttsService.preloadAll(unitsWithHash).catch(() => {})
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
          title: this.isFavorited ? '已加入学习列表' : '已移出学习列表',
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
.header-left {
  display: flex;
  align-items: center;
}
.correction-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  background: #f5f5f5;
  border: 1rpx solid #e5e5e5;
}
.correction-text {
  font-size: 22rpx;
  color: #666;
}
.title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 44rpx;
  font-weight: bold;
  color: #333;
}
.read-hint {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 16rpx;
  background: #eef2ff;
  border-radius: 24rpx;
  border: 1rpx solid #c7d2fe;
}
.read-hint-text {
  font-size: 22rpx;
  color: #4f46e5;
}
.meta {
  font-size: 28rpx;
  color: #888;
}
.sentence-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.sentence-item {
  padding: 12rpx 0;
  border-radius: 8rpx;
}
.sentence-item:active {
  background: #f5f5f5;
}
.sentence-text {
  font-size: 34rpx;
  color: #333;
  line-height: 2;
  letter-spacing: 2rpx;
}
.content-tip {
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eee;
}
.tip-text {
  font-size: 24rpx;
  color: #999;
}
.content-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.header-right {
  width: 120rpx;
}
.content-inner {
  overflow: hidden;
}
.content-inner.collapsed {
  max-height: 20vh;
}
.expand-wrap {
  margin-top: 24rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eee;
  text-align: center;
}
.expand-btn {
  font-size: 26rpx;
  color: #4f46e5;
  padding: 8rpx 24rpx;
  background: #eef2ff;
  border-radius: 24rpx;
}
.learning-records {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx 40rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.learning-records.login-tip {
  text-align: center;
  color: #888;
  font-size: 26rpx;
}
.records-section {
  margin-bottom: 32rpx;
}
.records-section:last-child {
  margin-bottom: 0;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 16rpx;
}
.section-title--clickable {
  cursor: pointer;
  padding: 8rpx 0;
  margin-bottom: 0;
  user-select: none;
}
.section-title--clickable:active {
  opacity: 0.8;
}
.section-count {
  font-size: 24rpx;
  font-weight: normal;
  color: #999;
}
.section-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.section-latest {
  font-size: 26rpx;
  font-weight: 600;
  color: #0b57d0;
  text-align: right;
}
.records-section:nth-child(1) .section-latest { color: #4f46e5; }
.records-section:nth-child(2) .section-latest { color: #0b57d0; }
.records-section:nth-child(3) .section-latest { color: #2563eb; }
.section-arrow {
  flex-shrink: 0;
}
.section-body {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #eee;
}
.records-loading,
.records-empty {
  font-size: 26rpx;
  color: #888;
  padding: 16rpx 0;
}
.records-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.record-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  background: #f8fafc;
  border-radius: 12rpx;
  border: 1rpx solid #eee;
}
.record-accuracy {
  font-size: 28rpx;
  font-weight: 600;
  color: #0b57d0;
  min-width: 56rpx;
}
.record-meta {
  flex: 1;
  font-size: 24rpx;
  color: #666;
}
.record-time {
  font-size: 22rpx;
  color: #999;
}
.record-delete-btn {
  font-size: 24rpx;
  color: #f53f3f;
  padding: 4rpx 8rpx;
  flex-shrink: 0;
}
.records-section:nth-child(1) .record-accuracy { color: #4f46e5; }
.records-section:nth-child(2) .record-accuracy { color: #0b57d0; }
.records-section:nth-child(3) .record-accuracy { color: #2563eb; }
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx 24rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.action-row {
  display: flex;
  align-items: stretch;
  gap: 24rpx;
}
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: 28rpx;
  padding: 0;
  line-height: 1;
  height: 100rpx;
  border: none;
  border-radius: 12rpx;
}
/* 左侧：加入学习（上 icon 下文案，与 69 的 icon 按钮结构一致） */
.btn-fav {
  flex-shrink: 0;
  width: 120rpx;
  min-width: 120rpx;
  height: 100rpx;
  min-height: 100rpx;
  color: #666;
  background: #f5f5f5;
  border: 1rpx solid #e5e5e5;
  padding: 12rpx 0;
}
.btn-fav .btn-fav-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.btn-fav .btn-fav-label {
  font-size: 22rpx;
  line-height: 1.2;
}
/* 右侧一组三按钮：与 list 页跟读/背诵/默写标记颜色一致 */
.action-group {
  flex: 1;
  display: flex;
  gap: 0;
  border-radius: 12rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}
.action-group .action-btn {
  flex: 1;
  height: 100%;
  color: #fff;
  font-weight: 600;
  border-radius: 0;
}
.action-group .action-btn:first-child {
  border-radius: 12rpx 0 0 12rpx;
}
.action-group .action-btn:last-child {
  border-radius: 0 12rpx 12rpx 0;
}
/* 右侧三按钮：通透渐变色，略透明更柔和 */
.btn-read {
  background: linear-gradient(135deg, rgba(56, 142, 60, 0.82) 0%, rgba(27, 94, 32, 0.88) 100%);
}
.btn-recite {
  background: linear-gradient(135deg, rgba(25, 118, 210, 0.82) 0%, rgba(13, 71, 161, 0.88) 100%);
}
.btn-dictation {
  background: linear-gradient(135deg, rgba(239, 108, 0, 0.82) 0%, rgba(230, 81, 0, 0.88) 100%);
}
</style>