<template>
  <view class="container">
    <view class="top-tools">
      <view class="font-switch">
        <text
          class="font-item"
          :class="{ active: fontSize === 'large' }"
          @tap="setFontSize('large')"
        >
          大
        </text>
        <text
          class="font-item"
          :class="{ active: fontSize === 'medium' }"
          @tap="setFontSize('medium')"
        >
          中
        </text>
        <text
          class="font-item"
          :class="{ active: fontSize === 'small' }"
          @tap="setFontSize('small')"
        >
          小
        </text>
      </view>
      <view class="right-tools">
        <button class="tool-btn" size="mini" @tap="openPrintEntry">打印</button>
        <button class="tool-btn" size="mini" @tap="goRecite">朗读</button>
      </view>
    </view>

    <view class="article-card">
      <view class="header">
        <text class="title">{{ detail.title || '未命名文章' }}</text>
        <text class="meta">{{ detail.dynasty || '' }}{{ detail.dynasty && detail.author ? ' · ' : '' }}{{ detail.author || '' }}</text>
      </view>

      <view class="content-area" :class="`font-${fontSize}`">
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

    <view class="bottom-bar">
      <button class="btn-follow" type="primary" @tap="onFollowRead">我要朗读</button>
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
      detail: {},
      fontSize: 'medium'
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
    setFontSize(size) {
      this.fontSize = size
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
    },
    onFollowRead() {
      uni.showToast({
        title: '我要朗读功能开发中',
        icon: 'none'
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
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.top-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
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
.right-tools {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.tool-btn {
  height: 48rpx;
  line-height: 48rpx;
  font-size: 22rpx;
  padding: 0 16rpx;
  border-radius: 24rpx;
  color: #2f6fff;
  background: #eef4ff;
  border: 1rpx solid #c9dcff;
}
.font-switch {
  display: flex;
  align-items: center;
  padding: 0 8rpx;
  height: 48rpx;
  border-radius: 24rpx;
  background: #f5f7fa;
}
.font-item {
  min-width: 36rpx;
  text-align: center;
  font-size: 22rpx;
  line-height: 36rpx;
  color: #667085;
  border-radius: 18rpx;
  padding: 0 8rpx;
}
.font-item.active {
  background: #2f6fff;
  color: #fff;
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
.content-area.font-small .pinyin {
  font-size: 16rpx;
}
.content-area.font-small .hanzi {
  font-size: 30rpx;
}
.content-area.font-medium .pinyin {
  font-size: 18rpx;
}
.content-area.font-medium .hanzi {
  font-size: 34rpx;
}
.content-area.font-large .pinyin {
  font-size: 22rpx;
}
.content-area.font-large .hanzi {
  font-size: 40rpx;
}
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.btn-follow {
  border-radius: 12rpx;
}
</style>
