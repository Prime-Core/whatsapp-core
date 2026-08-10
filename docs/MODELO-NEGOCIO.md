# Modelo de Negocio — whatsapp-core

## Quiénes somos

**Somos un integrador tecnológico, no un BSP revendedor de mensajes.** Nuestra propuesta de
valor es simplificar y automatizar WhatsApp para el cliente final, no hacer markup sobre lo que
Meta le cobra.

## Cómo ganamos dinero

**Única fuente de ingreso: suscripciones anuales.**

El cliente paga una vez al año por el servicio. No hay cobro por mensaje, no hay hidden fees.
El cobro se procesa por **múltiples pasarelas** para cubrir tanto clientes internacionales como
de Ecuador/LatAm. El cliente elige la pasarela en el checkout.

## Planes (anualidades)

| Plan | Mensual (equivalente) | Anual | Incluye |
|---|---|---|---|
| **Starter** | \$49/mes | **\$499/año** | 1 número Baileys o Cloud API · inbox multi-agente · 1 automatización básica · 2K contactos/mes |
| **Pro** | \$149/mes | **\$1,499/año** | 5 números · inbox avanzado · 10 automatizaciones · 20K contactos/mes · broadcast programado · plantillas Cloud API |
| **Business** | \$349/mes | **\$3,499/año** | 25 números · inbox IA · automatizaciones ilimitadas · 100K contactos/mes · API completa (SDK) · prioridad en soporte |
| **Enterprise** | A medida | **A medida** | Números ilimitados · tenant dedicado · SLA · integración white-label · soporte 24/7 · onboarding gestionado |

> Los precios son orientativos. Se configuran como productos/planes en cada pasarela.

## Pasarelas de pago

Todas viven detrás de una abstracción `PaymentGateway` en el core. El cliente elige una en el
checkout; el core normaliza el resultado (suscripción activa + fecha de renovación).

| Pasarela | Alcance | Recurrencia nativa | Manejo de la anualidad |
|---|---|---|---|
| **Stripe** | Internacional | Sí (Subscriptions) | Suscripción anual auto-renovable. Portal de cliente para gestionar. |
| **Kushki** | LatAm / Ecuador | Sí (suscripciones con tarjeta) | Suscripción anual con tokenización de tarjeta. |
| **PagoPlux** | Ecuador | Sí (pagos recurrentes) | Recurrencia anual; si no hay token, cobro anual + recordatorio de renovación. |
| **DeUna** | Ecuador (Banco Pichincha) | No (pago por QR/deeplink) | **Cobro único anual**; el core agenda recordatorio y re-cobro manual antes del vencimiento. |

**Regla de diseño:** las pasarelas con recurrencia nativa (Stripe, Kushki, PagoPlux) manejan la
renovación automática. Para las que no la tienen (DeUna), el core mantiene el estado de la
suscripción y dispara recordatorios + genera un nuevo cobro anual. Así el modelo de "anualidad"
es uniforme sin importar la pasarela.

Cada pasarela notifica su resultado por **webhook** a `POST /webhooks/payments/:gateway`, que el
core verifica (firma/secreto propio de cada una) y traduce a un cambio de estado de la suscripción.

## Cómo paga el cliente a Meta (solo tier Cloud API)

El cliente conserva el 100 % del control de su WABA. Al usar Embedded Signup:

1. Meta crea el WABA, el cliente **asocia su propia tarjeta/forma de pago** durante o después
   del onboarding.
2. Meta factura **directamente al cliente** según el consumo real (tipo de conversación × país
   destino, precios oficiales).
3. Nosotros le mostramos un **estimador informativo** en su panel, basado en la tabla pública
   de precios de Meta y el volumen histórico de mensajes.
4. El cliente puede verificar el costo real en su WhatsApp Manager (`business.facebook.com`).

> Esto es a propósito: **siempre es dinero del cliente → Meta**. Nosotros no tocamos ese flujo.
> Refuerza la confianza y la transparencia.

## Tier Baileys: modelo de pago único

- El cliente paga **solo a nosotros** (la anualidad del plan).
- No existe costo de Meta porque no se usa la Cloud API oficial.
- El sistema muestra una **advertencia explícita de riesgo** (posible baneo, violación de ToS)
  antes de que el cliente conecte un número por Baileys.
- Recomendado solo para pruebas, desarrollo o uso personal no crítico.

## Estimador de costos Meta (informativo)

Un módulo del panel que el cliente consulta. No genera cobros. Muestra:

```
Seleccioná el país de tus clientes →
  Argentina (ejemplo)

Volumen mensual estimado →
  Marketing:     500 msgs → ~$25/mes
  Utilidad:     2000 msgs → ~$8/mes
  Servicio:     1000 msgs → $0 (ventana 24h)
  Autenticación:  500 msgs → ~$2/mes
  ─────────────────────────────────────
  Total estimado a pagar a Meta: ~$35/mes
```

Los precios se actualizan periódicamente desde una tabla interna basada en los precios
oficiales publicados por Meta.

## Multi-tenant y tenencia de datos

- Cada cliente = un `tenant_id`.
- El cliente es dueño de sus datos (mensajes, contactos, plantillas, automatizaciones).
- Al cancelar la suscripción, el tenant se marca como `suspended`; tras un grace period, los
  datos se eliminan (GDPR-friendly).
- Para Cloud API, el WABA **sobrevive** a la cancelación (lo gestiona el cliente directamente
  en Meta Business Manager).

## Onboarding (cómo entra un cliente nuevo)

1. Se registra en el panel (email + password, **auth propia del core con JWT**) → se crea su tenant.
2. Elige un plan → elige pasarela (Stripe/PagoPlux/Kushki/DeUna) → checkout de esa pasarela (anual).
3. Pago completado → se activa el tenant.
4. El cliente elige tipo de conexión:
   - **Cloud API:** Embedded Signup (flujo de Meta, el cliente autentica su perfil FB, crea
     WABA, verifica número, concede permisos) → se intercambia token → queda operativo.
   - **Baileys:** se genera QR → el cliente escanea con su WhatsApp → sesión activa.
5. El cliente configura sus primeras automatizaciones, plantillas o flujos.
6. Recibe acceso a API keys (para uso vía SDK).

## Cancelación / Downgrade

- Cancelación: el tenant entra en `suspended`. Se detiene la renovación en la pasarela (o los
  recordatorios de re-cobro para DeUna). Datos accesibles en modo lectura por 30 días; luego eliminación.
- Downgrade: se ajusta al próximo ciclo de facturación anual (la pasarela maneja el prorrateo
  cuando lo soporta; si no, aplica al siguiente periodo).
- Si el cliente excede los límites del plan, recibe alertas y opción de upgrade.
