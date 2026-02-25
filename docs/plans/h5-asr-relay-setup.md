# H5 ASR Relay Setup

## 1) Configure relay URL for client

Edit `uniCloud-aliyun/common/config.js`:

- Set `aliyunParaformer.relayWsUrl` to your relay endpoint.
- Example: `wss://your-domain.com/asr-relay`

## 2) Start relay service

```bash
cd tools/asr-relay
npm install
DASHSCOPE_API_KEY=your_key_here npm start
```

Optional env:

- `PORT` default `8787`
- `DASHSCOPE_WS_URL` default `wss://dashscope.aliyuncs.com/api-ws/v1/inference`
- `TOKEN_EXPIRE_SECONDS` default `600`

## 3) Reverse proxy (recommended)

Expose relay with HTTPS/WSS and forward `/asr-relay` to relay process.

## 4) Verify

- Open H5 page `pages/ancient/recite`
- Click `开始背诵`
- Confirm live text appears and no browser direct DashScope websocket error
