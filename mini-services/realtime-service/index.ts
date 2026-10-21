// GuardianLink — Mini-service de tempo real
// Porta 3003: socket.io (para dashboards pais via Caddy gateway com ?XTransformPort=3003)
// Porta 3004: HTTP interno (para APIs fazerem broadcast via /internal/broadcast)
import { createServer } from 'http'
import { Server } from 'socket.io'

// ---- Socket.io server (porta 3003) ----
const ioServer = createServer()
const io = new Server(ioServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const socketToUser = new Map<string, string>()
const userToSockets = new Map<string, Set<string>>()

function subscribeSocket(socketId: string, userId: string) {
  socketToUser.set(socketId, userId)
  if (!userToSockets.has(userId)) userToSockets.set(userId, new Set())
  userToSockets.get(userId)!.add(socketId)
}

function unsubscribeSocket(socketId: string) {
  const userId = socketToUser.get(socketId)
  if (userId) {
    userToSockets.get(userId)?.delete(socketId)
    if (userToSockets.get(userId)?.size === 0) userToSockets.delete(userId)
  }
  socketToUser.delete(socketId)
}

io.on('connection', (socket) => {
  console.log(`[realtime] socket connected: ${socket.id}`)
  socket.on('subscribe', ({ userId }: { userId: string }) => {
    if (typeof userId !== 'string' || !userId) return
    subscribeSocket(socket.id, userId)
    console.log(`[realtime] socket ${socket.id} subscribed to ${userId}`)
    socket.emit('subscribed', { ok: true })
  })
  socket.on('unsubscribe', () => {
    unsubscribeSocket(socket.id)
  })
  socket.on('disconnect', () => {
    unsubscribeSocket(socket.id)
    console.log(`[realtime] socket disconnected: ${socket.id}`)
  })
})

ioServer.listen(3003, () => {
  console.log('[realtime] socket.io server listening on 3003')
})

// ---- HTTP interno (porta 3004) — para APIs chamarem e fazerem broadcast ----
const internalHttp = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'GET' && req.url === '/health') {
    res.statusCode = 200
    res.end(JSON.stringify({ ok: true, sockets: socketToUser.size, users: userToSockets.size }))
    return
  }
  if (req.method === 'POST' && req.url === '/internal/broadcast') {
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      const { userId, deviceId, event } = JSON.parse(body)
      if (!userId || !event) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'userId and event required' }))
        return
      }
      const sockets = userToSockets.get(userId)
      let sent = 0
      if (sockets && sockets.size > 0) {
        const payload = { deviceId, ...event }
        for (const socketId of sockets) {
          io.to(socketId).emit('event', payload)
          sent++
        }
        console.log(`[realtime] broadcast to ${sent} socket(s) for user ${userId}: type=${event.type}`)
      }
      res.statusCode = 200
      res.end(JSON.stringify({ ok: true, sent }))
    } catch {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'invalid json' }))
    }
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'not found' }))
})

internalHttp.listen(3004, '127.0.0.1', () => {
  console.log('[realtime] internal HTTP listening on 127.0.0.1:3004')
})

// ---- Graceful shutdown ----
const shutdown = (sig: string) => {
  console.log(`[realtime] ${sig}, closing...`)
  ioServer.close(() => {
    internalHttp.close(() => process.exit(0))
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
