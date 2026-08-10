# Tareas — whatsapp-core

Backlog gestionado "de a poco". Regla: se ejecuta **una tarea a la vez**, en orden, sin saltar
de fase hasta cerrar la anterior. Estados: ⬜ pendiente · 🟨 en curso · ✅ hecho · ⛔ bloqueada.

> Antes de tomar una tarea, seguir `skills/00-flujo-de-trabajo.md`.

> **Orden de ejecución activo:** Fase 1 (reducida) → **Fase 3 (Baileys, spike TASK-019)** →
> Fase 2 (Cloud API) → resto. Ver `docs/PLAN-MAESTRO.md` §6.

## Fase 0 — Gobernanza y planificación
| ID | Tarea | Estado |
|----|-------|--------|
| — | Reglas, plan maestro, modelo de negocio, spec frontend, skills | ✅ |
| — | Aprobación del cliente para pasar a Fase 1 | 🟨 (esperando review) |

## Fase 1 — Modelo de datos multi-tenant + fundaciones del core
| ID | Tarea | Estado |
|----|-------|--------|
| [TASK-000](./TASK-000-scaffolding.md) | Scaffolding del monorepo (core, sdks, migraciones, env) | ⬜ |
| [TASK-001](./TASK-001-modelo-datos.md) | Esquema PostgreSQL + RLS nativo (tenants, users, channels, messages, contacts, templates, automations, subscriptions) | ⬜ |
| TASK-002 | Auth propia (registro/login/JWT access+refresh, roles) — reemplaza Supabase Auth | ⬜ |
| TASK-003 | Realtime propio (WebSocket + Postgres LISTEN/NOTIFY) — reemplaza Supabase Realtime | ⬜ |

## Fase 2 — Adaptador Cloud API
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-010 | Cliente Graph API + envío texto/media | ⬜ |
| TASK-011 | Envío de plantillas e interactivos | ⬜ |
| TASK-012 | Webhook de entrada + verificación de firma | ⬜ |
| TASK-013 | Gestión de plantillas (CRUD + submit a Meta) | ⬜ |

## Fase 3 — Adaptador Baileys
| ID | Tarea | Estado |
|----|-------|--------|
| [TASK-019](./TASK-019-baileys-spike.md) | Spike: chat funcional vía número personal (QR + enviar/recibir) + matriz de capacidades | ⬜ |
| TASK-020 | Gestor de sesiones por tenant + QR + estado | ⬜ |
| TASK-021 | Envío/recepción + persistencia de sesión cifrada | ⬜ |
| TASK-022 | Reconexión, backoff y rate limiting | ⬜ |

## Fase 4 — Abstracción de canal + motor de eventos
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-030 | Interfaz `ChannelAdapter` + factory | ⬜ |
| TASK-031 | Normalización a `InboundMessage` + bus de eventos | ⬜ |

## Fase 5 — Onboarding
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-040 | Embedded Signup (intercambio token, register, subscribe) | ⬜ |
| TASK-041 | Flujo QR Baileys + consentimiento de riesgo | ⬜ |

## Fase 6 — Motor de automatizaciones
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-050 | Triggers + condiciones + acciones | ⬜ |
| TASK-051 | Horarios, enrutamiento y logs | ⬜ |
| TASK-052 | Gancho IA opcional | ⬜ |

## Fase 7 — Facturación (anualidades) + estimador Meta
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-060 | Abstracción `PaymentGateway` + tabla subscriptions + webhook único `/webhooks/payments/:gateway` | ⬜ |
| TASK-061 | Gateway Stripe (suscripción anual + portal) | ⬜ |
| TASK-062 | Gateway Kushki (suscripción con tarjeta) | ⬜ |
| TASK-063 | Gateway PagoPlux (recurrencia / cobro anual) | ⬜ |
| TASK-064 | Gateway DeUna (QR, cobro único anual + job de renovación) | ⬜ |
| TASK-065 | Límites por plan + enforcement | ⬜ |
| TASK-066 | Estimador de costo Meta por país/volumen | ⬜ |

## Fase 8 — SDKs finos
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-070 | SDK TypeScript (cliente REST tipado) | ⬜ |
| TASK-071 | SDK Python | ⬜ |

## Fase 9 — Integración del frontend
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-080 | Contrato REST estable + OpenAPI | ⬜ |
| TASK-081 | Suscripciones Realtime para inbox/estado | ⬜ |
| TASK-082 | Unir el frontend que aporta el cliente | ⬜ |

## Fase 10 — Hardening
| ID | Tarea | Estado |
|----|-------|--------|
| TASK-090 | Rate limits, observabilidad, auditoría | ⬜ |
| TASK-091 | Compliance (opt-in/out, GDPR, retención) | ⬜ |
| TASK-092 | Pruebas de carga y de integración | ⬜ |
