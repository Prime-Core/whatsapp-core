// ─── Tipos de canal ───────────────────────────────────────────────

export type ChannelType = 'cloud_api' | 'baileys'

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** Credenciales o parámetros para conectar un canal */
export interface ConnectInput {
  /** Cloud API: access token de Meta */
  accessToken?: string
  /** Cloud API: phone number ID */
  phoneNumberId?: string
  /** Cloud API: webhook verify token */
  webhookVerifyToken?: string
  /** Baileys: ruta al directorio de auth (credenciales) */
  authDir?: string
  /** Baileys: fuerza QR aunque haya credenciales previas */
  forceQr?: boolean
}

export interface ConnectResult {
  connected: boolean
  /** Baileys: QR para escanear (solo si forceQr o primer login) */
  qr?: string
  /** ID interno del canal tras conectar */
  channelId?: string
  /** Nombre/display del número */
  displayName?: string
}

export interface SendResult {
  /** ID del mensaje asignado por el canal */
  messageId: string
  /** Timestamp del envío (ISO) */
  timestamp: string
  /** Cloud API: ID de contacto del destinatario */
  recipientId?: string
}

// ─── Canal unificado (ChannelAdapter) ────────────────────────────

export interface ChannelAdapter {
  readonly type: ChannelType
  readonly tenantId: string

  // Ciclo de vida
  connect(input?: ConnectInput): Promise<ConnectResult>
  disconnect(): Promise<void>
  getStatus(): ChannelStatus

  // Envío de mensajes
  sendText(to: string, text: string): Promise<SendResult>
  sendImage(to: string, input: ImageInput): Promise<SendResult>
  sendVideo(to: string, input: VideoInput): Promise<SendResult>
  sendAudio(to: string, input: AudioInput): Promise<SendResult>
  sendDocument(to: string, input: DocumentInput): Promise<SendResult>
  sendLocation(to: string, input: LocationInput): Promise<SendResult>
  sendContact(to: string, input: ContactInput): Promise<SendResult>
  sendReaction(to: string, messageId: string, emoji: string): Promise<SendResult>

  // Interactivos (solo Cloud API, Baileys lanza error)
  sendInteractive?(to: string, input: InteractiveInput): Promise<SendResult>
  sendTemplate?(to: string, template: TemplateInput): Promise<SendResult>
  // Solo Cloud API: inicia un WhatsApp Flow (formulario nativo)
  sendFlow?(to: string, input: FlowInput): Promise<SendResult>

  // Solo Baileys: operaciones de grupo
  createGroup?(name: string, participants: string[]): Promise<GroupResult>
  addParticipants?(groupId: string, participants: string[]): Promise<void>
  removeParticipants?(groupId: string, participants: string[]): Promise<void>

  // Entrada: cada adaptador normaliza y emite InboundMessage
  onInbound(handler: (msg: InboundMessage) => void): void
  onEvent?(handler: (event: ChannelEvent) => void): void
}

// ─── Entrada de mensajes ────────────────────────────────────────

export type InboundMessageType = 'text' | 'image' | 'video' | 'audio' | 'document'
  | 'location' | 'contact' | 'reaction' | 'interactive' | 'button_reply'
  | 'list_reply' | 'order' | 'unknown'

export interface InboundMessage {
  tenantId: string
  channelId: string
  channelType: ChannelType
  from: string
  contactName?: string
  timestamp: string
  type: InboundMessageType
  text?: string
  media?: {
    url?: string
    mimeType?: string
    caption?: string
    filename?: string
  }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  contact?: { displayName: string; vcard?: string }
  reaction?: { messageId: string; emoji: string }
  interactive?: { id: string; title?: string; description?: string }
  /** Payload original sin procesar */
  raw: unknown
}

// ─── Eventos de canal ───────────────────────────────────────────

export type ChannelEventType = 'status_change' | 'qr' | 'error' | 'disconnected'

export interface ChannelEvent {
  tenantId: string
  channelId: string
  channelType: ChannelType
  type: ChannelEventType
  timestamp: string
  /** QR en base64/string para mostrar */
  qr?: string
  /** Status previo/actual */
  status?: ChannelStatus
  /** Mensaje de error */
  error?: string
}

// ─── Input de media ─────────────────────────────────────────────

export interface MediaBase {
  /** URL pública del archivo (HTTP/HTTPS) */
  url?: string
  /** Ruta local al archivo */
  filePath?: string
  /** Buffer con el contenido */
  buffer?: Buffer
  /** MIME type */
  mimeType?: string
  /** Texto adjunto (caption) */
  caption?: string
}

export interface ImageInput extends MediaBase {}
export interface VideoInput extends MediaBase {
  /** GIF playback */
  gifPlayback?: boolean
}
export interface AudioInput extends MediaBase {
  /** Push-to-talk */
  ptt?: boolean
}
export interface DocumentInput extends MediaBase {
  filename?: string
}

export interface LocationInput {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ContactInput {
  displayName: string
  phoneNumber: string
  organization?: string
}

// ─── Mensajes interactivos (Cloud API) ──────────────────────────

export interface InteractiveButton {
  id: string
  title: string
}

export interface InteractiveListRow {
  id: string
  title: string
  description?: string
}

export interface InteractiveListSection {
  title?: string
  rows: InteractiveListRow[]
}

export interface InteractiveInput {
  /** Texto del body */
  body: string
  /** Texto del footer */
  footer?: string
  /** Header opcional */
  header?: {
    type: 'text' | 'image' | 'video' | 'document'
    text?: string
    url?: string
  }
  /** Tipo de interactivo */
  type: 'button' | 'list' | 'cta_url' | 'flow'
  /** Botones (type=button): máx 3 */
  buttons?: InteractiveButton[]
  /** Lista de selección (type=list) */
  sections?: InteractiveListSection[]
  /** Texto del botón de lista */
  listButtonText?: string
  /** CTA URL (type=cta_url) */
  ctaUrl?: string
  ctaDisplayText?: string
  /** WhatsApp Flow (type=flow) */
  flowId?: string
  flowToken?: string
  flowScreen?: string
}

// ─── Templates (Cloud API) ──────────────────────────────────────

export interface TemplateInput {
  /** Nombre de la plantilla aprobada en Meta */
  name: string
  /** Idioma (locale) */
  language: string
  /** Parámetros de cuerpo */
  bodyParams?: string[]
  /** Parámetros de header */
  headerParams?: string[]
  /** Botones rápidos */
  buttons?: Array<{
    type: 'quick_reply' | 'url'
    text?: string
    url?: string
  }>
}

// ─── WhatsApp Flow (Cloud API) ───────────────────────────────────

export interface FlowInput {
  /** ID del Flow en Meta */
  flowId: string
  /** Token único para esta sesión del flow */
  token: string
  /** Pantalla inicial */
  screen?: string
  /** Datos adicionales para el flow */
  data?: Record<string, unknown>
  /** Texto del body */
  body?: string
  /** Texto del botón */
  buttonText?: string
}

// ─── Grupos (Baileys) ───────────────────────────────────────────

export interface GroupResult {
  groupId: string
  name: string
  participants: string[]
}
