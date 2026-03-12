<template>
  <view class="container">
    <!-- 头部信息 -->
    <view class="header">
      <view class="header-left">
        <view class="correction-btn" @click="goCorrection">
          <uni-icons type="compose" size="16" color="#666" />
          <text class="correction-text">纠错</text>
        </view>
      </view>
      <view class="header-main">
        <text class="title">{{ title }}</text>
        <text class="author" v-if="author">{{ dynasty ? dynasty + ' · ' : '' }}{{ author }}</text>
      </view>
    </view>

    <!-- 准确率 -->
    <view class="accuracy-card">
      <view class="accuracy-row">
        <text class="accuracy-label">准确率</text>
        <text class="accuracy-value">{{ accuracy }}%</text>
      </view>
      <view class="progress-bar">
        <view class="progress-fill" :style="{ width: accuracy + '%' }"></view>
      </view>
    </view>

    <!-- 拍照原图（横向展示） -->
    <view class="section-card" v-if="imageUrl">
      <view class="section-label">默写照片（点击查看大图）</view>
      <scroll-view class="photo-scroll" scroll-x>
        <image
          class="photo-preview"
          :src="imageUrl"
          mode="heightFix"
          @tap="previewImage"
        />
      </scroll-view>
    </view>

    <!-- 逐字批改 -->
    <view class="section-card">
      <view class="section-label">批改详情</view>

      <!-- 新版：双行对照（version 2） -->
      <template v-if="diffVersion === 2">
        <view class="detail-row" v-if="renderTitleList.length">
          <text class="detail-label">标题：</text>
          <view class="dual-row-grid">
            <view class="char-col" v-for="(item, idx) in renderTitleList" :key="'rt-' + idx">
              <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
              <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '']">{{ item.written || '\u3000' }}</text>
            </view>
          </view>
        </view>
        <view class="detail-row" v-if="renderAuthorList.length">
          <text class="detail-label">朝代·作者：</text>
          <view class="dual-row-grid">
            <view class="char-col" v-for="(item, idx) in renderAuthorList" :key="'ra-' + idx">
              <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
              <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '']">{{ item.written || '\u3000' }}</text>
            </view>
          </view>
        </view>
        <view class="detail-row content-row" v-if="renderContentList.length">
          <text class="detail-label">正文：</text>
          <view class="dual-row-grid">
            <view class="char-col" v-for="(item, idx) in renderContentList" :key="'rc-' + idx">
              <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
              <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '']">{{ item.written || '\u3000' }}</text>
            </view>
          </view>
        </view>
      </template>

      <!-- 旧版：标题/作者/正文（version 1） -->
      <template v-else>
        <view class="detail-row" v-if="titleDiff.length">
          <text class="detail-label">标题：</text>
          <text
            v-for="(item, idx) in titleDiff"
            :key="'t-' + idx"
            :class="['diff-char', 'diff-' + item.status]"
          >{{ item.status === 'missing' ? '＿' : item.char }}</text>
        </view>
        <view class="detail-row" v-if="authorDiff.length">
          <text class="detail-label">朝代·作者：</text>
          <text
            v-for="(item, idx) in authorDiff"
            :key="'a-' + idx"
            :class="['diff-char', 'diff-' + item.status]"
          >{{ item.status === 'missing' ? '＿' : item.char }}</text>
        </view>
        <view class="detail-row content-row" v-if="contentDiff.length">
          <text class="detail-label">正文：</text>
          <view class="diff-content">
            <text
              v-for="(item, idx) in contentDiff"
              :key="'c-' + idx"
              :class="['diff-char', 'diff-' + item.status]"
            >{{ item.status === 'missing' ? '＿' : item.char }}</text>
          </view>
        </view>
      </template>

      <!-- 图例 -->
      <view class="legend" v-if="diffVersion === 2">
        <text class="legend-correct">● 正确</text>
        <text class="legend-wrong">● 写错</text>
        <text class="legend-missing">● 漏写</text>
        <text class="legend-reversed">● 写反</text>
        <text class="legend-extra">● 多写</text>
        <text class="legend-tongjiazi">● 通假字</text>
      </view>
      <view class="legend" v-else>
        <text class="legend-correct">● 正确</text>
        <text class="legend-wrong">● 错误</text>
        <text class="legend-missing">● 漏写</text>
      </view>
    </view>

    <!-- 错字详情 -->
    <view class="section-card" v-if="wrongDetails.length > 0">
      <view class="section-label">错字详情</view>
      <view class="wrong-list">
        <view class="wrong-item" v-for="(item, idx) in wrongDetails" :key="idx">
          <text class="wrong-original">{{ item.char }}</text>
          <text class="wrong-arrow">→</text>
          <text class="wrong-written">{{ item.recognized }}</text>
          <text class="wrong-type" v-if="diffVersion === 2 && item.errorType">{{ errorTypeLabel(item.errorType) }}</text>
        </view>
      </view>
    </view>

    <!-- 识别文字 -->
    <view class="section-card">
      <view class="section-label">识别文字</view>
      <text class="recognized-text">{{ recognizedText || '（无识别内容）' }}</text>
    </view>

    <!-- 操作按钮 -->
    <view class="action-area">
      <button class="btn btn-primary" @tap="checkAgain">再次检查</button>
      <button class="btn btn-secondary" @tap="goBack">返回默写</button>
    </view>
  </view>
</template>

<script>
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

export default {
  data() {
    return {
      title: '',
      author: '',
      dynasty: '',
      originalText: '',
      recognizedText: '',
      diffResult: [],
      accuracy: 0,
      imageUrl: '',
      articleId: '',
      diffVersion: 1,
      renderTitleList: [],
      renderAuthorList: [],
      renderContentList: []
    }
  },
  computed: {
    /** 原文中标题部分长度（去空格），用于拆分批改结果 */
    titlePartLength() {
      return (this.title || '').replace(/\s+/g, '').length
    },
    /** 原文中朝代·作者部分长度（去空格） */
    authorPartLength() {
      const s = this.dynasty && this.author ? (this.dynasty + '·' + this.author) : (this.author || this.dynasty || '')
      return (s || '').replace(/\s+/g, '').length
    },
    /** 批改详情：仅标题部分 */
    titleDiff() {
      return this.diffResult.slice(0, this.titlePartLength)
    },
    /** 批改详情：仅朝代·作者部分 */
    authorDiff() {
      return this.diffResult.slice(this.titlePartLength, this.titlePartLength + this.authorPartLength)
    },
    /** 批改详情：仅正文部分 */
    contentDiff() {
      return this.diffResult.slice(this.titlePartLength + this.authorPartLength)
    },
    wrongDetails() {
      if (this.diffVersion === 2) {
        const errors = (this.diffResult && this.diffResult.errors) || []
        return errors.filter(e => e.type === 'wrong' && e.written).map(e => ({
          char: e.original,
          recognized: e.written,
          errorType: e.errorType || 'other',
          note: e.note || ''
        }))
      }
      return this.diffResult.filter(d => d.status === 'wrong' && d.recognized)
    }
  },
  onLoad(options) {
    if (options.recordId) {
      this.loadRecordDetail(options.recordId)
      return
    }
    const app = getApp()
    const result = app.globalData && app.globalData.dictationCheckResult
    if (!result) {
      uni.showToast({ title: '无批改数据', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 1500)
      return
    }
    this.title = result.title || ''
    this.author = result.author || ''
    this.dynasty = result.dynasty || ''
    this.originalText = result.originalText || ''
    this.recognizedText = this.parseRecognizedText(result.recognizedText || '') || ''
    this.diffResult = result.diffResult || []
    this.accuracy = result.accuracy || 0
    this.imageUrl = result.imageUrl || ''
    this.articleId = result.articleId || ''
    this.initDiffVersion()
  },
  methods: {
    /** 若识别结果为 JSON 字符串（如 {"content":"..."}），则解析并返回 content，否则返回原值 */
    parseRecognizedText(val) {
      if (val == null || typeof val !== 'string' || !val.trim()) return val
      try {
        const p = JSON.parse(val)
        if (p && typeof p.content === 'string') return p.content
      } catch (e) {}
      return val
    },
    goCorrection() {
      const id = this.articleId || ''
      const title = this.title || ''
      uni.navigateTo({ url: getFeedbackUrl({ id, title, type: 'dictation' }) })
    },
    async loadRecordDetail(recordId) {
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: { action: 'detail', data: { id: recordId } }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          uni.showToast({ title: result.msg || '记录加载失败', icon: 'none' })
          setTimeout(() => uni.navigateBack(), 1500)
          return
        }
        const r = result.data
        this.title = r.text_title || ''
        this.author = r.text_author || ''
        this.dynasty = r.text_dynasty || ''
        this.originalText = r.original_text || ''
        this.recognizedText = this.parseRecognizedText(r.recognized_text || '') || ''
        this.diffResult = r.diff_result || (Array.isArray(r.diff_result) ? r.diff_result : [])
        this.accuracy = Number(r.accuracy) || 0
        this.imageUrl = r.image_url || ''
        this.articleId = r.article_id || ''
        this.initDiffVersion()
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 1500)
      }
    },
    previewImage() {
      if (!this.imageUrl) return
      uni.previewImage({
        urls: [this.imageUrl],
        current: this.imageUrl
      })
    },
    checkAgain() {
      uni.navigateBack()
    },
    goBack() {
      uni.navigateBack()
    },
    errorTypeLabel(type) {
      const map = { homophone: '同音字', similar: '形近字', other: '写错' }
      return map[type] || '写错'
    },
    /** 判断 diff 版本并生成渲染列表 */
    initDiffVersion() {
      if (this.diffResult && this.diffResult.version === 2) {
        this.diffVersion = 2
        const fullList = this.buildRenderList(this.originalText, this.diffResult.errors || [])
        // 按标题、作者、正文拆分
        const titleLen = this.titlePartLength
        const authorLen = this.authorPartLength
        this.renderTitleList = fullList.slice(0, titleLen)
        this.renderAuthorList = fullList.slice(titleLen, titleLen + authorLen)
        this.renderContentList = fullList.slice(titleLen + authorLen)
      } else {
        this.diffVersion = 1
        if (!Array.isArray(this.diffResult)) {
          this.diffResult = []
        }
      }
    },
    /** 构建双行对照渲染数组 */
    buildRenderList(originalText, errors) {
      const fullText = originalText || ''
      const recognized = (this.recognizedText || '').replace(/[\u00B7\s\u3000-\u303f\uff00-\uffef\u2000-\u206f，。！？；：、·""''（）《》【】]/g, '')
      const list = []
      // 逐字初始化
      for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i]
        const isPunct = /[\u00B7\u3000-\u303f\uff00-\uffef\u2000-\u206f，。！？；：、·""''（）《》【】\s]/.test(ch)
        list.push({
          char: ch,
          status: isPunct ? 'punctuation' : 'correct',
          written: '',
          errorType: '',
          note: '',
          isGroupStart: false
        })
      }
      // 遍历错误，定位并标记
      if (Array.isArray(errors)) {
        for (const err of errors) {
          if (err.type === 'extra') {
            const insertIdx = this.findInsertPosition(list, fullText, err)
            const extraChars = (err.written || '').split('')
            for (let i = 0; i < extraChars.length; i++) {
              list.splice(insertIdx + i, 0, {
                char: null,
                status: 'extra',
                written: extraChars[i],
                errorType: '',
                note: err.note || '多写',
                isGroupStart: i === 0
              })
            }
            continue
          }
          const pos = this.findErrorPosition(fullText, err)
          if (pos < 0) continue
          const origChars = (err.original || '').split('')
          for (let i = 0; i < origChars.length; i++) {
            const idx = pos + i
            if (idx >= list.length) break
            list[idx].status = err.type
            list[idx].isGroupStart = i === 0
            if (i === 0) {
              list[idx].written = err.written || ''
              list[idx].errorType = err.errorType || ''
              list[idx].note = err.note || ''
            }
          }
        }
      }
      // 兜底：用字频校验，防止大模型漏判 missing
      if (recognized) {
        // 统计识别文本中每个字的出现次数
        const recognizedFreq = {}
        for (const ch of recognized) {
          recognizedFreq[ch] = (recognizedFreq[ch] || 0) + 1
        }
        // 扣除大模型已标记的 wrong/reversed 中 written 的字（这些字占用了识别文本的频次）
        for (const item of list) {
          if ((item.status === 'wrong' || item.status === 'reversed' || item.status === 'tongjiazi') && item.written) {
            for (const ch of item.written) {
              if (recognizedFreq[ch]) recognizedFreq[ch]--
            }
          }
        }
        // 统计原文中被标为 correct 的每个字的次数
        const correctChars = []
        for (let i = 0; i < list.length; i++) {
          if (list[i].status === 'correct' && list[i].char) {
            correctChars.push(i)
          }
        }
        // 按字分组，检查 correct 数量是否超过识别文本中的剩余出现次数
        const correctFreq = {}
        for (const idx of correctChars) {
          const ch = list[idx].char
          correctFreq[ch] = (correctFreq[ch] || 0) + 1
          if (correctFreq[ch] > (recognizedFreq[ch] || 0)) {
            list[idx].status = 'missing'
          }
        }
      }
      return list
    },
    /** 通过 context 在原文中定位错误位置 */
    findErrorPosition(fullText, err) {
      const original = err.original || ''
      const context = err.context || ''
      if (!original) return -1
      // 优先用 context 定位
      if (context) {
        const ctxIdx = fullText.indexOf(context)
        if (ctxIdx >= 0) {
          const relIdx = context.indexOf(original)
          if (relIdx >= 0) return ctxIdx + relIdx
        }
      }
      // fallback：直接搜索 original
      return fullText.indexOf(original)
    },
    /** 找到多写内容的插入位置 */
    findInsertPosition(list, fullText, err) {
      const after = err.afterOriginal || ''
      const context = err.context || ''
      if (after) {
        if (context) {
          const ctxIdx = fullText.indexOf(context)
          if (ctxIdx >= 0) {
            const relIdx = context.indexOf(after)
            if (relIdx >= 0) return ctxIdx + relIdx + after.length
          }
        }
        const idx = fullText.indexOf(after)
        if (idx >= 0) return idx + after.length
      }
      // fallback：插在末尾
      return list.length
    }
  }
}
</script>

<style scoped>
.container {
  padding: 24rpx;
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}
.header {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: 24rpx;
}
.header-left {
  flex-shrink: 0;
  margin-right: 16rpx;
}
.header-main {
  flex: 1;
  min-width: 0;
  text-align: center;
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
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}
.author {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-top: 8rpx;
}
.accuracy-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.accuracy-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.accuracy-label {
  font-size: 28rpx;
  color: #666;
}
.accuracy-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.progress-bar {
  height: 12rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  border-radius: 6rpx;
  transition: width 0.5s ease;
}
.section-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.section-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 16rpx;
}
.detail-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 16rpx;
}
.detail-label {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #999;
  margin-right: 12rpx;
  line-height: 2.4;
}
.detail-row .diff-char {
  font-size: 36rpx;
}
.content-row {
  display: block;
}
.content-row .detail-label {
  display: block;
  margin-bottom: 8rpx;
}
.content-row .diff-content {
  margin-bottom: 0;
}
.photo-scroll {
  width: 100%;
  white-space: nowrap;
  border-radius: 8rpx;
}
.photo-preview {
  height: 400rpx;
  border-radius: 8rpx;
}
.diff-content {
  line-height: 2.4;
  margin-bottom: 16rpx;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.diff-missing {
  color: #f5222d;
  text-decoration: underline;
}
.diff-punctuation {
  color: #333;
}
/* 双行对照样式 */
.dual-row-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 16rpx;
}
.char-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 52rpx;
  margin-bottom: 12rpx;
}
.row-original {
  font-size: 36rpx;
  line-height: 1.6;
  text-align: center;
}
.row-actual {
  font-size: 26rpx;
  line-height: 1.4;
  text-align: center;
  min-height: 36rpx;
}
/* 原文行颜色 */
.row-original.diff-correct {
  color: #52c41a;
}
.row-original.diff-wrong {
  color: #f5222d;
}
.row-original.diff-missing {
  color: #f5222d;
  text-decoration: underline;
}
.row-original.diff-reversed {
  color: #fa8c16;
}
.row-original.diff-extra {
  color: transparent;
}
.row-original.diff-tongjiazi {
  color: #1890ff;
}
.row-original.diff-punctuation {
  color: #333;
}
/* 实际行颜色 */
.diff-actual-wrong {
  color: #f5222d;
}
.diff-actual-reversed {
  color: #fa8c16;
}
.diff-actual-extra {
  color: #f5222d;
}
.diff-actual-tongjiazi {
  color: #1890ff;
}
.legend {
  display: flex;
  gap: 30rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.legend-correct {
  font-size: 24rpx;
  color: #52c41a;
}
.legend-wrong {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-missing {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-reversed {
  font-size: 24rpx;
  color: #fa8c16;
}
.legend-extra {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-tongjiazi {
  font-size: 24rpx;
  color: #1890ff;
}
.wrong-type {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
  background: #f5f5f5;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
}
.wrong-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.wrong-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  background: #fff2f0;
  border-radius: 8rpx;
}
.wrong-original {
  font-size: 30rpx;
  color: #52c41a;
  font-weight: bold;
}
.wrong-arrow {
  font-size: 24rpx;
  color: #999;
}
.wrong-written {
  font-size: 30rpx;
  color: #f5222d;
  font-weight: bold;
}
.recognized-text {
  font-size: 28rpx;
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
.btn-primary {
  background: #2f6fff;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
