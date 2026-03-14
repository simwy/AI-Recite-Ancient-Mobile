<template>
  <view class="container">
    <view class="top-bar">
      <view class="correction-btn" @click="goCorrection">
        <uni-icons type="compose" size="16" color="#666" />
        <text class="correction-text">纠错</text>
      </view>
    </view>
    <view class="section-top">
      <view class="section-header">
        <view class="section-title">默写练习</view>
      </view>
      <view class="difficulty-tabs">
        <view
          v-for="item in difficultyOptions"
          :key="item.value"
          class="difficulty-tab"
          :class="{ active: selectedDifficulty === item.value }"
          @tap="selectedDifficulty = item.value"
        >
          {{ item.label }}
        </view>
      </view>

      <view class="style-label">纸张样式</view>
      <view class="difficulty-tabs style-tabs">
        <view
          v-for="item in paperStyleOptions"
          :key="item.value"
          class="difficulty-tab"
          :class="{ active: paperStyle === item.value }"
          @tap="paperStyle = item.value"
        >
          {{ item.label }}
        </view>
      </view>

      <view class="paper-card">
        <view class="paper-title">{{ detail.title || '（未命名）' }}</view>
        <view class="paper-subtitle">{{ authorDisplayText }}</view>
        <view class="paper-meta-row">
          <text class="paper-meta-left">{{ currentDifficultyLabel }}</text>
          <text class="paper-meta-right">{{ id || '—' }}</text>
        </view>
        <view class="paper-divider"></view>
        <view class="paper-content">
          <!-- 下划线/虚线：流式布局 -->
          <view v-if="paperStyle === 'underline' || paperStyle === 'dotted'" class="paper-value paper-main">
            <template v-for="(seg, i) in paperSegments" :key="i">
              <text v-if="seg.type !== 'blank'">{{ seg.value }}</text>
              <view v-else :class="paperStyle === 'dotted' ? 'dotted-cell' : 'underline-cell'"></view>
            </template>
          </view>
          <!-- 格子类：flex wrap 布局 -->
          <view v-else class="paper-value paper-grid" :class="'grid-' + paperStyle">
            <template v-for="(seg, i) in gridSegments" :key="i">
              <view v-if="seg.type === 'pad'" class="grid-cell grid-pad" :class="gridCellClass"></view>
              <view v-else class="grid-cell" :class="[gridCellClass, seg.type === 'blank' ? 'grid-blank' : 'grid-char']">
                <text v-if="seg.type !== 'blank'" class="grid-text">{{ seg.value }}</text>
              </view>
            </template>
          </view>
        </view>
      </view>
    </view>

    <view class="print-record-section">
      <view
        class="print-record-header"
        @tap="printRecordExpanded = !printRecordExpanded"
      >
        <text class="print-record-title">打印记录</text>
        <text class="print-record-count" v-if="printRecordTotal > 0">共 {{ printRecordTotal }} 条</text>
        <text class="print-record-arrow" :class="{ expanded: printRecordExpanded }">›</text>
      </view>
      <view v-if="printRecordExpanded" class="print-record-body">
        <view v-if="printRecordLoading" class="print-record-loading">加载中...</view>
        <view v-else-if="!printRecordList.length" class="print-record-empty">暂无打印记录</view>
        <view v-else class="print-record-list">
          <view
            v-for="(item, idx) in printRecordList"
            :key="item._id || idx"
            class="print-record-item"
          >
            <view class="print-record-item-title">{{ item.text_title || '（未命名）' }}</view>
            <view class="print-record-item-meta">
              <text v-if="item.difficulty_label">{{ item.difficulty_label }}</text>
              <text v-if="item.difficulty_label" class="meta-dot">·</text>
              <text>{{ formatPrintTime(item.created_at) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="action-row">
        <view class="action-group">
          <button class="action-btn btn-print" @tap="printDictationPaper">
            <image
              class="icon-printer"
              :src="printerIconDataUri"
              mode="aspectFit"
            />
            <text class="btn-text">打印默写纸</text>
          </button>
          <button class="action-btn btn-capture" @tap="openPhotoEntry">
            <uni-icons type="camera" size="22" color="#fff" />
            <text class="btn-text">拍照检查</text>
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()
import { runDictationCheck } from '@/common/dictationCheck.js'
import { getFeedbackUrl } from '@/common/feedbackHelper.js'

export default {
  data() {
    return {
      id: '',
      detail: {},
      printerIconDataUri: 'data:image/svg+xml,' + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 6 2 18 2 18 9'/><path d='M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2'/><rect x='6' y='14' width='12' height='8'/></svg>"
      ),
      selectedDifficulty: 'advanced',
      difficultyOptions: [
        { label: '初级默写', value: 'junior' },
        { label: '中级默写', value: 'middle' },
        { label: '高级默写', value: 'advanced' }
      ],
      paperStyle: 'underline',
      paperStyleOptions: [
        { label: '下划线', value: 'underline' },
        { label: '虚线', value: 'dotted' },
        { label: '田字格', value: 'tian_grid' },
        { label: '米字格', value: 'mi_grid' },
        { label: '作文格', value: 'essay_grid' },
        { label: '中高考贴', value: 'exam_grid' }
      ],
      printRecordList: [],
      printRecordTotal: 0,
      printRecordLoading: false,
      printRecordExpanded: false
    }
  },
  computed: {
    currentDifficultyLabel() {
      const opt = this.difficultyOptions.find(d => d.value === this.selectedDifficulty)
      return opt ? opt.label : ''
    },
    authorDisplayText() {
      const dynasty = this.safeText(this.detail.dynasty)
      const author = this.safeText(this.detail.author)
      if (dynasty && author) return `${dynasty} · ${author}`
      if (author) return author
      return '——'
    },
    paperSegments() {
      const content = this.safeText(this.detail.content)
      if (!content) {
        return Array.from({ length: 30 }, () => ({ type: 'blank', value: '' }))
      }
      return this.getPaperSegments(content, this.selectedDifficulty)
    },
    isGridStyle() {
      return ['tian_grid', 'mi_grid', 'essay_grid', 'exam_grid'].includes(this.paperStyle)
    },
    gridCellClass() {
      const map = {
        tian_grid: 'tian-grid-cell',
        mi_grid: 'mi-grid-cell',
        essay_grid: 'essay-grid-cell',
        exam_grid: 'exam-grid-cell'
      }
      return map[this.paperStyle] || ''
    },
    gridSegments() {
      if (!this.isGridStyle) return this.paperSegments
      // 格子类：换行符后插入 pad 填充到行尾，实现强制换行
      // 预览时每行格数自适应，这里用 20 作为估算值
      const colsMap = { essay_grid: 17, exam_grid: 19 }
      const cols = colsMap[this.paperStyle] || 20
      const result = []
      let col = 0
      for (const seg of this.paperSegments) {
        if (seg.value === '\n') {
          // 填充当前行剩余格子
          const remaining = cols - (col % cols)
          if (remaining > 0 && remaining < cols) {
            for (let j = 0; j < remaining; j++) {
              result.push({ type: 'pad', value: '' })
            }
          }
          col = 0
          continue
        }
        result.push(seg)
        col++
      }
      return result
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.initDetail()
  },
  onShow() {
    this.loadPrintRecordList()
  },
  methods: {
    async initDetail() {
      const globalData = (getApp() && getApp().globalData) || {}
      const currentText = globalData.currentText || {}
      if (currentText && currentText._id === this.id && currentText.content) {
        this.detail = currentText
        return
      }
      if (!this.id) return
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0]
        }
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    async printDictationPaper() {
      const content = this.safeText(this.detail.content)
      if (!content) {
        uni.showToast({ title: '暂无正文内容', icon: 'none' })
        return
      }
      const diffLabel = (this.difficultyOptions.find(
        d => d.value === this.selectedDifficulty
      ) || {}).label || ''

      uni.showLoading({ title: '生成中...' })
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-print-pdf',
          data: {
            action: 'generate',
            articleId: this.id || this.detail._id || '',
            title: this.detail.title || '',
            dynasty: this.detail.dynasty || '',
            author: this.detail.author || '',
            content,
            difficulty: this.selectedDifficulty,
            fontSize: 'medium',
            difficultyLabel: diffLabel,
            paperStyle: this.paperStyle
          }
        })
        const result = res.result || {}
        if (result.code !== 0) {
          uni.showToast({ title: result.msg || '生成失败', icon: 'none' })
          return
        }
        const fileID = result.data.fileID
        const fileName = result.data.fileName || '默写纸.pdf'
        const urlRes = await uniCloud.getTempFileURL({ fileList: [fileID] })
        const fileUrl = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || ''
        if (!fileUrl) {
          uni.showToast({ title: '获取文件地址失败', icon: 'none' })
          return
        }
        await this.savePrintRecord({
          articleId: this.id || this.detail._id || '',
          title: this.detail.title || '',
          dynasty: this.detail.dynasty || '',
          author: this.detail.author || '',
          difficulty: this.selectedDifficulty,
          difficultyLabel: diffLabel,
          fontSize: 'medium',
          fileName,
          paperStyle: this.paperStyle
        })
        // H5/Chrome：直接用临时链接在新标签页打开 PDF，避免 uni.downloadFile 跨域报错
        // #ifdef H5
        window.open(fileUrl, '_blank', 'noopener')
        uni.showToast({ title: '已在新标签页打开', icon: 'none' })
        return
        // #endif
        const dlRes = await uni.downloadFile({ url: fileUrl })
        if (dlRes.statusCode !== 200 || !dlRes.tempFilePath) {
          uni.showToast({ title: '下载失败', icon: 'none' })
          return
        }
        uni.openDocument({
          filePath: dlRes.tempFilePath,
          fileType: 'pdf',
          showMenu: true,
          fail: () => {
            uni.showToast({ title: '打开PDF失败', icon: 'none' })
          }
        })
      } catch (e) {
        uni.showToast({ title: '生成PDF失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    },
    openPhotoEntry() {
      runDictationCheck({
        articleId: this.id || this.detail._id || '',
        difficulty: this.selectedDifficulty
      })
    },
    goCorrection() {
      const id = this.id || (this.detail && this.detail._id) || ''
      const title = (this.detail && this.detail.title) || ''
      uni.navigateTo({ url: getFeedbackUrl({ id, title, type: 'dictation' }) })
    },
    getUniIdToken() {
      const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
      if (!currentUserInfo.token) return ''
      if (currentUserInfo.tokenExpired && currentUserInfo.tokenExpired < Date.now()) return ''
      return currentUserInfo.token
    },
    async savePrintRecord(payload) {
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-print-record',
          data: {
            action: 'save',
            uniIdToken: this.getUniIdToken(),
            data: payload
          }
        })
        const result = res.result || {}
        if (result.code === 0 && !result.data?.skipped) {
          this.loadPrintRecordList()
        }
      } catch (e) {
        console.error('保存打印记录失败:', e)
      }
    },
    async loadPrintRecordList() {
      if (this.printRecordLoading) return
      this.printRecordLoading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-print-record',
          data: {
            action: 'list',
            uniIdToken: this.getUniIdToken(),
            data: { page: 1, pageSize: 20 }
          }
        })
        const result = res.result || {}
        if (result.code === 0 && result.data) {
          this.printRecordList = result.data.list || []
          this.printRecordTotal = result.data.total || 0
        }
      } catch (e) {
        console.error('加载打印记录失败:', e)
      } finally {
        this.printRecordLoading = false
      }
    },
    formatPrintTime(timestamp) {
      if (!timestamp) return '—'
      const d = new Date(timestamp)
      const now = new Date()
      const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      if (isToday) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    },
    safeText(value) {
      return (value || '').replace(/\r\n/g, '\n')
    },
    buildUnderline(length) {
      return new Array(length + 1).join('＿')
    },
    isPunctuation(char) {
      return /[，。、！？；：、“”‘’（）《》〈〉【】『』「」…,.!?;:'"()\-、]/.test(char)
    },
    isPhraseDelimiter(char) {
      return /[，、；：,;:]/.test(char)
    },
    isSentenceDelimiter(char) {
      return /[。！？!?]/.test(char)
    },
    getPaperSegments(content, difficulty) {
      let startChecker = () => false
      if (difficulty === 'junior') {
        startChecker = this.isPhraseDelimiter
      } else if (difficulty === 'middle') {
        startChecker = this.isSentenceDelimiter
      }

      let shouldHint = difficulty !== 'advanced'
      const segments = []

      for (let i = 0; i < content.length; i++) {
        const char = content[i]
        if (char === '\n') {
          segments.push({ type: 'char', value: '\n' })
          shouldHint = difficulty !== 'advanced'
          continue
        }
        if (/\s/.test(char)) {
          segments.push({ type: 'char', value: char })
          continue
        }
        if (this.isPunctuation(char)) {
          segments.push({ type: 'char', value: char })
          if (difficulty !== 'advanced' && startChecker(char)) {
            shouldHint = true
          }
          continue
        }
        if (difficulty !== 'advanced' && shouldHint) {
          segments.push({ type: 'char', value: char })
          shouldHint = false
        } else {
          segments.push({ type: 'blank', value: '' })
        }
      }
      return segments
    },
    maskContentByDifficulty(content, difficulty) {
      const segments = this.getPaperSegments(content, difficulty)
      return segments.map(s => (s.type === 'blank' ? '＿' : s.value)).join('')
    },
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: calc(150rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.top-bar {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
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
.section-top {
  position: relative;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-sizing: border-box;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.section-title {
  font-size: 30rpx;
  color: #222;
  font-weight: 600;
}
.difficulty-tabs {
  display: flex;
  gap: 14rpx;
  margin-bottom: 18rpx;
}
.difficulty-tab {
  padding: 10rpx 18rpx;
  background: #f5f7fb;
  color: #667085;
  border-radius: 999rpx;
  font-size: 24rpx;
}
.difficulty-tab.active {
  background: #2f6fff;
  color: #fff;
}
.paper-card {
  background: #fafbff;
  border: 1rpx dashed #d6def2;
  border-radius: 14rpx;
  padding: 20rpx;
}
.paper-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  text-align: center;
  margin-bottom: 8rpx;
}
.paper-subtitle {
  font-size: 26rpx;
  color: #475467;
  text-align: center;
  letter-spacing: 2rpx;
  margin-bottom: 16rpx;
}
.paper-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.paper-meta-left {
  font-size: 24rpx;
  color: #475467;
}
.paper-meta-right {
  font-family: monospace;
  font-size: 24rpx;
  color: #6b7280;
}
.paper-divider {
  border-top: 1rpx solid #d6def2;
  margin-bottom: 12rpx;
}
.paper-content {
  margin-top: 0;
}
.paper-value {
  color: #1f2937;
  font-size: 28rpx;
  line-height: 1.85;
}
.paper-main {
  display: block;
  margin-top: 8rpx;
  letter-spacing: 2rpx;
  white-space: pre-wrap;
  word-break: break-all;
}
.underline-cell {
  display: inline-block;
  min-width: 40rpx;
  height: 1.2em;
  border-bottom: 2rpx solid #1f2937;
  vertical-align: bottom;
  margin: 0 2rpx;
}
.dotted-cell {
  display: inline-block;
  min-width: 40rpx;
  height: 1.2em;
  border-bottom: 2rpx dashed #1f2937;
  vertical-align: bottom;
  margin: 0 2rpx;
}
.style-label {
  font-size: 26rpx;
  color: #475467;
  margin-bottom: 10rpx;
}
.style-tabs {
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 18rpx;
}
/* 格子布局容器 */
.paper-grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
}
/* 行间距：田字格/米字格 5mm≈30rpx，作文格 3mm≈18rpx，中高考贴 2mm≈12rpx */
.grid-tian_grid {
  row-gap: 30rpx;
}
.grid-mi_grid {
  row-gap: 30rpx;
}
.grid-essay_grid {
  row-gap: 18rpx;
}
.grid-exam_grid {
  row-gap: 12rpx;
}
.grid-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  position: relative;
}
.grid-text {
  font-size: 28rpx;
  color: #1f2937;
  line-height: 1;
}
.grid-blank {
  background: #fafbff;
}
.grid-pad {
  visibility: hidden;
}
/* 田字格 */
.tian-grid-cell {
  width: 60rpx;
  height: 60rpx;
  border: 1rpx solid #999;
}
.tian-grid-cell::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1rpx dashed #ccc;
}
.tian-grid-cell::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  border-left: 1rpx dashed #ccc;
}
/* 米字格：田字格 + 对角线 */
.mi-grid-cell {
  width: 60rpx;
  height: 60rpx;
  border: 1rpx solid #999;
  background: linear-gradient(
    to top right,
    transparent calc(50% - 0.5px),
    #ccc calc(50% - 0.5px),
    #ccc calc(50% + 0.5px),
    transparent calc(50% + 0.5px)
  ),
  linear-gradient(
    to bottom right,
    transparent calc(50% - 0.5px),
    #ccc calc(50% - 0.5px),
    #ccc calc(50% + 0.5px),
    transparent calc(50% + 0.5px)
  );
}
.mi-grid-cell::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1rpx dashed #ccc;
}
.mi-grid-cell::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  border-left: 1rpx dashed #ccc;
}
/* 作文格 */
.essay-grid-cell {
  width: 60rpx;
  height: 60rpx;
  border: 1rpx solid #999;
}
/* 中高考贴 */
.exam-grid-cell {
  width: 54rpx;
  height: 54rpx;
  border: 1rpx solid #999;
}
.print-record-section {
  margin-top: 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 0 24rpx;
  overflow: hidden;
}
.print-record-header {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  font-size: 28rpx;
  color: #1f2937;
}
.print-record-title {
  font-weight: 600;
}
.print-record-count {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: #6b7280;
}
.print-record-arrow {
  margin-left: auto;
  font-size: 36rpx;
  color: #9ca3af;
  transform: rotate(0deg);
  transition: transform 0.2s;
}
.print-record-arrow.expanded {
  transform: rotate(90deg);
}
.print-record-body {
  padding-bottom: 24rpx;
  border-top: 1rpx solid #f3f4f6;
}
.print-record-loading,
.print-record-empty {
  padding: 32rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: #9ca3af;
}
.print-record-list {
  padding-top: 16rpx;
}
.print-record-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
}
.print-record-item:last-child {
  border-bottom: none;
}
.print-record-item-title {
  font-size: 28rpx;
  color: #1f2937;
  margin-bottom: 8rpx;
}
.print-record-item-meta {
  font-size: 24rpx;
  color: #6b7280;
}
.print-record-item-meta .meta-dot {
  margin: 0 8rpx;
  color: #d1d5db;
}
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
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
  font-size: 28rpx;
  font-weight: 600;
  color: #fff;
  border: none;
  border-radius: 0;
  padding: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 100rpx;
}
.action-group .btn-text {
  line-height: 1.2;
}
.action-group .action-btn:first-child {
  border-radius: 12rpx 0 0 12rpx;
}
.action-group .action-btn:last-child {
  border-radius: 0 12rpx 12rpx 0;
}
/* 打印机图标（uni-icons 无 printer，用 SVG data URI） */
.icon-printer {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
}
.btn-print {
  background: linear-gradient(135deg, rgba(107, 114, 128, 0.9) 0%, rgba(75, 85, 99, 0.95) 100%);
}
.btn-capture {
  background: linear-gradient(135deg, rgba(239, 108, 0, 0.82) 0%, rgba(230, 81, 0, 0.88) 100%);
}
</style>
