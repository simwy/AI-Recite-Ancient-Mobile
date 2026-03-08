# TTS 合成服务抽离 + 预合成设计

## 背景

当前 TTS 合成、缓存逻辑全部耦合在 `pages/ancient/read.vue` 中（约 150 行）。未来 `result.vue` 等页面也需要相同的 TTS 能力，且希望在用户进入文章详情页时就提前合成语音，减少后续页面的等待时间。

## 设计目标

1. 将 TTS 合成+缓存逻辑抽离为共享模块 `common/ttsService.js`
2. 在 `detail.vue` 进入时自动触发后台静默预合成
3. `read.vue` 及未来页面通过 `ttsService` 复用合成/缓存能力
4. 播放控制仍留在各页面内（不抽离）

## 方案

### 新建 `common/ttsService.js`

单例模块，导出一个对象。核心职责：

| 方法 | 说明 |
|------|------|
| `init()` | 加载 localStorage 缓存索引 |
| `ensureUnitAudio(unit)` | 检查缓存 → 缺失则调云函数合成 → 返回音频地址 |
| `requestTtsResult(unit)` | 调用 `gw_tts-synthesize`，含 pending 重试（最多 6 次，间隔 800ms） |
| `resolvePlaySrc(unit, audioSrc)` | 小程序先下载到临时路径再播放 |
| `getCachedAudio(hash)` | 从 localStorage 或内存索引读缓存 |
| `saveCachedAudio(hash, base64, format)` | Base64 写入 localStorage |
| `saveCachedAudioUrl(hash, url, format)` | URL 写入内存索引 |
| `buildUnitHash(text)` | 生成缓存 key（含 ttsOptions） |
| `preloadAll(units)` | **新增** — `Promise.allSettled` 并发预合成所有句子 |

状态（`localCacheIndex`、`downloadTempPathCache`、`ttsOptions`）在单例中维护，跨页面共享。

### `detail.vue` 变更

文章内容加载完成后：
1. 调用 `buildPlayUnits(content)` 拆分句子（复用 `common/playUnits.js`）
2. 为每个 unit 生成 hash
3. 调用 `ttsService.preloadAll(units)` 静默预合成
4. 不阻塞页面，不显示进度

### `read.vue` 变更

- 删除迁出的 TTS 合成/缓存方法
- `ensureUnitAudio` → `ttsService.ensureUnitAudio`
- `resolvePlaySrc` → `ttsService.resolvePlaySrc`
- 播放控制（`playUnit`、`audioContext`、`preloadNextUnits`）保留不动
- 调试面板中的 `lastTtsResultType` 等状态保留在页面（通过回调或返回值获取）

### 未来页面

直接 `import ttsService from '@/common/ttsService.js'` 即可。

## 变更文件清单

| 文件 | 操作 |
|------|------|
| `common/ttsService.js` | 新建 |
| `pages/ancient/read.vue` | 修改：删除迁出方法，改为调用 ttsService |
| `pages/ancient/detail.vue` | 修改：加载完内容后调预合成 |

## 预合成策略

- 并发合成所有句子（`Promise.allSettled`），各句独立不互相阻塞
- 已有缓存的句子立即返回，不重复请求
- 云函数侧有分布式锁保护，不会重复合成同一句
