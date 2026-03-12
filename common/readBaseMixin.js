/**
 * readBaseMixin.js
 * 朗读页 (read.vue) 和跟读页 (follow.vue) 的公共 mixin
 */
import { buildPlayUnits as buildPlayUnitsFromContent } from '@/common/playUnits.js'
import ttsService from '@/common/ttsService.js'
import { createStableHash } from '@/common/ttsService.js'

const db = uniCloud.database()
const SPLIT_VERSION = 'v1'

export default {
  data() {
    return {
      id: '',
      pendingAutoStartIndex: -1,
      detail: {},
      fontSize: 'medium',
      playUnits: [],
      currentUnitIndex: -1,
      loadingUnitIndex: -1,
      scrollIntoViewId: '',
      audioContext: null,
      audioPlayResolver: null,
      lastFinishedUnitIndex: -1,
      snapshotSyncing: false
    }
  },
  computed: {
    showStopButton() {
      return this.loadingUnitIndex >= 0 || typeof this.audioPlayResolver === 'function'
    }
  },
  methods: {
    // ===== 钩子方法（子页面覆盖） =====
    onAudioEnded() {},
    onAudioError() {},
    maybeAutoStartRead() {},

    // ===== 数据加载 =====
    async loadDetail() {
      const globalData = (getApp() && getApp().globalData) || {}
      const currentText = globalData.currentText || {}
      if (currentText && currentText._id === this.id && currentText.content) {
        this.detail = currentText
        this.rebuildPlayUnits()
        this.maybeAutoStartRead()
        return
      }
      if (!this.id) return
      try {
        const res = await db.collection('gw-ancient-texts').doc(this.id).get()
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0]
          this.rebuildPlayUnits()
          this.maybeAutoStartRead()
        }
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },

    // ===== playUnits 构建（含标题、作者朝代 + 正文句） =====
    rebuildPlayUnits() {
      const rawContent = String((this.detail && this.detail.content) || '').replace(/\r\n/g, '\n')
      const contentUnits = buildPlayUnitsFromContent(rawContent)
      const headerUnits = []
      const title = String((this.detail && this.detail.title) || '').trim()
      if (title) {
        headerUnits.push({
          unitId: `${this.id || 'text'}-title-${this.createStableHash(title)}`,
          text: title,
          mainIndex: -1,
          subIndex: 0,
          hash: this.buildUnitHash(title),
          isTitle: true
        })
      }
      const dynasty = String((this.detail && this.detail.dynasty) || '').trim()
      const author = String((this.detail && this.detail.author) || '').trim()
      const metaText = [dynasty, author].filter(Boolean).join(' · ')
      if (metaText) {
        headerUnits.push({
          unitId: `${this.id || 'text'}-meta-${this.createStableHash(metaText)}`,
          text: metaText,
          mainIndex: -1,
          subIndex: 1,
          hash: this.buildUnitHash(metaText),
          isMeta: true
        })
      }
      const bodyUnits = contentUnits.map((item, index) => ({
        unitId: `${this.id || 'text'}-${index}-${this.createStableHash(item.text)}`,
        text: item.text,
        mainIndex: item.mainIndex,
        subIndex: item.subIndex,
        hash: this.buildUnitHash(item.text)
      }))
      this.playUnits = [...headerUnits, ...bodyUnits]
      this.resetReadProgressState()
      this.syncSentenceSnapshot(rawContent)
    },

    // ===== Hash 工具 =====
    createStableHash(text) {
      return createStableHash(text)
    },
    createSha1Hash(text) {
      return createStableHash(String(text || ''))
    },
    buildUnitHash(text) {
      return ttsService.buildUnitHash(text)
    },

    // ===== 快照同步 =====
    buildSnapshotSentences() {
      const grouped = {}
      // 只对正文句做快照，排除标题/作者朝代单元（mainIndex < 0）
      this.playUnits.filter((u) => (u.mainIndex ?? 0) >= 0).forEach((unit) => {
        const idx = Number(unit.mainIndex || 0)
        if (!grouped[idx]) {
          grouped[idx] = {
            index: idx, sentence_id: '', text: '',
            start_offset: 0, end_offset: 0, play_units: []
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
      } finally {
        this.snapshotSyncing = false
      }
    },

    // ===== 音频播放 =====
    initAudioContext() {
      if (typeof uni.createInnerAudioContext !== 'function') return
      this.audioContext = uni.createInnerAudioContext()
      this.audioContext.autoplay = false
      this.audioContext.onEnded(() => {
        if (this.currentUnitIndex >= 0) {
          this.lastFinishedUnitIndex = this.currentUnitIndex
        }
        this.resolveAudioPlay('ended')
        this.onAudioEnded()
      })
      this.audioContext.onError(() => {
        this.resolveAudioPlay('error')
        this.onAudioError()
        uni.showToast({ title: '播放失败', icon: 'none' })
      })
    },
    stopActiveAudio() {
      if (!this.audioContext) return
      try { this.audioContext.stop() } catch (e) {}
    },
    resolveAudioPlay(status) {
      if (typeof this.audioPlayResolver === 'function') {
        this.audioPlayResolver(status)
        this.audioPlayResolver = null
      }
    },
    waitAudioFinished() {
      return new Promise((resolve) => { this.audioPlayResolver = resolve })
    },
    async resolvePlaySrc(unit, audioSrc) {
      return ttsService.resolvePlaySrc(unit, audioSrc)
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
        const playSrc = await this.resolvePlaySrc(unit, audioSrc)
        this.stopActiveAudio()
        this.currentUnitIndex = index
        this.scrollToReadAnchor(index)
        this.audioContext.src = playSrc
        this.audioContext.play()
        this.loadingUnitIndex = -1
        await this.waitAudioFinished()
      } catch (err) {
        this.loadingUnitIndex = -1
        if (this.currentUnitIndex === index) this.currentUnitIndex = -1
        uni.showToast({ title: err.message || '语音播放失败', icon: 'none', duration: 2500 })
      }
    },
    async ensureUnitAudio(unit) {
      return ttsService.ensureUnitAudio(unit)
    },
    preloadNextUnits(startIndex, limit) {
      const end = Math.min(this.playUnits.length, startIndex + limit)
      for (let i = startIndex; i < end; i++) {
        const unit = this.playUnits[i]
        if (!unit) continue
        if (ttsService.getCachedAudio(unit.hash)) continue
        ttsService.ensureUnitAudio(unit).catch(() => {})
      }
    },

    // ===== UI 控制 =====
    setFontSize(size) {
      this.fontSize = size
    },
    getScrollAnchorIndex(targetIndex) {
      const index = Number(targetIndex)
      if (!Number.isInteger(index) || index < 0 || !this.playUnits.length) return 0
      return Math.max(0, index - 1)
    },
    scrollToReadAnchor(targetIndex) {
      const anchorIndex = this.getScrollAnchorIndex(targetIndex)
      this.scrollIntoViewId = `play-unit-${anchorIndex}`
    },
    resetReadProgressState() {
      this.currentUnitIndex = -1
      this.loadingUnitIndex = -1
      this.scrollIntoViewId = ''
      this.lastFinishedUnitIndex = -1
    }
  }
}
