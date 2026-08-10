# Reglas del Proyecto — whatsapp-core

> Estas reglas son de obligado cumplimiento para cualquier persona o agente que trabaje
> en este repositorio. Si una tarea entra en conflicto con una regla, para y avisa.

## 1. Identidad del negocio (NO negociable)

1. **Somos INTEGRADORES, no un BSP revendedor.** Nunca aplicamos markup sobre los
   mensajes de WhatsApp ni intermediamos el cobro de Meta.
2. **Tier Cloud API oficial:** el cliente es dueño de su WABA y **paga directamente a Meta**
   por las conversaciones. Nosotros solo:
   - facilitamos el onboarding (Embedded Signup),
   - automatizamos su operación,
   - le mostramos un **estimador** de lo que pagará a Meta (informativo, nunca un cobro nuestro).
3. **Tier Baileys:** no pasa por Meta, no hay costo de mensajes. El **único pago es a nosotros**
   por el servicio. Siempre mostrar la advertencia de riesgo ToS/baneo antes de conectar.
4. **Cobro a nuestros clientes = ANUALIDADES.** No hay pago por mensaje. El cobro se realiza
   por múltiples pasarelas: **Stripe** (internacional), **PagoPlux**, **Kushki** y **DeUna**
   (Ecuador/LatAm). Todas detrás de una abstracción común `PaymentGateway`.

## 2. Arquitectura

1. Stack base: **Core REST + SDKs finos**. El core es la única fuente de verdad; los SDKs
   (TS y Python) solo son clientes HTTP tipados.
2. Lenguaje del core: **TypeScript / Node.js**. Datos: **PostgreSQL puro** (conexión directa vía
   `DATABASE_URL`, sin Supabase). Auth (JWT), Realtime (WebSocket) y Storage son **propios del core**.
3. El core expone una **abstracción de canal unificada**: el resto del sistema no debe saber si
   detrás hay Cloud API o Baileys. Los adaptadores viven aislados en `channels/`.
4. **Pasarelas de pago** también detrás de una abstracción `PaymentGateway` en `billing/gateways/`
   (Stripe, PagoPlux, Kushki, DeUna). El resto del sistema no depende de una pasarela concreta.
5. **Multi-tenant estricto:** todo dato pertenece a un `tenant_id`. Ninguna consulta puede cruzar tenants.
   Usar **RLS nativo de PostgreSQL** (política por `app.current_tenant_id` fijado por sesión/transacción).

## 3. Seguridad

1. **Nunca** loguear ni commitear tokens de Meta, secrets de pasarelas (Stripe, PagoPlux, Kushki,
   DeUna), ni credenciales de sesión Baileys.
2. Secrets solo por variables de entorno / gestor de secretos. `.env` va en `.gitignore`.
3. Tokens de tenant se guardan cifrados en reposo.
4. Validar la firma de los webhooks de Meta (`X-Hub-Signature-256`) antes de procesar.
5. Las API keys de los SDKs son por-tenant y revocables.

## 4. Proceso de trabajo

1. **No salirse del Plan Maestro** (`docs/PLAN-MAESTRO.md`). Cambios de alcance = actualizar el plan primero.
2. Trabajar **una tarea a la vez** desde `tasks/`. Seguir el flujo del playbook
   `skills/00-flujo-de-trabajo.md`.
3. Antes de codear una tarea: leer el plan, la tarea y los skills aplicables.
4. Al terminar una tarea: marcar checklist, actualizar estado en `tasks/README.md` y verificar.
5. No crear features fuera de la tarea activa. Nada de "mejoras" no pedidas.

## 5. Cumplimiento (compliance)

1. Cloud API es el camino por defecto para producción y para cualquier cliente empresarial.
2. Baileys solo para el tier inicial/personal, con consentimiento explícito del riesgo registrado.
3. Respetar la ventana de servicio de 24h y el uso de plantillas aprobadas en Cloud API.
4. Prohibido diseñar flujos de spam masivo a números que no dieron opt-in.
