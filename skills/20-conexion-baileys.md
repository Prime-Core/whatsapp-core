# Skill 20 — Conexión Baileys (QR)

Usar al implementar o depurar la conexión de un número personal por QR (tier inicial).

> ⚠️ Baileys viola los ToS de WhatsApp. Es solo para el tier inicial/personal. Antes de
> conectar, el cliente debe **aceptar explícitamente** la advertencia de riesgo (baneo posible).

## Flujo

### Core (gestor de sesiones)
1. Al recibir `POST /tenants/:tid/channels` con `{ type: 'baileys' }`, crear una sesión Baileys
   aislada por tenant+canal.
2. Generar el QR y exponerlo (base64) al frontend por respuesta y/o por el WebSocket del core
   (`channels:tenant:TID:status`).
3. Emitir cambios de estado: `qr` → `connecting` → `open` (activo) / `close`.
4. **Persistir credenciales de sesión** (auth state) cifradas para reconexión sin re-escanear.
   Nunca en logs, nunca en git.
5. Al `open`, guardar el canal en PostgreSQL (type=baileys, estado=active, jid).

### Recepción de mensajes
- Escuchar `messages.upsert` y normalizar al evento común del core (ver skill 30).
- Publicar al WebSocket del core para el inbox.

### Envío
- Mapear la interfaz `ChannelAdapter.sendText/sendMedia` a las llamadas de Baileys.
- Aplicar **rate limiting** conservador (evitar detección de spam): delays aleatorios, no
  ráfagas, priorizar respuestas a conversaciones iniciadas por el usuario.

## Reconexión y robustez

- Reintentos con backoff ante `close` que no sea logout.
- Si es logout (sesión inválida), marcar canal como `disconnected` y pedir re-escaneo.
- Heartbeat/estado visible en el panel.

## Buenas prácticas anti-baneo (mitigación, no garantía)

- Número dedicado/desechable, no el corporativo.
- Calentar el número gradualmente.
- Priorizar respuestas (no envíos masivos en frío).
- Delays aleatorios entre mensajes.

## Referencia

- Baileys: https://github.com/WhiskeySockets/Baileys
