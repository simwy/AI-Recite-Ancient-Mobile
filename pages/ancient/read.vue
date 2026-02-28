<template>
  <view class="container">
    <view class="top-tools">
      <view class="font-switch">
        <text class="font-item" :class="{ active: fontSize === 'large' }" @tap="setFontSize('large')">大</text>
        <text class="font-item" :class="{ active: fontSize === 'medium' }" @tap="setFontSize('medium')">中</text>
        <text class="font-item" :class="{ active: fontSize === 'small' }" @tap="setFontSize('small')">小</text>
      </view>
      <view class="right-tools">
        <button class="tool-btn" size="mini" @tap="openPrintEntry">打印</button>
        <button class="tool-btn" size="mini" @tap="goRecite">背诵</button>
      </view>
    </view>

    <view class="article-card">
      <view class="header">
        <text class="title">{{ detail.title || '未命名文章' }}</text>
        <text class="meta">{{ detail.dynasty || '' }}{{ detail.dynasty && detail.author ? ' · ' : '' }}{{ detail.author || '' }}</text>
      </view>

      <scroll-view class="content-area" :class="`font-${fontSize}`" scroll-y :scroll-into-view="scrollIntoViewId">
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
          <text class="sentence-text">{{ unit.text }}</text>
          <text v-if="loadingUnitIndex === index" class="sentence-tip">正在合成语音...</text>
        </view>
        <view v-if="playUnits.length === 0" class="empty-tip">
          <text>暂无可朗读内容</text>
        </view>
      </scroll-view>
    </view>

    <view class="bottom-bar">
      <view class="status-row">
        <text class="status-text">{{ playStatusText }}</text>
      </view>
      <view class="action-row">
        <button class="btn btn-primary" @tap="onToggleFullRead">
          {{ fullReadButtonText }}
        </button>
        <button class="btn btn-secondary" @tap="onResumeFromNext">
          下一句
        </button>
        <button class="btn btn-stop" @tap="onStopPlay">
          停止
        </button>
      </view>
    </view>
  </view>
</template>

<script>
const db = uniCloud.database()
const CACHE_INDEX_KEY = 'gw_tts_audio_cache_index_v1'
const CACHE_AUDIO_PREFIX = 'gw_tts_audio_data_v1_'
const MAX_LOCAL_CACHE_ITEMS = 80
const SPLIT_VERSION = 'v1'
const TTS_PENDING_RETRY_MAX = 6
const TTS_PENDING_RETRY_DELAY = 800

export default {
  data() {
    return {
      id: '',
      detail: {},
      fontSize: 'medium',
      playUnits: [],
      currentUnitIndex: -1,
      loadingUnitIndex: -1,
      scrollIntoViewId: '',
      audioContext: null,
      audioPlayResolver: null,
      isFullReading: false,
      isPaused: false,
      queueNextIndex: 0,
      pausedUnitIndex: -1,
      fullReadToken: 0,
      localCacheIndex: {},
      ttsOptions: {
        voice: 'x6_lingyufei_pro',
        speed: 50,
        pitch: 50,
        volume: 50,
        format: 'mp3'
      },
      snapshotSyncing: false
    }
  },
  computed: {
    fullReadButtonText() {
      if (!this.isFullReading) return '完整朗读'
      return this.isPaused ? '继续（当前句）' : '暂停'
    },
    playStatusText() {
      if (this.loadingUnitIndex >= 0) return `第 ${this.loadingUnitIndex + 1} 句语音生成中...`
      if (this.currentUnitIndex >= 0) return `当前第 ${this.currentUnitIndex + 1} 句`
      return '可点按任一句单独朗读，或使用完整朗读'
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.localCacheIndex = this.loadCacheIndex()
    this.initAudioContext()
    this.loadDetail()
  },
  onUnload() {
    this.stopActiveAudio()
    this.audioPlayResolver = null
    if (this.audioContext) {
      this.audioContext.destroy()
      this.audioContext = null
    }
  },
  methods: {
    async loadDetail() {
      const globalData = (getApp() && getApp().globalData) || {}
      const currentText = globalData.currentText || {}
      if (currentText && currentText._id === this.id && currentText.content) {
        this.detail = currentText
        this.rebuildPlayUnits()
        return
      }
      if (!this.id) return
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0]
          this.rebuildPlayUnits()
        }
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    initAudioContext() {
      if (typeof uni.createInnerAudioContext !== 'function') return
      this.audioContext = uni.createInnerAudioContext()
      this.audioContext.autoplay = false
      this.audioContext.onEnded(() => {
        this.resolveAudioPlay('ended')
        this.handleUnitFinished()
      })
      this.audioContext.onError((err) => {
        this.resolveAudioPlay('error')
        if (this.isFullReading && !this.isPaused) {
          this.playNextInQueue()
        }
        console.error('音频播放失败:', err)
      })
    },
    rebuildPlayUnits() {
      const rawContent = String((this.detail && this.detail.content) || '').replace(/\r\n/g, '\n')
      const units = this.buildPlayUnits(rawContent)
      this.playUnits = units.map((item, index) => ({
        unitId: `${this.id || 'text'}-${index}-${this.createStableHash(item.text)}`,
        text: item.text,
        mainIndex: item.mainIndex,
        subIndex: item.subIndex,
        hash: this.buildUnitHash(item.text)
      }))
      this.currentUnitIndex = -1
      this.loadingUnitIndex = -1
      this.scrollIntoViewId = ''
      this.isFullReading = false
      this.isPaused = false
      this.queueNextIndex = 0
      this.pausedUnitIndex = -1
      this.syncSentenceSnapshot(rawContent)
    },
    buildPlayUnits(content) {
      if (!content) return []
      const lines = content.split('\n')
      const result = []
      let mainIndex = 0
      lines.forEach((line) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return
        const mainSentences = this.splitByDelimiter(trimmedLine, /([。！？；!?;])/g)
        mainSentences.forEach((sentence) => {
          const adaptiveUnits = this.splitAdaptive(sentence)
          adaptiveUnits.forEach((subSentence, subIndex) => {
            result.push({
              text: subSentence,
              mainIndex,
              subIndex
            })
          })
          mainIndex++
        })
      })
      return result
    },
    splitByDelimiter(text, reg) {
      const tokens = text.split(reg).filter(Boolean)
      const chunks = []
      const delimiterChecker = new RegExp(`^${reg.source.replace(/^\(|\)$/g, '')}$`)
      let current = ''
      tokens.forEach((token) => {
        if (delimiterChecker.test(token)) {
          current += token
          if (current.trim()) {
            chunks.push(current.trim())
          }
          current = ''
          return
        }
        current += token
      })
      if (current.trim()) {
        chunks.push(current.trim())
      }
      return chunks
    },
    splitAdaptive(sentence) {
      const pureLen = this.countHanChars(sentence)
      if (pureLen <= 22) return [sentence]
      const roughParts = this.splitByDelimiter(sentence, /([，、,:：])/g)
      if (roughParts.length <= 1) return [sentence]

      const merged = []
      const minLen = 8
      const maxLen = 18

      roughParts.forEach((part) => {
        if (!part) return
        const partLen = this.countHanChars(part)
        if (merged.length === 0) {
          merged.push(part)
          return
        }
        const last = merged[merged.length - 1]
        const combined = `${last}${part}`
        const combinedLen = this.countHanChars(combined)
        if (partLen < minLen || combinedLen <= maxLen) {
          merged[merged.length - 1] = combined
        } else {
          merged.push(part)
        }
      })

      // 末尾过短时，和前一句合并，避免出现“几字分句”
      if (merged.length > 1) {
        const lastLen = this.countHanChars(merged[merged.length - 1])
        if (lastLen < minLen) {
          merged[merged.length - 2] += merged[merged.length - 1]
          merged.pop()
        }
      }
      return merged
    },
    countHanChars(text) {
      const m = String(text || '').match(/[\u4e00-\u9fff]/g)
      return m ? m.length : 0
    },
    createStableHash(text) {
      const source = String(text || '')
      let hash = 2166136261
      for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0).toString(16)
    },
    createSha1Hash(text) {
      return this.createStableHash(String(text || ''))
    },
    buildUnitHash(text) {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim()
      const payload = `${normalized}|${this.ttsOptions.voice}|${this.ttsOptions.speed}|${this.ttsOptions.pitch}|${this.ttsOptions.volume}|${this.ttsOptions.format}|v2`
      return this.createStableHash(payload)
    },
    buildSnapshotSentences() {
      const grouped = {}
      this.playUnits.forEach((unit) => {
        const idx = Number(unit.mainIndex || 0)
        if (!grouped[idx]) {
          grouped[idx] = {
            index: idx,
            sentence_id: '',
            text: '',
            start_offset: 0,
            end_offset: 0,
            play_units: []
          }
        }
        grouped[idx].play_units.push({
          sub_index: Number(unit.subIndex || 0),
          unit_id: unit.hash,
          text: unit.text
        })
      })
      const sentences = Object.values(grouped)
      sentences.sort((a, b) => a.index - b.index)
      sentences.forEach((sentence) => {
        sentence.play_units.sort((a, b) => a.sub_index - b.sub_index)
        sentence.text = sentence.play_units.map(item => item.text).join('')
        sentence.sentence_id = this.createSha1Hash(`sentence|${this.id || ''}|${sentence.index}|${sentence.text}`)
      })
      return sentences
    },
    async syncSentenceSnapshot(content) {
      if (this.snapshotSyncing || !this.id || !this.playUnits.length) return
      this.snapshotSyncing = true
      try {
        await uniCloud.callFunction({
          name: 'gw_sentence-snapshot',
          data: {
            action: 'upsert',
            data: {
              text_id: this.id,
              split_version: SPLIT_VERSION,
              content_hash: this.createSha1Hash(content || ''),
              content,
              sentences: this.buildSnapshotSentences()
            }
          }
        })
      } catch (e) {
        console.error('分句快照同步失败:', e)
      } finally {
        this.snapshotSyncing = false
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
    async onTapSentence(index) {
      if (index < 0 || index >= this.playUnits.length) return
      this.isFullReading = false
      this.isPaused = false
      this.queueNextIndex = 0
      this.fullReadToken++
      this.stopActiveAudio()
      this.resolveAudioPlay('interrupted')
      await this.playUnit(index)
    },
    async onToggleFullRead() {
      if (!this.playUnits.length) {
        uni.showToast({ title: '暂无可朗读内容', icon: 'none' })
        return
      }
      if (!this.isFullReading) {
        this.startFullRead(0)
        return
      }
      if (!this.isPaused) {
        this.pauseFullRead()
        return
      }
      const resumeFrom = this.currentUnitIndex >= 0 ? this.currentUnitIndex : 0
      this.startFullRead(resumeFrom)
    },
    onResumeFromNext() {
      if (!this.playUnits.length) return
      if (!this.isPaused) {
        uni.showToast({ title: '请先暂停，再使用下一句', icon: 'none' })
        return
      }
      const start = Math.min(this.pausedUnitIndex + 1, this.playUnits.length - 1)
      this.startFullRead(start)
    },
    onStopPlay() {
      this.isFullReading = false
      this.isPaused = false
      this.queueNextIndex = 0
      this.pausedUnitIndex = this.currentUnitIndex >= 0 ? this.currentUnitIndex : this.pausedUnitIndex
      this.stopActiveAudio()
      this.currentUnitIndex = -1
      this.scrollIntoViewId = ''
      this.loadingUnitIndex = -1
      this.resolveAudioPlay('stopped')
    },
    startFullRead(startIndex) {
      if (!this.playUnits.length) return
      const start = Math.max(0, Math.min(startIndex, this.playUnits.length - 1))
      this.stopActiveAudio()
      this.resolveAudioPlay('interrupted')
      this.isFullReading = true
      this.isPaused = false
      this.queueNextIndex = start
      this.fullReadToken++
      this.playNextInQueue()
    },
    pauseFullRead() {
      this.isPaused = true
      if (this.currentUnitIndex >= 0) {
        this.pausedUnitIndex = this.currentUnitIndex
      }
      this.stopActiveAudio()
      this.resolveAudioPlay('paused')
    },
    async playNextInQueue() {
      if (!this.isFullReading || this.isPaused) return
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
      if (!this.isFullReading || this.isPaused) return
      this.playNextInQueue()
    },
    stopActiveAudio() {
      if (!this.audioContext) return
      try {
        this.audioContext.stop()
      } catch (e) {
        console.error('停止播放失败:', e)
      }
    },
    resolveAudioPlay(status) {
      if (typeof this.audioPlayResolver === 'function') {
        this.audioPlayResolver(status)
        this.audioPlayResolver = null
      }
    },
    waitAudioFinished() {
      return new Promise((resolve) => {
        this.audioPlayResolver = resolve
      })
    },
    async playUnit(index) {
      const unit = this.playUnits[index]
      if (!unit || !this.audioContext) {
        uni.showToast({ title: '当前环境不支持音频播放', icon: 'none' })
        return
      }
      this.loadingUnitIndex = index
      try {
        const audioSrc = await this.ensureUnitAudio(unit)
        this.stopActiveAudio()
        this.currentUnitIndex = index
        this.pausedUnitIndex = index
        this.scrollIntoViewId = `play-unit-${index}`
        this.audioContext.src = audioSrc
        this.audioContext.play()
        this.loadingUnitIndex = -1
        await this.waitAudioFinished()
      } catch (err) {
        this.loadingUnitIndex = -1
        if (this.currentUnitIndex === index) {
          this.currentUnitIndex = -1
        }
        uni.showToast({
          title: err.message || '语音播放失败',
          icon: 'none',
          duration: 2500
        })
      }
    },
    async ensureUnitAudio(unit) {
      const cached = this.getCachedAudio(unit.hash)
      if (cached) {
        this.touchCacheEntry(unit.hash)
        return cached
      }
      const result = await this.requestTtsResult(unit)
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '语音合成失败')
      }
      if (result.data.audioUrl) {
        return result.data.audioUrl
      }
      if (!result.data.audioBase64) {
        throw new Error('语音合成结果为空')
      }
      const format = result.data.format || this.ttsOptions.format || 'mp3'
      const dataUri = this.buildDataUri(result.data.audioBase64, format)
      this.saveCachedAudio(unit.hash, result.data.audioBase64, format)
      return dataUri
    },
    async requestTtsResult(unit) {
      for (let i = 0; i < TTS_PENDING_RETRY_MAX; i++) {
        const res = await uniCloud.callFunction({
          name: 'gw_tts-synthesize',
          data: {
            text: unit.text,
            ...this.ttsOptions
          }
        })
        const result = (res && res.result) || {}
        const status = result && result.data && result.data.status
        if (result.code !== 0 || status !== 'pending') {
          return result
        }
        const retryAfter = Number(result.data.retryAfter || TTS_PENDING_RETRY_DELAY)
        await this.sleep(Math.max(200, retryAfter))
      }
      return {
        code: -1,
        msg: '语音生成排队中，请稍后重试'
      }
    },
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    },
    preloadNextUnits(startIndex, limit) {
      const end = Math.min(this.playUnits.length, startIndex + limit)
      for (let i = startIndex; i < end; i++) {
        const unit = this.playUnits[i]
        if (!unit) continue
        if (this.getCachedAudio(unit.hash)) continue
        this.ensureUnitAudio(unit).catch(() => {})
      }
    },
    buildDataUri(base64, format) {
      const mimeMap = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        pcm: 'audio/L16'
      }
      const fmt = String(format || 'mp3').toLowerCase()
      const mime = mimeMap[fmt] || 'audio/mpeg'
      return `data:${mime};base64,${base64}`
    },
    loadCacheIndex() {
      const cached = uni.getStorageSync(CACHE_INDEX_KEY)
      if (!cached || typeof cached !== 'object') return {}
      return cached
    },
    persistCacheIndex() {
      uni.setStorageSync(CACHE_INDEX_KEY, this.localCacheIndex)
    },
    getCachedAudio(hash) {
      const base64 = uni.getStorageSync(`${CACHE_AUDIO_PREFIX}${hash}`)
      if (!base64 || typeof base64 !== 'string') return ''
      const meta = this.localCacheIndex[hash]
      const format = (meta && meta.format) || this.ttsOptions.format || 'mp3'
      return this.buildDataUri(base64, format)
    },
    touchCacheEntry(hash) {
      if (!this.localCacheIndex[hash]) return
      this.localCacheIndex[hash].lastAccessAt = Date.now()
      this.persistCacheIndex()
    },
    saveCachedAudio(hash, base64, format) {
      const storageKey = `${CACHE_AUDIO_PREFIX}${hash}`
      try {
        uni.setStorageSync(storageKey, base64)
        this.localCacheIndex[hash] = {
          key: storageKey,
          format,
          size: base64.length,
          updatedAt: Date.now(),
          lastAccessAt: Date.now()
        }
        this.trimCacheByLru()
        this.persistCacheIndex()
      } catch (e) {
        console.error('写入本地语音缓存失败:', e)
      }
    },
    trimCacheByLru() {
      const entries = Object.keys(this.localCacheIndex).map((hash) => ({
        hash,
        meta: this.localCacheIndex[hash]
      }))
      if (entries.length <= MAX_LOCAL_CACHE_ITEMS) return
      entries.sort((a, b) => (a.meta.lastAccessAt || 0) - (b.meta.lastAccessAt || 0))
      const removeCount = entries.length - MAX_LOCAL_CACHE_ITEMS
      for (let i = 0; i < removeCount; i++) {
        const current = entries[i]
        if (!current) continue
        const targetKey = `${CACHE_AUDIO_PREFIX}${current.hash}`
        uni.removeStorageSync(targetKey)
        delete this.localCacheIndex[current.hash]
      }
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx;
  padding-bottom: calc(210rpx + env(safe-area-inset-bottom));
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
  max-height: 68vh;
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
.status-row {
  margin-bottom: 12rpx;
}
.status-text {
  font-size: 24rpx;
  color: #667085;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.btn {
  flex: 1;
  border-radius: 12rpx;
  font-size: 26rpx;
}
.btn-primary {
  background: #2f6fff;
  color: #fff;
}
.btn-secondary {
  background: #eef4ff;
  color: #2f6fff;
  border: 1rpx solid #c9dcff;
}
.btn-stop {
  background: #fff3f3;
  color: #b42318;
  border: 1rpx solid #f1b4b0;
}
</style>
