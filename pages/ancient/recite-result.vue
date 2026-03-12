<template>
  <view class="container">
    <view class="header">
      <view class="header-left">
        <view class="correction-btn" @click="goCorrection">
          <uni-icons type="compose" size="16" color="#666" />
          <text class="correction-text">纠错</text>
        </view>
      </view>
      <text class="link-tag" @click="goDetail">古文正文</text>
      <text class="title">{{ textData.title }}</text>
      <view class="stats">
        <view class="stat-item">
          <text class="stat-value">{{ accuracy }}%</text>
          <text class="stat-label">正确率</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ hintCount }}</text>
          <text class="stat-label">提示次数</text>
        </view>
      </view>
    </view>

    <view class="diff-area">
      <view class="diff-header">
        <text class="diff-label">对比结果：</text>
        <view class="legend-inline">
          <text class="legend-correct">● 正确</text>
          <text class="legend-fuzzy">● 近音</text>
          <text class="legend-missing">● 遗漏</text>
          <text class="legend-hinted">● 提醒</text>
        </view>
      </view>
      <view class="diff-content" v-if="diffGroups.length">
        <view v-for="(group, gIdx) in diffGroups" :key="gIdx"
          :id="`play-unit-${gIdx}`"
          class="sentence-block"
          :class="{ active: currentUnitIndex === gIdx, loading: loadingUnitIndex === gIdx }"
          @tap="onTapSentence(gIdx)">
          <template v-for="(item, idx) in group" :key="idx">
            <view v-if="item.status === 'fuzzy'" class="fuzzy-char-wrap">
              <text class="fuzzy-pinyin">{{ item.origPinyin }}</text>
              <text :class="['diff-char', 'diff-fuzzy', item.hinted ? 'diff-hinted' : '']">{{ item.char }}</text>
              <text class="fuzzy-recog">{{ item.recogChar }}({{ item.recogPinyin }})</text>
            </view>
            <text v-else
              :class="['diff-char', 'diff-' + item.status, item.hinted ? 'diff-hinted' : '']">{{ item.char }}</text>
          </template>
          <text v-if="loadingUnitIndex === gIdx" class="sentence-tip">合成中...</text>
        </view>
      </view>
      <view class="diff-content" v-else>
        <template v-for="(item, idx) in diffResult" :key="idx">
          <view v-if="item.status === 'fuzzy'" class="fuzzy-char-wrap">
            <text class="fuzzy-pinyin">{{ item.origPinyin }}</text>
            <text :class="['diff-char', 'diff-fuzzy', item.hinted ? 'diff-hinted' : '']">{{ item.char }}</text>
            <text class="fuzzy-recog">{{ item.recogChar }}({{ item.recogPinyin }})</text>
          </view>
          <text v-else
            :class="['diff-char', 'diff-' + item.status, item.hinted ? 'diff-hinted' : '']"
          >{{ item.char }}</text>
        </template>
      </view>
    </view>

    <view class="recognized-area" v-if="recognizedText">
      <view class="diff-label">识别文字：</view>
      <text class="recognized-text">{{ recognizedText }}</text>
    </view>

    <view class="action-area">
      <button type="primary" class="btn" @click="goReciteAgain">
        再背一次
      </button>
    </view>
  </view>
</template>

<script>
import { diffChars, calcAccuracy } from '@/common/diff.js'
import readBaseMixin from '@/common/readBaseMixin.js'
import { buildPlayUnits } from '@/common/playUnits.js'
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

export default {
  mixins: [readBaseMixin],
  data() {
    return {
      id: '',
      recordType: '',
      textData: {},
      recognizedText: '',
      hintCount: 0,
      duration: 0,
      diffResult: [],
      accuracy: 0,
      saved: false,
      diffGroups: [],
      /** 被提示过的原文字符索引（去标点后的索引） */
      hintedIndices: []
    }
  },
  onLoad(options) {
    this.initAudioContext()
    if (options.recordId) {
      this.recordType = options.type || 'recite'
      this.loadRecordDetail(options.recordId)
      return
    }
    this.id = options.id
    const app = getApp()
    const result = app.globalData && app.globalData.reciteResult
    if (result) {
      this.textData = result.textData
      this.recognizedText = result.recognizedText
      this.hintCount = result.hintCount
      this.duration = Number(result.duration) || 0
      this.hintedIndices = Array.isArray(result.hintedIndices) ? result.hintedIndices : []
    }
    this.doDiff()
    this.rebuildPlayUnitsForResult()
    this.saveRecord()
  },
  onUnload() {
    this.stopActiveAudio()
    if (this.audioContext) {
      try { this.audioContext.destroy() } catch (e) {}
      this.audioContext = null
    }
  },
  methods: {
    async loadRecordDetail(recordId) {
      try {
        const cfName = this.recordType === 'follow' ? 'gw_follow-record' : 'gw_recite-record'
        const res = await uniCloud.callFunction({
          name: cfName,
          data: { action: 'detail', data: { id: recordId } }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          uni.showToast({ title: result.msg || '记录加载失败', icon: 'none' })
          setTimeout(() => uni.navigateBack(), 1500)
          return
        }
        const r = result.data
        this.id = r.text_id
        this.textData = {
          title: r.text_title || '',
          author: r.text_author || '',
          dynasty: r.text_dynasty || ''
        }
        this.recognizedText = r.recognized_text || ''
        this.hintCount = Number(r.hint_count) || 0
        this.duration = Number(r.duration_seconds) || 0
        this.diffResult = Array.isArray(r.diff_result) ? r.diff_result : []
        this.accuracy = Number(r.accuracy) || 0
        // 从 diffResult 重建 content 用于拆句
        const content = this.diffResult
          .filter(d => d.status !== 'extra')
          .map(d => d.char).join('')
        if (content) {
          this.textData.content = content
        }
        this.rebuildPlayUnitsForResult()
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 1500)
      }
    },
    rebuildPlayUnitsForResult() {
      const content = String((this.textData && this.textData.content) || '').replace(/\r\n/g, '\n')
      if (!content) { this.diffGroups = []; return }
      const units = buildPlayUnits(content)
      this.playUnits = units.map((item, index) => ({
        unitId: `${this.id || 'text'}-${index}-${this.createStableHash(item.text)}`,
        text: item.text,
        mainIndex: item.mainIndex,
        subIndex: item.subIndex,
        hash: this.buildUnitHash(item.text)
      }))
      this.buildDiffGroups(content)
    },
    buildDiffGroups(content) {
      if (!this.playUnits.length || !this.diffResult.length) {
        this.diffGroups = []
        return
      }
      // 只保留原文字符（排除 extra）的 diff 项
      const originalDiffs = this.diffResult.filter(d => d.status !== 'extra')
      const groups = []
      let charPos = 0
      for (const unit of this.playUnits) {
        const unitStart = content.indexOf(unit.text, charPos)
        if (unitStart < 0) { groups.push([]); continue }
        const unitEnd = unitStart + unit.text.length
        groups.push(originalDiffs.slice(unitStart, unitEnd))
        charPos = unitEnd
      }
      this.diffGroups = groups
    },
    onTapSentence(index) {
      this.stopActiveAudio()
      this.resolveAudioPlay('stopped')
      this.playUnit(index)
    },
    doDiff() {
      if (!this.textData.content) return
      this.diffResult = diffChars(
        this.textData.content,
        this.recognizedText
      )
      this.markHintedChars()
      const baseAccuracy = calcAccuracy(this.diffResult)
      this.accuracy = this.applyHintPenalty(baseAccuracy)
    },
    /** 将 hintedIndices（去标点索引）映射到 diffResult（含标点索引），标记 hinted */
    markHintedChars() {
      if (!this.hintedIndices.length || !this.diffResult.length) return
      const hintedSet = new Set(this.hintedIndices)
      let noPuncIdx = 0
      for (let i = 0; i < this.diffResult.length; i++) {
        if (this.diffResult[i].status === 'punctuation') continue
        if (hintedSet.has(noPuncIdx)) {
          this.diffResult[i].hinted = true
        }
        noPuncIdx++
      }
    },
    applyHintPenalty(baseAccuracy) {
      const totalChars = Array.isArray(this.diffResult)
        ? this.diffResult.filter(d => d.status !== 'punctuation' && d.status !== 'normal').length
        : 0
      const hintedCharCount = Array.isArray(this.hintedIndices) ? this.hintedIndices.length : 0
      if (!totalChars || !hintedCharCount) return baseAccuracy

      const ratio = hintedCharCount / totalChars
      const maxPenalty = 20
      const penalty = Math.round(ratio * maxPenalty)
      const finalAccuracy = Math.max(0, baseAccuracy - penalty)
      return finalAccuracy
    },
    getUniIdToken() {
      const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
      if (!currentUserInfo.token) return ''
      if (currentUserInfo.tokenExpired && currentUserInfo.tokenExpired < Date.now()) {
        return ''
      }
      return currentUserInfo.token
    },
    async saveRecord() {
      if (this.saved) return
      if (!this.id || !this.textData || !this.textData.title) return
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'save',
            uniIdToken,
            data: {
              text_id: this.id,
              text_title: this.textData.title,
              hint_count: this.hintCount,
              duration_seconds: this.duration,
              recognized_text: this.recognizedText,
              diff_result: this.diffResult,
              accuracy: this.accuracy
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0) {
          this.saved = true
        } else {
          if (result.msg === '请先登录') {
            uni.showToast({ title: '请先登录后记录会保存到历史', icon: 'none' })
          } else {
            uni.showToast({ title: result.msg || '保存失败', icon: 'none' })
          }
        }
      } catch (e) {
        console.error('保存记录失败:', e)
        uni.showToast({ title: '保存记录失败', icon: 'none' })
      }
    },
    goReciteAgain() {
      uni.redirectTo({
        url: `/pages/ancient/recite?id=${this.id}`
      })
    },
    goCorrection() {
      const id = this.id || (this.textData && this.textData._id) || ''
      const title = (this.textData && this.textData.title) || ''
      uni.navigateTo({ url: getFeedbackUrl({ id, title, type: 'recite' }) })
    },
    goDetail() {
      if (!this.id) return
      uni.navigateTo({
        url: `/pages/ancient/detail?id=${this.id}`
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
  position: relative;
  text-align: center;
  margin-bottom: 40rpx;
}
.header-left {
  position: absolute;
  left: 0;
  top: 0;
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
.link-tag {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 24rpx;
  color: #1890ff;
  padding: 6rpx 16rpx;
  border: 1rpx solid #1890ff;
  border-radius: 8rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
}
.stats {
  display: flex;
  justify-content: center;
  gap: 80rpx;
}
.stat-item {
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.stat-label {
  font-size: 24rpx;
  color: #999;
}
.diff-area {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.diff-label {
  font-size: 26rpx;
  color: #999;
}
.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.legend-inline {
  display: flex;
  gap: 16rpx;
  align-items: center;
}
.diff-content {
  line-height: 2.2;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-punctuation {
  color: #666;
}
.diff-missing, .diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.diff-hinted {
  background-color: #fff7e6;
  border: 1rpx solid #d48806;
  border-radius: 4rpx;
  padding: 0 2rpx;
}
.legend-correct {
  font-size: 22rpx;
  color: #52c41a;
}
.legend-missing {
  font-size: 22rpx;
  color: #f5222d;
}
.legend-hinted {
  font-size: 22rpx;
  color: #ad4e00;
}
.legend-fuzzy {
  font-size: 22rpx;
  color: #fa8c16;
}
.diff-fuzzy {
  color: #fa8c16;
  text-decoration: underline;
  text-decoration-style: wavy;
}
.fuzzy-char-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin: 0 2rpx;
  vertical-align: bottom;
}
.fuzzy-pinyin {
  font-size: 20rpx;
  color: #52c41a;
  line-height: 1.2;
}
.fuzzy-recog {
  font-size: 18rpx;
  color: #fa8c16;
  line-height: 1.2;
}
.recognized-area {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 40rpx;
}
.recognized-text {
  font-size: 30rpx;
  color: #666;
  line-height: 1.8;
}
.action-area {
  padding: 20rpx 0;
}
.btn {
  width: 100%;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
.sentence-block {
  display: inline;
  padding: 4rpx 0;
  border-radius: 8rpx;
  transition: background-color 0.2s;
}
.sentence-block.active {
  background-color: rgba(24, 144, 255, 0.1);
}
.sentence-block.loading {
  background-color: rgba(24, 144, 255, 0.05);
}
.sentence-tip {
  font-size: 22rpx;
  color: #1890ff;
  margin-left: 8rpx;
}
</style>
