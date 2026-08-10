# Plan Maestro — whatsapp-core

Última actualización: 2026-07-09 · Estado global: **Fase 0 (Gobernanza y planificación)**

## 1. Visión

Ser un **canal de integración "llave en mano" para WhatsApp**. El usuario final pide una
solución para su negocio y nosotros la resolvemos: conectamos su WhatsApp, automatizamos su
operación y le damos un panel para gestionarlo, **sin que pierda el control de su número**.

Dos públicos, un mismo producto:

- **Usuarios iniciales:** quieren automatizar de forma sencilla con su propio número. Entran por
  el tier **Baileys** (conexión por QR, pago directo a nosotros por el servicio).
- **Empresas:** quieren operar en serio, con pagos contra Meta y sin riesgo de baneo. Entran por
  el tier **Cloud API oficial** (Embedded Signup, dueñas de su WABA, pagan a Meta directamente).

> Somos integradores: cobramos **anualidad por el servicio**, nunca por mensaje.

## 2. Principios

- El **Core** es la única fuente de verdad. Frontend y SDKs solo consumen su REST.
- **Abstracción de canal**: el negocio no sabe si detrás está Cloud API o Baileys.
- **Multi-tenant** desde el día uno (aislamiento por `tenant_id` + RLS).
- Seguridad primero: secretos fuera del código, tokens cifrados, webhooks firmados.
- Iterar por **tareas pequeñas**; no salirse de este plan.

## 3. Arquitectura (alto nivel)

```
                    ┌───────────────────────────────────────────┐
   Frontend (SaaS)  │  Panel multi-tenant (React) — lo integra    │
   ───────────────► │  el cliente, se conecta al Core vía REST     │
                    └───────────────────────────────────────────┘
                                     │ REST + Realtime
                                     ▼
   SDK TS  ─┐        ┌───────────────────────────────────────────┐
   SDK Py  ─┼──────► │                 CORE (TypeScript)           │
            │        │  API REST · Webhooks · Auth(JWT) · Realtime │
            │        │  Motor de eventos                           │
            │        │                                             │
            │        │  channels/                                  │
            │        │    ├── cloud-api/   (Graph API de Meta)     │
            │        │    └── baileys/     (sesiones QR)           │
            │        │  billing/gateways/ (Stripe·PagoPlux·        │
            │        │            Kushki·DeUna)                    │
            │        │  onboarding/  automations/                  │
            │        └───────────────────────────────────────────┘
                                     │
                    ┌────────────────┼───────────────────┐
                    ▼                ▼                    ▼
             PostgreSQL         Meta Graph API      Pasarelas de pago
        (datos + RLS nativo)  (Cloud API+webhooks)  Stripe·PagoPlux·
                                                    Kushki·DeUna
```

### Componentes

- **Core (TypeScript/Node):** API REST para frontend y SDKs, ingesta de webhooks de Meta,
  gestor de sesiones Baileys, motor de automatizaciones, onboarding, facturación, **auth propia
  (JWT) y realtime propio (WebSocket)**.
- **channels/**: adaptadores aislados. Interfaz común `ChannelAdapter`
  (`sendText`, `sendMedia`, `sendTemplate`, `sendInteractive`, `getStatus`, ...).
- **billing/gateways/**: adaptadores de pago aislados. Interfaz común `PaymentGateway`
  (`createCheckout`, `handleWebhook`, `getSubscription`, `cancel`) — Stripe, PagoPlux, Kushki, DeUna.
- **Datos (PostgreSQL puro):** Postgres accedido por `DATABASE_URL` con RLS nativo. Nada de
  Supabase. Media en Storage propio (disco o S3-compatible), guardando URLs.
- **SDKs finos (TS, Python):** clientes HTTP tipados con API key por tenant.
- **Frontend:** panel que aporta el cliente; nosotros definimos el contrato y lo integramos
  (ver `docs/FRONTEND-SPEC.md`).

## 4. Tiers de conexión

| | **Cloud API oficial** | **Baileys** |
|---|---|---|
| Público | Empresas / producción | Usuarios iniciales / personal |
| Conexión | Embedded Signup (WABA propia) | QR (número personal) |
| Costo de mensajes | El cliente paga **a Meta** | Sin costo de Meta |
| Nuestro cobro | Anualidad por servicio | Anualidad por servicio |
| Riesgo de baneo | Nulo | Alto (ToS) — con advertencia |
| Estimador de costos Meta | Sí (informativo) | No aplica |

## 5. Fases y entregables

> Detalle y checklist de cada fase en `tasks/`. Estado: ⬜ pendiente · 🟨 en curso · ✅ hecho.

- **Fase 0 — Gobernanza y planificación** 🟨
  Reglas, plan maestro, modelo de negocio, spec de frontend, skills y backlog de tareas.
- **Fase 1 — Modelo de datos multi-tenant** ⬜
  Esquema PostgreSQL: tenants, usuarios/roles, conexiones, mensajes, contactos, plantillas,
  automatizaciones, suscripciones. RLS nativo + migraciones versionadas.
- **Fase 2 — Adaptador Cloud API** ⬜
  Envío (texto/media/plantilla/interactivo), recepción por webhook, verificación de firma,
  gestión de plantillas y estados de entrega.
- **Fase 3 — Adaptador Baileys** ⬜
  Gestor de sesiones por tenant, QR/estado, envío/recepción, persistencia de sesión.
- **Fase 4 — Abstracción de canal + motor de eventos** ⬜
  Interfaz `ChannelAdapter`, normalización de mensajes entrantes a un evento común.
- **Fase 5 — Onboarding** ⬜
  Embedded Signup (intercambio de token, registro de número, suscripción a webhooks) + flujo QR Baileys.
- **Fase 6 — Motor de automatizaciones** ⬜
  Disparadores (palabra clave, mensaje entrante), respuestas, horarios, enrutamiento, gancho IA opcional.
- **Fase 7 — Facturación (anualidades) + estimador Meta** ⬜
  Abstracción `PaymentGateway` con Stripe, PagoPlux, Kushki y DeUna. Planes anuales, límites por
  plan, webhooks de cada pasarela y calculadora de costo Meta por país/volumen.
- **Fase 8 — SDKs finos** ⬜
  Cliente TS y Python tipados sobre la REST del core.
- **Fase 9 — Integración del frontend** ⬜
  Conectar el panel del cliente al contrato REST/Realtime.
- **Fase 10 — Hardening** ⬜
  Rate limits, observabilidad, auditoría, compliance, pruebas de carga.

## 6. Orden de ejecución (estrategia de arranque)

> La numeración de fases (sección 5) se mantiene como **identificador**; el **orden real de
> ejecución** cambia para salir rápido con un chat funcional y validar capacidades antes de
> invertir en la vía oficial:

1. **Fase 1 (reducida)** — scaffolding + fundaciones mínimas.
2. **Fase 3 — Baileys primero:** conectar un número personal por QR y salir con un chat
   funcional (enviar/recibir), validando qué se puede hacer. *Solo número desechable, no productivo.*
3. **Fase 2 — Cloud API:** migrar a la vía oficial reutilizando la abstracción `ChannelAdapter`
   (el resto del sistema no cambia).
4. Resto de fases según sección 5.

Racional: la **abstracción de canal** hace que migrar de Baileys a Cloud API sea agregar otro
adaptador, sin reescribir el core.

## 7. Estado actual

- [x] Decisiones base (enfoque híbrido, core REST + SDKs, alcance plataforma completa).
- [x] Modelo de negocio confirmado (integrador + anualidades; PostgreSQL; multi-pasarela).
- [x] Gobernanza escrita y Fase 0 aprobada.
- [ ] Fase 1 (reducida) + spike Baileys (TASK-019) — **en curso**.
