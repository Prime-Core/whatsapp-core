# Skill 10 — Onboarding Cloud API (Embedded Signup)

Usar al implementar o depurar la conexión de un número por la vía oficial de Meta.

## Contexto

Embedded Signup v4 (v2 se deprecia el 15/oct/2026). El cliente conserva la propiedad de su WABA.
El objetivo es obtener y registrar sus activos sin que pierda el control.

## Flujo end-to-end

### Frontend (Meta JS SDK)
1. Cargar el JS SDK de Facebook y llamar a `FB.login()` con `config_id` (config de Embedded
   Signup) y `response_type: 'code'`, `override_default_response_type: true`.
2. Al completar, Meta devuelve al frontend: `code` (token intercambiable), y por el mensaje
   `WA_EMBEDDED_SIGNUP` los IDs: `waba_id` y `phone_number_id`.
3. Enviar esos datos al core: `POST /tenants/:tid/channels` con `{ type: 'cloud_api', code,
   waba_id, phone_number_id }`.

### Core (server-to-server)
1. **Intercambiar el code** por un token de acceso de negocio (customer-scoped):
   `GET https://graph.facebook.com/v21.0/oauth/access_token?client_id=APP_ID&client_secret=APP_SECRET&code=CODE`.
2. **Registrar el número** para Cloud API:
   `POST /PHONE_NUMBER_ID/register` con `{ messaging_product: 'whatsapp', pin: '<6-digitos>' }`.
3. **Suscribir la app a los webhooks del WABA:**
   `POST /WABA_ID/subscribed_apps`.
4. Guardar en PostgreSQL: `channel` (tenant_id, type=cloud_api, waba_id, phone_number_id,
   token **cifrado**, estado=active).
5. Devolver el canal creado al frontend.

## Verificación

- Enviar un mensaje de prueba con `POST /PHONE_NUMBER_ID/messages`.
- Confirmar recepción de webhook de estado (`sent`/`delivered`).
- Confirmar que el token está cifrado en reposo y no aparece en logs.

## Errores comunes

- **Número ya activo en la app de consumidor:** el cliente debe borrar esa cuenta o usar otro número.
- **App no aprobada (advanced access):** en modo live solo funcionan permisos aprobados por App Review.
- **PIN de 2FA:** si el número tiene two-step verification, hay que usar/limpiar el PIN.

## Referencias

- Embedded Signup: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/
- Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
