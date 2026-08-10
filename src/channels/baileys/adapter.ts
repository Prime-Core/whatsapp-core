/**
 * ChannelAdapter para Baileys (conexión no-oficial vía QR).
 *
 * Capacidades:
 *   ✅ texto, imagen, video, audio, documento, sticker
 *   ✅ ubicación, contacto, reacción, presencia
 *   ✅ grupos (crear, añadir, remover)
 *   ✅ recibir mensajes, estados, eventos
 *   ✅ polls (encuestas)
 *   ❌ botones interactivos (rechazados por servidor WA)
 *   ❌ listas interactivas (rechazados por servidor WA)
 *   ❌ CTA URL/Call reales (rechazados por servidor WA)
 *   ❌ WhatsApp Flows (solo Cloud API)
 *   ⚠️ Riesgo de baneo (no-oficial)
 */

import { EventEmitter } from 'node:events'
import makeWASocket, {
  useMultiFileAuthState, fetchLatestBaileysVersion,
  DisconnectReason, proto, type WASocket,
  makeCacheableSignalKeyStore,
  delay, Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import type {
  ChannelAdapter, ChannelType, ChannelStatus,
  ConnectInput, ConnectResult, SendResult,
  InboundMessage, InboundMessageType, ChannelEvent,
  ImageInput, VideoInput, AudioInput, DocumentInput,
  LocationInput, ContactInput, GroupResult,
} from '../../types/channel.js'

// ─── Constantes ──────────────────────────────────────────────────

const CAPABILITIES = {
  interactive: false,
  templates: false,
  flows: false,
  groups: true,
  reactions: true,
  polls: true,
  presence: true,
  readReceipts: true,
}

// ─── Helpers ─────────────────────────────────────────────────────

function normalizeJid(raw: string): string {
  return raw.replace(/^\+/, '') + '@s.whatsapp.net'
}

function extractText(msg: proto.IMessage): string | undefined {
  if (msg.conversation) return msg.conversation
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text
  if (msg.imageMessage?.caption) return msg.imageMessage.caption
  if (msg.videoMessage?.caption) return msg.videoMessage.caption
  if (msg.documentMessage?.caption) return msg.documentMessage.caption
  if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId
  return undefined
}

function classifyMessage(msg: proto.IMessage): InboundMessageType {
  if (msg.imageMessage) return 'image'
  if (msg.videoMessage) return 'video'
  if (msg.audioMessage) return 'audio'
  if (msg.documentMessage) return 'document'
  if (msg.locationMessage) return 'location'
  if (msg.contactMessage || msg.contactsArrayMessage) return 'contact'
  if (msg.reactionMessage) return 'reaction'
  if (msg.buttonsResponseMessage) return 'button_reply'
  if (msg.listResponseMessage) return 'list_reply'
  if (msg.orderMessage) return 'order'
  if (msg.conversation || msg.extendedTextMessage) return 'text'
  return 'unknown'
}

// ─── Adapter ─────────────────────────────────────────────────────

export class BaileysChannelAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'baileys'
  readonly tenantId: string
  readonly capabilities = CAPABILITIES

  sock: WASocket | null = null
  private status: ChannelStatus = 'disconnected'
  private authDir: string
  private emitter = new EventEmitter()
  private logger = pino({ level: 'silent' })

  constructor(tenantId: string, authDir = './auth/baileys') {
    this.tenantId = tenantId
    this.authDir = authDir
  }

  // ─── Ciclo de vida ──────────────────────────────────────────

  async connect(input?: ConnectInput): Promise<ConnectResult> {
    const dir = input?.authDir ?? this.authDir
    this.authDir = dir
    this.status = 'connecting'

    const { state, saveCreds } = await useMultiFileAuthState(dir)
    const { version } = await fetchLatestBaileysVersion()

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger as any),
      },
      logger: this.logger as any,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      emitOwnEvents: false,
    })

    this.sock.ev.on('creds.update', saveCreds)

    return new Promise((resolve) => {
      this.sock!.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) {
          this.status = 'connecting'
          this.emitEvent({ type: 'qr', qr })
          if (input?.forceQr) resolve({ connected: false, qr })
          return
        }

        if (connection === 'open') {
          this.status = 'connected'
          this.setupMessageListener()
          this.setupEvents()
          resolve({
            connected: true,
            channelId: `${this.tenantId}:${this.sock!.user!.id}`,
            displayName: this.sock!.user!.name ?? undefined,
          })
        }

        if (connection === 'close') {
          const code = (lastDisconnect?.error as any)?.output?.statusCode
          if (code === DisconnectReason.loggedOut) {
            this.status = 'disconnected'
            this.emitEvent({ type: 'disconnected', error: 'logged_out' })
          }
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    try { await this.sock?.logout() } catch {}
    this.sock = null
    this.status = 'disconnected'
    this.emitEvent({ type: 'status_change', status: 'disconnected' })
  }

  getStatus(): ChannelStatus {
    return this.status
  }

  // ─── Envío de mensajes ─────────────────────────────────────

  async sendText(to: string, text: string): Promise<SendResult> {
    this.assertConnected()
    const msg = await this.sock!.sendMessage(normalizeJid(to), { text })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendImage(to: string, input: ImageInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveMedia(input)
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      image: media,
      caption: input.caption,
      mimetype: input.mimeType,
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendVideo(to: string, input: VideoInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveMedia(input)
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      video: media,
      caption: input.caption,
      mimetype: input.mimeType,
      gifPlayback: input.gifPlayback,
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendAudio(to: string, input: AudioInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveMedia(input)
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      audio: media,
      mimetype: input.mimeType,
      ptt: input.ptt ?? false,
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendDocument(to: string, input: DocumentInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveMedia(input)
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      document: media,
      mimetype: input.mimeType ?? 'application/octet-stream',
      fileName: input.filename ?? 'document',
      caption: input.caption,
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendLocation(to: string, input: LocationInput): Promise<SendResult> {
    this.assertConnected()
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      location: {
        degreesLatitude: input.latitude,
        degreesLongitude: input.longitude,
        name: input.name,
        address: input.address,
      },
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendContact(to: string, input: ContactInput): Promise<SendResult> {
    this.assertConnected()
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      contacts: {
        displayName: input.displayName,
        contacts: [{
          displayName: input.displayName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${input.displayName}\nTEL:${input.phoneNumber}\n${input.organization ? `ORG:${input.organization}\n` : ''}END:VCARD`,
        }],
      },
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<SendResult> {
    this.assertConnected()
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      react: { text: emoji, key: { id: messageId, remoteJid: normalizeJid(to), fromMe: false } },
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  // ─── Interactivos / Templates (no soportados en Baileys) ───

  async sendInteractive(): Promise<SendResult> {
    throw new Error('Baileys: mensajes interactivos no soportados. Usar Cloud API para botones, listas y CTA.')
  }

  async sendTemplate(): Promise<SendResult> {
    throw new Error('Baileys: templates no soportados. Usar Cloud API para plantillas.')
  }

  async sendFlow(): Promise<SendResult> {
    throw new Error('Baileys: WhatsApp Flows no soportados. Solo disponibles en Cloud API.')
  }

  // ─── Grupos (solo Baileys) ─────────────────────────────────

  async createGroup(name: string, participants: string[]): Promise<GroupResult> {
    this.assertConnected()
    const jids = participants.map(p => normalizeJid(p))
    const group = await (this.sock as any)?.groupCreate(name, jids)
    return {
      groupId: group?.id ?? '',
      name: group?.subject ?? name,
      participants: group?.participants?.map((p: any) => p.id) ?? jids,
    }
  }

  async addParticipants(groupId: string, participants: string[]): Promise<void> {
    this.assertConnected()
    const jids = participants.map(p => normalizeJid(p))
    await (this.sock as any)?.groupParticipantsUpdate(groupId, jids, 'add')
  }

  async removeParticipants(groupId: string, participants: string[]): Promise<void> {
    this.assertConnected()
    const jids = participants.map(p => normalizeJid(p))
    await (this.sock as any)?.groupParticipantsUpdate(groupId, jids, 'remove')
  }

  // ─── Utilidades ────────────────────────────────────────────

  /** Envía confirmación de lectura */
  async sendReadReceipt(to: string, messageIds: string[]): Promise<void> {
    this.assertConnected()
    const jid = normalizeJid(to)
    for (const id of messageIds) {
      await this.sock!.readMessages([{ remoteJid: jid, id }])
    }
  }

  /** Actualiza presencia (typing, recording, paused) */
  async sendPresence(to: string, type: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable'): Promise<void> {
    this.assertConnected()
    await this.sock!.sendPresenceUpdate(type, normalizeJid(to))
  }

  /** Crea y envía una encuesta (poll) */
  async sendPoll(to: string, title: string, options: string[], maxAnswers = 1): Promise<SendResult> {
    this.assertConnected()
    const msg = await this.sock!.sendMessage(normalizeJid(to), {
      poll: { name: title, values: options, selectableCount: maxAnswers },
    })
    return { messageId: msg?.key?.id ?? '', timestamp: new Date().toISOString() }
  }

  // ─── Eventos de entrada ────────────────────────────────────

  onInbound(handler: (msg: InboundMessage) => void): void {
    this.emitter.on('inbound', handler)
  }

  onEvent(handler: (event: ChannelEvent) => void): void {
    this.emitter.on('event', handler)
  }

  // ─── Privados ──────────────────────────────────────────────

  private assertConnected(): void {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('Baileys: canal no conectado. Ejecutar connect() primero.')
    }
  }

  private async resolveMedia(input: { url?: string; filePath?: string; buffer?: Buffer }): Promise<Buffer | { url: string }> {
    if (input.buffer) return input.buffer
    if (input.filePath) {
      const { readFileSync } = await import('node:fs')
      return readFileSync(input.filePath)
    }
    if (input.url) return { url: input.url }
    throw new Error('Media input debe tener url, filePath o buffer')
  }

  private setupMessageListener(): void {
    this.sock!.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue // ignorar mensajes propios
        const content = msg.message
        if (!content) continue

        const from = msg.key.remoteJid?.split('@')[0] ?? 'unknown'
        const inbound: InboundMessage = {
          tenantId: this.tenantId,
          channelId: `${this.tenantId}:${this.sock!.user!.id}`,
          channelType: 'baileys',
          from,
          contactName: msg.pushName ?? undefined,
          timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
          type: classifyMessage(content),
          text: extractText(content),
          raw: msg,
        }

        // Media info
        if (content.imageMessage) {
          inbound.media = { mimeType: content.imageMessage.mimetype ?? undefined, caption: content.imageMessage.caption ?? undefined }
        } else if (content.videoMessage) {
          inbound.media = { mimeType: content.videoMessage.mimetype ?? undefined, caption: content.videoMessage.caption ?? undefined }
        } else if (content.audioMessage) {
          inbound.media = { mimeType: content.audioMessage.mimetype ?? undefined }
        } else if (content.documentMessage) {
          inbound.media = { mimeType: content.documentMessage.mimetype ?? undefined, filename: content.documentMessage.fileName ?? undefined }
        } else if (content.locationMessage) {
          inbound.location = {
            latitude: content.locationMessage.degreesLatitude ?? 0,
            longitude: content.locationMessage.degreesLongitude ?? 0,
            name: content.locationMessage.name ?? undefined,
          }
        } else if (content.reactionMessage) {
          inbound.reaction = {
            messageId: content.reactionMessage.key?.id ?? '',
            emoji: content.reactionMessage.text ?? '',
          }
        }

        this.emitter.emit('inbound', inbound)
      }
    })
  }

  private setupEvents(): void {
    this.sock!.ev.on('connection.update', ({ connection, qr }) => {
      if (qr) {
        this.emitEvent({ type: 'qr', qr })
      }
      if (connection === 'open') {
        this.emitEvent({ type: 'status_change', status: 'connected' })
      }
      if (connection === 'close') {
        this.emitEvent({ type: 'status_change', status: 'disconnected' })
      }
    })
  }

  private emitEvent(evt: Omit<ChannelEvent, 'tenantId' | 'channelId' | 'channelType' | 'timestamp'>): void {
    this.emitter.emit('event', {
      ...evt,
      tenantId: this.tenantId,
      channelId: `${this.tenantId}:baileys`,
      channelType: 'baileys',
      timestamp: new Date().toISOString(),
    } as ChannelEvent)
  }
}
