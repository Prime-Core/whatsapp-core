/**
 * Registro de canales (factory).
 *
 * Cada tenant puede tener uno o más canales (Baileys + Cloud API).
 * El registry gestiona el ciclo de vida: crear, conectar, desconectar, destruir.
 */

import { EventEmitter } from 'node:events'
import { BaileysChannelAdapter } from './baileys/adapter.js'
import { CloudApiChannelAdapter } from './cloud-api/adapter.js'
import type {
  ChannelAdapter, ChannelType, ChannelStatus,
  ConnectInput, InboundMessage, ChannelEvent,
} from '../types/channel.js'

export interface ChannelEntry {
  adapter: ChannelAdapter
  status: ChannelStatus
  createdAt: string
}

export interface ChannelRegistryOptions {
  /** Directorio base para auth de Baileys */
  authBaseDir?: string
}

export class ChannelRegistry {
  private channels = new Map<string, ChannelEntry>()
  private emitter = new EventEmitter()
  private authBaseDir: string

  constructor(options: ChannelRegistryOptions = {}) {
    this.authBaseDir = options.authBaseDir ?? './auth'
  }

  /** Crea un canal sin conectar */
  create(tenantId: string, type: ChannelType, channelId?: string): ChannelAdapter {
    const id = channelId ?? `${tenantId}:${type}`

    if (this.channels.has(id)) {
      throw new Error(`Canal ${id} ya existe. Usar connect() o eliminar primero.`)
    }

    let adapter: ChannelAdapter
    if (type === 'baileys') {
      adapter = new BaileysChannelAdapter(tenantId, `${this.authBaseDir}/baileys/${tenantId}`)
    } else {
      adapter = new CloudApiChannelAdapter(tenantId)
    }

    this.channels.set(id, { adapter, status: 'disconnected', createdAt: new Date().toISOString() })

    // Retransmitir eventos
    adapter.onEvent?.((evt) => {
      this.emitter.emit('event', evt)
    })

    return adapter
  }

  /** Obtiene o crea un canal */
  getOrCreate(tenantId: string, type: ChannelType, channelId?: string): ChannelAdapter {
    const id = channelId ?? `${tenantId}:${type}`
    const existing = this.channels.get(id)
    if (existing) return existing.adapter
    return this.create(tenantId, type, id)
  }

  /** Conecta un canal existente */
  async connect(channelId: string, input?: ConnectInput): Promise<ChannelAdapter> {
    const entry = this.channels.get(channelId)
    if (!entry) throw new Error(`Canal ${channelId} no encontrado. Usar create() primero.`)

    entry.status = 'connecting'
    await entry.adapter.connect(input)
    entry.status = entry.adapter.getStatus()

    // Retransmitir inbound
    entry.adapter.onInbound((msg) => {
      this.emitter.emit('inbound', msg)
    })

    return entry.adapter
  }

  /** Desconecta un canal */
  async disconnect(channelId: string): Promise<void> {
    const entry = this.channels.get(channelId)
    if (!entry) return
    await entry.adapter.disconnect()
    entry.status = entry.adapter.getStatus()
  }

  /** Elimina (disconnect + remove) un canal */
  async destroy(channelId: string): Promise<void> {
    await this.disconnect(channelId)
    this.channels.delete(channelId)
  }

  /** Desconecta y elimina todos los canales */
  async destroyAll(): Promise<void> {
    for (const [id] of this.channels) {
      await this.destroy(id)
    }
  }

  /** Obtener un canal por ID */
  get(channelId: string): ChannelAdapter | undefined {
    return this.channels.get(channelId)?.adapter
  }

  /** Listar todos los canales con su estado */
  list(): Array<{ id: string; type: ChannelType; status: ChannelStatus }> {
    return [...this.channels.entries()].map(([id, entry]) => ({
      id,
      type: entry.adapter.type,
      status: entry.adapter.getStatus(),
    }))
  }

  /** Obtener todos los canales de un tenant */
  listByTenant(tenantId: string): Array<{ id: string; type: ChannelType; status: ChannelStatus }> {
    return this.list().filter(c => c.id.startsWith(tenantId))
  }

  /** Escuchar mensajes entrantes de cualquier canal */
  onInbound(handler: (msg: InboundMessage) => void): void {
    this.emitter.on('inbound', handler)
  }

  /** Escuchar eventos de cualquier canal */
  onEvent(handler: (event: ChannelEvent) => void): void {
    this.emitter.on('event', handler)
  }
}
