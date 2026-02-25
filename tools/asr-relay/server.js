const http = require('http')
const https = require('https')
const WebSocket = require('ws')

const LISTEN_PORT = Number(process.env.PORT || 8787)
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''
const DASHSCOPE_WS_URL = process.env.DASHSCOPE_WS_URL || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const TOKEN_EXPIRE_SECONDS = Math.max(1, Math.min(1800, Number(process.env.TOKEN_EXPIRE_SECONDS || 600)))

if (!DASHSCOPE_API_KEY) {
  throw new Error('Missing DASHSCOPE_API_KEY env')
}

let cachedToken = ''
let cachedTokenExpiresAt = 0

function json(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function requestTemporaryToken() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://dashscope.aliyuncs.com/api/v1/tokens?expire_in_seconds=${TOKEN_EXPIRE_SECONDS}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`
        }
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            if (res.statusCode !== 200 || !data.token || !String(data.token).startsWith('st-')) {
              reject(new Error(data.message || 'Failed to obtain temporary token'))
              return
            }
            cachedToken = data.token
            cachedTokenExpiresAt = Number(data.expires_at || Math.floor(Date.now() / 1000) + TOKEN_EXPIRE_SECONDS)
            resolve(cachedToken)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function getTemporaryToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedTokenExpiresAt - now > 30) {
    return cachedToken
  }
  return requestTemporaryToken()
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    json(res, 200, { ok: true })
    return
  }
  json(res, 404, { ok: false, message: 'not found' })
})

const wss = new WebSocket.Server({ server, path: '/asr-relay' })

wss.on('connection', async (clientSocket) => {
  let remoteSocket
  try {
    const token = await getTemporaryToken()
    remoteSocket = new WebSocket(DASHSCOPE_WS_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
  } catch (error) {
    clientSocket.close(1011, 'token_failed')
    return
  }

  remoteSocket.on('open', () => {
    // no-op
  })

  remoteSocket.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary })
    }
  })

  remoteSocket.on('close', (code, reason) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close(code || 1000, reason ? reason.toString() : '')
    }
  })

  remoteSocket.on('error', () => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close(1011, 'remote_error')
    }
  })

  clientSocket.on('message', (data, isBinary) => {
    if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
      remoteSocket.send(data, { binary: isBinary })
    }
  })

  clientSocket.on('close', () => {
    if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
      remoteSocket.close(1000, 'client_closed')
    }
  })

  clientSocket.on('error', () => {
    if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
      remoteSocket.close(1011, 'client_error')
    }
  })
})

server.listen(LISTEN_PORT, () => {
  console.log(`[asr-relay] listening on :${LISTEN_PORT}`)
})
