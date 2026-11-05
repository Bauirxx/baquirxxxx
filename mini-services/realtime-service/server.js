// GuardianLink — Mini-service de tempo real (versao Node, sem Bun)
//  - Porta 3003: socket.io (o painel liga aqui diretamente)
//  - Porta 3004: HTTP interno (as APIs do Next.js fazem POST /internal/broadcast)
'use strict'

const { createServer } = require('http')
const { Server } = require('socket.io')

const IO_PORT = Number(process.env.RT_IO_PORT || 3003)
const INTERNAL_PORT = Number(process.env.RT_INTERNAL_PORT || 3004)

const ioServer = createServer()
const io = new Server(ioServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const socketToUser = new Map()
const userToSockets = new Map()

function subscribeSocket(socketId, userId) {
  socketToUser.set(socketId, userId)
  if (!userToSockets.has(userId)) userToSockets.set(userId, new Set())
  userToSockets.get(userId).add(socketId)
}

function unsubscribeSocket(socketId) {
  const userId = socketToUser.get(socketId)
  if (userId) {
    const set = userToSockets.get(userId)
    if (set) {
      set.delete(socketId)
      if (set.size === 0) userToSockets.delete(userId)
    }
  }
  socketToUser.delete(socketId)
}

io.on('connection', (socket) => {
  console.log('[realtime] ligado: ' + socket.id)
  socket.on('subscribe', (data) => {
    const userId = data && data.userId
    if (typeof userId !== 'string' || !userId) return
    subscribeSocket(socket.id, userId)
    console.log('[realtime] ' + socket.id + ' subscreveu ' + userId)
    socket.emit('subscribed', { ok: true })
  })
  socket.on('unsubscribe', () => unsubscribeSocket(socket.id))
  socket.on('disconnect', () => {
    unsubscribeSocket(socket.id)
    console.log('[realtime] desligado: ' + socket.id)
  })
})

ioServer.listen(IO_PORT, '0.0.0.0', () => {
  console.log('[realtime] socket.io a ouvir em 0.0.0.0:' + IO_PORT)
})

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
        console.log('[realtime] broadcast p/ ' + sent + ' socket(s) user=' + userId + ' type=' + (event.type || '?'))
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

internalHttp.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log('[realtime] HTTP interno a ouvir em 127.0.0.1:' + INTERNAL_PORT)
})

const shutdown = (sig) => {
  console.log('[realtime] ' + sig + ', a fechar...')
  ioServer.close(() => internalHttp.close(() => process.exit(0)))
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
