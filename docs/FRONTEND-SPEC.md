# Especificación del Frontend — whatsapp-core

> Este documento describe el panel SaaS que el cliente integrará. Nosotros entregamos el core
> (REST + Realtime) y este spec; el cliente une su frontend a ese contrato.

## Stack objetivo

- React con Tailwind y shadcn/ui (preferido por ecosistema).
- **Auth propia del core (JWT)**: el frontend hace login contra `/api/v1/auth/*` y guarda el
  access token; no usa Supabase.
- Comunicación con el core: REST (fetch/axios) + **WebSocket propio del core** para cambios en
  vivo (inbox, estado de sesión, logs).
- Checkout multi-pasarela: **Stripe, PagoPlux, Kushki, DeUna** (el usuario elige una).
- Meta JS SDK para Embedded Signup (Cloud API).

## Rutas y pantallas

### `/login` — Autenticación
- Login / registro con **auth propia del core** (`/api/v1/auth/*`, JWT).
- Recuperar contraseña.
- Redirigir a `/onboarding` si es nuevo, o a `/dashboard` si ya tiene tenant activo.

### `/onboarding` — Flujo guiado de primer acceso
- **Paso 1 — Elegir plan:** cards de Starter / Pro / Business / Enterprise.
  Mostrar features, límites y precio anual.
- **Paso 2 — Checkout:** el usuario elige pasarela (Stripe / PagoPlux / Kushki / DeUna) y paga
  la anualidad. Al confirmarse el pago (webhook) se activa el tenant. Para DeUna se muestra el QR.
- **Paso 3 — Agregar primer canal:**
  - Opción A: **Cloud API** → Embedded Signup (popup/redirect de Meta JS SDK).
    Flujo: autentica FB, selecciona/crea WABA, verifica número, concede permisos.
  - Opción B: **Baileys** → muestra QR. El usuario escanea con su WhatsApp.
    Barra de progreso: QR → escaneado → conectando → activo.
    Advertencia de riesgo ToS (debe aceptarla explícitamente).
- **Paso 4 — Configuración rápida:** display name, webhook de prueba, primeros contactos.
- **Paso 5 — Listo:** resumen de lo configurado, acceso al dashboard.

### `/dashboard` — Vista principal
- **Widgets resumen:**
  - Conexiones activas / totales (por tipo: Cloud API / Baileys).
  - Mensajes del día / del mes (enviados, recibidos, fallados).
  - Contactos activos.
  - Estado de la suscripción (días restantes, plan).
  - Alerta si hay sesiones Baileys desconectadas.
- **Gráfico de actividad** (últimos 30 días).
- **Quick actions:** "Nuevo número", "Crear plantilla", "Ir al inbox".

### `/inbox` — Bandeja multi-agente
- **Sidebar izquierda (lista de canales):** números conectados agrupados por tipo.
  Cada item muestra: número/nombre, badge de mensajes no leídos, estado (🟢 conectado /
  🔴 desconectado / 🟡 reconectando).
- **Panel central (lista de conversaciones):** contactos con preview del último mensaje,
  timestamp, estado (leído/no leído). Search bar y filtros (canal, estado, fecha).
- **Panel derecho (chat):** mensajes en orden cronológico. Tipos: texto, imagen, audio,
  video, documento, plantilla, botones interactivos.
  - Enviar mensaje: input de texto + adjuntos + quick replies / plantillas preconfiguradas.
  - Indicador de ventana de servicio 24h (Cloud API): muestra tiempo restante.
  - Info del contacto: nombre, número, etiquetas, notas, historial.

### `/connections` — Gestión de números / canales
- **Tabla/listado:** todos los números conectados del tenant.
  Columnas: número, nombre display, tipo (Cloud API / Baileys), estado, mensajes enviados/recibidos, último heartbeat.
- **Fila expandible o drawer:** detalles (token status, webhook config, límite de mensajes,
  plantillas asociadas).
- **Botón "Agregar número":** misma lógica de conexión que en onboarding.
- **Acciones:** pausar / reanudar / desconectar / borrar número.

### `/templates` — Gestión de plantillas (Cloud API)
- Listado de plantillas por número/WABA, con estado de aprobación de Meta
  (pendiente / aprobada / rechazada).
- Crear plantilla: name, categoría, idioma, componentes (header, body, footer, buttons),
  preview en tiempo real.
- Enviar a aprobación, editar, duplicar.
- Indicador de tasa de calidad (quality rating de Meta).
- Historial de cambios de estado.

### `/automations` — Motor de automatizaciones
- **Lista de reglas** del tenant. Cada una: trigger + condición + acción + horario.
- **Tipos de trigger:** mensaje entrante con palabra clave, primer mensaje de contacto nuevo,
  fuera de horario, webhook externo.
- **Tipos de acción:** responder con texto/plantilla/media, etiquetar contacto, notificar por
  email/slack, enrutar a un agente humano, invocar webhook/IA.
- **Editor visual opcional** (nodos y flechas) o form builder.
- **Horario:** días + rango horario en el que la automatización está activa.
- **Log de ejecuciones** por automatización.

### `/contacts` — CRM ligero
- Lista de contactos (nombre, número, canal, etiquetas, último contacto, opt-in/in/out).
- Detalle del contacto: historial de conversaciones, notas, etiquetas, atributos
  personalizados, fecha de opt-in.
- Importación CSV.
- Segmentación: filtros por etiqueta, fecha, canal, estado de opt-in.

### `/broadcasts` — Campañas (Cloud API)
- Crear campaña: seleccionar canal, lista de contactos/segmento, plantilla, horario de envío.
- Preview antes de enviar.
- Vista de campaña: progreso (enviados, entregados, leídos, fallados), pausar/cancelar.
- **Estimador de costo Meta** (antes de enviar, informativo).
- Historial de campañas.

### `/billing` — Facturación y suscripción
- Plan actual + días restantes + fecha de próxima renovación.
- Límites del plan vs uso actual (números, automatizaciones, contactos, mensajes).
- **Estimador Meta:** calculadora por país + volumen (informativo, no pagable).
- Historial de facturas/pagos (según la pasarela usada).
- Pasarela de pago actual + opción de cambiarla en la próxima renovación.
- Botones: upgrade, downgrade, cancelar, actualizar método de pago. Redirige al portal de la
  pasarela cuando aplica (p. ej. Stripe Customer Portal); para DeUna, re-genera el QR de re-cobro.
- Acceso al WhatsApp Manager de Meta (link externo, por si el cliente quiere ver su consumo
  real en Meta).

### `/settings` — Configuración del tenant
- **General:** nombre de la organización, logo, zona horaria, idioma.
- **Equipo:** miembros y roles (owner / admin / agent). Invitaciones.
- **Webhooks y API keys:** generar/revocar keys por miembro.
- **URLs de salida:** webhook URL del core para que el cliente sepa a dónde apuntar otros
  servicios (si aplica).
- **Seguridad:** 2FA, logs de acceso, sesiones activas.
- **Datos:** exportar contactos / mensajes, solicitar eliminación de cuenta.

### `/changelog` — Novedades
- Listado de versiones del core con cambios visibles al usuario.

## Contratos con el Core (endpoints clave que el frontend consume)

| Grupo | Endpoints (prefijo `/api/v1`) | Descripción |
|---|---|---|
| Auth | `POST /auth/register`<br/>`POST /auth/login`<br/>`POST /auth/refresh`<br/>`POST /auth/logout`<br/>`POST /auth/forgot-password` | Auth propia del core (JWT access + refresh). Devuelve el tenant asociado. |
| Conexiones | `GET /tenants/:tid/channels`<br/>`POST /tenants/:tid/channels`<br/>`GET /tenants/:tid/channels/:cid`<br/>`DELETE /tenants/:tid/channels/:cid`<br/>`POST /tenants/:tid/channels/:cid/pause\|resume` | CRUD de canales. El POST inicia el flujo de conexión (Cloud API: devuelve redirect/params para Embedded Signup; Baileys: devuelve QR como imagen/base64). |
| Mensajes | `GET /tenants/:tid/messages?channel=&contact=&status=`<br/>`POST /tenants/:tid/messages`<br/>`GET /tenants/:tid/messages/:mid` | Listado paginado, envío y detalle. |
| Plantillas | `GET /tenants/:tid/templates`<br/>`POST /tenants/:tid/templates`<br/>`GET /tenants/:tid/templates/:tid`<br/>`POST /tenants/:tid/templates/:tid/submit` | CRUD de plantillas Cloud API. |
| Automatizaciones | `GET /tenants/:tid/automations`<br/>`POST /tenants/:tid/automations`<br/>`PUT /tenants/:tid/automations/:aid`<br/>`DELETE /tenants/:tid/automations/:aid`<br/>`GET /tenants/:tid/automations/:aid/logs` | CRUD + logs del motor. |
| Contactos | `GET /tenants/:tid/contacts`<br/>`POST /tenants/:tid/contacts`<br/>`GET /tenants/:tid/contacts/:cid`<br/>`PUT /tenants/:tid/contacts/:cid`<br/>`POST /tenants/:tid/contacts/import` | Vista unificada de contactos a través de todos los canales del tenant. |
| Broadcasts | `GET /tenants/:tid/broadcasts`<br/>`POST /tenants/:tid/broadcasts`<br/>`GET /tenants/:tid/broadcasts/:bid`<br/>`POST /tenants/:tid/broadcasts/:bid/send` | Campañas. |
| Billing | `GET /tenants/:tid/billing`<br/>`GET /tenants/:tid/billing/invoices`<br/>`GET /tenants/:tid/billing/gateways`<br/>`POST /tenants/:tid/billing/checkout` (body: `{ plan, gateway }`)<br/>`GET /tenants/:tid/billing/meta-estimator?country=&marketing=&utility=&auth=` | Plan, límites, historial de pagos, pasarelas disponibles, inicio de checkout y estimador Meta. |
| Config | `GET /tenants/:tid/settings`<br/>`PUT /tenants/:tid/settings`<br/>`GET /tenants/:tid/members`<br/>`POST /tenants/:tid/members`<br/>`DELETE /tenants/:tid/members/:uid`<br/>`POST /tenants/:tid/api-keys`<br/>`DELETE /tenants/:tid/api-keys/:kid` | Configuración del tenant. |
| Dashboard | `GET /tenants/:tid/dashboard` | Widgets resumen. |

> Los endpoints de arriba vuelcan JSON. Para el inbox en tiempo real el frontend se conecta al
> **WebSocket propio del core** (`wss://.../realtime`, autenticado con el JWT) y se suscribe a
> tópicos: `messages:tenant:TID:new`, `channels:tenant:TID:status`, `presence:tenant:TID`.

## Flujo de integración para el cliente del frontend

1. Cliente recibe este spec y las credenciales de acceso al core (URL + API key de integración).
2. Usa la auth propia del core (`/api/v1/auth/*`) para login y manejo del JWT en el frontend.
3. Configura las pasarelas de pago que quiera ofrecer (Stripe/PagoPlux/Kushki/DeUna) — el core
   expone `GET /billing/gateways` con las habilitadas.
4. Registra la app de Meta para Embedded Signup y comparte el ID al core.
5. Mapea cada ruta de este spec a componentes React, consumiendo los endpoints documentados.
6. Se conecta al WebSocket del core para el inbox en vivo.

El core no conoce detalles del framework de frontend. La integración es puramente REST +
WebSocket propio + JS SDK de Meta (Embedded Signup) + el checkout de la pasarela elegida.
