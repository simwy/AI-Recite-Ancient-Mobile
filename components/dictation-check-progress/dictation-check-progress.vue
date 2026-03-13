<template>
  <view v-if="visible" class="dictation-progress-mask">
    <view class="dictation-progress-card">
      <view class="dictation-progress-title">AI 批改中</view>
      <view class="dictation-progress-hint">预计约 15～30 秒，请稍候</view>
      <view class="dictation-progress-stage">{{ stageText }}</view>
      <view class="dictation-progress-bar-wrap">
        <view class="dictation-progress-bar" :style="{ width: progress + '%' }"></view>
      </view>
      <view class="dictation-progress-pct">{{ progress }}%</view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'DictationCheckProgress',
  data() {
    return {
      visible: false,
      stageText: '',
      progress: 0
    }
  },
  mounted() {
    const app = getApp()
    if (app) {
      app.dictationProgressUpdater = (data) => {
        this.visible = !!data.visible
        this.stageText = data.stageText || ''
        this.progress = Math.min(100, Math.max(0, data.progress || 0))
      }
    }
  },
  beforeUnmount() {
    const app = getApp()
    if (app && app.dictationProgressUpdater) {
      app.dictationProgressUpdater = null
    }
  }
}
</script>

<style scoped>
.dictation-progress-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.dictation-progress-card {
  width: 560rpx;
  padding: 48rpx 40rpx;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.12);
}
.dictation-progress-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1f2937;
  text-align: center;
  margin-bottom: 16rpx;
}
.dictation-progress-hint {
  font-size: 24rpx;
  color: #6b7280;
  text-align: center;
  margin-bottom: 24rpx;
}
.dictation-progress-stage {
  font-size: 28rpx;
  color: #2f6fff;
  text-align: center;
  margin-bottom: 24rpx;
  min-height: 40rpx;
}
.dictation-progress-bar-wrap {
  height: 16rpx;
  background: #e5e7eb;
  border-radius: 8rpx;
  overflow: hidden;
  margin-bottom: 16rpx;
}
.dictation-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2f6fff, #5b8def);
  border-radius: 8rpx;
  transition: width 0.3s ease;
}
.dictation-progress-pct {
  font-size: 24rpx;
  color: #6b7280;
  text-align: center;
}
</style>
