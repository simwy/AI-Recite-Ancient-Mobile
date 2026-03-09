# Implementation Plan: ASR NLS Refactor

Based on design: `docs/plans/2025-07-24-asr-nls-refactor-design.md`

## Step 1: Create `utils/asr-nls.js` — NlsAsrClient class

Create the core ASR module that encapsulates the Aliyun ISI NLS WebSocket protocol.

**File:** `utils/asr-nls.js` (new)

**Class: NlsAsrClient**
- Constructor accepts: `{ url, appkey, params, onStarted, onResultChanged, onSentenceEnd, onCompleted, onError, onClose }`
- Internal state machine: `idle → connecting → connected → transcribing → stopping → closed`
- `start()`: opens WebSocket via `uni.connectSocket()`, on open sends `StartTranscription` JSON directive, returns Promise that resolves on `TranscriptionStarted` event
- `stop()`: sends `StopTranscription` directive, returns Promise that resolves on `TranscriptionCompleted` event (with 5s timeout)
- `destroy()`: force-closes WebSocket, cleans up
- `sendAudio(arrayBuffer)`: if state is `transcribing`, sends binary frame directly; if `connected` (waiting for TranscriptionStarted), queues frames
- Internal `_handleMessage(data)`: parses JSON, dispatches by `header.name`:
  - `TranscriptionStarted` → flush queue, set state=transcribing, call onStarted
  - `TranscriptionResultChanged` → call onResultChanged(payload.result, payload)
  - `SentenceEnd` → call onSentenceEnd(payload.result, payload)
  - `TranscriptionCompleted` → call onCompleted, resolve stop promise
  - `TaskFailed` → call onError

**NLS Protocol details:**
- namespace: `SpeechTranscriber`
- message_id: random 32-char hex
- task_id: random 32-char hex (generated once per session)
- StartTranscription payload: `{ format, sample_rate, enable_intermediate_result, enable_punctuation_prediction, enable_inverse_text_normalization, max_sentence_silence }`
- Audio: raw binary frames via WebSocket send
- StopTranscription: same header format, no payload needed

## Step 2: Update `common/config/index.js`

**File:** `uniCloud-alipay/cloudfunctions/common/config/index.js`

Changes:
- Remove `aliyunParaformer` config block
- Remove `iflytekAsr` config block
- Add `nls` config block:
  ```js
  nls: {
    accessKeyId: 'YOUR_ACCESS_KEY_ID',
    accessKeySecret: 'YOUR_ACCESS_KEY_SECRET',
    appkey: 'YOUR_NLS_APPKEY',
    wsUrl: 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1',
    tokenExpireSeconds: 600
  }
  ```
- Keep `iflytekTts`, `bailianPoemSearch`, `bailianVision` unchanged

## Step 3: Rewrite `gw_asr-config/index.js`

**File:** `uniCloud-alipay/cloudfunctions/gw_asr-config/index.js`

Complete rewrite:
- Remove all DashScope token logic
- Remove all iFlytek config builders
- Implement ISI CreateToken via Aliyun OpenAPI:
  - Endpoint: `http://nls-meta.cn-shanghai.aliyuncs.com/`
  - Action: CreateToken, Version: 2019-02-28
  - SignatureMethod: HMAC-SHA1, SignatureVersion: 1.0
  - Build canonical query string, sign with AccessKeySecret
- Cache token in module-level variable, refresh when within 30s of expiry
- Return: `{ code: 0, data: { token, appkey, wsUrl, expireTime } }`

## Step 4: Refactor `pages/ancient/recite.vue`

**File:** `pages/ancient/recite.vue`

Remove (~300 lines):
- `openSocket()`, `sendRunTask()`, `sendAudioFrame()`, `flushFrameQueue()`
- `handleSocketMessage()`, `decodeSocketData()`, `handleRecognizedSentence()`
- `finishTask()`, `closeSocket()`, `createTaskId()`, `buildDefaultRelayWsUrl()`
- `startWebRecorder()`, `stopWebRecorder()`, `convertFloat32To16kPcm()`
- `startH5PcmRecorder()`, `stopH5PcmRecorder()`, `cleanupH5PcmRecorder()`, `blobToBase64()`
- H5 file-recognize fallback (MediaRecorder + gw_asr-file-recognize)
- All H5 relay WebSocket logic

Replace with:
- `import NlsAsrClient from '@/utils/asr-nls.js'`
- Simplify `loadAsrConfig()` to match new cloud function response
- New `startAsr()`: create NlsAsrClient instance, call start(), set callbacks
- New `stopAsr()`: call asrClient.stop()
- Callbacks wire to existing `finalSentences`/`partialSentence`/`realtimeText`
- `onUnload`: call `asrClient.destroy()`

Keep unchanged:
- Template/UI, recording permission, recorder init, silence detection
- Hint system, pause/resume logic, goResult navigation
- `initRecorder()` still uses `uni.getRecorderManager()` for APP/小程序
- H5 still uses Web Audio API for PCM capture, but now streams to NLS directly (no relay)

Data changes:
- Remove: `socketTask`, `taskId`, `taskStarted`, `taskFinished`, `frameQueue`, `waitTaskFinishedResolver`, `h5MediaRecorder`, `h5AudioChunks`, `h5StopPromiseResolver`
- Add: `asrClient` (NlsAsrClient instance)

## Step 5: Refactor `pages/ancient/follow.vue`

**File:** `pages/ancient/follow.vue`

Same pattern as recite.vue. Remove duplicated ASR code, use NlsAsrClient.

Remove:
- Same WebSocket/ASR methods as recite.vue
- H5 file-recognize fallback (MediaRecorder + gw_asr-file-recognize + blobToBase64)
- All relay logic

Replace with:
- `import NlsAsrClient from '@/utils/asr-nls.js'`
- `startFollowRecording()`: create NlsAsrClient, start(), begin recording
- `stopFollowRecording()`: stop recorder, call asrClient.stop()
- H5: use Web Audio API → PCM → NlsAsrClient.sendAudio() (same as APP)

Keep unchanged:
- TTS playback, follow state machine, diff/accuracy, save record
- readBaseMixin usage, UI template

## Step 6: Delete obsolete files

- Delete `tools/asr-relay/` directory
- Delete `uniCloud-alipay/cloudfunctions/gw_asr-file-recognize/` directory

## Step 7: Verify and test

- Check all imports resolve
- Verify no remaining references to DashScope, iFlytek ASR, relay, file-recognize
- Ensure H5/APP/小程序 conditional compilation is correct

## Execution Order

Steps 1-3 can be done first (no dependencies on page changes).
Steps 4-5 depend on Step 1.
Step 6 can be done after Steps 4-5.
Step 7 is final verification.

## Risk Notes

- NLS WebSocket URL needs to be added to 微信小程序 socket合法域名
- Token acquisition uses HTTP (not HTTPS) for nls-meta endpoint — verify uniCloud httpclient supports this
- H5 direct WebSocket to NLS requires HTTPS context (same as current)
- User needs to provide actual AccessKeyId/Secret/Appkey before testing
