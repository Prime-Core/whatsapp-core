# Skill 30 — Agregar un adaptador de canal

Usar al crear un canal nuevo o modificar la abstracción común.

## Principio

El resto del sistema (motor de eventos, automatizaciones, inbox) **no debe saber** qué canal
hay detrás. Toda diferencia se encapsula en `channels/<nombre>/`.

## Interfaz común

Todo adaptador implementa `ChannelAdapter`:

```ts
interface ChannelAdapter {
  readonly type: 'cloud_api' | 'baileys';
  connect(input: ConnectInput): Promise<ConnectResult>;   // QR o redirect/params
  disconnect(): Promise<void>;
  getStatus(): Promise<ChannelStatus>;

  sendText(to: string, text: string): Promise<SendResult>;
  sendMedia(to: string, media: MediaInput): Promise<SendResult>;
  sendTemplate?(to: string, template: TemplateInput): Promise<SendResult>;    // solo Cloud API
  sendInteractive?(to: string, payload: InteractiveInput): Promise<SendResult>;

  // Entrada: cada adaptador normaliza a InboundMessage y lo emite al motor de eventos.
  onInbound(handler: (msg: InboundMessage) => void): void;
}
```

## Normalización de entrada

Todo mensaje entrante se convierte a `InboundMessage`:

```ts
interface InboundMessage {
  tenantId: string;
  channelId: string;
  channelType: 'cloud_api' | 'baileys';
  from: string;          // número/jid normalizado a E.164
  contactName?: string;
  timestamp: string;     // ISO
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'interactive' | 'unknown';
  text?: string;
  media?: { url?: string; mimeType?: string; caption?: string };
  raw: unknown;          // payload original por si se necesita
}
```

## Pasos para un canal nuevo

1. Crear `channels/<nombre>/adapter.ts` implementando `ChannelAdapter`.
2. Registrarlo en el factory `channels/index.ts`.
3. Mapear entrada → `InboundMessage`.
4. Añadir su tipo a las enums (`ChannelType`).
5. Documentar límites y capacidades (¿soporta plantillas? ¿interactivos?).
6. Tests del adaptador con payloads reales de ejemplo.
