---
description: Project patterns for whatsapp-core. Use when adding or modifying channel adapters (Baileys/Cloud API), extending the ChannelAdapter contract, or adding a new channel type.
mode: subagent
---

# Project Patterns — whatsapp-core

Documented patterns and conventions for this codebase.

## 1. Channel Adapter Pattern (core abstraction)

The business layer must never know whether Cloud API or Baileys is behind a channel.
Every channel is a class implementing the `ChannelAdapter` interface
(`src/types/channel.ts`), and is registered via `ChannelRegistry` (`src/channels/index.ts`).

```ts
export interface ChannelAdapter {
  readonly type: ChannelType          // 'cloud_api' | 'baileys'
  readonly tenantId: string
  connect(input?: ConnectInput): Promise<ConnectResult>
  disconnect(): Promise<void>
  getStatus(): ChannelStatus
  sendText(to: string, text: string): Promise<SendResult>
  sendImage(to: string, input: ImageInput): Promise<SendResult>
  // ... sendVideo/Audio/Document/Location/Contact/Reaction
  sendInteractive?(to: string, input: InteractiveInput): Promise<SendResult>  // Cloud API only
  sendTemplate?(to: string, template: TemplateInput): Promise<SendResult>     // Cloud API only
  sendFlow?(to: string, input: FlowInput): Promise<SendResult>                // Cloud API only
  createGroup?(name: string, participants: string[]): Promise<GroupResult>    // Baileys only
  onInbound(handler: (msg: InboundMessage) => void): void
  onEvent?(handler: (event: ChannelEvent) => void): void
}
```

**Rules:**
- Capabilities matrix per adapter (see `CAPABILITIES` const in each adapter) declares what is supported; unsupported methods throw a descriptive error (e.g. Baileys `sendInteractive` throws "use Cloud API").
- Media inputs accept `url | filePath | buffer` (`MediaBase`) and each adapter resolves them (`resolveMedia` in Baileys, download in Cloud API).
- Inbound messages are normalized to `InboundMessage` with `raw` preserving the original payload.
- Channel lifecycle statuses: `disconnected | connecting | connected | error`.
- Baileys JIDs are normalized with `normalizeJid()` (strip `+`, append `@s.whatsapp.net`).

**When to use:** creating a new channel adapter, modifying the `ChannelAdapter` interface, or debugging send/receive flows. Follow the SOP `skills/30-agregar-canal.md`.

## 2. Registry / Factory Pattern

`ChannelRegistry` owns the lifecycle of all channels for all tenants:

```ts
registry.create(tenantId, 'baileys')            // no connection yet
registry.connect('tenant:baileys')              // triggers QR/auth
registry.onInbound((msg) => ...)                // any channel
registry.onEvent((evt) => ...)                  // qr/status/error/disconnected
registry.destroyAll()
```

**Rules:**
- Channels are keyed by `${tenantId}:${type}` (or custom id)
- Creating a duplicate id throws; use `getOrCreate` for idempotent access
- The registry re-emits adapter events and inbound messages on its own EventEmitter

## 3. Convention Notes

- ESM with `.js` extension in relative imports (`from '../../types/channel.js'`)
- `EventEmitter` from `node:events` for event fan-out
- pino for logging; `pino({ level: 'silent' })` passed to Baileys internals
- Errors are Spanish-language with the channel prefix, e.g. `Baileys: canal no conectado...`
