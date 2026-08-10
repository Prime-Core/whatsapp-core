# TASK-001 — Esquema de datos multi-tenant + RLS

Fase: 1 · Estado: ⬜ · Depende de: TASK-000

## Objetivo

Definir el modelo de datos en **PostgreSQL puro** con aislamiento estricto por tenant.

## Alcance (tablas mínimas)

- `tenants` — id, nombre, estado (active/suspended), plan, created_at.
- `users` — auth propia del core: email, `password_hash` (argon2/bcrypt), estado. Pertenecen a un tenant.
- `refresh_tokens` — user_id, hash, expiración, revocado (para JWT refresh propio).
- `memberships` — user_id, tenant_id, rol (owner/admin/agent).
- `channels` — tenant_id, type (cloud_api|baileys), estado, waba_id, phone_number_id/jid,
  token_cifrado, metadata.
- `contacts` — tenant_id, phone (E.164), nombre, etiquetas[], opt_in, atributos jsonb.
- `messages` — tenant_id, channel_id, contact_id, direction (in/out), type, contenido,
  estado (sent/delivered/read/failed), timestamp, raw jsonb.
- `templates` — tenant_id, channel_id, name, categoría, idioma, componentes jsonb, estado.
- `automations` — tenant_id, nombre, trigger jsonb, acciones jsonb, horario jsonb, activo.
- `automation_logs` — automation_id, ejecución, resultado.
- `subscriptions` — tenant_id, gateway (stripe|pagoplux|kushki|deuna), external_ref, plan,
  periodo (anual), estado, `paid_until`, renovación (auto|manual).
- `api_keys` — tenant_id, hash, nombre, revocada.

## Requisitos

- **RLS nativo de PostgreSQL** en todas las tablas: cada fila filtra por `tenant_id` usando la
  variable de sesión `app.current_tenant_id` (se fija por transacción antes de cada query). El
  rol de sistema del core puede fijar el tenant explícito para trabajos internos (webhooks, motor).
- Tokens y credenciales **cifrados** en columna (no texto plano).
- Índices en `tenant_id` + columnas de búsqueda frecuente (phone, channel_id, timestamp).
- Migraciones versionadas en `supabase/migrations/`.

## Checklist

- [ ] Migración SQL con todas las tablas + FKs.
- [ ] Políticas RLS por tabla.
- [ ] Índices y constraints (unicidad phone por tenant, etc.).
- [ ] Tipos TS generados/derivados en `packages/shared`.
- [ ] Seed de ejemplo (1 tenant demo) para desarrollo.

## Verificación

- Aplicar migración con el tool de migraciones contra `DATABASE_URL` (o MCP PostgreSQL).
- Un usuario del tenant A no puede leer datos del tenant B (test de RLS con `app.current_tenant_id`).
