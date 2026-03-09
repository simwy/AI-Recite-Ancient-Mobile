# ASR 切换阿里云 ISI NLS + 重构设计

## 背景

recite.vue 和 follow.vue 中存在大量重复的 ASR 代码（DashScope Paraformer + 讯飞），H5 需要 relay 中转。
目标：切换到阿里云 ISI NLS 实时语音识别，提取公共模块，H5 也直连。

## 架构

```
页面层 (recite.vue / follow.vue)
  ├── 录音控制 (uni.getRecorderManager)
  ├── UI 状态管理
  └── 调用 NlsAsrClient
        │
        ▼
utils/asr-nls.js (NlsAsrClient)
  ├── WebSocket 连接管理
  ├── NLS 协议封装
  ├── 音频帧发送
  └── 消息解析与回调分发
        │
        ▼ wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1
阿里云 ISI NLS 实时语音识别服务

云函数 gw_asr-config
  └── 调用 ISI CreateToken API → 返回 token + appkey + ws_url
```

## NlsAsrClient 类设计

```js
class NlsAsrClient {
  constructor(options) {
    // options: url, appkey, params, onStarted, onResultChanged,
    //          onSentenceEnd, onCompleted, onError, onClose
  }
  start()                  // 连接 → StartTranscription, 返回 Promise
  stop()                   // StopTranscription → 等待完成, 返回 Promise
  destroy()                // 强制关闭
  sendAudio(arrayBuffer)   // 发送 PCM 二进制帧
  get state()              // idle|connecting|connected|transcribing|stopping|closed
}
```

默认参数：format=PCM, sample_rate=16000, enable_intermediate_result=true,
enable_punctuation_prediction=true, enable_inverse_text_normalization=true,
max_sentence_silence=800

## NLS WebSocket 协议

消息格式：`{ header: { appkey, message_id, task_id, namespace, name }, payload: {} }`
- namespace 固定为 `SpeechTranscriber`
- message_id/task_id 为 32 位 hex 字符串
- 音频数据以 WebSocket binary frame 发送，每帧最大 3200 字节

事件流：connect → StartTranscription → TranscriptionStarted → 发送音频 →
TranscriptionResultChanged(中间) / SentenceEnd(最终) → StopTranscription →
TranscriptionCompleted → 关闭

## 云函数改造 (gw_asr-config)

- 移除 DashScope token 和讯飞签名逻辑
- 新增 ISI CreateToken 调用 (HMAC-SHA1 签名)
- 端点: `http://nls-meta.cn-shanghai.aliyuncs.com/?Action=CreateToken&Version=2019-02-28&...`
- 返回: `{ token, appkey, ws_url, expire_time }`
- Token 缓存，过期前 30 秒刷新

配置新增 (common/config):
```js
nls: { accessKeyId, accessKeySecret, appkey,
       ws_url: 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1' }
```

## 文件变更

| 操作 | 文件 |
|------|------|
| 新建 | `utils/asr-nls.js` |
| 改造 | `pages/ancient/recite.vue` |
| 改造 | `pages/ancient/follow.vue` |
| 改造 | `uniCloud-alipay/cloudfunctions/gw_asr-config/index.js` |
| 改造 | `uniCloud-alipay/cloudfunctions/common/config/index.js` |
| 删除 | `tools/asr-relay/` |
| 删除 | `uniCloud-alipay/cloudfunctions/gw_asr-file-recognize/` |

## 决策记录

- 封装方式：工具类模块（非 Mixin/Composable），与 Vue 无耦合
- H5 直连 NLS（不再需要 relay 中转）
- 移除讯飞 ASR（不保留备选）
- 不内置录音逻辑，录音由页面控制
- 回调式 API（非事件模式）
- start()/stop() 返回 Promise
- 不做自动重连（短时会话场景）
