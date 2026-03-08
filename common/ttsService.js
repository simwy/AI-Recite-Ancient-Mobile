/**
 * TTS 合成 + 缓存共享服务（单例）
 * 从 read.vue 抽离，供 detail.vue 预合成、read.vue 播放、未来页面复用
 */

const CACHE_INDEX_KEY = 'gw_tts_audio_cache_index_v1'
const CACHE_AUDIO_PREFIX = 'gw_tts_audio_data_v1_'
const MAX_LOCAL_CACHE_ITEMS = 80
const TTS_PENDING_RETRY_MAX = 6
const TTS_PENDING_RETRY_DELAY = 800

function isMiniProgram() {
  return typeof wx !== 'undefined' || typeof my !== 'undefined'
}

function createStableHash(text) {
  const source = String(text || '')
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const ttsService = {
  _initialized: false,
  localCacheIndex: {},
  downloadTempPathCache: {},
  ttsOptions: {
    voice: 'x6_lingyufei_pro',
    speed: 50,
    pitch: 50,
    volume: 50,
    format: 'mp3'
  },

  init() {
    if (this._initialized) return
    this.localCacheIndex = this.loadCacheIndex()
    this._initialized = true
  },

  buildUnitHash(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim()
    const payload = `${normalized}|${this.ttsOptions.voice}|${this.ttsOptions.speed}|${this.ttsOptions.pitch}|${this.ttsOptions.volume}|${this.ttsOptions.format}|v2`
    return createStableHash(payload)
  },

  buildDataUri(base64, format) {
    const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', pcm: 'audio/L16' }
    const fmt = String(format || 'mp3').toLowerCase()
    const mime = mimeMap[fmt] || 'audio/mpeg'
    return `data:${mime};base64,${base64}`
  },

  // ========== 缓存 ==========

  loadCacheIndex() {
    const cached = uni.getStorageSync(CACHE_INDEX_KEY)
    if (!cached || typeof cached !== 'object') return {}
    return cached
  },

  persistCacheIndex() {
    uni.setStorageSync(CACHE_INDEX_KEY, this.localCacheIndex)
  },

  getCachedAudio(hash) {
    this.init()
    const meta = this.localCacheIndex[hash]
    if (meta && meta.url) return meta.url
    if (isMiniProgram()) return ''
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
        key: storageKey, format, size: base64.length,
        updatedAt: Date.now(), lastAccessAt: Date.now()
      }
      this.trimCacheByLru()
      this.persistCacheIndex()
    } catch (e) {}
  },

  saveCachedAudioUrl(hash, url, format) {
    if (!url) return
    this.localCacheIndex[hash] = {
      key: '', url, format, size: String(url).length,
      updatedAt: Date.now(), lastAccessAt: Date.now()
    }
    this.trimCacheByLru()
    this.persistCacheIndex()
  },

  trimCacheByLru() {
    const entries = Object.keys(this.localCacheIndex).map((h) => ({
      hash: h, meta: this.localCacheIndex[h]
    }))
    if (entries.length <= MAX_LOCAL_CACHE_ITEMS) return
    entries.sort((a, b) => (a.meta.lastAccessAt || 0) - (b.meta.lastAccessAt || 0))
    const removeCount = entries.length - MAX_LOCAL_CACHE_ITEMS
    for (let i = 0; i < removeCount; i++) {
      const cur = entries[i]
      if (!cur) continue
      uni.removeStorageSync(`${CACHE_AUDIO_PREFIX}${cur.hash}`)
      delete this.localCacheIndex[cur.hash]
    }
  },

  // ========== TTS 合成 ==========

  async ensureUnitAudio(unit) {
    this.init()
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
    if (isMiniProgram()) {
      throw new Error('语音播放暂时不可用，请稍后重试')
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
        data: { text: unit.text, ...this.ttsOptions }
      })
      const result = (res && res.result) || {}
      const status = result && result.data && result.data.status
      if (result.code !== 0 || status !== 'pending') return result
      const retryAfter = Number(result.data.retryAfter || TTS_PENDING_RETRY_DELAY)
      await sleep(Math.max(200, retryAfter))
    }
    return { code: -1, msg: '语音生成排队中，请稍后重试' }
  },

  // ========== 播放源解析（小程序下载） ==========

  resolvePlaySrc(unit, audioSrc) {
    if (!isMiniProgram()) return Promise.resolve(audioSrc)
    const url = String(audioSrc || '')
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return Promise.resolve(audioSrc)
    }
    const hash = unit && unit.hash
    if (!hash) return Promise.resolve(audioSrc)
    if (this.downloadTempPathCache[hash]) {
      return Promise.resolve(this.downloadTempPathCache[hash])
    }
    return new Promise((resolve) => {
      uni.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            this.downloadTempPathCache[hash] = res.tempFilePath
            resolve(res.tempFilePath)
          } else {
            resolve(url)
          }
        },
        fail: () => { resolve(url) }
      })
    })
  },

  // ========== 预合成 ==========

  preloadAll(units) {
    this.init()
    return Promise.allSettled(
      units.map(u => this.ensureUnitAudio(u))
    )
  }
}

export default ttsService
export { createStableHash, isMiniProgram }
