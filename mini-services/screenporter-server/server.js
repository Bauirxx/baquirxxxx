// ScreenPorter relay server (porta 8820)
// --------------------------------------------------------------------------
// A app Android aponta para este servidor (ex.: 100.88.155.59:8820). Ele:
//  1) faz PROXY de todo o HTTP para o painel Next.js em 127.0.0.1:3000
//     (login /api/auth/login, monitorizacao /api/agent/ingest, etc.)
//  2) trata dos WebSockets de espelhamento:
//       raiz  ws://host:8820/            <- a app (header X-Agent-Token): hello +
//                                           frames H.264 binarios (12 bytes + Annex-B)
//       /ws/devices/:deviceId            <- o browser/painel: ve o video + controla
//
// O VIDEO e re-embrulhado no formato comprovado do navegador (cabecalho de 12
// bytes [high:4][low:4][size:4]) e guardamos config + ultimo GOP para quem abre
// a meio ver logo. O CONTROLO do browser (formato scrcpy) e traduzido para o
// comando que a app Companion entende ({command:...}).
'use strict'

const http = require('http')
const { WebSocketServer } = require('ws')
const { PrismaClient } = require('@prisma/client')

const PORT = Number(process.env.PORT || 8820)
const NEXT = { host: '127.0.0.1', port: Number(process.env.NEXT_PORT || 3000) }
const MAX_GOP_BYTES = 4 * 1024 * 1024

const db = new PrismaClient()

// userId -> { companion, browsers:Set, meta, lastConfig:Buffer|null, gop:Buffer[], gopBytes }
const hub = new Map()
function entryFor(userId) {
  let e = hub.get(userId)
  if (!e) {
    e = { companion: null, browsers: new Set(), meta: null, lastConfig: null, gop: [], gopBytes: 0, lastAudioMeta: null }
    hub.set(userId, e)
  }
  return e
}

async function userIdFromToken(token) {
  if (!token) return null
  try {
    const dev = await db.device.findFirst({ where: { agentToken: token } })
    if (dev) return dev.userId
    const s = await db.session.findUnique({ where: { token } })
    if (s && s.expiresAt > new Date()) return s.userId
  } catch (e) {
    console.error('userIdFromToken:', e.message)
  }
  return null
}

async function userIdFromDeviceId(deviceId) {
  if (!deviceId) return null
  try {
    const dev = await db.device.findUnique({ where: { id: deviceId } })
    return dev ? dev.userId : null
  } catch {
    return null
  }
}

// Monta o cabecalho de 12 bytes do protocolo de video (igual ao do scrcpy/web).
function enquadrar(config, keyFrame, payload) {
  const header = Buffer.alloc(12)
  let high = 0
  if (config) high |= 0x40000000
  if (keyFrame) high |= 0x20000000
  const pts = config ? 0 : Date.now() * 1000
  const ptsHigh = config ? 0 : Math.floor(pts / 2 ** 32) & 0x1fffffff
  const ptsLow = config ? 0 : pts >>> 0
  header.writeUInt32BE((high | ptsHigh) >>> 0, 0)
  header.writeUInt32BE(ptsLow >>> 0, 4)
  header.writeUInt32BE(payload.length, 8)
  return Buffer.concat([header, payload])
}

// Monta o cabecalho de 12 bytes de um pacote de AUDIO para o browser. Usa o bit
// 0x80000000 (que o video nunca liga) como marcador, para o navegador distinguir
// audio de video sem quebrar o formato de video existente. payload = PCM16LE.
function enquadrarAudio(payload) {
  const header = Buffer.alloc(12)
  header.writeUInt32BE(0x80000000, 0) // marcador de audio
  header.writeUInt32BE(0, 4)
  header.writeUInt32BE(payload.length, 8)
  return Buffer.concat([header, payload])
}

// Traduz um comando de controlo do browser (formato scrcpy) para o comando que
// a app Companion entende (ControlAccessibilityService: {command, x:0..1, y:0..1}).
function traduzirControlo(msg) {
  if (!msg || typeof msg !== 'object') return null
  switch (msg.t) {
    case 'touch':
      // A app so faz tap: usamos o 'down' (toque imediato); move/up ignorados.
      if (msg.action === 'down' && msg.w && msg.h) {
        return { command: 'touch', x: msg.x / msg.w, y: msg.y / msg.h }
      }
      return null
    case 'back':
      return { command: 'back' }
    case 'home':
      return { command: 'home' }
    case 'recents':
      return { command: 'recents' }
    case 'power':
      return { command: 'power' }
    case 'audio':
      // Escuta remota: liga/desliga a captura de audio na app. source =
      // 'playback' (som das apps) | 'mic' (microfone/ambiente).
      if (msg.action === 'start') {
        return { command: 'audio_start', source: msg.source === 'mic' ? 'mic' : 'playback' }
      }
      if (msg.action === 'stop') {
        return { command: 'audio_stop' }
      }
      return null
    default:
      return null
  }
}

// ---- HTTP: proxy transparente para o Next.js (+ canal interno de controlo) ----
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__relay/control') {
    handleInternalControl(req, res)
    return
  }
  if (req.method === 'GET' && req.url === '/__relay/status') {
    const online = []
    for (const [userId, e] of hub) {
      if (e.companion && e.companion.readyState === 1) {
        online.push({
          userId,
          model: e.meta ? e.meta.model : null,
          width: e.meta ? e.meta.width : null,
          height: e.meta ? e.meta.height : null,
        })
      }
    }
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ online }))
    return
  }
  const opts = {
    host: NEXT.host,
    port: NEXT.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: NEXT.host + ':' + NEXT.port },
  }
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end('proxy error')
  })
  req.pipe(proxyReq)
})

// Next.js faz POST aqui {userId, message} para enviar `message` (texto) a app.
function handleInternalControl(req, res) {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    try {
      const { userId, message } = JSON.parse(body || '{}')
      const e = hub.get(userId)
      let delivered = false
      if (e && e.companion && e.companion.readyState === 1 && typeof message === 'string') {
        try { e.companion.send(message); delivered = true } catch {}
      }
      res.statusCode = 200
      res.end(JSON.stringify({ ok: true, delivered }))
    } catch {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, error: 'bad json' }))
    }
  })
}

// ---- WebSocket ----
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  let url
  try {
    url = new URL(req.url, 'http://x')
  } catch {
    socket.destroy()
    return
  }
  const path = url.pathname
  if (path.startsWith('/ws/devices/')) {
    const id = decodeURIComponent(path.slice('/ws/devices/'.length))
    wss.handleUpgrade(req, socket, head, (ws) => onBrowser(ws, id))
  } else if (path.startsWith('/_next/') || path.startsWith('/__next')) {
    // HMR / Turbopack dev WebSocket — proxy transparente para o Next.js.
    const proxyReq = http.request({
      host: NEXT.host,
      port: NEXT.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: NEXT.host + ':' + NEXT.port },
    })
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const statusLine = 'HTTP/1.1 ' + proxyRes.statusCode + ' ' + proxyRes.statusMessage + '\r\n'
      let headers = ''
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        headers += proxyRes.rawHeaders[i] + ': ' + proxyRes.rawHeaders[i + 1] + '\r\n'
      }
      socket.write(statusLine + headers + '\r\n')
      if (proxyHead && proxyHead.length) socket.write(proxyHead)
      proxySocket.pipe(socket)
      socket.pipe(proxySocket)
      proxySocket.on('error', () => { try { socket.destroy() } catch {} })
      socket.on('error', () => { try { proxySocket.destroy() } catch {} })
    })
    proxyReq.on('error', () => { try { socket.destroy() } catch {} })
    proxyReq.end()
  } else {
    // A app Companion liga-se na RAIZ e envia o token no header X-Agent-Token.
    const token = req.headers['x-agent-token'] || url.searchParams.get('token')
    wss.handleUpgrade(req, socket, head, (ws) => onCompanion(ws, token))
  }
})

async function onCompanion(ws, token) {
  const userId = await userIdFromToken(token)
  if (!userId) {
    try { ws.close(4401, 'token invalido') } catch {}
    return
  }
  const e = entryFor(userId)
  e.companion = ws
  // Reset do buffer de recuperacao para a nova ligacao.
  e.lastConfig = null
  e.gop = []
  e.gopBytes = 0
  let frames = 0
  let keyframes = 0
  const ligadoEm = Date.now()
  console.log('[companion] ligado   userId=' + userId)

  // Keepalive: ping a cada 15s. Sem vídeo a fluir, uma ligação ociosa cai por
  // inatividade (NAT do Tailscale / timeouts ~30-45s). O ping mantém-na viva —
  // é o que garante que os comandos chegam SEMPRE (persistência).
  const hb = setInterval(() => {
    if (ws.readyState === 1) { try { ws.ping() } catch {} }
    else { try { clearInterval(hb) } catch {} }
  }, 15000)

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Frame da app: [flags:1 (bit0=key, bit1=config)][ts:8][reserved:3] + Annex-B
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      if (buf.length < 12) return
      const flags = buf[0]
      const isKey = (flags & 0x01) !== 0
      const isConfig = (flags & 0x02) !== 0
      const isAudio = (flags & 0x04) !== 0
      const payload = buf.subarray(12)

      // AUDIO: nao entra no buffer de recuperacao de video (GOP); so reencaminha
      // ao vivo para quem esta a escutar. Chega quando o operador liga a escuta.
      if (isAudio) {
        const wrappedAudio = enquadrarAudio(payload)
        for (const b of e.browsers) {
          if (b.readyState === 1) { try { b.send(wrappedAudio) } catch {} }
        }
        return
      }

      const wrapped = enquadrar(isConfig, isKey, payload)

      frames++
      if (isKey) keyframes++
      if (frames <= 4 || frames % 60 === 0) {
        console.log('[companion] frame ' + frames + ' (key=' + keyframes + ' config=' + isConfig + ' k=' + isKey + ' ' + payload.length + 'B) browsers=' + e.browsers.size)
      }

      if (isConfig) {
        e.lastConfig = wrapped
      } else if (isKey) {
        e.gop = [wrapped]
        e.gopBytes = wrapped.length
      } else {
        e.gop.push(wrapped)
        e.gopBytes += wrapped.length
        while (e.gopBytes > MAX_GOP_BYTES && e.gop.length > 1) {
          e.gopBytes -= e.gop.shift().length
        }
      }

      for (const b of e.browsers) {
        if (b.readyState === 1) { try { b.send(wrapped) } catch {} }
      }
      return
    }
    // Texto: hello (+ possivel location/etc.)
    let msg = null
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg && msg.t === 'crash') {
      console.log('[companion] CRASH anterior reportado pela app:\n' + String(msg.stack || '').slice(0, 2500))
      return
    }
    // Audio: meta (formato do PCM) e erros da captura. Reencaminha aos browsers;
    // guarda a ultima meta para quem abre a meio (catch-up).
    if (msg && (msg.t === 'audio_meta' || msg.t === 'audio_error')) {
      if (msg.t === 'audio_meta') {
        e.lastAudioMeta = (msg.active === false) ? null : data.toString()
      }
      for (const b of e.browsers) {
        if (b.readyState === 1) { try { b.send(data.toString()) } catch {} }
      }
      console.log('[companion] ' + msg.t + ' ' + data.toString().slice(0, 160))
      return
    }
    if (msg && msg.t === 'hello') {
      e.meta = { id: msg.id, model: msg.model, width: msg.width, height: msg.height }
      for (const b of e.browsers) {
        if (b.readyState === 1) { try { b.send(JSON.stringify({ t: 'meta', ...e.meta })) } catch {} }
      }
      console.log('[companion] hello    ' + JSON.stringify(e.meta))
    }
  })

  ws.on('close', (code, reason) => {
    try { clearInterval(hb) } catch {}
    if (e.companion === ws) {
      e.companion = null
      // Fonte caiu: avisa os navegadores (como o totalcontrol) e limpa o buffer.
      e.lastConfig = null
      e.gop = []
      e.gopBytes = 0
      e.lastAudioMeta = null
      for (const b of e.browsers) {
        if (b.readyState === 1) {
          try { b.send(JSON.stringify({ t: 'audio_meta', active: false })) } catch {}
          try { b.send(JSON.stringify({ t: 'closed' })) } catch {}
        }
      }
    }
    const dur = ((Date.now() - ligadoEm) / 1000).toFixed(1)
    console.log('[companion] desligado userId=' + userId + ' apos ' + dur + 's, frames=' + frames + ' keyframes=' + keyframes + ' code=' + code + ' reason=' + (reason ? reason.toString() : '-'))
  })
  ws.on('error', () => {})
}

async function onBrowser(ws, deviceId) {
  const userId = await userIdFromDeviceId(deviceId)
  if (!userId) {
    try { ws.close(4404, 'dispositivo desconhecido') } catch {}
    return
  }
  const e = entryFor(userId)
  e.browsers.add(ws)
  console.log('[browser]  ligado    device=' + deviceId + ' userId=' + userId + ' companionLigado=' + !!e.companion)

  // Catch-up: meta + config + ultimo GOP, para ver ja (mesmo entrando a meio).
  if (e.meta) { try { ws.send(JSON.stringify({ t: 'meta', ...e.meta })) } catch {} }
  if (e.lastAudioMeta) { try { ws.send(e.lastAudioMeta) } catch {} }
  if (e.lastConfig) { try { ws.send(e.lastConfig) } catch {} }
  for (const pkt of e.gop) { if (ws.readyState === 1) { try { ws.send(pkt) } catch {} } }

  // Estado do gesto em curso (para distinguir toque de arrasto/scroll).
  let gesto = null // { x, y, t } em coords normalizadas 0..1
  const enviarApp = (cmd) => {
    if (cmd && e.companion && e.companion.readyState === 1) {
      try { e.companion.send(JSON.stringify(cmd)) } catch {}
    }
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    let msg = null
    try { msg = JSON.parse(data.toString()) } catch { return }

    // Toque/arrasto: o browser manda down/move/up em px de vídeo (+ w,h).
    // Normalizamos para 0..1 e, no 'up', decidimos toque vs deslize.
    if (msg.t === 'touch' && msg.w && msg.h) {
      const nx = Math.max(0, Math.min(1, Number(msg.x) / Number(msg.w)))
      const ny = Math.max(0, Math.min(1, Number(msg.y) / Number(msg.h)))
      if (msg.action === 'down') {
        gesto = { x: nx, y: ny, t: Date.now() }
      } else if (msg.action === 'up') {
        const g = gesto
        gesto = null
        if (!g) {
          enviarApp({ command: 'touch', x: nx, y: ny })
        } else {
          const dist = Math.hypot(nx - g.x, ny - g.y)
          if (dist < 0.02) {
            enviarApp({ command: 'touch', x: g.x, y: g.y })
          } else {
            const dur = Math.max(80, Math.min(1500, Date.now() - g.t))
            enviarApp({ command: 'swipe', x: g.x, y: g.y, endX: nx, endY: ny, duration: dur })
          }
        }
      }
      // 'move' é ignorado — o deslize é despachado de uma vez no 'up'.
      return
    }

    // Botões do sistema / outros comandos.
    enviarApp(traduzirControlo(msg))
  })
  ws.on('close', () => { e.browsers.delete(ws) })
  ws.on('error', () => {})
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('ScreenPorter relay a ouvir em http://0.0.0.0:' + PORT + '  (proxy HTTP -> Next.js :' + NEXT.port + ')')
})
