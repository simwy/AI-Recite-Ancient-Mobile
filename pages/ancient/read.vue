<template>
  <view class="container">
    <view class="top-tools">
      <view class="font-switch">
        <text class="font-item" :class="{ active: fontSize === 'large' }" @tap="setFontSize('large')">大</text>
        <text class="font-item" :class="{ active: fontSize === 'medium' }" @tap="setFontSize('medium')">中</text>
        <text class="font-item" :class="{ active: fontSize === 'small' }" @tap="setFontSize('small')">小</text>
      </view>
      <view class="right-tools">
        <view v-if="followMode && followTotalScore > 0" class="follow-score-badge">
          <text class="follow-score-num">{{ followTotalScore }}</text>
          <text class="follow-score-label">分 {{ followProgress }}</text>
        </view>
      </view>
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
            loading: loadingUnitIndex === index,
            recording: getFollowState(index) === 'recording',
            'follow-done': getFollowState(index) === 'done'
          }"
          @tap="onTapSentence(index)"
        >
          <!-- 跟读完成：逐字着色 -->
          <view v-if="getFollowState(index) === 'done'" class="sentence-text diff-text">
            <text
              v-for="(ch, ci) in getFollowDiffResult(index)"
              :key="ci"
              :class="{
                'diff-correct': ch.status === 'correct' || ch.status === 'homophone',
                'diff-wrong': ch.status === 'wrong' || ch.status === 'missing',
                'diff-punctuation': ch.status === 'punctuation'
              }"
            >{{ ch.char }}</text>
            <text class="follow-accuracy">{{ getFollowAccuracy(index) }}%</text>
            <view v-if="getFollowAccuracy(index) < 80" class="follow-retry-hint">
              <text class="retry-hint-text">请重新朗读</text>
              <view class="follow-retry-btn" @tap.stop="startFollowUnit(index)">
                <text>重试</text>
              </view>
            </view>
          </view>
          <!-- 录音中 -->
          <view v-else-if="getFollowState(index) === 'recording'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-dot">●</text>
              <text class="recording-label">录音中...</text>
            </view>
          </view>
          <!-- 识别中 -->
          <view v-else-if="getFollowState(index) === 'recognizing'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-label">识别中...</text>
            </view>
          </view>
          <!-- 播放TTS中 -->
          <view v-else-if="getFollowState(index) === 'playing'" class="sentence-text">
            {{ unit.text }}
            <view class="follow-recording-hint">
              <text class="recording-label">播放中...</text>
            </view>
          </view>
          <!-- 默认 -->
          <view v-else class="sentence-text">{{ unit.text }}</view>
          <text v-if="loadingUnitIndex === index" class="sentence-tip">正在合成语音...</text>
          <!-- 跟读模式下录音中显示停止按钮 -->
          <view v-if="followMode && getFollowState(index) === 'recording'" class="follow-stop-btn" @tap.stop="stopFollowRecording">
            <text>跟读完成</text>
          </view>
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
import { diffChars, calcAccuracy } from '@/common/diff.js'
import { buildPlayUnits as buildPlayUnitsFromContent } from '@/common/playUnits.js'
import ttsService from '@/common/ttsService.js'
import { createStableHash } from '@/common/ttsService.js'

const db = uniCloud.database()
const SPLIT_VERSION = 'v1'

export default {
  computed: {
    showStopButton() {
      return this.isFullReading || this.loadingUnitIndex >= 0 || typeof this.audioPlayResolver === 'function'
    },
    followTotalScore() {
      if (!this.playUnits.length) return 0
      const doneEntries = Object.values(this.followStates).filter(s => s.state === 'done')
      if (!doneEntries.length) return 0
      const sum = doneEntries.reduce((acc, s) => acc + (s.accuracy || 0), 0)
      return Math.round(sum / this.playUnits.length)
    },
    followProgress() {
      const done = Object.values(this.followStates).filter(s => s.state === 'done').length
      return `${done}/${this.playUnits.length}`
    }
  },
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
      isFullReading: false,
      queueNextIndex: 0,
      lastFinishedUnitIndex: -1,
      fullReadToken: 0,
      snapshotSyncing: false,
      // 跟读模式
      followMode: true,
      followingUnitIndex: -1,
      followStates: {},
      recording: false,
      // 录音/ASR
      recorderManager: null,
      socketTask: null,
      asrConfig: null,
      taskId: '',
      taskStarted: false,
      taskFinished: false,
      frameQueue: [],
      finalSentences: [],
      partialSentence: '',
      realtimeText: '',
      stopping: false,
      waitTaskFinishedResolver: null,
      useWebRecorder: false,
      webAudioContext: null,
      webMediaStream: null,
      webScriptProcessor: null,
      h5MediaRecorder: null,
      h5AudioChunks: [],
      h5StopPromiseResolver: null,
      requestingPermission: false,
      followStartTime: 0,
      followRecordSaved: false
    }
  },
  onLoad(options) {
    this.id = options.id || ''
    this.pendingAutoStartIndex = options.autoStart === '1' ? 0 : (options.startIndex != null && options.startIndex !== '' ? parseInt(options.startIndex, 10) : -1)
    // autoStart=1 → 跟读模式；startIndex → 朗读模式
    this.followMode = options.autoStart === '1'
    this.initAudioContext()
    this.initRecorder()
    this.loadDetail()
  },
  onUnload() {
    this.stopActiveAudio()
    this.audioPlayResolver = null
    // 清理录音/ASR资源
    this.closeSocket()
    if (this.useWebRecorder) {
      this.stopWebRecorder()
      this.cleanupH5PcmRecorder()
    }
    if (this.recorderManager && this.recording) {
      try { this.recorderManager.stop() } catch (e) {}
    }
    if (this.audioContext) {
      this.audioContext.destroy()
      this.audioContext = null
    }
    if (this.followMode && !this.followRecordSaved) {
      this.saveFollowRecord()
    }
  },
  methods: {
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
    maybeAutoStartRead() {
      if (this.pendingAutoStartIndex < 0 || !this.playUnits.length) return
      const startIndex = Math.max(0, Math.min(this.pendingAutoStartIndex, this.playUnits.length - 1))
      this.pendingAutoStartIndex = -1
      this.$nextTick(() => {
        if (this.followMode) {
          this.startFollowUnit(startIndex)
        } else {
          this.startFullRead(startIndex)
        }
      })
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
      this.audioContext.onError(() => {
        this.resolveAudioPlay('error')
        if (this.isFullReading) {
          this.playNextInQueue()
        }
        uni.showToast({ title: '播放失败', icon: 'none' })
      })
    },
    rebuildPlayUnits() {
      const rawContent = String((this.detail && this.detail.content) || '').replace(/\r\n/g, '\n')
      const units = buildPlayUnitsFromContent(rawContent)
      this.playUnits = units.map((item, index) => ({
        unitId: `${this.id || 'text'}-${index}-${this.createStableHash(item.text)}`,
        text: item.text,
        mainIndex: item.mainIndex,
        subIndex: item.subIndex,
        hash: this.buildUnitHash(item.text)
      }))
      this.resetReadProgressState()
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
      return createStableHash(text)
    },
    createSha1Hash(text) {
      return createStableHash(String(text || ''))
    },
    buildUnitHash(text) {
      return ttsService.buildUnitHash(text)
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
      } finally {
        this.snapshotSyncing = false
      }
    },
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
    onClearReadProgress() {
      this.onStopPlay()
      this.resetReadProgressState()
      this.followStates = {}
      uni.showToast({ title: '已清空朗读进度', icon: 'none' })
    },
    resetReadProgressState() {
      this.currentUnitIndex = -1
      this.loadingUnitIndex = -1
      this.scrollIntoViewId = ''
      this.lastFinishedUnitIndex = -1
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
      if (this.followMode) {
        this.startFollowUnit(index)
        return
      }
      if (this.isFullReading) return
      this.isFullReading = false
      this.queueNextIndex = 0
      this.fullReadToken++
      this.stopActiveAudio()
      this.resolveAudioPlay('interrupted')
      await this.playUnit(index)
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
      if (this.currentUnitIndex >= 0) {
        return this.currentUnitIndex
      }
      if (this.lastFinishedUnitIndex >= 0 && this.lastFinishedUnitIndex < this.playUnits.length - 1) {
        return this.lastFinishedUnitIndex + 1
      }
      return 0
    },
    onStopPlay() {
      this.isFullReading = false
      this.queueNextIndex = 0
      this.fullReadToken++
      this.stopActiveAudio()
      this.loadingUnitIndex = -1
      this.resolveAudioPlay('stopped')
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
    stopActiveAudio() {
      if (!this.audioContext) return
      try {
        this.audioContext.stop()
      } catch (e) {
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
    /**
     * 小程序真机播网络 URL 易报 err 55，先下载到本地再播；同一句复用本地路径。
     * 若 download 失败（如未配置下载域名），降级为直接使用网络地址播放。
     */
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

    // ========== 录音/ASR 方法（移植自 recite.vue） ==========
    ensureRecordPermission() {
      return new Promise((resolve, reject) => {
        // #ifdef H5
        resolve()
        return
        // #endif
        const doAuthorize = () => {
          uni.authorize({
            scope: 'scope.record',
            success: () => resolve(),
            fail: (err) => {
              const errStr = String((err && (err.errMsg || err.message)) || '')
              const isDenied = /auth deny|denied|拒绝|未授权|scope\.record/i.test(errStr)
              if (!isDenied) {
                reject(err || new Error('获取录音权限失败'))
                return
              }
              uni.showModal({
                title: '需要麦克风权限',
                content: '用于跟读语音识别，请允许使用麦克风。',
                confirmText: '去设置',
                cancelText: '取消',
                success: (res) => {
                  if (!res.confirm) {
                    reject(new Error('未授权录音权限'))
                    return
                  }
                  uni.openSetting({
                    success: (settingRes) => {
                      if (settingRes.authSetting && settingRes.authSetting['scope.record']) {
                        resolve()
                      } else {
                        reject(new Error('未授权录音权限'))
                      }
                    },
                    fail: () => reject(new Error('未授权录音权限'))
                  })
                }
              })
            }
          })
        }
        // #ifdef MP-WEIXIN
        uni.getSetting({
          success: (settingRes) => {
            if (settingRes.authSetting && settingRes.authSetting['scope.record'] === true) {
              resolve()
              return
            }
            doAuthorize()
          },
          fail: () => doAuthorize()
        })
        // #endif
        // #ifndef MP-WEIXIN
        doAuthorize()
        // #endif
      })
    },
    initRecorder() {
      // #ifdef H5
      this.useWebRecorder = true
      return
      // #endif
      if (typeof uni.getRecorderManager !== 'function') {
        this.useWebRecorder = true
        return
      }
      try {
        this.recorderManager = uni.getRecorderManager()
      } catch (e) {
        this.useWebRecorder = true
        return
      }
      if (!this.recorderManager) {
        this.useWebRecorder = true
        return
      }
      this.recorderManager.onFrameRecorded((res) => {
        this.sendAudioFrame(res.frameBuffer)
      })
      this.recorderManager.onStop(() => {
        this.recording = false
        this.handleFollowRecorderStop()
      })
      this.recorderManager.onError((err) => {
        this.recording = false
        this.closeSocket()
        const msg = (err && err.errMsg) ? err.errMsg : '录音失败'
        uni.showToast({ title: msg.indexOf('record') !== -1 ? '请允许麦克风权限后重试' : '录音失败', icon: 'none', duration: 3000 })
      })
    },

    async loadAsrConfig() {
      if (this.asrConfig) return // 已有配置则跳过，避免重复网络请求
      const res = await uniCloud.callFunction({ name: 'gw_asr-config' })
      const result = res.result || {}
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || '获取语音配置失败')
      }
      this.asrConfig = result.data
    },
    openSocket() {
      return new Promise((resolve, reject) => {
        let socketUrl = this.asrConfig.wsUrl
        let socketHeader = {
          Authorization: `${this.asrConfig.tokenType || 'bearer'} ${this.asrConfig.temporaryToken}`
        }
        // #ifdef H5
        if (!window.isSecureContext) {
          reject(new Error('H5 录音需要 HTTPS 或 localhost 安全上下文'))
          return
        }
        const fallbackRelayWsUrl = this.buildDefaultRelayWsUrl()
        const relayWsUrl = this.asrConfig.relayWsUrl || fallbackRelayWsUrl
        if (!relayWsUrl) {
          reject(new Error('H5 需要配置 relayWsUrl'))
          return
        }
        socketUrl = relayWsUrl
        socketHeader = {}
        // #endif
        this.taskId = this.createTaskId()
        this.socketTask = uni.connectSocket({
          url: socketUrl,
          header: socketHeader,
          complete: () => {}
        })
        this.socketTask.onOpen(() => {
          this._openSocketResolver = resolve
          this._openSocketTimer = setTimeout(() => {
            if (this._openSocketResolver) {
              console.warn('[ASR] task-started 超时，强制 resolve')
              this._openSocketResolver()
              this._openSocketResolver = null
            }
          }, 5000)
          this.sendRunTask()
        })
        this.socketTask.onMessage(({ data }) => {
          this.handleSocketMessage(data)
        })
        this.socketTask.onError((err) => {
          // #ifdef H5
          reject(new Error('H5 WebSocket 连接失败'))
          // #endif
          // #ifndef H5
          reject(err)
          // #endif
        })
        this.socketTask.onClose(() => {
          this.socketTask = null
        })
      })
    },
    sendRunTask() {
      if (!this.socketTask) return
      const payload = {
        header: {
          action: 'run-task',
          task_id: this.taskId,
          streaming: 'duplex'
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: this.asrConfig.model || 'paraformer-realtime-v2',
          parameters: {
            format: this.asrConfig.format || 'pcm',
            sample_rate: this.asrConfig.sampleRate || 16000,
            language_hints: this.asrConfig.languageHints || ['zh'],
            punctuation_prediction_enabled: this.asrConfig.punctuationPredictionEnabled !== false,
            inverse_text_normalization_enabled: this.asrConfig.inverseTextNormalizationEnabled !== false
          },
          input: {}
        }
      }
      this.socketTask.send({ data: JSON.stringify(payload) })
    },
    sendAudioFrame(frameBuffer) {
      if (!frameBuffer || !this.socketTask) return
      if (!this.taskStarted) {
        this.frameQueue.push(frameBuffer)
        return
      }
      this.socketTask.send({ data: frameBuffer })
    },
    flushFrameQueue() {
      if (!this.socketTask || !this.taskStarted || this.frameQueue.length === 0) return
      while (this.frameQueue.length > 0) {
        const frame = this.frameQueue.shift()
        this.socketTask.send({ data: frame })
      }
    },
    handleSocketMessage(rawData) {
      const decoded = this.decodeSocketData(rawData)
      if (!decoded) return
      let message = decoded
      try { message = JSON.parse(decoded) } catch (e) { return }
      const header = message.header || {}
      const event = header.event
      if (event === 'task-started') {
        this.taskStarted = true
        this.flushFrameQueue()
        if (this._openSocketTimer) {
          clearTimeout(this._openSocketTimer)
          this._openSocketTimer = null
        }
        if (this._openSocketResolver) {
          this._openSocketResolver()
          this._openSocketResolver = null
        }
        return
      }
      if (event === 'result-generated') {
        this.handleRecognizedSentence(message.payload && message.payload.output && message.payload.output.sentence)
        return
      }
      if (event === 'task-finished') {
        this.taskFinished = true
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver()
          this.waitTaskFinishedResolver = null
        }
        this.closeSocket()
        return
      }
      if (event === 'task-failed') {
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver()
          this.waitTaskFinishedResolver = null
        }
        this.closeSocket()
      }
    },
    decodeSocketData(rawData) {
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
    handleRecognizedSentence(sentence) {
      if (!sentence || sentence.heartbeat) return
      const text = sentence.text || ''
      if (!text) return
      if (sentence.sentence_end) {
        this.finalSentences.push(text)
        this.partialSentence = ''
        this.realtimeText = this.finalSentences.join('')
        // 自动停止检查
        this.checkAutoStopFollow()
      } else {
        this.partialSentence = text
        this.realtimeText = `${this.finalSentences.join('')}${this.partialSentence}`
      }
    },
    checkAutoStopFollow() {
      if (!this.recording || this.followingUnitIndex < 0) return
      // 最短录音时间保护：录音开始 1.5 秒内不自动停止
      if (this._followRecordStartTime && (Date.now() - this._followRecordStartTime < 1500)) return
      // sentence_end 时一律停止录音，由 processFollowResult 根据准确率决定后续行为
      this.stopFollowRecording()
    },
    finishTask() {
      return new Promise((resolve) => {
        if (!this.socketTask) { resolve(); return }
        if (this.taskStarted && !this.taskFinished) {
          this.socketTask.send({
            data: JSON.stringify({
              header: { action: 'finish-task', task_id: this.taskId, streaming: 'duplex' },
              payload: { input: {} }
            })
          })
        }
        const timer = setTimeout(() => { this.closeSocket(); resolve() }, 5000)
        this.waitTaskFinishedResolver = () => { clearTimeout(timer); resolve() }
      })
    },
    closeSocket() {
      if (!this.socketTask) return
      try { this.socketTask.close() } catch (e) {}
      this.socketTask = null
    },
    resetRealtimeState() {
      this.taskId = ''
      this.taskStarted = false
      this.taskFinished = false
      this.frameQueue = []
      this.finalSentences = []
      this.partialSentence = ''
      this.realtimeText = ''
      this.waitTaskFinishedResolver = null
    },
    createTaskId() {
      return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    },
    buildDefaultRelayWsUrl() {
      // #ifdef H5
      if (!window.location || !window.location.host) return ''
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProtocol}//${window.location.host}/asr-relay`
      // #endif
      // #ifndef H5
      return ''
      // #endif
    },
    async startWebRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音')
      }
      const targetSampleRate = this.asrConfig.sampleRate || 16000
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.webAudioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.webAudioContext.createMediaStreamSource(this.webMediaStream)
      this.webScriptProcessor = this.webAudioContext.createScriptProcessor(4096, 1, 1)
      this.webScriptProcessor.onaudioprocess = (event) => {
        if (!this.recording || !this.socketTask) return
        const inputData = event.inputBuffer.getChannelData(0)
        const pcmBuffer = this.convertFloat32To16kPcm(inputData, this.webAudioContext.sampleRate, targetSampleRate)
        if (pcmBuffer && pcmBuffer.byteLength > 0) {
          this.sendAudioFrame(pcmBuffer)
        }
      }
      source.connect(this.webScriptProcessor)
      this.webScriptProcessor.connect(this.webAudioContext.destination)
    },
    stopWebRecorder() {
      if (this.webScriptProcessor) {
        this.webScriptProcessor.disconnect()
        this.webScriptProcessor.onaudioprocess = null
      }
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach(track => track.stop())
      }
      if (this.webAudioContext) {
        this.webAudioContext.close()
      }
      this.webScriptProcessor = null
      this.webMediaStream = null
      this.webAudioContext = null
    },
    convertFloat32To16kPcm(float32Array, inputSampleRate, outputSampleRate) {
      if (!float32Array || float32Array.length === 0) return null
      const ratio = inputSampleRate / outputSampleRate
      const outputLength = Math.max(1, Math.floor(float32Array.length / ratio))
      const result = new Int16Array(outputLength)
      let offsetResult = 0
      let offsetBuffer = 0
      while (offsetResult < outputLength) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio)
        let accum = 0, count = 0
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
          accum += float32Array[i]
          count++
        }
        const sample = count > 0 ? accum / count : 0
        const clamped = Math.max(-1, Math.min(1, sample))
        result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
        offsetResult++
        offsetBuffer = nextOffsetBuffer
      }
      return result.buffer
    },
    async startH5PcmRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持录音')
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('当前浏览器不支持 MediaRecorder')
      }
      this.h5AudioChunks = []
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.h5MediaRecorder = new MediaRecorder(this.webMediaStream, { mimeType: 'audio/webm' })
      this.h5MediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          this.h5AudioChunks.push(evt.data)
        }
      }
      this.h5MediaRecorder.onstop = async () => {
        if (!this.stopping) return
        const idx = this.followingUnitIndex
        try {
          uni.showLoading({ title: '语音识别中...' })
          const audioBlob = new Blob(this.h5AudioChunks, { type: 'audio/webm' })
          const audioBase64 = await this.blobToBase64(audioBlob)
          const callRes = await uniCloud.callFunction({
            name: 'gw_asr-file-recognize',
            data: { audioBase64, format: 'webm' }
          })
          const result = callRes.result || {}
          if (result.code !== 0) throw new Error(result.msg || '识别失败')
          const recognizedText = (result.data && result.data.text) || ''
          this.processFollowResult(idx, recognizedText)
        } catch (error) {
          uni.showToast({ title: error.message || '识别失败', icon: 'none' })
          this.followStates = { ...this.followStates, [idx]: { state: 'error' } }
        } finally {
          uni.hideLoading()
          this.cleanupH5PcmRecorder()
          if (this.h5StopPromiseResolver) {
            this.h5StopPromiseResolver()
            this.h5StopPromiseResolver = null
          }
        }
      }
      this.h5MediaRecorder.start()
    },
    async stopH5PcmRecorder() {
      if (!this.h5MediaRecorder || this.h5MediaRecorder.state === 'inactive') {
        this.cleanupH5PcmRecorder()
        return
      }
      await new Promise((resolve) => {
        this.h5StopPromiseResolver = resolve
        this.h5MediaRecorder.stop()
      })
    },
    cleanupH5PcmRecorder() {
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach(track => track.stop())
      }
      this.webMediaStream = null
      this.h5MediaRecorder = null
      this.h5AudioChunks = []
      this.h5StopPromiseResolver = null
    },
    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result || ''
          resolve(String(result).split(',')[1] || '')
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    },
    handleFollowRecorderStop() {
      if (!this.stopping) return
      this.processFollowStopWithASR()
    },
    async processFollowStopWithASR() {
      const idx = this.followingUnitIndex
      try {
        uni.showLoading({ title: '正在结束识别...' })
        await this.finishTask()
        uni.hideLoading()
        this.processFollowResult(idx, this.realtimeText)
      } catch (e) {
        uni.hideLoading()
        console.error('[跟读] processFollowStopWithASR error:', e)
        this.followStates = { ...this.followStates, [idx]: { state: 'error' } }
        uni.showToast({ title: '识别失败', icon: 'none' })
      } finally {
        this.stopping = false
      }
    },
    // ========== 跟读流程方法 ==========
    toggleFollowMode() {
      this.followMode = !this.followMode
      if (!this.followMode) {
        this.abortCurrentFollowRecording()
        if (this._autoAdvanceTimer) { clearTimeout(this._autoAdvanceTimer); this._autoAdvanceTimer = null }
        this.followingUnitIndex = -1
      } else {
        // 进入跟读模式时停止朗读
        this.onStopPlay()
      }
    },
    async startFollowUnit(index) {
      if (!this.followStartTime) {
        this.followStartTime = Date.now()
      }
      if (this.recording) {
        // 正在录音中，先停止当前录音
        await this.stopFollowRecording()
        return
      }
      // 中断之前的跟读
      this.abortCurrentFollowRecording()
      this.followingUnitIndex = index
      this.followStates = { ...this.followStates, [index]: { state: 'playing' } }
      try {
        // 先播放 TTS
        await this.playUnit(index)
        // TTS 播完后自动开始录音
        if (this.followingUnitIndex !== index || !this.followMode) return
        await new Promise(r => setTimeout(r, 500))
        if (this.followingUnitIndex !== index || !this.followMode) return
        await this.startFollowRecording(index)
      } catch (e) {
        console.error('startFollowUnit error:', e)
        if (this.followingUnitIndex === index) {
          this.followStates = { ...this.followStates, [index]: { state: 'error' } }
          uni.showToast({ title: e.message || '跟读失败', icon: 'none' })
        }
      }
    },
    async startFollowRecording(index) {
      console.log('[跟读] startFollowRecording, index:', index, 'useWebRecorder:', this.useWebRecorder)
      this.followStates = { ...this.followStates, [index]: { state: 'recording' } }
      this.resetRealtimeState()
      try {
        await this.ensureRecordPermission()
        console.log('[跟读] 权限已获取')
        await this.loadAsrConfig()
        console.log('[跟读] ASR配置已加载', this.asrConfig ? 'ok' : 'null')
        if (this.useWebRecorder) {
          // H5: 使用文件录音方式
          await this.startH5PcmRecorder()
          this.recording = true
          this._followRecordStartTime = Date.now()
          console.log('[跟读] H5录音已启动')
        } else {
          // 原生: 先启动录音，再连 WebSocket（frameQueue 会缓存早期帧）
          this.recording = true
          this._followRecordStartTime = Date.now()
          this.recorderManager.start({
            duration: 30000,
            sampleRate: this.asrConfig.sampleRate || 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'PCM',
            frameSize: 4
          })
          console.log('[跟读] 原生录音已启动（WebSocket 连接中）')
          await this.openSocket()
          console.log('[跟读] WebSocket已连接，缓冲帧已刷新')
        }
        // 30秒自动停止
        this._followTimer = setTimeout(() => {
          if (this.recording && this.followingUnitIndex === index) {
            this.stopFollowRecording()
          }
        }, 30000)
        // 静音超时：8秒内无识别结果则自动停止
        this._silenceTimer = setTimeout(() => {
          if (this.recording && this.followingUnitIndex === index && !this.realtimeText) {
            console.log('[跟读] 静音超时，自动停止录音')
            this.stopFollowRecording()
          }
        }, 8000)
      } catch (e) {
        this.recording = false
        try { this.recorderManager && this.recorderManager.stop() } catch (_) {}
        this.followStates = { ...this.followStates, [index]: { state: 'error' } }
        uni.showToast({ title: e.message || '录音启动失败', icon: 'none' })
      }
    },
    async stopFollowRecording() {
      if (!this.recording) return
      if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null }
      if (this._followTimer) { clearTimeout(this._followTimer); this._followTimer = null }
      this.stopping = true
      const idx = this.followingUnitIndex
      this.followStates = { ...this.followStates, [idx]: { state: 'recognizing' } }
      if (this.useWebRecorder) {
        this.recording = false
        await this.stopH5PcmRecorder()
        this.stopping = false
      } else {
        // recorderManager.stop() 是异步的，onStop 回调里会处理后续流程
        this.recorderManager.stop()
      }
    },
    abortCurrentFollowRecording() {
      if (this._autoAdvanceTimer) { clearTimeout(this._autoAdvanceTimer); this._autoAdvanceTimer = null }
      if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null }
      if (this._followTimer) { clearTimeout(this._followTimer); this._followTimer = null }
      // 清除当前句子的 playing/recording 状态（避免切换句子后旧句子仍显示播放中）
      const prevIdx = this.followingUnitIndex
      if (prevIdx >= 0 && this.followStates[prevIdx]) {
        const prevState = this.followStates[prevIdx].state
        if (prevState === 'playing' || prevState === 'recording') {
          const { [prevIdx]: _, ...rest } = this.followStates
          this.followStates = rest
        }
      }
      if (this.recording) {
        this.stopping = false
        this.recording = false
        if (this.useWebRecorder) {
          this.cleanupH5PcmRecorder()
          this.stopWebRecorder()
        } else if (this.recorderManager) {
          try { this.recorderManager.stop() } catch (e) {}
        }
        this.closeSocket()
        this.resetRealtimeState()
      }
    },
    processFollowResult(index, recognizedText) {
      if (index < 0 || index >= this.playUnits.length) return
      const originalText = this.playUnits[index].text || ''
      console.log('[跟读] 原文:', originalText)
      console.log('[跟读] 识别结果:', recognizedText)
      if (!recognizedText || !recognizedText.trim()) {
        this.followStates = { ...this.followStates, [index]: { state: 'done', diffResult: [], accuracy: 0 } }
        return
      }
      const diffResult = diffChars(originalText, recognizedText)
      const accuracy = calcAccuracy(diffResult)
      console.log('[跟读] diff结果:', JSON.stringify(diffResult))
      console.log('[跟读] 准确率:', accuracy)
      this.followStates = { ...this.followStates, [index]: { state: 'done', diffResult, accuracy } }
      this.resetRealtimeState()
      // 准确率 ≥ 80% 自动推进到下一句（已读过的句子不自动播放）
      if (accuracy >= 80 && this.followMode) {
        const nextIndex = index + 1
        const nextState = this.followStates[nextIndex] && this.followStates[nextIndex].state
        if (nextIndex < this.playUnits.length && nextState !== 'done') {
          this._autoAdvanceTimer = setTimeout(() => {
            if (this.followMode && !this.recording) {
              this.startFollowUnit(nextIndex)
            }
          }, 800)
        }
      }
      // 所有句子完成后自动保存
      const doneCount = Object.values(this.followStates).filter(s => s.state === 'done').length
      if (doneCount === this.playUnits.length) {
        this.saveFollowRecord()
      }
    },
    getFollowState(index) {
      return (this.followStates[index] && this.followStates[index].state) || ''
    },
    getFollowDiffResult(index) {
      return (this.followStates[index] && this.followStates[index].diffResult) || []
    },
    getFollowAccuracy(index) {
      return (this.followStates[index] && this.followStates[index].accuracy) || 0
    },
    getUniIdToken() {
      const info = uniCloud.getCurrentUserInfo() || {}
      if (!info.token) return ''
      if (info.tokenExpired && info.tokenExpired < Date.now()) return ''
      return info.token
    },
    async saveFollowRecord() {
      if (this.followRecordSaved) return
      if (!this.id || !this.detail.title) return
      const doneEntries = Object.entries(this.followStates).filter(([_, s]) => s.state === 'done')
      if (!doneEntries.length) return
      const totalScore = this.followTotalScore
      const duration = Math.round((Date.now() - this.followStartTime) / 1000)
      const allDiff = []
      const sentenceDetails = []
      for (const [idx, s] of doneEntries) {
        const unit = this.playUnits[Number(idx)]
        allDiff.push(...(s.diffResult || []))
        const wrongChars = (s.diffResult || [])
          .filter(d => d.status === 'wrong' || d.status === 'missing')
          .map(d => d.char)
        sentenceDetails.push({
          index: Number(idx),
          text: unit ? unit.text : '',
          accuracy: s.accuracy || 0,
          diff_result: s.diffResult || [],
          wrong_chars: wrongChars
        })
      }
      try {
        const uniIdToken = this.getUniIdToken()
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'save',
            uniIdToken,
            data: {
              text_id: this.id,
              text_title: this.detail.title,
              practice_mode: 'follow',
              duration_seconds: duration,
              accuracy: totalScore,
              diff_result: allDiff,
              sentence_details: sentenceDetails
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code === 0) {
          this.followRecordSaved = true
        }
      } catch (e) {
        console.error('[跟读] 保存记录失败:', e)
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
.follow-score-badge {
  display: flex;
  align-items: baseline;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20rpx;
  padding: 6rpx 20rpx;
}
.follow-score-num {
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
}
.follow-score-label {
  font-size: 22rpx;
  color: rgba(255,255,255,0.85);
  margin-left: 6rpx;
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
.tool-btn-stop {
  color: #b42318;
  background: #fff1f0;
  border-color: #fecdc9;
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

/* ========== 跟读模式样式 ========== */
.tool-btn-active {
  background: #2f6fff !important;
  color: #fff !important;
  border-color: #2f6fff !important;
}
.sentence-item.recording {
  border-left: 6rpx solid #fa8c16;
  background: #fff7e6;
}
.sentence-item.follow-done {
  border-left: 6rpx solid #52c41a;
  background: #f6ffed;
}
.diff-text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong, .diff-missing {
  color: #f5222d;
}
.diff-punctuation {
  color: #666;
}
.follow-accuracy {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: #2f6fff;
  font-weight: 600;
}
.follow-retry-hint {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
  gap: 16rpx;
}
.retry-hint-text {
  font-size: 24rpx;
  color: #f5222d;
}
.follow-retry-btn {
  padding: 6rpx 20rpx;
  background: #4f46e5;
  border-radius: 24rpx;
  color: #fff;
  font-size: 24rpx;
}
.follow-recording-hint {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}
.recording-dot {
  color: #f5222d;
  font-size: 28rpx;
  margin-right: 6rpx;
  animation: blink 1s infinite;
}
.recording-label {
  font-size: 24rpx;
  color: #fa8c16;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.follow-stop-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 12rpx;
  padding: 8rpx 24rpx;
  background: #ff4d4f;
  color: #fff;
  border-radius: 24rpx;
  font-size: 26rpx;
  width: fit-content;
}
</style>
