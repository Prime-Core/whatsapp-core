# Skill 40 — Pasarelas de pago

Usar al implementar o modificar el cobro. Objetivo: **anualidades** cobradas por cualquiera de
las pasarelas soportadas, detrás de una única abstracción.

## Principio

El resto del sistema (billing, onboarding, límites de plan) no debe depender de una pasarela
concreta. Toda diferencia se encapsula en `billing/gateways/<nombre>/`.

## Interfaz común

```ts
type Gateway = 'stripe' | 'pagoplux' | 'kushki' | 'deuna';

interface PaymentGateway {
  readonly id: Gateway;
  readonly supportsRecurring: boolean;   // true: renueva sola · false: re-cobro gestionado por el core

  // Inicia el pago de una anualidad. Devuelve lo que el frontend necesita:
  // url de checkout, o QR/deeplink (DeUna), o clientSecret, etc.
  createCheckout(input: {
    tenantId: string;
    plan: 'starter' | 'pro' | 'business' | 'enterprise';
    amount: number;          // en la moneda del plan
    currency: string;
    customer: { email: string; name: string };
  }): Promise<CheckoutResult>;

  // Verifica y normaliza el webhook de la pasarela a un evento interno.
  handleWebhook(req: RawRequest): Promise<PaymentEvent>;

  getSubscription(ref: string): Promise<SubscriptionStatus>;
  cancel(ref: string): Promise<void>;
}
```

Evento normalizado que todas las pasarelas producen:

```ts
interface PaymentEvent {
  tenantId: string;
  gateway: Gateway;
  type: 'paid' | 'failed' | 'renewed' | 'canceled' | 'refunded';
  externalRef: string;        // id de la suscripción/pago en la pasarela
  paidUntil?: string;         // ISO — hasta cuándo queda cubierta la anualidad
  raw: unknown;
}
```

## Notas por pasarela

- **Stripe** (internacional): usar Subscriptions (interval year). Verificar webhook con
  `STRIPE_WEBHOOK_SECRET`. Customer Portal para autogestión. `supportsRecurring = true`.
- **Kushki** (LatAm/Ecuador): tokenización de tarjeta + suscripciones. Claves pública/privada
  por merchant. `supportsRecurring = true`.
- **PagoPlux** (Ecuador): pagos y recurrencia. Si no hay token recurrente disponible, tratar la
  anualidad como cobro anual + recordatorio. `supportsRecurring = true` (fallback a re-cobro).
- **DeUna** (Ecuador, Banco Pichincha): pago por **QR/deeplink**, sin recurrencia. Al crear
  checkout devolver el QR. `supportsRecurring = false`: el core agenda el vencimiento, avisa al
  cliente y genera un nuevo QR de re-cobro antes de que expire la anualidad.

## Renovación cuando NO hay recurrencia (DeUna, fallback PagoPlux)

- El core guarda `paid_until` en `subscriptions`.
- Un job diario busca suscripciones próximas a vencer → notifica al cliente y genera el cobro.
- Si no se paga antes de `paid_until` + grace period → tenant `suspended`.

## Webhooks

- Ruta única: `POST /webhooks/payments/:gateway`.
- Cada pasarela verifica su firma/secreto **antes** de procesar (regla de seguridad).
- Traducir a `PaymentEvent` y actualizar `subscriptions` de forma idempotente (dedupe por `externalRef`).

## Seguridad

- Claves de cada pasarela solo por env (`STRIPE_*`, `KUSHKI_*`, `PAGOPLUX_*`, `DEUNA_*`).
- Nunca loguear payloads con datos de tarjeta.
- Validar montos contra el plan del servidor (no confiar en el monto del cliente).
