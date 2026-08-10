# TASK-000 — Scaffolding del monorepo

Fase: 1 · Estado: ⬜ · Depende de: aprobación de Fase 0

## Objetivo

Crear la estructura base del proyecto para que las siguientes tareas tengan dónde vivir.
Solo estructura y configuración; **sin lógica de negocio todavía**.

## Alcance

- Monorepo con workspaces:
  ```
  whatsapp-core/
  ├── apps/
  │   └── core/            # servicio TypeScript (API REST + webhooks)
  ├── packages/
  │   ├── sdk-ts/          # SDK fino TypeScript
  │   └── shared/          # tipos compartidos (ChannelAdapter, InboundMessage, ...)
  ├── sdk-py/              # SDK fino Python
  ├── db/
  │   └── migrations/      # SQL de migraciones (PostgreSQL, versionadas)
  ├── docs/                # (ya existe)
  ├── skills/              # (ya existe)
  └── tasks/               # (ya existe)
  ```
- `package.json` raíz con workspaces + gestor (pnpm o npm).
- TypeScript config base compartida.
- Framework HTTP del core (Fastify o Hono) con un `GET /health`.
- Cliente de PostgreSQL (`pg` / query builder tipo Drizzle o Kysely) + tool de migraciones.
- `.env.example` con variables:
  - `DATABASE_URL` (PostgreSQL)
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  - `ENCRYPTION_KEY` (cifrado de tokens en reposo)
  - `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`
  - Pasarelas: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KUSHKI_PUBLIC_KEY`,
    `KUSHKI_PRIVATE_KEY`, `PAGOPLUX_TOKEN`, `PAGOPLUX_ESTABLISHMENT`, `DEUNA_API_KEY`,
    `DEUNA_POS_ID`
  - Opcionales: `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `.gitignore` (node_modules, .env, sesiones Baileys, dist).
- Linter + formatter (eslint + prettier).

## Checklist

- [ ] Workspaces configurados e instalables.
- [ ] `apps/core` levanta y responde `GET /health` con 200.
- [ ] `packages/shared` exporta tipos base vacíos (placeholders).
- [ ] `.env.example` y `.gitignore` creados.
- [ ] Lint/format corren sin error.

## Fuera de alcance

- Cualquier endpoint de negocio, adaptadores, base de datos real.

## Verificación

- `pnpm install` sin errores.
- `pnpm --filter core dev` levanta el server; `curl /health` → 200.
