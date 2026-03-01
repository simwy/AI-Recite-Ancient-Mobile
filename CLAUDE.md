# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered ancient Chinese poetry/prose recitation learning app. Users search for classical texts, recite them aloud via speech recognition, and get accuracy scores with character-level diff analysis (including homophone matching via pinyin).

Built on **uni-app (Vue 3)** targeting Android, iOS, WeChat Mini Program, H5, and Alipay Mini Program. Uses **HBuilderX** as the primary build tool — there are no npm build scripts; all compilation and dev serving is done through HBuilderX.

## Development

- **Package manager:** npm (`npm install` for dependencies)
- **Build/Run:** Open project in HBuilderX, use its built-in run/build commands for each platform
- **ASR relay for H5 dev:** `cd tools/asr-relay && npm start` (WebSocket proxy on port 8787, requires `DASHSCOPE_API_KEY` env var)
- **Cloud functions:** Deployed via HBuilderX to uniCloud (Alipay space). Right-click cloud function folder → Upload
- **No test framework or linter configured**

## Architecture

### Page Flow
`pages/ancient/list` (search/browse) → `pages/ancient/detail` (text detail) → `pages/ancient/recite` (speech recognition) → `pages/ancient/result` (accuracy analysis)

Additional modes: `pages/ancient/dictation` (dictation practice), `pages/ancient/read` (reading mode), `pages/ancient/history` (recitation history).

Tabbar has 4 tabs: 古文 (list), 广场 (square), 复盘 (review), 我的 (ucenter).

Auth is handled by `uni_modules/uni-id-pages` (lazy-loaded sub-package).

### State Passing
No Vuex/Pinia. Data flows via `getApp().globalData`:
- `currentText` — selected ancient text object, set before navigating to recite page
- `reciteResult` — diff results, set before navigating to result page
- `searchText` — current search query shared between pages
- `config` — app metadata from `uni-starter.config.js`, mounted by `common/appInit.js`

### App Initialization
`common/appInit.js` runs on launch: mounts config to globalData, sets up uniCloud interceptors, handles invitation codes from clipboard (APP), monitors network status (APP), checks app version.

### Backend (uniCloud Alipay)
Cloud functions in `uniCloud-alipay/cloudfunctions/` (all prefixed `gw_`):
- **gw_ancient-search** — text search, AI search (Aliyun Bailian qwen-plus), square/category browsing, favorites
- **gw_asr-config** — returns WebSocket URL + temp token for real-time ASR (supports Aliyun Paraformer and iFlytek)
- **gw_recite-record** — persists recitation history (save/list/detail/delete)
- **gw_tts-synthesize** — text-to-speech via iFlytek WebSocket
- **gw_dictation-print-pdf** — PDF generation for dictation practice
- **gw_sentence-snapshot** — sentence-level snapshots

**Cloud function pattern:** All use action-based routing:
```javascript
exports.main = async (event, context) => {
  const { action, data = {} } = event
  switch(action) { case 'actionName': ... }
}
```
Called via `uniCloud.callFunction({ name, data: { action, ...params } })`.

**Auth pattern:** Cloud functions check `context.auth.uid` first (platform-injected), fall back to `event.uniIdToken` (client-provided).

### Database Collections
- `gw-ancient-texts` — main texts (title, author, dynasty, content, source, created_by)
- `gw-recite-records` — user recitation history
- `gw-square-categories` / `gw-square-subcollections` / `gw-square-text-relations` — content organization
- `gw-square-sub-favorites` — user favorite subcollections

### Core Algorithm (`common/diff.js`)
LCS-based character comparison that:
- Strips punctuation before comparing, maps results back to original text
- Detects homophones using `pinyin-pro` (with pinyin caching for performance)
- Returns per-character match status (correct / wrong / missing / extra) and overall accuracy
- Exports `diffChars()` and `calcAccuracy()`

### Platform Conditional Compilation
Uses uni-app's `// #ifdef PLATFORM` / `// #endif` directives throughout:
- `APP` / `APP-PLUS` — native features (recorder, clipboard invite, version check)
- `H5` — web features (download bar via `common/openApp.js`, relay server for ASR)
- `MP-WEIXIN` — WeChat Mini Program specifics
- `VUE3` / `#ifndef VUE3` — Vue version splits in main.js and App.vue

### Key Config Files
- `pages.json` — routes, tabbar, global styles, login-required pages (design width 375px)
- `manifest.json` — app ID (`__UNI__1397D60`), platform permissions, WeChat appid `wx8f0a012573bc8bac`
- `uni-starter.config.js` — app metadata, i18n toggle (disabled), download links

## Conventions

- Language: Chinese UI, Chinese comments in code
- Styling: rpx units (750rpx = screen width), global variables in `uni.scss`
- i18n: Framework exists in `lang/` but currently disabled in config
- Components: Heavy use of `uni_modules/` ecosystem components (65+ modules)
- API keys: Stored in `uniCloud-alipay/cloudfunctions/common/config/index.js` (Aliyun DashScope, iFlytek, Bailian)
