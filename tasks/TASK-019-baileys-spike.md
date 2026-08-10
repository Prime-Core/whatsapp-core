# TASK-019 — Spike: chat funcional vía Baileys (número personal)

Fase: 3 · Estado: 🟨 · Tipo: **spike/validación** (código desechable, aislado)

## Objetivo

Salir rápido con un **chat funcional** conectando un número personal por QR, y **validar qué se
puede hacer** con Baileys antes de invertir en la vía oficial. No compromete la arquitectura final.

> ⚠️ Usar un **número desechable/dedicado**, nunca el personal/corporativo (riesgo de baneo ToS).

## Alcance

- Proyecto aislado en `spikes/baileys/` (no toca el monorepo aún).
- Conexión por QR con persistencia de sesión local (`./auth`, ignorada por git).
- Recepción de mensajes entrantes (log en consola).
- **Eco de prueba:** al recibir `ping` responde `pong`.
- **Matriz de capacidades** (llenar durante el spike): ver abajo.

## Checklist

- [ ] Proyecto ejecuta y muestra QR en terminal.
- [ ] Se escanea y la sesión queda `open`.
- [ ] Se reciben mensajes entrantes (log).
- [ ] `ping` → `pong` funciona.
- [ ] Reconexión automática (salvo logout) verificada.
- [ ] Matriz de capacidades completada.

## Matriz de capacidades a validar

| Capacidad | ¿Baileys? | Nota vs Cloud API (futuro) |
|---|---|---|
| Enviar/recibir texto | ⬜ | Cloud API sí |
| Media (imagen/audio/video/doc) | ⬜ | Cloud API sí |
| Grupos (leer/enviar) | ⬜ | Cloud API **no** |
| Reacciones | ⬜ | limitado en Cloud API |
| Recibos de lectura/entrega | ⬜ | Cloud API sí |
| Presencia (typing/online) | ⬜ | limitado |
| Botones/listas interactivas | ⬜ | Cloud API sí (nativo) |

## Verificación

- `npm install` y `npm start` en `spikes/baileys/`.
- Escanear QR con el número desechable → enviar `ping` desde otro teléfono → recibir `pong`.

## Fuera de alcance (van en TASK-020/021/022)

- Multi-tenant, persistencia de sesión **cifrada** productiva, rate limiting/anti-baneo,
  integración con el core/REST y WebSocket. Aquí solo validamos capacidades.
