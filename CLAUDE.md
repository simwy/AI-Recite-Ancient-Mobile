# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered ancient Chinese poetry/prose recitation learning app. Users search for classical texts, recite them aloud via speech recognition, and get accuracy scores with character-level diff analysis (including homophone matching via pinyin).

Built on **uni-app (Vue 3)** targeting Android, iOS, WeChat Mini Program, H5, and Alipay Mini Program. Uses **HBuilderX** as the primary AI assistant and build tool — there are no npm build scripts; all compilation and dev serving is done through HBuilderX.

## Development

- **Package manager:** npm (`npm install` for dependencies)
- **Build/Run:** Open project in HBuilderX, use its built-in run/build commands for each platform
- **ASR relay for H5 dev:** `node tools/asr-relay/relay-server.js` (WebSocket proxy for browser speech recognition)
- **Cloud functions:** Deployed via HBuilderX to uniCloud (Alipay space). Right-click cloud function folder → Upload

## Architecture

### Page Flow
`pages/ancient/list` (search/browse) → `pages/ancient/recite` (speech recognition) → `pages/ancient/result` (accuracy analysis)

User center lives in `pages/ucenter/`. Auth is handled by `uni_modules/uni-id-pages` (sub-package).

### State Passing
No Vuex/Pinia. Data flows via `getApp().globalData`:
- `currentText` — selected ancient text object, set before navigating to recite page
- `reciteResult` — diff results, set before navigating to result page
- `searchText` — current search query shared between pages

### Backend (uniCloud Alipay)
Cloud functions in `uniCloud-alipay/cloudfunctions/`:
- **ancient-search** — text search + AI search via Aliyun Bailian (qwen-plus LLM)
- **asr-config** — returns Aliyun DashScope WebSocket URL and temp token for real-time ASR
- **asr-file-recognize** — file-based speech recognition (H5 fallback)
- **recite-record** — persists recitation history

All called via `uniCloud.callFunction({ name, data: { action, ...params } })`.

Database collection: `ancient-texts` (title, author, dynasty, content, source, created_by).

### Core Algorithm (`common/diff.js`)
LCS-based character comparison that:
- Strips punctuation before comparing
- Detects homophones using `pinyin-pro` library
- Returns per-character match status (correct / wrong / missing / extra) and overall accuracy

### Platform Conditional Compilation
Uses uni-app's `// #ifdef PLATFORM` / `// #endif` directives throughout. Key platform splits:
- Speech recognition: native recorder on APP, MediaRecorder + file upload on H5
- Navigation bar and UI adjustments per platform

### Key Config Files
- `pages.json` — routes, tabbar (2 tabs: 古文 / 我的), global styles, login-required pages
- `manifest.json` — app ID (`__UNI__1397D60`), platform permissions, SDK configs
- `uni-starter.config.js` — i18n toggle, about info, app download links

## Conventions

- Language: Chinese UI, Chinese comments in code
- Styling: rpx units (750rpx = screen width), global variables in `uni.scss`
- i18n: Framework exists in `lang/` but currently disabled in config
- Components: Heavy use of `uni_modules/` ecosystem components (65+ modules)
