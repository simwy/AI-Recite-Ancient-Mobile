<template>
  <view class="container">
    <view class="section-top">
      <view class="section-title">打印默写纸</view>
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

      <view class="paper-card">
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
        <button class="btn-print" @tap="openPrintEntry">打印默写纸</button>
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
      difficultyOptions: [
        { label: '初级默写', value: 'junior' },
        { label: '中级默写', value: 'middle' },
        { label: '高级默写', value: 'advanced' }
      ]
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
    openPrintEntry() {
      uni.showToast({
        title: '打印功能即将上线',
        icon: 'none'
      })
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
.section-title {
  font-size: 30rpx;
  color: #222;
  font-weight: 600;
  margin-bottom: 16rpx;
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
.paper-line {
  margin-bottom: 12rpx;
}
.paper-content {
  margin-top: 10rpx;
}
.paper-label {
  font-size: 26rpx;
  color: #475467;
}
.paper-value {
  font-size: 28rpx;
  color: #1f2937;
  line-height: 1.85;
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
