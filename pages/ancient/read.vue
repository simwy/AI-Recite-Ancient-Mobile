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
        <button class="tool-btn" size="mini" @tap="onToggleFullRead">{{ fullReadButtonText }}</button>
        <button class="tool-btn" size="mini" @tap="onResumeFromNext">继续朗读</button>
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
            loading: loadingUnitIndex === index,
            liveMatching: speechActive && speechLiveMatchedIndex === index,
            matched: lastMatchedIndex === index
          }"
          @tap="onTapSentence(index)"
        >
          <text v-if="unit.pinyinText" class="sentence-pinyin">{{ unit.pinyinText }}</text>
          <view class="sentence-text">
            <text
              v-for="(charItem, charIdx) in getSentenceDisplayChars(index)"
              :key="`${unit.unitId}-${charIdx}`"
              :class="['char-item', `char-${charItem.status}`]"
            >{{ charItem.char }}</text>
          </view>
          <text v-if="getSentenceReadMeta(index)" class="sentence-read-meta">{{ getSentenceReadMeta(index) }}</text>
          <text v-if="loadingUnitIndex === index" class="sentence-tip">正在合成语音...</text>
        </view>
        <view v-if="playUnits.length === 0" class="empty-tip">
          <text>暂无可朗读内容</text>
        </view>
      </scroll-view>
    </view>

    <view v-if="speechCurrentSentenceText" class="speech-floating-row">
      <text class="speech-current-text">{{ speechCurrentSentenceText }}</text>
    </view>
    <view class="bottom-bar">
      <view class="speech-btn-row">
        <view
          class="speech-btn"
          :class="{ active: speechActive || speechStarting }"
          @longpress.stop.prevent="onPressStart"
          @touchend.stop.prevent="onPressEnd"
          @touchcancel.stop.prevent="onPressEnd"
        >
          <text>{{ speechActive || speechStarting ? '松开结束朗读' : '按住朗读' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { pinyin } from 'pinyin-pro'
import { diffChars, calcAccuracy } from '@/common/diff.js'

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
      lastFinishedUnitIndex: -1,
      fullReadToken: 0,
      localCacheIndex: {},
      ttsOptions: {
        voice: 'x6_lingyufei_pro',
        speed: 50,
        pitch: 50,
        volume: 50,
        format: 'mp3'
      },
      snapshotSyncing: false,
      speechStarting: false,
      speechActive: false,
      speechPendingStop: false,
      speechTargetIndex: -1,
      speechDurationSeconds: 0,
      speechDurationTimer: null,
      speechRealtimeText: '',
      speechAsrConfig: null,
      speechSocketTask: null,
      speechSocketReady: false,
      speechTaskFinished: false,
      speechUiUpdateTimer: null,
      speechPendingMergedText: '',
      speechPendingChunkText: '',
      speechSessionId: '',
      speechFrameQueue: [],
      speechFrameFlushTimer: null,
      speechSegmentMap: {},
      speechWaitFinishResolver: null,
      speechStopping: false,
      speechRecorderManager: null,
      speechUseWebRecorder: false,
      speechWebAudioContext: null,
      speechWebMediaStream: null,
      speechWebScriptProcessor: null,
      speechLiveDiffMap: {},
      speechSentenceResultMap: {},
      speechSentenceAttemptMap: {},
      lastMatchedIndex: -1,
      speechLiveMatchedIndex: -1,
      speechLiveMatchedAccuracy: 0,
      speechLiveCandidateIndex: -1,
      speechLiveCandidateHits: 0,
      speechLastSwitchAt: 0,
      speechFlowCursorIndex: 0,
      speechLatestChunkText: ''
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
    },
    speechStatusText() {
      if (this.speechActive) {
        return `长按朗读中（${this.formatSpeechDuration(this.speechDurationSeconds)}）松手自动识别`
      }
      if (this.speechRealtimeText) {
        return `实时识别：${this.speechRealtimeText}`
      }
      return '长按下方按钮开始朗读，松手后自动匹配句子并标注正误'
    },
    speechCurrentSentenceText() {
      if (!this.speechActive && !this.speechStarting) return ''
      const source = String(this.speechLatestChunkText || this.speechRealtimeText || '').trim()
      if (!source) return ''
      const current = this.extractCurrentSentenceText(source)
      const noPunctuation = current
        .replace(/[，。！？；：、,.!?;:'"“”‘’（）()《》〈〉【】\[\]—…\-\s]/g, '')
        .trim()
      if (!noPunctuation) return ''
      if (noPunctuation.length <= 36) return noPunctuation
      return `${noPunctuation.slice(0, 36)}...`
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.localCacheIndex = this.loadCacheIndex()
    this.initAudioContext()
    this.initSpeechRecorder()
    this.loadDetail()
  },
  onUnload() {
    this.stopActiveAudio()
    this.audioPlayResolver = null
    this.cleanupSpeechTimers()
    this.stopSpeechWebRecorder()
    this.closeSpeechSocket()
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
        if (this.currentUnitIndex >= 0) {
          this.lastFinishedUnitIndex = this.currentUnitIndex
        }
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
        pinyinText: this.buildUnitPinyin(item.text),
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
      this.lastFinishedUnitIndex = -1
      this.speechLiveDiffMap = {}
      this.speechSentenceResultMap = {}
      this.speechSentenceAttemptMap = {}
      this.lastMatchedIndex = -1
      this.speechRealtimeText = ''
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
            const normalized = String(subSentence || '').trim()
            if (this.isSinglePunctuationUnit(normalized) && result.length > 0) {
              result[result.length - 1].text += normalized
              return
            }
            result.push({
              text: normalized,
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
    isSinglePunctuationUnit(text) {
      if (!text || text.length !== 1) return false
      return /^[，。！？；：、,.!?;:'"“”‘’（）()《》〈〉【】\[\]—…]$/.test(text)
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
    buildUnitPinyin(text) {
      const chars = String(text || '').split('')
      if (!chars.length) return ''
      const tokens = chars.map((char) => {
        if (/[\u4e00-\u9fff]/.test(char)) {
          const py = pinyin(char, {
            toneType: 'symbol',
            type: 'array'
          })
          return Array.isArray(py) && py.length ? py[0] : char
        }
        return char
      })
      return tokens
        .join(' ')
        .replace(/\s+([，。！？；、,.!?;:])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
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
    onPressStart() {
      if (!this.playUnits.length) return
      if (this.speechActive || this.speechStarting) return
      this.startSpeechRecognition()
    },
    onPressEnd() {
      if (!this.speechActive) {
        if (this.speechStarting) {
          this.speechPendingStop = true
        }
        return
      }
      this.stopSpeechRecognition()
    },
    getSentenceDisplayChars(index) {
      const unit = this.playUnits[index]
      if (!unit) return []
      const liveResult = this.speechLiveDiffMap[unit.unitId]
      if ((this.speechActive || this.speechStarting) && Array.isArray(liveResult) && liveResult.length) {
        return liveResult.map(item => ({
          ...item,
          status: this.toLiveStatus(item.status)
        }))
      }
      const result = this.speechSentenceResultMap[unit.unitId]
      if (result && Array.isArray(result.diffResult) && result.diffResult.length) {
        return result.diffResult
      }
      return String(unit.text || '').split('').map(char => ({ char, status: 'normal' }))
    },
    getSentenceReadMeta(index) {
      const unit = this.playUnits[index]
      if (!unit) return ''
      const result = this.speechSentenceResultMap[unit.unitId]
      if (!result) return ''
      return `第 ${result.attemptNo} 遍 · 准确率 ${result.accuracy}%`
    },
    toLiveStatus(status) {
      if (status === 'correct') return 'live-correct'
      if (status === 'missing' || status === 'wrong') return 'live-wrong'
      if (status === 'punctuation') return 'live-punctuation'
      return 'normal'
    },
    cleanupSpeechTimers() {
      clearInterval(this.speechDurationTimer)
      this.speechDurationTimer = null
      clearInterval(this.speechFrameFlushTimer)
      this.speechFrameFlushTimer = null
      clearTimeout(this.speechUiUpdateTimer)
      this.speechUiUpdateTimer = null
    },
    async ensureSpeechAsrConfig() {
      const res = await uniCloud.callFunction({
        name: 'gw_asr-config',
        data: { provider: 'iflytek-rtasr' }
      })
      const result = (res && res.result) || {}
      if (result.code !== 0 || !result.data || !result.data.wsUrl) {
        throw new Error(result.msg || '获取讯飞语音配置失败')
      }
      this.speechAsrConfig = result.data
      return this.speechAsrConfig
    },
    async startSpeechRecognition() {
      if (this.speechActive || this.speechStarting) return
      this.speechStarting = true
      this.speechPendingStop = false
      try {
        await this.ensureSpeechAsrConfig()
        this.resetSpeechRuntimeState()
        this.speechTargetIndex = -1
        this.speechFlowCursorIndex = Math.max(0, this.lastMatchedIndex >= 0 ? this.lastMatchedIndex : 0)
        this.speechStopping = false
        this.speechDurationSeconds = 0
        clearInterval(this.speechDurationTimer)
        this.speechDurationTimer = setInterval(() => {
          this.speechDurationSeconds += 1
        }, 1000)
        await this.openSpeechSocket()
        this.startSpeechFrameFlusher()
        await this.startSpeechRecorder()
        this.speechActive = true
        this.speechStarting = false
        if (this.speechPendingStop) {
          this.stopSpeechRecognition()
        }
      } catch (error) {
        this.speechStarting = false
        this.failSpeechSession(error)
      }
    },
    async stopSpeechRecognition() {
      if (!this.speechActive || this.speechStopping) return
      this.speechStopping = true
      clearInterval(this.speechDurationTimer)
      this.speechDurationTimer = null
      try {
        await this.stopSpeechRecorder()
        await this.finishSpeechTask()
        this.flushSpeechUiUpdate()
        const recognizedText = this.speechRealtimeText
        if (!recognizedText) {
          uni.showToast({ title: '未识别到语音内容', icon: 'none' })
          return
        }
        await this.applySpeechResult(recognizedText)
      } catch (error) {
        uni.showToast({
          title: (error && error.message) || '识别失败',
          icon: 'none',
          duration: 2500
        })
      } finally {
        this.endSpeechSession()
      }
    },
    failSpeechSession(error) {
      this.endSpeechSession()
      uni.showToast({
        title: (error && error.message) || '启动朗读识别失败',
        icon: 'none',
        duration: 2500
      })
      console.error('启动朗读识别失败:', error)
    },
    endSpeechSession() {
      this.cleanupSpeechTimers()
      this.stopSpeechWebRecorder()
      this.closeSpeechSocket()
      this.speechStarting = false
      this.speechActive = false
      this.speechPendingStop = false
      this.speechStopping = false
      this.speechSocketReady = false
      this.speechTaskFinished = false
      this.speechPendingMergedText = ''
      this.speechPendingChunkText = ''
      this.speechSessionId = ''
      this.speechFrameQueue = []
      this.speechLiveDiffMap = {}
      this.speechLiveMatchedIndex = -1
      this.speechLiveMatchedAccuracy = 0
      this.speechLiveCandidateIndex = -1
      this.speechLiveCandidateHits = 0
      this.speechLastSwitchAt = 0
      this.speechFlowCursorIndex = 0
      this.speechRealtimeText = ''
      this.speechLatestChunkText = ''
    },
    resetSpeechRuntimeState() {
      this.speechSocketReady = false
      this.speechTaskFinished = false
      this.speechPendingMergedText = ''
      this.speechPendingChunkText = ''
      this.speechSessionId = ''
      this.speechFrameQueue = []
      this.speechLiveDiffMap = {}
      this.speechSegmentMap = {}
      this.speechRealtimeText = ''
      this.speechLiveMatchedIndex = -1
      this.speechLiveMatchedAccuracy = 0
      this.speechLiveCandidateIndex = -1
      this.speechLiveCandidateHits = 0
      this.speechLastSwitchAt = 0
      this.speechFlowCursorIndex = 0
      this.speechLatestChunkText = ''
      this.speechWaitFinishResolver = null
    },
    async applySpeechResult(recognizedText) {
      const currentChunk = String(this.speechLatestChunkText || '').trim()
      const targetText = currentChunk || recognizedText
      let matched = null
      if (this.speechLiveMatchedIndex >= 0 && this.playUnits[this.speechLiveMatchedIndex]) {
        matched = { index: this.speechLiveMatchedIndex, accuracy: this.speechLiveMatchedAccuracy }
      } else {
        const preferredIndex = this.speechTargetIndex >= 0 ? this.speechTargetIndex : this.speechFlowCursorIndex
        matched = this.findBestMatchedUnit(targetText, preferredIndex)
      }
      if (!matched || matched.index < 0) {
        uni.showToast({ title: '未匹配到对应句子', icon: 'none' })
        return
      }
      const targetUnit = this.playUnits[matched.index]
      if (!targetUnit) return
      this.currentUnitIndex = matched.index
      this.lastMatchedIndex = matched.index
      this.scrollIntoViewId = `play-unit-${matched.index}`

      const diffResult = diffChars(targetUnit.text, targetText)
      const accuracy = calcAccuracy(diffResult)
      const wrongChars = diffResult
        .filter(item => item.status === 'missing' || item.status === 'wrong')
        .map(item => item.char)
        .filter(char => /[\u4e00-\u9fff]/.test(char))
      const attemptNo = (this.speechSentenceAttemptMap[targetUnit.unitId] || 0) + 1
      this.speechSentenceAttemptMap[targetUnit.unitId] = attemptNo
      this.speechSentenceResultMap = {
        ...this.speechSentenceResultMap,
        [targetUnit.unitId]: {
          diffResult,
          accuracy,
          attemptNo,
          recognizedText: targetText,
          wrongChars
        }
      }
      await this.saveSpeechRecord({
        unit: targetUnit,
        sentenceIndex: matched.index,
        recognizedText: targetText,
        diffResult,
        accuracy,
        wrongChars,
        attemptNo
      })
    },
    findBestMatchedUnit(recognizedText, preferredIndex) {
      const target = String(recognizedText || '').trim()
      if (!target || !this.playUnits.length) return null
      let best = null
      const hasPreferred = Number.isInteger(preferredIndex) && preferredIndex >= 0
      const start = hasPreferred ? Math.max(0, preferredIndex - 2) : 0
      const end = hasPreferred ? Math.min(this.playUnits.length - 1, preferredIndex + 4) : this.playUnits.length - 1
      for (let index = start; index <= end; index++) {
        const unit = this.playUnits[index]
        const diffResult = diffChars(unit.text, target)
        const accuracy = calcAccuracy(diffResult)
        const distance = preferredIndex >= 0 ? Math.abs(index - preferredIndex) : 9999
        const score = accuracy * 100 - distance
        if (!best || score > best.score) {
          best = { index, score, accuracy }
        }
      }
      if (!best) return null
      if (best.accuracy < 20 && preferredIndex >= 0 && this.playUnits[preferredIndex]) {
        return { index: preferredIndex, accuracy: best.accuracy }
      }
      return best
    },
    async saveSpeechRecord(payload) {
      const { unit, sentenceIndex, recognizedText, diffResult, accuracy, wrongChars, attemptNo } = payload
      try {
        await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'save',
            data: {
              text_id: this.id,
              text_title: this.detail.title || '',
              practice_mode: 'read',
              hint_count: 0,
              duration_seconds: Number(this.speechDurationSeconds) || 0,
              recognized_text: recognizedText,
              diff_result: diffResult,
              accuracy,
              sentence_index: sentenceIndex,
              sentence_text: unit.text || '',
              sentence_accuracy: accuracy,
              wrong_chars: wrongChars,
              attempt_no: attemptNo
            }
          }
        })
      } catch (error) {
        console.error('保存朗读记录失败:', error)
      }
    },
    openSpeechSocket() {
      return new Promise((resolve, reject) => {
        const socketTimeout = Number(this.speechAsrConfig.timeout || 20000) || 20000
        const timer = setTimeout(() => {
          reject(new Error('语音服务连接超时'))
        }, socketTimeout)
        this.speechSocketTask = uni.connectSocket({
          url: this.speechAsrConfig.wsUrl,
          complete: () => {}
        })
        this.speechSocketTask.onOpen(() => {
          clearTimeout(timer)
          this.speechSocketReady = true
          resolve()
        })
        this.speechSocketTask.onMessage(({ data }) => {
          this.handleSpeechSocketMessage(data)
        })
        this.speechSocketTask.onError((err) => {
          clearTimeout(timer)
          reject(err)
        })
        this.speechSocketTask.onClose(() => {
          this.speechSocketTask = null
          this.speechSocketReady = false
        })
      })
    },
    closeSpeechSocket() {
      if (!this.speechSocketTask) return
      try {
        this.speechSocketTask.close({})
      } catch (error) {
        console.error('关闭朗读 socket 失败:', error)
      }
      this.speechSocketTask = null
      this.speechSocketReady = false
    },
    handleSpeechSocketMessage(rawData) {
      const decoded = this.decodeSpeechSocketData(rawData)
      if (!decoded) return
      let message = decoded
      try {
        message = JSON.parse(decoded)
      } catch (error) {
        return
      }
      if (message.action === 'started') {
        this.speechSessionId = message.sid || this.speechSessionId
        return
      }
      if (message.action === 'error' || Number(message.code) > 0) {
        const errorMessage = message.desc || '语音识别异常'
        console.error('朗读识别异常:', errorMessage, message)
      }
      if (message.msg_type === 'result' && message.res_type === 'asr') {
        this.consumeSpeechResult(message.data)
      }
    },
    decodeSpeechSocketData(rawData) {
      if (typeof rawData === 'string') return rawData
      if (!(rawData instanceof ArrayBuffer)) return ''
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(rawData)
      }
      const bytes = new Uint8Array(rawData)
      let result = ''
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i])
      }
      return decodeURIComponent(escape(result))
    },
    consumeSpeechResult(data) {
      if (!data || !data.cn || !data.cn.st) return
      const segId = Number(data.seg_id || 0)
      const text = this.extractSpeechTextFromData(data)
      if (!text) return
      this.speechSegmentMap[segId] = text
      const merged = Object.keys(this.speechSegmentMap)
        .map(key => Number(key))
        .sort((a, b) => a - b)
        .map(key => this.speechSegmentMap[key] || '')
        .join('')
      this.speechPendingMergedText = merged
      this.speechPendingChunkText = text
      this.scheduleSpeechUiUpdate()
      if (data.ls === true) {
        this.speechTaskFinished = true
        if (typeof this.speechWaitFinishResolver === 'function') {
          this.speechWaitFinishResolver()
          this.speechWaitFinishResolver = null
        }
      }
    },
    scheduleSpeechUiUpdate() {
      if (this.speechUiUpdateTimer) return
      this.speechUiUpdateTimer = setTimeout(() => {
        this.flushSpeechUiUpdate()
      }, 120)
    },
    flushSpeechUiUpdate() {
      if (this.speechUiUpdateTimer) {
        clearTimeout(this.speechUiUpdateTimer)
        this.speechUiUpdateTimer = null
      }
      const merged = String(this.speechPendingMergedText || '')
      const chunk = String(this.speechPendingChunkText || '')
      if (!merged && !chunk) return
      this.speechRealtimeText = merged
      this.speechLatestChunkText = chunk
      this.updateSpeechLiveMatch(merged)
    },
    updateSpeechLiveMatch(recognizedChunk) {
      const chunk = String(recognizedChunk || '').trim()
      if (!chunk || !this.playUnits.length) return
      const now = Date.now()
      const cursor = Math.max(0, Math.min(this.speechFlowCursorIndex || 0, this.playUnits.length - 1))
      let matched = this.findBestMatchedUnit(chunk, cursor)
      if (!matched || matched.accuracy < 35) {
        matched = this.findBestMatchedUnit(chunk, this.speechLiveMatchedIndex >= 0 ? this.speechLiveMatchedIndex : cursor)
      }
      if (!matched || matched.index < 0) return

      let activeIndex = this.speechLiveMatchedIndex
      let switched = false
      const canInit = activeIndex < 0
      if (canInit) {
        activeIndex = matched.index
        switched = true
        this.speechLiveCandidateIndex = -1
        this.speechLiveCandidateHits = 0
      } else if (matched.index === activeIndex) {
        this.speechLiveCandidateIndex = -1
        this.speechLiveCandidateHits = 0
      } else {
        if (this.speechLiveCandidateIndex === matched.index) {
          this.speechLiveCandidateHits += 1
        } else {
          this.speechLiveCandidateIndex = matched.index
          this.speechLiveCandidateHits = 1
        }
        const meetsHitThreshold = this.speechLiveCandidateHits >= 2
        const meetsAccuracy = Number(matched.accuracy || 0) >= 55
        const meetsStayTime = now - Number(this.speechLastSwitchAt || 0) >= 650
        if (meetsHitThreshold && meetsAccuracy && meetsStayTime) {
          activeIndex = matched.index
          switched = true
          this.speechLiveCandidateIndex = -1
          this.speechLiveCandidateHits = 0
        }
      }

      if (switched || this.speechLiveMatchedIndex < 0) {
        this.speechLiveMatchedIndex = activeIndex
        this.currentUnitIndex = activeIndex
        this.scrollIntoViewId = `play-unit-${activeIndex}`
        this.speechLastSwitchAt = now
      }
      this.speechLiveMatchedAccuracy = Number(matched.accuracy || 0)

      const targetUnit = this.playUnits[activeIndex]
      if (targetUnit) {
        const currentSentenceText = this.extractCurrentSentenceText(chunk)
        const liveDiff = diffChars(targetUnit.text, currentSentenceText || chunk)
        this.speechLiveDiffMap = {
          [targetUnit.unitId]: liveDiff
        }
      }
      // 当当前句命中较高时，游标前移，支持“按住读完整篇”连续匹配
      if (matched.accuracy >= 88 && activeIndex >= cursor) {
        this.speechFlowCursorIndex = Math.min(activeIndex + 1, this.playUnits.length - 1)
      } else {
        this.speechFlowCursorIndex = activeIndex
      }
    },
    extractCurrentSentenceText(source) {
      const text = String(source || '').trim()
      if (!text) return ''
      const parts = text.split(/[。！？!?；;\n]/).map(item => item.trim()).filter(Boolean)
      return parts.length ? parts[parts.length - 1] : text
    },
    extractSpeechTextFromData(data) {
      const rt = (((data || {}).cn || {}).st || {}).rt
      if (!Array.isArray(rt)) return ''
      const words = []
      rt.forEach((part) => {
        const wsList = (part && part.ws) || []
        wsList.forEach((wsItem) => {
          const cwList = (wsItem && wsItem.cw) || []
          cwList.forEach((cw) => {
            const token = (cw && cw.w) || ''
            if (token) words.push(token)
          })
        })
      })
      return words.join('')
    },
    startSpeechFrameFlusher() {
      clearInterval(this.speechFrameFlushTimer)
      const intervalMs = Number(this.speechAsrConfig.frameIntervalMs || 40) || 40
      this.speechFrameFlushTimer = setInterval(() => {
        if (!this.speechSocketTask || !this.speechSocketReady) return
        if (!this.speechFrameQueue.length) return
        const frame = this.speechFrameQueue.shift()
        this.speechSocketTask.send({ data: frame })
      }, Math.max(20, intervalMs))
    },
    pushSpeechFrame(frameBuffer) {
      if (!frameBuffer || !(frameBuffer instanceof ArrayBuffer)) return
      const frameBytes = Number(this.speechAsrConfig.frameBytes || 1280) || 1280
      const bytes = new Uint8Array(frameBuffer)
      for (let offset = 0; offset < bytes.length; offset += frameBytes) {
        const slice = bytes.slice(offset, Math.min(offset + frameBytes, bytes.length))
        this.speechFrameQueue.push(slice.buffer)
      }
    },
    initSpeechRecorder() {
      // #ifdef H5
      this.speechUseWebRecorder = true
      return
      // #endif
      if (typeof uni.getRecorderManager !== 'function') {
        this.speechUseWebRecorder = true
        return
      }
      try {
        this.speechRecorderManager = uni.getRecorderManager()
      } catch (error) {
        this.speechUseWebRecorder = true
        return
      }
      if (!this.speechRecorderManager) {
        this.speechUseWebRecorder = true
        return
      }
      this.speechRecorderManager.onFrameRecorded((res) => {
        this.pushSpeechFrame(res.frameBuffer)
      })
      this.speechRecorderManager.onError((error) => {
        console.error('朗读录音失败:', error)
      })
    },
    async startSpeechRecorder() {
      if (!this.speechRecorderManager && !this.speechUseWebRecorder) {
        this.initSpeechRecorder()
      }
      if (this.speechUseWebRecorder) {
        await this.startSpeechWebRecorder()
        return
      }
      this.speechRecorderManager.start({
        format: 'PCM',
        sampleRate: Number(this.speechAsrConfig.sampleRate || 16000) || 16000,
        numberOfChannels: 1,
        frameSize: 2
      })
    },
    async stopSpeechRecorder() {
      if (this.speechUseWebRecorder) {
        this.stopSpeechWebRecorder()
        return
      }
      if (!this.speechRecorderManager) return
      try {
        this.speechRecorderManager.stop()
      } catch (error) {
        console.error('停止朗读录音失败:', error)
      }
    },
    async startSpeechWebRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前环境不支持录音')
      }
      const targetSampleRate = Number(this.speechAsrConfig.sampleRate || 16000) || 16000
      this.speechWebMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.speechWebAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.speechWebAudioContext.createMediaStreamSource(this.speechWebMediaStream)
      this.speechWebScriptProcessor = this.speechWebAudioContext.createScriptProcessor(4096, 1, 1)
      this.speechWebScriptProcessor.onaudioprocess = (event) => {
        if (!this.speechActive) return
        const input = event.inputBuffer.getChannelData(0)
        const pcm = this.convertSpeechFloat32ToPcm(input, this.speechWebAudioContext.sampleRate, targetSampleRate)
        if (pcm && pcm.byteLength > 0) {
          this.pushSpeechFrame(pcm)
        }
      }
      source.connect(this.speechWebScriptProcessor)
      this.speechWebScriptProcessor.connect(this.speechWebAudioContext.destination)
    },
    stopSpeechWebRecorder() {
      if (this.speechWebScriptProcessor) {
        this.speechWebScriptProcessor.disconnect()
        this.speechWebScriptProcessor.onaudioprocess = null
      }
      if (this.speechWebMediaStream) {
        this.speechWebMediaStream.getTracks().forEach(track => track.stop())
      }
      if (this.speechWebAudioContext) {
        this.speechWebAudioContext.close()
      }
      this.speechWebScriptProcessor = null
      this.speechWebMediaStream = null
      this.speechWebAudioContext = null
    },
    convertSpeechFloat32ToPcm(float32Array, inputSampleRate, outputSampleRate) {
      if (!float32Array || float32Array.length === 0) return null
      const ratio = inputSampleRate / outputSampleRate
      const outputLength = Math.max(1, Math.floor(float32Array.length / ratio))
      const result = new Int16Array(outputLength)
      let offsetResult = 0
      let offsetBuffer = 0
      while (offsetResult < outputLength) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio)
        let sum = 0
        let count = 0
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
          sum += float32Array[i]
          count++
        }
        const sample = count > 0 ? sum / count : 0
        const clamped = Math.max(-1, Math.min(1, sample))
        result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
        offsetResult++
        offsetBuffer = nextOffsetBuffer
      }
      return result.buffer
    },
    finishSpeechTask() {
      return new Promise((resolve) => {
        if (!this.speechSocketTask) {
          resolve()
          return
        }
        const endPayload = {
          end: true
        }
        if (this.speechSessionId) {
          endPayload.sessionId = this.speechSessionId
        }
        this.speechSocketTask.send({
          data: JSON.stringify(endPayload)
        })
        const timer = setTimeout(() => {
          resolve()
        }, 5000)
        this.speechWaitFinishResolver = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    },
    formatSpeechDuration(seconds) {
      const m = Math.floor((Number(seconds) || 0) / 60)
      const s = (Number(seconds) || 0) % 60
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
      if (!this.playUnits.length) {
        uni.showToast({ title: '暂无可朗读内容', icon: 'none' })
        return
      }
      if (this.isFullReading && !this.isPaused) {
        uni.showToast({ title: '正在完整朗读中', icon: 'none' })
        return
      }
      let start = 0
      if (this.isPaused && this.currentUnitIndex >= 0) {
        // 暂停时当前句可能尚未播完，继续时从当前句恢复
        start = this.currentUnitIndex
      } else if (this.lastFinishedUnitIndex >= 0) {
        start = this.lastFinishedUnitIndex + 1
      } else if (this.currentUnitIndex >= 0) {
        start = this.currentUnitIndex + 1
      }
      if (start >= this.playUnits.length) {
        uni.showToast({ title: '已经朗读到最后一句', icon: 'none' })
        return
      }
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
        this.saveCachedAudioUrl(unit.hash, result.data.audioUrl, result.data.format || this.ttsOptions.format || 'mp3')
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
      const meta = this.localCacheIndex[hash]
      if (meta && meta.url) {
        return meta.url
      }
      const base64 = uni.getStorageSync(`${CACHE_AUDIO_PREFIX}${hash}`)
      if (!base64 || typeof base64 !== 'string') return ''
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
    saveCachedAudioUrl(hash, url, format) {
      if (!url) return
      this.localCacheIndex[hash] = {
        key: '',
        url,
        format,
        size: String(url).length,
        updatedAt: Date.now(),
        lastAccessAt: Date.now()
      }
      this.trimCacheByLru()
      this.persistCacheIndex()
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
  padding-bottom: calc(228rpx + env(safe-area-inset-bottom));
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
.sentence-item.liveMatching {
  border-color: #f97316;
  box-shadow: 0 0 0 2rpx rgba(249, 115, 22, 0.14);
}
.sentence-item.matched {
  border-color: #22c55e;
}
.sentence-text {
  color: #111827;
  line-height: 1.8;
}
.char-item {
  color: #111827;
}
.char-correct {
  color: #16a34a;
}
.char-missing,
.char-wrong {
  color: #dc2626;
}
.char-live-correct {
  color: #4ade80;
}
.char-live-wrong {
  color: #fb7185;
}
.char-live-punctuation {
  color: #9ca3af;
}
.char-punctuation,
.char-normal {
  color: #111827;
}
.sentence-pinyin {
  display: block;
  margin-bottom: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.5;
}
.sentence-tip {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #b26a00;
}
.sentence-read-meta {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #4b5563;
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
.speech-btn-row {
  margin-top: 0;
}
.speech-floating-row {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(112rpx + env(safe-area-inset-bottom));
  z-index: 12;
  pointer-events: none;
}
.speech-current-text {
  display: block;
  text-align: center;
  font-size: 34rpx;
  color: #f97316;
  font-weight: 600;
  line-height: 1.6;
  text-shadow: 0 2rpx 8rpx rgba(255, 255, 255, 0.8);
}
.speech-btn {
  width: 100%;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 36rpx;
  background: #f97316;
  color: #fff;
  font-size: 28rpx;
  border: 0;
}
.speech-btn.active {
  background: #dc2626;
}
</style>
