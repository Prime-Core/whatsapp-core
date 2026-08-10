/**
 * whatsapp-core — Servidor HTTP multichannel.
 *
 * DOS capas de endpoints:
 *   1. RAÍZ (compatibilidad total con api-whtsapp v1.0.0)
 *      Usa la sesión default (única, la del número principal).
 *   2. MULTI-SESSION (/api/sessions/...)
 *      Registra, enrola (QR/pairing), consulta y envía desde N números.
 */

import express from 'express'
import cors from 'cors'
import QRCode from 'qrcode'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import fs from 'node:fs'
import path from 'node:path'
import { BaileysChannelAdapter } from './channels/baileys/adapter.js'

// ─── Config ──────────────────────────────────────────────────

const PORT = process.env.PORT || 8000
const SESSIONS_ROOT = process.env.SESSIONS_ROOT || './sessions'
const DEFAULT_PHONE = process.env.DEFAULT_PHONE || 'default'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── Registro de sesiones (multi-número) ─────────────────────

interface SessionEntry {
  phone: string
  authDir: string
  adapter: BaileysChannelAdapter
  status: {
    authenticated: boolean
    ready: boolean
    qrCode: string | null
    sessionRestored: boolean
    lastActivity: Date
  }
}

class SessionRegistry {
  private sessions = new Map<string, SessionEntry>()
  private receivedMessages = new Map<string, any[]>()
  private webhooks = new Map<string, string[]>()
  private readonly MAX_MESSAGES = 1000

  constructor() {
    fs.mkdirSync(SESSIONS_ROOT, { recursive: true })
  }

  /** Registra un teléfono: crea su adapter y arranca la conexión */
  register(phone: string): SessionEntry {
    const normalized = phone.replace(/[^0-9]/g, '') || 'default'
    if (this.sessions.has(normalized)) {
      return this.sessions.get(normalized)!
    }

    const authDir = path.join(SESSIONS_ROOT, normalized)
    const adapter = new BaileysChannelAdapter(normalized, authDir)

    const entry: SessionEntry = {
      phone: normalized,
      authDir,
      adapter,
      status: {
        authenticated: false,
        ready: false,
        qrCode: null,
        sessionRestored: false,
        lastActivity: new Date(),
      },
    }

    // Eventos del adapter
    adapter.onEvent((event) => {
      if (event.type === 'qr' && event.qr) {
        entry.status.qrCode = event.qr
        entry.status.lastActivity = new Date()
      }
      if (event.type === 'status_change') {
        if (event.status === 'connected') {
          entry.status.ready = true
          entry.status.authenticated = true
          entry.status.qrCode = null
          entry.status.sessionRestored = true
        }
        if (event.status === 'disconnected') {
          entry.status.ready = false
          entry.status.authenticated = false
          entry.status.qrCode = null
          // Reconexión automática
          setTimeout(() => {
            adapter.connect({ authDir, forceQr: true }).catch(() => {})
          }, 10000)
        }
        entry.status.lastActivity = new Date()
      }
    })

    adapter.onInbound((msg) => {
      entry.status.lastActivity = new Date()
      const list = this.receivedMessages.get(normalized) || []
      list.unshift(msg)
      this.receivedMessages.set(normalized, list.slice(0, this.MAX_MESSAGES))
      // Webhooks del teléfono
      for (const url of this.webhooks.get(normalized) || []) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'message', data: msg, phone: normalized }),
        }).catch((err) => console.warn(`Webhook falló ${url}:`, err.message))
      }
    })

    this.sessions.set(normalized, entry)

    // Conectar automáticamente (restaura sesión o genera QR)
    adapter.connect({ authDir, forceQr: true }).then((result) => {
      if (result.connected) {
        entry.status.ready = true
        entry.status.authenticated = true
        entry.status.sessionRestored = true
      }
    }).catch(() => {})

    return entry
  }

  get(phone: string): SessionEntry | undefined {
    const normalized = phone.replace(/[^0-9]/g, '') || 'default'
    return this.sessions.get(normalized)
  }

  getAll(): SessionEntry[] {
    return Array.from(this.sessions.values())
  }

  async remove(phone: string): Promise<boolean> {
    const entry = this.get(phone)
    if (!entry) return false
    await entry.adapter.disconnect().catch(() => {})
    fs.rmSync(entry.authDir, { recursive: true, force: true })
    this.sessions.delete(entry.phone)
    this.receivedMessages.delete(entry.phone)
    this.webhooks.delete(entry.phone)
    return true
  }

  async clearSession(phone: string): Promise<void> {
    const entry = this.get(phone)
    if (!entry) return
    await entry.adapter.disconnect().catch(() => {})
    fs.rmSync(entry.authDir, { recursive: true, force: true })
    entry.status = {
      authenticated: false, ready: false, qrCode: null,
      sessionRestored: false, lastActivity: new Date(),
    }
    setTimeout(() => {
      entry.adapter.connect({ authDir: entry.authDir, forceQr: true }).catch(() => {})
    }, 2000)
  }

  registerWebhook(phone: string, url: string): void {
    const normalized = phone.replace(/[^0-9]/g, '') || 'default'
    const list = this.webhooks.get(normalized) || []
    if (!list.includes(url)) list.push(url)
    this.webhooks.set(normalized, list)
  }

  getReceived(phone: string, limit = 50): any[] {
    const normalized = phone.replace(/[^0-9]/g, '') || 'default'
    return (this.receivedMessages.get(normalized) || []).slice(0, limit)
  }

  /** Helper: responde error si la sesión no está ready */
  requireReady(res: express.Response, entry: SessionEntry): boolean {
    if (!entry.status.ready) {
      res.status(400).json({ error: 'Cliente no está listo' })
      return false
    }
    return true
  }
}

const registry = new SessionRegistry()

// Registrar la sesión default (compatibilidad con el viejo API)
const defaultEntry = registry.register(DEFAULT_PHONE)

// ═══════════════════════════════════════════════════════════════
// CAPA 1: ENDPOINTS RAÍZ (compatibles con api-whtsapp v1.0.0)
// Usan la sesión default — URL idéntica al servicio viejo.
// ═══════════════════════════════════════════════════════════════

// ─── GET / ───────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    message: 'WhatsApp Core API',
    version: '3.0.0',
    endpoints: {
      status: '/api/status',
      qr: '/api/qr',
      qr_html: '/api/qr/html',
      client_info: '/api/client/info',
      health: '/health',
      docs: '/api-docs',
      sessions: '/api/sessions',
    },
  })
})

// ─── GET /health ─────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Core Service',
    sessions: registry.getAll().length,
  })
})

// ─── GET /api/status ─────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  const s = defaultEntry.status
  res.json({
    status: s.ready ? 'ready' : s.authenticated ? 'authenticated'
      : s.qrCode ? 'waiting_qr' : s.sessionRestored ? 'initializing' : 'disconnected',
    authenticated: s.authenticated,
    ready: s.ready,
    qrCode: s.qrCode,
    sessionRestored: s.sessionRestored,
    lastActivity: s.lastActivity,
  })
})

// ─── GET /api/qr ─────────────────────────────────────────────

app.get('/api/qr', async (_req, res) => {
  const s = defaultEntry.status
  if (s.qrCode) {
    try {
      const qrBuffer = await QRCode.toBuffer(s.qrCode, { type: 'png', width: 300, margin: 2 })
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Content-Disposition', 'inline; filename="whatsapp-qr.png"')
      res.send(qrBuffer)
    } catch (error: any) {
      if (!res.headersSent) res.status(500).json({ error: 'Error generando QR: ' + error.message })
    }
  } else if (s.ready) {
    res.status(400).json({ error: 'Cliente ya está autenticado y listo' })
  } else {
    res.status(404).json({ error: 'QR no disponible, intenta más tarde' })
  }
})

// ─── GET /api/qr/html ────────────────────────────────────────

app.get('/api/qr/html', async (_req, res) => {
  const s = defaultEntry.status
  if (s.qrCode) {
    try {
      const qrImage = await QRCode.toDataURL(s.qrCode)
      res.send(`<!DOCTYPE html><html><head><title>WhatsApp QR</title>
<style>body{font-family:Arial;text-align:center;padding:20px;background:#f0f0f0}
.container{background:white;padding:20px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px;margin:0 auto}
h1{color:#25D366}img{max-width:100%;border:1px solid #ddd;border-radius:5px}
.instructions{margin-top:20px;color:#666;font-size:14px}</style></head>
<body><div class="container"><h1>WhatsApp Authentication</h1>
<p>Escanea este QR con WhatsApp</p><img src="${qrImage}" alt="QR">
<div class="instructions"><p>1. Abre WhatsApp en tu teléfono</p>
<p>2. Toca Menú → Dispositivos vinculados</p>
<p>3. Escanea este código QR</p></div></div></body></html>`)
    } catch (error: any) {
      res.status(500).json({ error: 'Error generando QR: ' + error.message })
    }
  } else if (s.ready) {
    res.status(400).json({ error: 'Cliente ya está autenticado y listo' })
  } else {
    res.status(404).json({ error: 'QR no disponible, intenta más tarde' })
  }
})

// ─── POST /api/session/clear ─────────────────────────────────

app.post('/api/session/clear', async (_req, res) => {
  try {
    await registry.clearSession(DEFAULT_PHONE)
    res.json({ success: true, message: 'Caché de sesión eliminado. Se requiere nueva autenticación.' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error al limpiar caché: ' + error.message })
  }
})

// ─── POST /api/pairing-code ──────────────────────────────────

app.post('/api/pairing-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body
    if (!phoneNumber) return res.status(400).json({ error: 'El campo "phoneNumber" es requerido' })
    const entry = registry.get(phoneNumber) ?? registry.register(phoneNumber)
    if (!entry.adapter.sock) {
      return res.status(400).json({ error: 'Cliente no inicializado. Espera a que genere el QR/pairing primero.' })
    }
    const clean = String(phoneNumber).replace(/[^0-9]/g, '')
    const code = await entry.adapter.sock.requestPairingCode(clean)
    console.log(`[${entry.phone}] Pairing code generado:`, code)
    res.json({ success: true, pairingCode: code, phoneNumber: clean })
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error generando pairing code: ' + error.message })
  }
})

// ─── GET /api/client/info ────────────────────────────────────

app.get('/api/client/info', (_req, res) => {
  if (!defaultEntry.status.ready || !defaultEntry.adapter.sock?.user) {
    return res.status(400).json({ error: 'Cliente no está listo' })
  }
  try {
    const user = defaultEntry.adapter.sock.user
    res.json({ wid: user.id, platform: 'baileys', pushname: user.name || '' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ─── POST /api/messages/send ─────────────────────────────────

app.post('/api/messages/send', async (req, res) => {
  if (!registry.requireReady(res, defaultEntry)) return
  const { to, message } = req.body
  if (!to || !message) {
    return res.status(400).json({ error: 'Los campos "to" y "message" son requeridos' })
  }
  try {
    const cleanTo = to.replace('@c.us', '').replace('@s.whatsapp.net', '')
    const result = await defaultEntry.adapter.sendText(cleanTo, message)
    res.json({
      success: true,
      messageId: result.messageId,
      timestamp: result.timestamp,
      to: cleanTo + '@s.whatsapp.net',
      message,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al enviar mensaje', details: error.message })
  }
})

// ─── POST /api/messages/broadcast ────────────────────────────

app.post('/api/messages/broadcast', async (req, res) => {
  if (!registry.requireReady(res, defaultEntry)) return
  const { recipients, message } = req.body
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ error: '"recipients" (array) y "message" son requeridos' })
  }
  const results: any[] = []
  for (const recipient of recipients) {
    try {
      const cleanTo = recipient.replace('@c.us', '').replace('@s.whatsapp.net', '')
      const result = await defaultEntry.adapter.sendText(cleanTo, message)
      results.push({ success: true, recipient: cleanTo + '@s.whatsapp.net', messageId: result.messageId, timestamp: result.timestamp })
    } catch (error: any) {
      results.push({ success: false, recipient, error: error.message })
    }
  }
  res.json({
    success: true,
    total: recipients.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  })
})

// ─── GET /api/chats ──────────────────────────────────────────

app.get('/api/chats', async (_req, res) => {
  if (!registry.requireReady(res, defaultEntry)) return
  try {
    const store = (defaultEntry.adapter.sock as any).store
    if (!store) return res.json({ total: 0, chats: [] })
    const chats = await store.chats.all()
    const simplified = chats.map((c: any) => ({
      id: c.id, name: c.name || c.id,
      isGroup: c.id?.includes('@g.us') || false,
      isReadOnly: c.readOnly || false,
      unreadCount: c.unreadCount || 0,
      archived: c.archive || false, pinned: c.pin || false,
    }))
    res.json({ total: simplified.length, chats: simplified })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener chats', details: error.message })
  }
})

// ─── GET /api/contacts ───────────────────────────────────────

app.get('/api/contacts', async (_req, res) => {
  if (!registry.requireReady(res, defaultEntry)) return
  try {
    const store = (defaultEntry.adapter.sock as any).store
    if (!store) return res.json({ total: 0, contacts: [] })
    const contacts = await store.contacts.all()
    const simplified = contacts
      .filter((c: any) => c.id?.includes('@s.whatsapp.net'))
      .map((c: any) => ({
        id: c.id, name: c.name || c.notify || '',
        pushname: c.notify || '', isBusiness: false, isMyContact: true,
      }))
    res.json({ total: simplified.length, contacts: simplified })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener contactos', details: error.message })
  }
})

// ─── Webhooks raíz ───────────────────────────────────────────

app.post('/api/webhooks/register', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL requerida' })
  registry.registerWebhook(DEFAULT_PHONE, url)
  res.json({ success: true })
})

app.get('/api/webhooks', (_req, res) => {
  res.json({ webhooks: registry.getReceived(DEFAULT_PHONE) })
})

app.get('/api/messages/received', (req, res) => {
  const limit = parseInt((req as any).query.limit as string) || 50
  res.json({ total: registry.getReceived(DEFAULT_PHONE, 1000).length, messages: registry.getReceived(DEFAULT_PHONE, limit) })
})

// ═══════════════════════════════════════════════════════════════
// CAPA 2: ENDPOINTS MULTI-SESSION (/api/sessions/...)
// Registra teléfonos, los enrola (QR/pairing), consulta y envía.
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/sessions — listar todas ───────────────────────

app.get('/api/sessions', (_req, res) => {
  const sessions = registry.getAll().map((e) => ({
    phone: e.phone,
    status: e.status.ready ? 'ready' : e.status.qrCode ? 'waiting_qr'
      : e.status.authenticated ? 'authenticated' : 'disconnected',
    ready: e.status.ready,
    authenticated: e.status.authenticated,
    waitingQr: !!e.status.qrCode,
    lastActivity: e.status.lastActivity,
  }))
  res.json({ total: sessions.length, sessions })
})

// ─── POST /api/sessions — registrar nuevo teléfono ──────────

app.post('/api/sessions', (req, res) => {
  const { phoneNumber } = req.body
  if (!phoneNumber) return res.status(400).json({ error: 'El campo "phoneNumber" es requerido' })
  const entry = registry.register(phoneNumber)
  res.json({
    success: true,
    phone: entry.phone,
    status: 'registering',
    message: 'Teléfono registrado. Usa /pairing-code o /qr para enrolarlo.',
  })
})

// ─── DELETE /api/sessions/{phone} — eliminar sesión ─────────

app.delete('/api/sessions/:phone', async (req, res) => {
  const removed = await registry.remove(req.params.phone)
  if (!removed) return res.status(404).json({ error: 'Sesión no encontrada' })
  res.json({ success: true, message: 'Sesión eliminada' })
})

// ─── GET /api/sessions/{phone}/status ────────────────────────

app.get('/api/sessions/:phone/status', (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  const s = entry.status
  res.json({
    phone: entry.phone,
    status: s.ready ? 'ready' : s.authenticated ? 'authenticated'
      : s.qrCode ? 'waiting_qr' : s.sessionRestored ? 'initializing' : 'disconnected',
    authenticated: s.authenticated,
    ready: s.ready,
    qrCode: s.qrCode,
    sessionRestored: s.sessionRestored,
    lastActivity: s.lastActivity,
  })
})

// ─── GET /api/sessions/{phone}/qr — QR como PNG ──────────────

app.get('/api/sessions/:phone/qr', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  if (!entry.status.qrCode) {
    return entry.status.ready
      ? res.status(400).json({ error: 'Cliente ya autenticado' })
      : res.status(404).json({ error: 'QR no disponible' })
  }
  try {
    const qrBuffer = await QRCode.toBuffer(entry.status.qrCode, { type: 'png', width: 300, margin: 2 })
    res.setHeader('Content-Type', 'image/png')
    res.send(qrBuffer)
  } catch (error: any) {
    res.status(500).json({ error: 'Error generando QR: ' + error.message })
  }
})

// ─── POST /api/sessions/{phone}/pairing-code ─────────────────

app.post('/api/sessions/:phone/pairing-code', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada. Registra primero.' })
  try {
    if (!entry.adapter.sock) {
      return res.status(400).json({ error: 'Cliente no inicializado aún. Espera unos segundos.' })
    }
    const code = await entry.adapter.sock.requestPairingCode(entry.phone)
    console.log(`[${entry.phone}] Pairing code:`, code)
    res.json({ success: true, phone: entry.phone, pairingCode: code })
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error generando pairing code: ' + error.message })
  }
})

// ─── POST /api/sessions/{phone}/session/clear ────────────────

app.post('/api/sessions/:phone/session/clear', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  try {
    await registry.clearSession(entry.phone)
    res.json({ success: true, message: 'Sesión limpiada. Re-enrolar requerido.' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─── POST /api/sessions/{phone}/messages/send ────────────────

app.post('/api/sessions/:phone/messages/send', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  if (!registry.requireReady(res, entry)) return
  const { to, message } = req.body
  if (!to || !message) return res.status(400).json({ error: '"to" y "message" requeridos' })
  try {
    const cleanTo = to.replace('@c.us', '').replace('@s.whatsapp.net', '')
    const result = await entry.adapter.sendText(cleanTo, message)
    res.json({
      success: true,
      from: entry.phone,
      messageId: result.messageId,
      timestamp: result.timestamp,
      to: cleanTo + '@s.whatsapp.net',
      message,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al enviar mensaje', details: error.message })
  }
})

// ─── POST /api/sessions/{phone}/messages/broadcast ───────────

app.post('/api/sessions/:phone/messages/broadcast', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  if (!registry.requireReady(res, entry)) return
  const { recipients, message } = req.body
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ error: '"recipients" (array) y "message" requeridos' })
  }
  const results: any[] = []
  for (const recipient of recipients) {
    try {
      const cleanTo = recipient.replace('@c.us', '').replace('@s.whatsapp.net', '')
      const result = await entry.adapter.sendText(cleanTo, message)
      results.push({ success: true, recipient: cleanTo + '@s.whatsapp.net', messageId: result.messageId, timestamp: result.timestamp })
    } catch (error: any) {
      results.push({ success: false, recipient, error: error.message })
    }
  }
  res.json({
    success: true,
    from: entry.phone,
    total: recipients.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  })
})

// ─── GET /api/sessions/{phone}/chats ─────────────────────────

app.get('/api/sessions/:phone/chats', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  if (!registry.requireReady(res, entry)) return
  try {
    const store = (entry.adapter.sock as any).store
    if (!store) return res.json({ total: 0, chats: [] })
    const chats = await store.chats.all()
    const simplified = chats.map((c: any) => ({
      id: c.id, name: c.name || c.id,
      isGroup: c.id?.includes('@g.us') || false,
      unreadCount: c.unreadCount || 0,
      archived: c.archive || false, pinned: c.pin || false,
    }))
    res.json({ phone: entry.phone, total: simplified.length, chats: simplified })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener chats', details: error.message })
  }
})

// ─── GET /api/sessions/{phone}/contacts ──────────────────────

app.get('/api/sessions/:phone/contacts', async (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  if (!registry.requireReady(res, entry)) return
  try {
    const store = (entry.adapter.sock as any).store
    if (!store) return res.json({ total: 0, contacts: [] })
    const contacts = await store.contacts.all()
    const simplified = contacts
      .filter((c: any) => c.id?.includes('@s.whatsapp.net'))
      .map((c: any) => ({
        id: c.id, name: c.name || c.notify || '',
        pushname: c.notify || '', isBusiness: false, isMyContact: true,
      }))
    res.json({ phone: entry.phone, total: simplified.length, contacts: simplified })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener contactos', details: error.message })
  }
})

// ─── Webhooks multi-session ──────────────────────────────────

app.post('/api/sessions/:phone/webhooks/register', (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL requerida' })
  registry.registerWebhook(entry.phone, url)
  res.json({ success: true, phone: entry.phone })
})

app.get('/api/sessions/:phone/messages/received', (req, res) => {
  const entry = registry.get(req.params.phone)
  if (!entry) return res.status(404).json({ error: 'Sesión no registrada' })
  const limit = parseInt((req as any).query.limit as string) || 50
  res.json({ phone: entry.phone, total: registry.getReceived(entry.phone, 1000).length, messages: registry.getReceived(entry.phone, limit) })
})

// ═══════════════════════════════════════════════════════════════
// SWAGGER (spec dinámica según host de la request)
// ═══════════════════════════════════════════════════════════════

// ─── Spec Swagger construida programáticamente ───────────────

const waTag = { name: 'WhatsApp', description: 'Capa raíz — compatibilidad api-whtsapp' }
const multiTag = { name: 'Multi-Session', description: 'Capa multi-número — enrolar y gestionar teléfonos' }
const sysTag = { name: 'Sistema', description: 'Endpoints de sistema' }

function buildSwaggerSpec(req: express.Request) {
  const host = req.get('host') || `localhost:${PORT}`
  const protocol = req.protocol || 'http'
  return {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Core API',
      version: '3.0.0',
      description: 'API multichannel WhatsApp. Capa raíz compatible con api-whtsapp + capa multi-session.',
    },
    servers: [{ url: `${protocol}://${host}`, description: 'Servidor actual' }],
    tags: [sysTag, waTag, multiTag],
    paths: {
      // ── Sistema ──
      '/': {
        get: { tags: ['Sistema'], summary: 'Información de la API', responses: { 200: { description: 'OK' } } },
      },
      '/health': {
        get: { tags: ['Sistema'], summary: 'Health check', responses: { 200: { description: 'OK' } } },
      },
      '/api-docs/json': {
        get: { tags: ['Sistema'], summary: 'Spec OpenAPI JSON', responses: { 200: { description: 'OK' } } },
      },

      // ── Capa raíz (WhatsApp default) ──
      '/api/status': {
        get: { tags: ['WhatsApp'], summary: 'Estado del servicio (sesión default)', responses: { 200: { description: 'Estado' } } },
      },
      '/api/qr': {
        get: { tags: ['WhatsApp'], summary: 'QR como PNG', responses: { 200: { description: 'Imagen PNG' }, 404: { description: 'QR no disponible' } } },
      },
      '/api/qr/html': {
        get: { tags: ['WhatsApp'], summary: 'QR como página HTML', responses: { 200: { description: 'HTML' } } },
      },
      '/api/session/clear': {
        post: { tags: ['WhatsApp'], summary: 'Limpiar sesión default y forzar QR', responses: { 200: { description: 'OK' } } },
      },
      '/api/pairing-code': {
        post: {
          tags: ['WhatsApp'], summary: 'Generar pairing code (default o registra si no existe)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['phoneNumber'],
            properties: { phoneNumber: { type: 'string', description: 'Número con código de país sin +' } },
          } } } },
          responses: { 200: { description: 'Código generado' } },
        },
      },
      '/api/client/info': {
        get: { tags: ['WhatsApp'], summary: 'Información del número conectado', responses: { 200: { description: 'OK' } } },
      },
      '/api/messages/send': {
        post: {
          tags: ['WhatsApp'], summary: 'Enviar mensaje de texto (sesión default)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['to', 'message'],
            properties: {
              to: { type: 'string', description: 'Número destinatario' },
              message: { type: 'string', description: 'Texto' },
            },
          } } } },
          responses: { 200: { description: 'Enviado' }, 400: { description: 'Cliente no listo' } },
        },
      },
      '/api/messages/broadcast': {
        post: {
          tags: ['WhatsApp'], summary: 'Broadcast a múltiples destinatarios (default)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['recipients', 'message'],
            properties: {
              recipients: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
          } } } },
          responses: { 200: { description: 'Resultado broadcast' } },
        },
      },
      '/api/chats': {
        get: { tags: ['WhatsApp'], summary: 'Listar chats (default)', responses: { 200: { description: 'OK' } } },
      },
      '/api/contacts': {
        get: { tags: ['WhatsApp'], summary: 'Listar contactos (default)', responses: { 200: { description: 'OK' } } },
      },
      '/api/webhooks/register': {
        post: { tags: ['WhatsApp'], summary: 'Registrar webhook (default)', responses: { 200: { description: 'OK' } } },
      },
      '/api/messages/received': {
        get: { tags: ['WhatsApp'], summary: 'Mensajes recibidos (default)', responses: { 200: { description: 'OK' } } },
      },

      // ── Capa multi-session ──
      '/api/sessions': {
        get: { tags: ['Multi-Session'], summary: 'Listar teléfonos enrolados', responses: { 200: { description: 'Lista' } } },
        post: {
          tags: ['Multi-Session'], summary: 'Enrolar nuevo teléfono',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['phoneNumber'],
            properties: { phoneNumber: { type: 'string', description: 'Número a enrolar' } },
          } } } },
          responses: { 200: { description: 'Registrado' } },
        },
      },
      '/api/sessions/{phone}': {
        delete: { tags: ['Multi-Session'], summary: 'Desenrolar teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'Eliminado' }, 404: { description: 'No existe' } } },
      },
      '/api/sessions/{phone}/status': {
        get: { tags: ['Multi-Session'], summary: 'Estado de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'Estado' } } },
      },
      '/api/sessions/{phone}/qr': {
        get: { tags: ['Multi-Session'], summary: 'QR de un teléfono (PNG)', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'PNG' } } },
      },
      '/api/sessions/{phone}/pairing-code': {
        post: { tags: ['Multi-Session'], summary: 'Pairing code de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'Código' } } },
      },
      '/api/sessions/{phone}/session/clear': {
        post: { tags: ['Multi-Session'], summary: 'Limpiar sesión de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'OK' } } },
      },
      '/api/sessions/{phone}/messages/send': {
        post: {
          tags: ['Multi-Session'], summary: 'Enviar mensaje desde un teléfono',
          parameters: [{ name: 'phone', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['to', 'message'],
            properties: {
              to: { type: 'string' }, message: { type: 'string' },
            },
          } } } },
          responses: { 200: { description: 'Enviado' } },
        },
      },
      '/api/sessions/{phone}/messages/broadcast': {
        post: {
          tags: ['Multi-Session'], summary: 'Broadcast desde un teléfono',
          parameters: [{ name: 'phone', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['recipients', 'message'],
            properties: {
              recipients: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
          } } } },
          responses: { 200: { description: 'Resultado' } },
        },
      },
      '/api/sessions/{phone}/chats': {
        get: { tags: ['Multi-Session'], summary: 'Chats de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'OK' } } },
      },
      '/api/sessions/{phone}/contacts': {
        get: { tags: ['Multi-Session'], summary: 'Contactos de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'OK' } } },
      },
      '/api/sessions/{phone}/webhooks/register': {
        post: { tags: ['Multi-Session'], summary: 'Webhook de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'OK' } } },
      },
      '/api/sessions/{phone}/messages/received': {
        get: { tags: ['Multi-Session'], summary: 'Mensajes recibidos de un teléfono', parameters: [
          { name: 'phone', in: 'path', required: true, schema: { type: 'string' } },
        ], responses: { 200: { description: 'OK' } } },
      },
    },
  }
}

app.get('/api-docs/json', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(buildSwaggerSpec(req))
})

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(undefined, {
  swaggerOptions: { url: '/api-docs/json' },
}))

// ─── Error handler ───────────────────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err)
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' })
})

// ─── Iniciar ─────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`WhatsApp Core v3.0.0 en http://localhost:${PORT}`)
  console.log(`Docs: http://localhost:${PORT}/api-docs`)
  console.log(`Sesiones root: ${SESSIONS_ROOT}`)
})
