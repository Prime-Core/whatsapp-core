/**
 * whatsapp-core — Core de comunicación multi-canal con WhatsApp.
 *
 * Abstracción unificada sobre Baileys (tier inicial/personal)
 * y Cloud API (tier empresarial). Multi-tenant, PostgreSQL nativo,
 * auth JWT propia, WebSocket propio para Realtime.
 *
 * @module whatsapp-core
 */

export { BaileysChannelAdapter } from './channels/baileys/adapter.js'
export { CloudApiChannelAdapter } from './channels/cloud-api/adapter.js'
export { ChannelRegistry } from './channels/index.js'
export type { ChannelEntry, ChannelRegistryOptions } from './channels/index.js'

export type {
  // Canal
  ChannelAdapter, ChannelType, ChannelStatus,
  ConnectInput, ConnectResult, SendResult,
  // Mensajes entrantes
  InboundMessage, InboundMessageType,
  // Eventos
  ChannelEvent, ChannelEventType,
  // Media
  ImageInput, VideoInput, AudioInput, DocumentInput,
  LocationInput, ContactInput,
  // Interactivos
  InteractiveInput, InteractiveButton, InteractiveListRow, InteractiveListSection,
  // Templates
  TemplateInput,
  // WhatsApp Flows
  FlowInput,
  // Grupos
  GroupResult,
} from './types/channel.js'
