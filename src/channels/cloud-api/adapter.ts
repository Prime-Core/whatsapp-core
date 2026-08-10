/**
 * ChannelAdapter para WhatsApp Cloud API (Meta Graph API).
 *
 * Capacidades:
 *   ✅ texto, imagen, video, audio, documento
 *   ✅ ubicación, contacto, reacción
 *   ✅ botones interactivos (button_reply)
 *   ✅ listas interactivas (list_message)
 *   ✅ CTA URL
 *   ✅ templates (plantillas aprobadas)
 *   ✅ WhatsApp Flows (formularios nativos)
 *   ✅ webhooks entrantes (verificación + eventos)
 *   ✅ oficial, sin riesgo de baneo
 *   ❌ grupos (no disponible en Cloud API)
 *   ❌ presencia (typing) en tiempo real (solo vía webhook de mensajes)
 */

import { EventEmitter } from 'node:events'
import type {
  ChannelAdapter, ChannelType, ChannelStatus,
  ConnectInput, ConnectResult, SendResult,
  InboundMessage, InboundMessageType, ChannelEvent,
  ImageInput, VideoInput, AudioInput, DocumentInput,
  LocationInput, ContactInput,
  InteractiveInput, TemplateInput, FlowInput,
} from '../../types/channel.js'

// ─── Constantes ──────────────────────────────────────────────────

const GRAPH_API_BASE = 'https://graph.facebook.com/v22.0'

const CAPABILITIES = {
  interactive: true,
  templates: true,
  flows: true,
  groups: false,
  reactions: true,
  polls: false,
  presence: false,
  readReceipts: true,
}

// ─── Adapter ─────────────────────────────────────────────────────

export class CloudApiChannelAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'cloud_api'
  readonly tenantId: string
  readonly capabilities = CAPABILITIES

  accessToken: string | null = null
  phoneNumberId: string | null = null
  private webhookVerifyToken: string | null = null
  private status: ChannelStatus = 'disconnected'
  private emitter = new EventEmitter()

  constructor(tenantId: string) {
    this.tenantId = tenantId
  }

  // ─── Ciclo de vida ──────────────────────────────────────────

  async connect(input?: ConnectInput): Promise<ConnectResult> {
    if (!input?.accessToken) throw new Error('Cloud API: accessToken requerido')
    if (!input?.phoneNumberId) throw new Error('Cloud API: phoneNumberId requerido')

    this.accessToken = input.accessToken
    this.phoneNumberId = input.phoneNumberId
    this.webhookVerifyToken = input.webhookVerifyToken ?? null
    this.status = 'connecting'

    // Verificar que las credenciales funcionan
    try {
      const resp = await this.graphGet(`/${this.phoneNumberId}`)
      const data = resp as any
      this.status = 'connected'
      this.emitEvent({ type: 'status_change', status: 'connected' })
      return {
        connected: true,
        channelId: `${this.tenantId}:${this.phoneNumberId}`,
        displayName: data?.verified_name ?? data?.display_phone_number ?? undefined,
      }
    } catch (e: any) {
      this.status = 'error'
      throw new Error(`Cloud API: error al conectar — ${e.message}`)
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = null
    this.phoneNumberId = null
    this.status = 'disconnected'
    this.emitEvent({ type: 'status_change', status: 'disconnected' })
  }

  getStatus(): ChannelStatus {
    return this.status
  }

  // ─── Envío de mensajes ─────────────────────────────────────

  async sendText(to: string, text: string): Promise<SendResult> {
    this.assertConnected()
    return this.sendApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    })
  }

  async sendImage(to: string, input: ImageInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveCloudApiMedia(input, 'image')
    return this.sendApi(media)
  }

  async sendVideo(to: string, input: VideoInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveCloudApiMedia(input, 'video')
    return this.sendApi(media)
  }

  async sendAudio(to: string, input: AudioInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveCloudApiMedia(input, 'audio')
    return this.sendApi(media)
  }

  async sendDocument(to: string, input: DocumentInput): Promise<SendResult> {
    this.assertConnected()
    const media = await this.resolveCloudApiMedia(input, 'document', input.filename)
    return this.sendApi(media)
  }

  async sendLocation(to: string, input: LocationInput): Promise<SendResult> {
    this.assertConnected()
    return this.sendApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location: {
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        name: input.name,
        address: input.address,
      },
    })
  }

  async sendContact(to: string, input: ContactInput): Promise<SendResult> {
    this.assertConnected()
    return this.sendApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'contacts',
      contacts: [{
        name: { formatted_name: input.displayName },
        phones: [{ phone: input.phoneNumber }],
      }],
    } as any)
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<SendResult> {
    this.assertConnected()
    return this.sendApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    })
  }

  // ─── Interactivos ──────────────────────────────────────────

  async sendInteractive(to: string, input: InteractiveInput): Promise<SendResult> {
    this.assertConnected()
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: input.type === 'list' ? 'list' : 'button',
        body: { text: input.body },
      },
    }

    if (input.header) {
      const header: any = { type: input.header.type }
      if (input.header.type === 'text') header.text = input.header.text
      else header[input.header.type] = { id: input.header.url }
      payload.interactive.header = header
    }

    if (input.footer) {
      payload.interactive.footer = { text: input.footer }
    }

    if (input.type === 'button' && input.buttons) {
      const buttons = input.buttons.slice(0, 3).map((b, i) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.substring(0, 20) },
      }))
      payload.interactive.action = { buttons }
    } else if (input.type === 'list' && input.sections) {
      payload.interactive.action = {
        button: input.listButtonText ?? 'Ver opciones',
        sections: input.sections.map(s => ({
          title: s.title,
          rows: s.rows.map(r => ({ id: r.id, title: r.title.substring(0, 24), description: r.description })),
        })),
      }
    } else if (input.type === 'cta_url' && input.ctaUrl) {
      payload.interactive.action = {
        name: 'cta_url',
        parameters: { display_text: input.ctaDisplayText ?? 'Abrir', url: input.ctaUrl },
      }
    } else if (input.type === 'flow' && input.flowId) {
      payload.interactive.action = {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: input.flowToken!,
          flow_id: input.flowId,
          flow_action: 'navigate',
          flow_action_payload: { screen: input.flowScreen ?? 'MAIN', data: input.flowToken ? {} : undefined },
        },
      }
    }

    return this.sendApi(payload)
  }

  async sendTemplate(to: string, template: TemplateInput): Promise<SendResult> {
    this.assertConnected()
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
      },
    }

    if (template.bodyParams) {
      payload.template.components = [
        {
          type: 'body',
          parameters: template.bodyParams.map(p => ({ type: 'text', text: p })),
        },
      ]
    }

    if (template.headerParams) {
      payload.template.components ??= []
      payload.template.components.push({
        type: 'header',
        parameters: template.headerParams.map(p => ({ type: 'text', text: p })),
      })
    }

    return this.sendApi(payload)
  }

  async sendFlow(to: string, input: FlowInput): Promise<SendResult> {
    this.assertConnected()
    return this.sendInteractive(to, {
      type: 'flow',
      body: input.body ?? 'Completá el formulario',
      flowId: input.flowId,
      flowToken: input.token,
      flowScreen: input.screen,
    })
  }

  // ─── Utilidades Cloud API ──────────────────────────────────

  /** Envía confirmación de lectura */
  async sendReadReceipt(to: string, messageId: string): Promise<void> {
    this.assertConnected()
    await this.graphPost(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    })
  }

  /**
   * Verifica un webhook de Meta (GET para suscripción).
   * Usar en el endpoint de webhook para validar el hub challenge.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      return challenge
    }
    return null
  }

  /**
   * Procesa el cuerpo de un webhook POST de Meta y emite InboundMessage.
   */
  handleWebhook(body: any): void {
    const entries = body?.entry ?? []
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value?.messages) continue

        for (const msg of value.messages) {
          const inbound = this.parseWebhookMessage(msg, value)
          if (inbound) this.emitter.emit('inbound', inbound)
        }
      }
    }
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
    if (!this.accessToken || !this.phoneNumberId || this.status !== 'connected') {
      throw new Error('Cloud API: canal no conectado. Ejecutar connect() con accessToken y phoneNumberId.')
    }
  }

  private async graphGet(path: string): Promise<unknown> {
    const url = `${GRAPH_API_BASE}${path}`
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(`Cloud API error ${resp.status}: ${JSON.stringify(err)}`)
    }
    return resp.json()
  }

  private async graphPost(path: string, body: unknown): Promise<any> {
    const url = `${GRAPH_API_BASE}${path}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    if (!resp.ok) {
      throw new Error(`Cloud API error ${resp.status}: ${JSON.stringify(data)}`)
    }
    return data
  }

  private async sendApi(message: any): Promise<SendResult> {
    const data = await this.graphPost(`/${this.phoneNumberId}/messages`, message)
    return {
      messageId: data?.messages?.[0]?.id ?? data?.wamid ?? '',
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Sube media a Meta usando el Media API y devuelve el payload.
   */
  private async resolveCloudApiMedia(
    input: { url?: string; filePath?: string; buffer?: Buffer; mimeType?: string; caption?: string },
    type: 'image' | 'video' | 'audio' | 'document',
    filename?: string,
  ): Promise<any> {
    let mediaId: string

    if (input.url) {
      // Media por URL
      const resp = await this.graphPost(`/${this.phoneNumberId}/media`, {
        messaging_product: 'whatsapp',
        type: input.mimeType ?? this.defaultMime(type),
        url: input.url,
      })
      mediaId = resp?.id
    } else {
      // Media por archivo local o buffer
      let fileBuffer: Buffer
      if (input.buffer) fileBuffer = input.buffer
      else if (input.filePath) {
        const { readFileSync } = await import('node:fs')
        fileBuffer = readFileSync(input.filePath)
      } else {
        throw new Error('Cloud API media: se requiere url, filePath o buffer')
      }

      const formData = new FormData()
      formData.append('messaging_product', 'whatsapp')
      formData.append('type', input.mimeType ?? this.defaultMime(type))
      formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: input.mimeType }), filename ?? 'file')

      const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/media`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: formData as any,
      })
      const data = await resp.json() as any
      if (!resp.ok) throw new Error(`Cloud API media upload error ${resp.status}: ${JSON.stringify(data)}`)
      mediaId = data?.id
    }

    if (!mediaId) throw new Error('Cloud API: no se pudo subir el media')

    const msg: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      type,
      [type]: { id: mediaId },
    }

    if (input.caption) {
      msg[type].caption = input.caption
    }

    if (filename && type === 'document') {
      msg[type].filename = filename
    }

    return msg
  }

  private defaultMime(type: string): string {
    const map: Record<string, string> = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: 'audio/mp4',
      document: 'application/pdf',
    }
    return map[type] ?? 'application/octet-stream'
  }

  // ─── Parseo de webhooks ────────────────────────────────────

  private parseWebhookMessage(msg: any, value: any): InboundMessage | null {
    const typeMap: Record<string, InboundMessageType> = {
      text: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      document: 'document',
      location: 'location',
      contacts: 'contact',
      reaction: 'reaction',
      interactive: 'interactive',
      button: 'button_reply',
      order: 'order',
    }

    const inbound: InboundMessage = {
      tenantId: this.tenantId,
      channelId: `${this.tenantId}:${this.phoneNumberId}`,
      channelType: 'cloud_api',
      from: msg.from,
      timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
      type: typeMap[msg.type] ?? 'unknown',
      raw: msg,
    }

    if (msg.type === 'text') {
      inbound.text = msg.text?.body
    } else if (['image', 'video', 'audio', 'document'].includes(msg.type)) {
      const m = msg[msg.type]
      inbound.media = {
        url: m?.id ? `${GRAPH_API_BASE}/${m.id}` : undefined,
        mimeType: m?.mime_type,
        caption: m?.caption,
        filename: m?.filename,
      }
    } else if (msg.type === 'location') {
      inbound.location = {
        latitude: Number(msg.location?.latitude),
        longitude: Number(msg.location?.longitude),
        name: msg.location?.name,
        address: msg.location?.address,
      }
    } else if (msg.type === 'reaction') {
      inbound.reaction = {
        messageId: msg.reaction?.message_id,
        emoji: msg.reaction?.emoji,
      }
    } else if (msg.type === 'interactive') {
      const ir = msg.interactive
      if (ir?.button_reply) {
        inbound.type = 'button_reply'
        inbound.interactive = { id: ir.button_reply.id, title: ir.button_reply.title }
      } else if (ir?.list_reply) {
        inbound.type = 'list_reply'
        inbound.interactive = { id: ir.list_reply.id, title: ir.list_reply.title, description: ir.list_reply.description }
      }
    }

    return inbound
  }

  // ─── Eventos de canal ──────────────────────────────────────

  private emitEvent(evt: Omit<ChannelEvent, 'tenantId' | 'channelId' | 'channelType' | 'timestamp'>): void {
    this.emitter.emit('event', {
      ...evt,
      tenantId: this.tenantId,
      channelId: `${this.tenantId}:${this.phoneNumberId}`,
      channelType: 'cloud_api',
      timestamp: new Date().toISOString(),
    } as ChannelEvent)
  }
}
