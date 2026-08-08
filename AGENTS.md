# AGENTS.md — whatsapp-core

> **Stack:** TypeScript + Node.js · **Librería:** @whiskeysockets/baileys v7
> **Runtime:** Node.js >= 18 · **Package manager:** npm

## Propósito

API multichannel para mensajería WhatsApp de PrimeCore. Arquitectura de canales:
- `channels/baileys/` → Conexión directa WebSocket (sin navegador)
- `channels/cloud-api/` → WhatsApp Cloud API (Meta)

Reemplaza al legacy `api-whtsapp` (whatsapp-web.js + Puppeteer) manteniendo compatibilidad de endpoints y respuestas JSON.

## Estructura del proyecto

```
whatsapp-core/
├── src/
│   ├── index.ts              ← Entry point, servidor Express
│   ├── channels/
│   │   ├── baileys/
│   │   │   └── adapter.ts    ← Adapter Baileys (WebSocket)
│   │   └── cloud-api/
│   │       └── adapter.ts    ← Adapter Cloud API (REST)
│   └── types/
│       └── channel.ts        ← Interfaces de canal
├── skills/                   ← Documentación de desarrollo
├── tasks/                    ← Seguimiento de tareas
└── package.json
```

## Comandos

```bash
npm install          # Instalar dependencias
npm run dev          # Desarrollo con hot-reload (tsx --watch)
npm run build        # Compilar TypeScript
npm run typecheck    # Verificar tipos sin compilar
```

## Endpoints (compatibilidad con api-whtsapp v1.0.0)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/status` | Estado del servicio + sesión |
| GET | `/api/qr` | QR como PNG |
| GET | `/api/qr/html` | QR como HTML |
| POST | `/api/session/clear` | Limpiar sesión |
| GET | `/api/client/info` | Info del cliente |
| POST | `/api/messages/send` | Enviar mensaje |
| POST | `/api/messages/broadcast` | Broadcast |
| GET | `/api/chats` | Listar chats |
| GET | `/api/contacts` | Listar contactos |
| GET | `/api-docs` | Swagger UI |

## Convenciones

1. **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`)
2. **Formato:** Prettier (TypeScript)
3. **Nombres:** kebab-case para archivos, camelCase para funciones
4. **Tipado:** Strict TypeScript (`tsc --noEmit`)

## Reglas para agentes de IA

1. ⛔ NUNCA modificar `.env`, credenciales, o sesiones guardadas
2. ⛔ NUNCA cambiar las firmas JSON de los endpoints (rompe consumidores)
3. ✅ SIEMPRE mantener compatibilidad con el contrato del viejo api-whtsapp
4. ✅ SIEMPRE ejecutar `npm run typecheck` antes de commitear
5. ✅ Los endpoints deben responder en puerto `process.env.PORT || 8000`
