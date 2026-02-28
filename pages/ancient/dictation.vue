<template>
  <view class="container">
    <view class="section-top">
      <view class="section-header">
        <view class="section-title">打印默写纸</view>
        <view class="font-tabs">
          <view
            v-for="item in fontSizeOptions"
            :key="item.value"
            class="font-tab"
            :class="{ active: selectedFontSize === item.value }"
            @tap="selectedFontSize = item.value"
          >
            {{ item.label }}
          </view>
        </view>
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

      <view class="paper-card" :class="paperFontClass">
        <view class="paper-line">
          <text class="paper-label">标题：</text>
          <text class="paper-value">{{ detail.title || '（未命名）' }}</text>
        </view>
        <view class="paper-line">
          <text class="paper-label">作者：</text>
          <text class="paper-value author-placeholder">{{ authorPlaceholder }}</text>
        </view>
        <view class="paper-content">
          <text class="paper-label">正文：</text>
          <text class="paper-value paper-main">{{ dictationPaperContent }}</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="action-row">
        <button class="btn-print" :loading="printingPdf" @tap="openPrintEntry">打印默写纸</button>
        <button class="btn-capture" @tap="openPhotoEntry">拍照检查</button>
      </view>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()

export default {
  data() {
    return {
      id: '',
      detail: {},
      selectedDifficulty: 'junior',
      selectedFontSize: 'medium',
      difficultyOptions: [
        { label: '初级默写', value: 'junior' },
        { label: '中级默写', value: 'middle' },
        { label: '高级默写', value: 'advanced' }
      ],
      fontSizeOptions: [
        { label: '大', value: 'large' },
        { label: '中', value: 'medium' },
        { label: '小', value: 'small' }
      ],
      printingPdf: false
    }
  },
  computed: {
    authorPlaceholder() {
      const author = this.safeText(this.detail.author)
      if (!author) return this.buildUnderline(8)
      return this.buildUnderline(Math.max(author.length, 4))
    },
    dictationPaperContent() {
      const content = this.safeText(this.detail.content)
      if (!content) return this.buildUnderline(30)
      return this.maskContentByDifficulty(content, this.selectedDifficulty)
    },
    paperFontClass() {
      return `paper-font-${this.selectedFontSize}`
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.initDetail()
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
    async openPrintEntry() {
      if (this.printingPdf) return
      const content = this.safeText(this.dictationPaperContent)
      if (!content) {
        uni.showToast({ title: '暂无可打印内容', icon: 'none' })
        return
      }
      this.printingPdf = true
      uni.showLoading({ title: '正在生成PDF...' })
      try {
        const callRes = await uniCloud.callFunction({
          name: 'gw_dictation-print-pdf',
          data: {
            action: 'generate',
            data: {
              title: this.safeText(this.detail.title || '古文默写'),
              author: this.safeText(this.detail.author || ''),
              content,
              fontSize: this.selectedFontSize,
              difficulty: this.selectedDifficulty,
              difficultyLabel: this.getDifficultyLabel()
            }
          }
        })
        const result = (callRes && callRes.result) || {}
        if (result.code !== 0 || !result.data || !result.data.fileID) {
          throw new Error(result.msg || '生成PDF失败')
        }
        await this.openPdfDocument(result.data.fileID)
      } catch (error) {
        uni.showToast({
          title: (error && error.message) || '打印失败，请稍后再试',
          icon: 'none',
          duration: 2500
        })
      } finally {
        uni.hideLoading()
        this.printingPdf = false
      }
    },
    openPhotoEntry() {
      uni.showToast({
        title: '拍照检查功能即将上线',
        icon: 'none'
      })
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
    getFontSizeLabel() {
      const target = this.fontSizeOptions.find((item) => item.value === this.selectedFontSize)
      return target ? `${target.label}号字体` : '中号字体'
    },
    getDifficultyLabel() {
      const target = this.difficultyOptions.find((item) => item.value === this.selectedDifficulty)
      return target ? target.label : '中级默写'
    },
    async openPdfDocument(fileID) {
      const tempUrl = await this.getCloudFileTempUrl(fileID)
      if (!tempUrl) {
        throw new Error('获取PDF地址失败')
      }
      // #ifdef H5
      if (typeof window !== 'undefined' && window.open) {
        window.open(tempUrl, '_blank')
        uni.showToast({ title: 'PDF已打开', icon: 'none' })
        return
      }
      // #endif
      const localPath = await this.downloadPdf(tempUrl)
      await this.openLocalPdf(localPath)
    },
    async getCloudFileTempUrl(fileID) {
      const res = await uniCloud.getTempFileURL({
        fileList: [fileID]
      })
      const first = res && res.fileList && res.fileList[0]
      if (!first || !first.tempFileURL) return ''
      return first.tempFileURL
    },
    downloadPdf(url) {
      return new Promise((resolve, reject) => {
        uni.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode !== 200 || !res.tempFilePath) {
              reject(new Error('PDF下载失败'))
              return
            }
            resolve(res.tempFilePath)
          },
          fail: (err) => reject(err || new Error('PDF下载失败'))
        })
      })
    },
    openLocalPdf(filePath) {
      return new Promise((resolve, reject) => {
        uni.openDocument({
          filePath,
          fileType: 'pdf',
          showMenu: true,
          success: resolve,
          fail: (err) => reject(err || new Error('打开PDF失败'))
        })
      })
    },
    maskContentByDifficulty(content, difficulty) {
      let startChecker = () => false
      if (difficulty === 'junior') {
        startChecker = this.isPhraseDelimiter
      } else if (difficulty === 'middle') {
        startChecker = this.isSentenceDelimiter
      }

      let shouldHint = difficulty !== 'advanced'
      let output = ''

      for (let i = 0; i < content.length; i++) {
        const char = content[i]
        if (char === '\n') {
          output += '\n'
          shouldHint = difficulty !== 'advanced'
          continue
        }
        if (/\s/.test(char)) {
          output += char
          continue
        }
        if (this.isPunctuation(char)) {
          output += char
          if (difficulty !== 'advanced' && startChecker(char)) {
            shouldHint = true
          }
          continue
        }
        if (difficulty !== 'advanced' && shouldHint) {
          output += char
          shouldHint = false
        } else {
          output += '＿'
        }
      }
      return output
    }
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
.section-top {
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
.font-tabs {
  display: flex;
  gap: 12rpx;
}
.font-tab {
  padding: 8rpx 16rpx;
  font-size: 22rpx;
  color: #667085;
  background: #f5f7fb;
  border-radius: 999rpx;
}
.font-tab.active {
  color: #2f6fff;
  background: #e7f0ff;
}
.paper-card {
  background: #fafbff;
  border: 1rpx dashed #d6def2;
  border-radius: 14rpx;
  padding: 20rpx;
}
.paper-font-large .paper-label {
  font-size: 30rpx;
}
.paper-font-large .paper-value {
  font-size: 32rpx;
  line-height: 2;
}
.paper-font-medium .paper-label {
  font-size: 26rpx;
}
.paper-font-medium .paper-value {
  font-size: 28rpx;
  line-height: 1.85;
}
.paper-font-small .paper-label {
  font-size: 22rpx;
}
.paper-font-small .paper-value {
  font-size: 24rpx;
  line-height: 1.75;
}
.paper-line {
  margin-bottom: 12rpx;
}
.paper-content {
  margin-top: 10rpx;
}
.paper-label {
  color: #475467;
}
.paper-value {
  color: #1f2937;
}
.author-placeholder {
  letter-spacing: 2rpx;
}
.paper-main {
  display: block;
  margin-top: 8rpx;
  letter-spacing: 2rpx;
  white-space: pre-wrap;
  word-break: break-all;
}
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18rpx 24rpx;
  padding-bottom: calc(18rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.action-row {
  display: flex;
  gap: 16rpx;
}
.btn-print,
.btn-capture {
  flex: 1;
  border-radius: 12rpx;
}
.btn-print {
  background: #eef4ff;
  color: #2f6fff;
  border: 1rpx solid #c9dcff;
}
.btn-capture {
  background: #2f6fff;
  color: #fff;
}
</style>
