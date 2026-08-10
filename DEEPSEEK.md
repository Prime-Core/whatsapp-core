# DEEPSEEK.md - whatsapp-core

## Project Overview

Multi-channel WhatsApp communication core. A unified channel abstraction over Baileys (initial/personal tier via QR, unofficial) and Meta Cloud API (enterprise tier, official). Multi-tenant by design; PostgreSQL, JWT auth, and WebSocket Realtime are planned for the Core (see `docs/PLAN-MAESTRO.md`). We are INTEGRATORS: no markup on WhatsApp messages, customers pay Meta directly; our revenue is annual subscriptions via payment gateways (Stripe, PagoPlux, Kushki, DeUna).

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24 (types: ^22) |
| Framework | None (plain TypeScript library/core, ESM) | — |
| Language | TypeScript (strict, ES2022, NodeNext) | ^5.7.0 |
| Messaging | @whiskeysockets/baileys (WhatsApp unofficial) | ^7.0.0-rc13 |
| Logging | pino | ^9.0.0 |
| QR display | qrcode-terminal | ^0.12.0 |
| Dev runner | tsx | ^4.0.0 |

## Critical Rules

### Code Organization
- Many small files over few large files (200-400 lines typical, 800 max)
- Organize by feature/domain (channels/, types/), not by type
- High cohesion, low coupling: adapters are isolated in `src/channels/`
- Follow `skills/00-flujo-de-trabajo.md` before starting/ending any task

### Code Style
- No console.log in production code — use pino logger
- Proper error handling: always try/catch async operations
- No input validation library yet (planned: none detected — use plain guards)
- Prefer immutability with spread operators
- ESM imports always with `.js` extension (NodeNext module resolution)
- Comments in Spanish, matching existing codebase style
- Class-based adapters implementing the `ChannelAdapter` interface

### Testing
- No test framework configured yet — do not invent one

### Security (from `.trae/rules/project_rules.md`)
- NEVER log or commit Meta tokens, payment gateway secrets, or Baileys session credentials
- Secrets only via environment variables; `.env` must be in `.gitignore`
- Tenant tokens stored encrypted at rest
- Validate Meta webhook signature (`X-Hub-Signature-256`) before processing
- Multi-tenant isolation: every query scoped by `tenant_id`, never cross tenants
- Baileys sessions: show ToS/ban-risk consent before connecting

### Project Rules
- `.trae/rules/project_rules.md` is authoritative — if a task conflicts, stop and ask
- Work ONE task at a time from `tasks/` (phases in `docs/PLAN-MAESTRO.md`)
- No scope creep: nothing outside the active task
- Never route payments through us: customers pay Meta directly (Cloud API tier)

## Project Structure

```
src/
|-- channels/
|   |-- baileys/          Baileys adapter (QR, groups, unofficial)
|   |-- cloud-api/        Meta Cloud API adapter (interactive, templates, flows)
|   `-- index.ts          ChannelRegistry (factory + lifecycle)
|-- types/
|   `-- channel.ts        ChannelAdapter contract + all domain types
`-- index.ts              Public exports
docs/                     PLAN-MAESTRO, MODELO-NEGOCIO, FRONTEND-SPEC, POCs
skills/                   SOP playbooks (00-flujo-de-trabajo … 40-pasarelas-pago)
tasks/                    Backlog per phase (TASK-XXX)
spikes/                   Isolated experiments (baileys, kyc-capture)
```

## Available Scripts

| Command | Description |
|---------|-------------|
| npm run dev | Run `src/index.ts` with hot reload (tsx --watch) |
| npm run build | Compile TypeScript to `dist/` (tsc) |
| npm run typecheck | Type-check without emitting (tsc --noEmit) |

## Environment Variables

None detected yet (no .env / .env.example, no process.env usage in code).
Planned: `DATABASE_URL` (PostgreSQL), Meta Cloud API tokens, payment gateway secrets.

## API Structure

No HTTP routes yet — this is a library core. Planned REST API in later phases (see `docs/PLAN-MAESTRO.md`).

## Git Workflow

- Repo not yet initialized with git
- Workflow (from playbook): mark task in-progress 🟨, implement only task scope, verify, mark ✅, update `docs/PLAN-MAESTRO.md` phase status
- Never commit secrets or `.env`
