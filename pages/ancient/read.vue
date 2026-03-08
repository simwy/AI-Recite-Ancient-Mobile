<template>
  <view class="container">
    <view class="top-tools">
      <view class="font-switch">
        <text class="font-item" :class="{ active: fontSize === 'large' }" @tap="setFontSize('large')">大</text>
        <text class="font-item" :class="{ active: fontSize === 'medium' }" @tap="setFontSize('medium')">中</text>
        <text class="font-item" :class="{ active: fontSize === 'small' }" @tap="setFontSize('small')">小</text>
      </view>
      <view class="right-tools"></view>
    </view>

    <view class="article-card">
      <view class="header">
        <text class="title">{{ detail.title || '未命名文章' }}</text>
        <text class="meta">{{ detail.dynasty || '' }}{{ detail.dynasty && detail.author ? ' · ' : '' }}{{ detail.author || '' }}</text>
      </view>

      <scroll-view class="content-area" :class="`font-${fontSize}`" scroll-y scroll-with-animation :scroll-into-view="scrollIntoViewId">
        <view
          v-for="(unit, index) in playUnits"
          :id="`play-unit-${index}`"
          :key="unit.unitId"
          class="sentence-item"
          :class="{
            active: currentUnitIndex === index,
            loading: loadingUnitIndex === index
          }"
          @tap="onTapSentence(index)"
        >
          <view class="sentence-text">{{ unit.text }}</view>
          <text v-if="loadingUnitIndex === index" class="sentence-tip">正在合成语音...</text>
        </view>
        <view v-if="playUnits.length === 0" class="empty-tip">
          <text>暂无可朗读内容</text>
        </view>
      </scroll-view>
    </view>

    <view class="bottom-bar">
      <view class="action-row">
        <view v-if="showStopButton" class="stop-read-btn" @tap="onStopPlay">
          <uni-icons type="pause" size="22" color="#fff"></uni-icons>
          <text class="stop-read-text">停止朗读</text>
        </view>
        <view class="clear-btn" @tap="onClearReadProgress">
          <uni-icons type="reload" size="24" color="#4f46e5"></uni-icons>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import readBaseMixin from '@/common/readBaseMixin.js'

export default {
  mixins: [readBaseMixin],
  computed: {
    showStopButton() {
      return this.isFullReading || this.loadingUnitIndex >= 0 || typeof this.audioPlayResolver === 'function'
    }
  },
  data() {
    return {
      isFullReading: false,
      queueNextIndex: 0,
      fullReadToken: 0
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.pendingAutoStartIndex = options.startIndex !== undefined ? Number(options.startIndex) : -1
    this.initAudioContext()
    this.loadDetail()
  },
  onUnload() {
    this.onStopPlay()
    if (this.audioContext) {
      try { this.audioContext.destroy() } catch (e) {}
      this.audioContext = null
    }
  },
  methods: {
    maybeAutoStartRead() {
      if (this.pendingAutoStartIndex >= 0 && this.playUnits.length > 0) {
        const idx = Math.min(this.pendingAutoStartIndex, this.playUnits.length - 1)
        this.pendingAutoStartIndex = -1
        this.$nextTick(() => { this.startFullRead(idx) })
      }
    },
    onAudioEnded() {
      this.handleUnitFinished()
    },
    onAudioError() {
      this.playNextInQueue()
    },
    startFullRead(startIndex) {
      if (!this.playUnits.length) return
      const start = Math.max(0, Math.min(startIndex, this.playUnits.length - 1))
      this.stopActiveAudio()
      this.resolveAudioPlay('interrupted')
      this.isFullReading = true
      this.queueNextIndex = start
      this.fullReadToken++
      this.playNextInQueue()
    },
    async playNextInQueue() {
      if (!this.isFullReading) return
      if (this.queueNextIndex >= this.playUnits.length) {
        this.isFullReading = false
        this.currentUnitIndex = -1
        return
      }
      const token = this.fullReadToken
      const targetIndex = this.queueNextIndex
      this.queueNextIndex += 1
      await this.playUnit(targetIndex)
      if (token !== this.fullReadToken) return
      this.preloadNextUnits(this.queueNextIndex, 2)
    },
    handleUnitFinished() {
      if (!this.isFullReading) return
      this.playNextInQueue()
    },
    onStopPlay() {
      this.isFullReading = false
      this.queueNextIndex = 0
      this.fullReadToken++
      this.stopActiveAudio()
      this.loadingUnitIndex = -1
      this.resolveAudioPlay('stopped')
    },
    onReadFromCurrent() {
      if (!this.playUnits.length) {
        uni.showToast({ title: '暂无可朗读内容', icon: 'none' })
        return
      }
      const audioBusy = this.loadingUnitIndex >= 0 || typeof this.audioPlayResolver === 'function'
      if (this.isFullReading || audioBusy) {
        this.onStopPlay()
        return
      }
      const start = this.resolveReadStartIndex()
      this.startFullRead(start)
    },
    resolveReadStartIndex() {
      if (this.currentUnitIndex >= 0) return this.currentUnitIndex
      if (this.lastFinishedUnitIndex >= 0 && this.lastFinishedUnitIndex < this.playUnits.length - 1) {
        return this.lastFinishedUnitIndex + 1
      }
      return 0
    },
    async onTapSentence(index) {
      if (index < 0 || index >= this.playUnits.length) return
      if (this.isFullReading) return
      this.isFullReading = false
      this.queueNextIndex = 0
      this.fullReadToken++
      this.stopActiveAudio()
      this.resolveAudioPlay('interrupted')
      await this.playUnit(index)
    },
    onClearReadProgress() {
      this.onStopPlay()
      this.resetReadProgressState()
      uni.showToast({ title: '已清空朗读进度', icon: 'none' })
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
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
  margin-bottom: 20rpx;
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
  height: 68vh;
}
.sentence-item {
  margin-bottom: 12rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  background: #f8fafc;
  border: 1rpx solid transparent;
}
.sentence-item.active {
  background: #eaf2ff;
  border-color: #9cc1ff;
}
.sentence-item.loading {
  border-color: #f2c94c;
}
.sentence-text {
  color: #111827;
  line-height: 1.8;
  word-break: break-all;
}
.sentence-tip {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #b26a00;
}
.content-area.font-small .sentence-text {
  font-size: 30rpx;
}
.content-area.font-medium .sentence-text {
  font-size: 34rpx;
}
.content-area.font-large .sentence-text {
  font-size: 40rpx;
}
.empty-tip {
  text-align: center;
  color: #98a2b3;
  font-size: 26rpx;
  padding: 32rpx 0;
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
.action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
}
.stop-read-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 28rpx;
  margin-right: auto;
  background: #dc2626;
  border-radius: 36rpx;
  border: none;
}
.stop-read-btn:active {
  opacity: 0.9;
}
.stop-read-text {
  font-size: 26rpx;
  color: #fff;
}
.clear-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  border: 1rpx solid #c7d2fe;
}
</style>
