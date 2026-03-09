# 云函数公共配置

敏感信息通过**环境变量**或本地 **config.local.js**（不提交）提供。

## 配置方式

### 线上（uniCloud）

在 [uniCloud 控制台](https://unicloud.dcloud.net.cn) → 云函数 → 对应函数 → 环境变量，添加：

| 变量名 | 说明 |
|--------|------|
| `NLS_ACCESS_KEY_ID` | 阿里云 NLS AccessKey ID |
| `NLS_ACCESS_KEY_SECRET` | 阿里云 NLS AccessKey Secret |
| `NLS_APPKEY` | 阿里云 NLS 应用 key |
| `IFLYTEK_TTS_APP_ID` | 讯飞 TTS AppID |
| `IFLYTEK_TTS_API_KEY` | 讯飞 TTS API Key |
| `IFLYTEK_TTS_API_SECRET` | 讯飞 TTS API Secret |
| `IFLYTEK_TTS_ENDPOINT` | 讯飞 TTS WebSocket 地址 |
| `BAILIAN_API_KEY` | 百炼/通义 API Key |

### 本地开发

复制 `config.example.js` 为 `config.local.js`，填入真实键值。`config.local.js` 已加入 .gitignore，不会提交。
