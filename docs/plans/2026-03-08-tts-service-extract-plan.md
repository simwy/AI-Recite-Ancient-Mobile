# TTS 合成服务抽离 + 预合成 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 TTS 合成+缓存逻辑从 `read.vue` 抽离为共享模块 `common/ttsService.js`，并在 `detail.vue` 进入时自动预合成所有句子。

**Architecture:** 新建单例模块 `common/ttsService.js`，承载 TTS 合成请求、本地缓存（localStorage LRU）、小程序下载临时路径等逻辑。`read.vue` 改为调用 ttsService，`detail.vue` 在加载完文章内容后调用 `ttsService.preloadAll()` 并发预合成。播放控制（audioContext、playUnit）仍留在各页面。

**Tech Stack:** uni-app (Vue 2 options API)、uniCloud.callFunction、uni.getStorageSync/setStorageSync

---

### Task 1: 创建 `common/ttsService.js` 模块

**Files:**
- Create: `common/ttsService.js`

**Step 1: 创建 ttsService.js，迁移常量和工具函数**

从 `read.vue` 迁移以下内容到 `common/ttsService.js`：

```javascript
// common/ttsService.js
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
    const mimeMap = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pcm: 'audio/L16'
    }
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
    const meta = this.localCacheIndex[hash]
    if (meta && meta.url) {
      return meta.url
    }
    if (isMiniProgram()) {
      return ''
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
      await sleep(Math.max(200, retryAfter))
    }
    return {
      code: -1,
      msg: '语音生成排队中，请稍后重试'
    }
  },

  // ========== 播放源解析（小程序下载） ==========

  resolvePlaySrc(unit, audioSrc) {
    if (!isMiniProgram()) {
      return Promise.resolve(audioSrc)
    }
    const url = String(audioSrc || '')
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return Promise.resolve(audioSrc)
    }
    const hash = unit && unit.hash
    if (!hash) {
      return Promise.resolve(audioSrc)
    }
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
        fail: () => {
          resolve(url)
        }
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
```

**要点说明：**
- `ensureUnitAudio` 不再设置 `lastTtsResultType`（调试状态），这些留在 `read.vue` 页面中通过返回值判断
- `resolvePlaySrc` 简化为纯逻辑，不再设置 `lastPlaySrcType` 等调试字段
- 导出 `createStableHash` 和 `isMiniProgram`，因为 `read.vue` 中 `createSha1Hash`/调试面板等仍需使用

**Step 2: 提交**

```bash
git add common/ttsService.js
git commit -m "feat: 抽离 TTS 合成+缓存服务为 common/ttsService.js"
```

---

### Task 2: 修改 `read.vue` 使用 ttsService

**Files:**
- Modify: `pages/ancient/read.vue`

**Step 1: 添加 import，删除迁出的 data 字段和方法**

在 `<script>` 顶部添加：
```javascript
import ttsService from '@/common/ttsService.js'
import { createStableHash as _createStableHash, isMiniProgram } from '@/common/ttsService.js'
```

从 `data()` 中删除：
- `localCacheIndex: {}`（改用 ttsService 内部状态）
- `ttsOptions: { ... }`（改用 ttsService.ttsOptions）
- `downloadTempPathCache: {}`（改用 ttsService 内部状态）

保留这些调试用字段不动：`lastTtsResultType`、`lastPlaySrcType`、`lastPlaySrcPreview`、`lastAudioError`、`lastDownloadTest`

从 `methods` 中删除以下方法（已迁入 ttsService）：
- `loadCacheIndex()`
- `persistCacheIndex()`
- `getCachedAudio(hash)`
- `touchCacheEntry(hash)`
- `saveCachedAudio(hash, base64, format)`
- `saveCachedAudioUrl(hash, url, format)`
- `trimCacheByLru()`
- `buildDataUri(base64, format)`
- `requestTtsResult(unit)`
- `sleep(ms)`

从 `onLoad` 中删除：
```javascript
this.localCacheIndex = this.loadCacheIndex()
```

从顶部删除已迁移的常量：
- `CACHE_INDEX_KEY`
- `CACHE_AUDIO_PREFIX`
- `MAX_LOCAL_CACHE_ITEMS`
- `TTS_PENDING_RETRY_MAX`
- `TTS_PENDING_RETRY_DELAY`

保留 `isMiniProgram()` 函数定义（调试面板 debugEnv 用到），或者改用从 ttsService 导入的版本。

**Step 2: 修改 `ensureUnitAudio` 改为调用 ttsService 并保留调试状态**

```javascript
async ensureUnitAudio(unit) {
  const cached = ttsService.getCachedAudio(unit.hash)
  if (cached) {
    ttsService.touchCacheEntry(unit.hash)
    return cached
  }
  const audioSrc = await ttsService.ensureUnitAudio(unit)
  // 更新调试状态
  if (String(audioSrc || '').startsWith('data:')) {
    this.lastTtsResultType = 'audioBase64'
  } else {
    this.lastTtsResultType = 'audioUrl'
  }
  return audioSrc
},
```

**Step 3: 修改 `resolvePlaySrc` 改为调用 ttsService 并保留调试状态**

```javascript
async resolvePlaySrc(unit, audioSrc) {
  const playSrc = await ttsService.resolvePlaySrc(unit, audioSrc)
  // 更新调试状态
  if (!isMiniProgram()) {
    this.lastPlaySrcType = audioSrc && String(audioSrc).startsWith('data:') ? 'dataUri' : 'networkUrl'
  } else if (playSrc !== audioSrc) {
    this.lastPlaySrcType = 'tempPath'
  } else {
    this.lastPlaySrcType = 'networkUrl'
  }
  this.lastPlaySrcPreview = this.previewSrc(playSrc)
  return playSrc
},
```

**Step 4: 修改 `preloadNextUnits` 改为调用 ttsService**

```javascript
preloadNextUnits(startIndex, limit) {
  const end = Math.min(this.playUnits.length, startIndex + limit)
  for (let i = startIndex; i < end; i++) {
    const unit = this.playUnits[i]
    if (!unit) continue
    if (ttsService.getCachedAudio(unit.hash)) continue
    ttsService.ensureUnitAudio(unit).catch(() => {})
  }
},
```

**Step 5: 修改 `buildUnitHash` 改为调用 ttsService**

```javascript
buildUnitHash(text) {
  return ttsService.buildUnitHash(text)
},
```

**Step 6: 修改调试面板方法 `runTestCurrentUnit` 和 `runTestDownload`**

这些方法中调用 `this.ensureUnitAudio`（已改为包装方法），无需额外修改。

**Step 7: 提交**

```bash
git add pages/ancient/read.vue
git commit -m "refactor: read.vue 改为调用 ttsService 共享模块"
```

---

### Task 3: 修改 `detail.vue` 添加预合成

**Files:**
- Modify: `pages/ancient/detail.vue`

**Step 1: 添加 import**

在 `<script>` 顶部添加：
```javascript
import ttsService from '@/common/ttsService.js'
```

已有的 import 保留：
```javascript
import { buildPlayUnits } from '@/common/playUnits.js'
```

**Step 2: 在 `loadDetail` 成功后触发预合成**

修改 `loadDetail` 方法，在获取到文章数据后调用预合成：

```javascript
async loadDetail() {
  try {
    const res = await db.collection('gw-ancient-texts').doc(this.id).get()
    if (res.result.data && res.result.data.length > 0) {
      this.detail = res.result.data[0]
      this.preloadTts()
    }
  } catch (e) {
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
},
```

**Step 3: 添加 `preloadTts` 方法**

在 `methods` 中添加：

```javascript
preloadTts() {
  const content = (this.detail && this.detail.content) || ''
  if (!content) return
  const units = buildPlayUnits(content)
  const unitsWithHash = units.map(item => ({
    ...item,
    hash: ttsService.buildUnitHash(item.text)
  }))
  ttsService.preloadAll(unitsWithHash).catch(() => {})
},
```

注意：`preloadAll` 返回 `Promise.allSettled`，不会因为个别句子失败而中断。末尾 `.catch(() => {})` 防止 unhandled rejection。

**Step 4: 提交**

```bash
git add pages/ancient/detail.vue
git commit -m "feat: detail.vue 进入时自动预合成所有句子的 TTS 语音"
```

---

### Task 4: 手动验证

**无代码变更，仅验证步骤。**

在 HBuilderX 中运行项目，验证以下场景：

**场景 1：预合成生效**
1. 进入古文详情页（`detail.vue`），等待几秒
2. 点击「跟读」进入 `read.vue`
3. 点击句子应能快速播放（无需等待合成）

**场景 2：read.vue 正常播放**
1. 直接进入 `read.vue`（不经过 detail）
2. 点击句子仍能正常合成+播放
3. 跟读模式（autoStart=1）正常工作

**场景 3：调试面板**
1. 在 `read.vue` 点击「调试」按钮
2. `lastTtsResultType` 和 `lastPlaySrcType` 仍能正确显示
3. 「检测当前句」「测试下载」按钮仍能正常工作

**场景 4：缓存共享**
1. 在 detail 页预合成完成后
2. 进入 read.vue，句子应命中缓存（loadingUnitIndex 不会长时间显示）
