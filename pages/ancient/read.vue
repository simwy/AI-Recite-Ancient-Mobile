<template>
  <view class="container">
    <view class="article-card">
      <view class="header">
        <text class="title">{{ detail.title || '未命名文章' }}</text>
        <text class="meta">{{ detail.dynasty || '' }}{{ detail.dynasty && detail.author ? ' · ' : '' }}{{ detail.author || '' }}</text>
      </view>

      <view class="content-area">
        <view v-for="(line, lineIndex) in parsedLines" :key="`line-${lineIndex}`" class="line">
          <view
            v-for="(item, charIndex) in line"
            :key="`char-${lineIndex}-${charIndex}`"
            class="char-cell"
            :class="{ punctuation: item.isPunctuation }"
          >
            <text class="pinyin">{{ item.pinyinText }}</text>
            <text class="hanzi">{{ item.char }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="action-row">
        <button class="btn-print" @tap="openPrintEntry">打印</button>
        <button class="btn-recite" type="primary" @tap="goRecite">开始朗读</button>
      </view>
    </view>
  </view>
</template>

<script>
import { pinyin } from 'pinyin-pro'

const db = uniCloud.database()

const PUNCTUATION_REG = /[，。、；：？！“”‘’（）《》〈〉【】「」『』〔〕…—\s\r\n,.;:?!'"()\[\]{}]/

export default {
  data() {
    return {
      id: '',
      detail: {}
    }
  },
  computed: {
    parsedLines() {
      const content = String(this.detail.content || '')
      if (!content) return []
      return content.split('\n').map((line) => line.split('').map((char) => this.toCharItem(char)))
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.loadDetail()
  },
  methods: {
    async loadDetail() {
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
    toCharItem(char) {
      const isPunctuation = PUNCTUATION_REG.test(char)
      let pinyinText = ''
      if (!isPunctuation) {
        const py = pinyin(char, {
          toneType: 'symbol',
          type: 'array'
        })
        pinyinText = Array.isArray(py) && py.length ? py[0] : ''
      }
      return {
        char,
        isPunctuation,
        pinyinText
      }
    },
    openPrintEntry() {
      uni.showToast({
        title: '打印功能即将上线',
        icon: 'none'
      })
    },
    goRecite() {
      getApp().globalData = getApp().globalData || {}
      getApp().globalData.currentText = this.detail
      uni.navigateTo({
        url: `/pages/ancient/recite?id=${this.id}`
      })
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.article-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 20rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  color: #1f2937;
  font-weight: 700;
  margin-bottom: 10rpx;
}
.meta {
  display: block;
  font-size: 24rpx;
  color: #667085;
}
.content-area {
  border-top: 1rpx solid #eef2f7;
  padding-top: 16rpx;
}
.line {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 12rpx;
}
.char-cell {
  min-width: 44rpx;
  margin-right: 8rpx;
  margin-bottom: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.char-cell.punctuation {
  min-width: 26rpx;
}
.pinyin {
  font-size: 18rpx;
  line-height: 1.2;
  min-height: 24rpx;
  color: #98a2b3;
}
.hanzi {
  font-size: 34rpx;
  line-height: 1.4;
  color: #111827;
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
.btn-recite {
  flex: 1;
  border-radius: 12rpx;
}
.btn-print {
  background: #eef4ff;
  color: #2f6fff;
  border: 1rpx solid #c9dcff;
}
</style>
