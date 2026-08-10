# PoC-Spec — Módulo "Sign & Pay" (KYC + Firma + Cobro en WhatsApp)

> **Artefacto aislado.** No modifica el Plan Maestro, reglas ni tareas. Sirve para validar los
> puntos críticos antes de formalizar el módulo como fase del proyecto. Es desechable.

## 1. Objetivo

Obtener evidencia técnica (go/no-go) de los 3 riesgos del módulo, con el mínimo código posible:

1. **Cámara en el webview de WhatsApp Flows** — ¿permite `getUserMedia` para capturar cédula
   (frontal/posterior) y selfie/liveness? Si **no**, validar el fallback: CTA URL → navegador del
   teléfono → retorno al chat.
2. **Biometría vía API REST del cliente** — invocar liveness + face-match desde nuestro backend y
   obtener veredicto.
3. **Firma PAdES real con la PKI del cliente** — firmar un PDF en **ambos niveles**: FEA (avanzada)
   y FEC (cualificada).

Complementos mínimos: **arranque externo por REST** (una empresa lanza el flujo a un usuario) y
**cobro opcional** (QR DeUna / redirect).

## 2. Alcance (mínimo y desechable)

- Un único flujo recortado: **firma transaccional** (cubre KYC + firma + cobro en un solo camino).
- **No** incluye: multi-tenant productivo, builder de flujos, UI final, escalado, persistencia real.
- Meta: entorno de prueba (número sandbox de Cloud API).

## 3. Hipótesis y criterios de éxito

| # | Hipótesis | Criterio de éxito | Fallback si falla |
|---|-----------|-------------------|-------------------|
| H1 | El webview de Flows accede a la cámara | Se captura foto de cédula y selfie/video desde el webview | CTA URL abre navegador del teléfono para el paso de captura |
| H2 | La API REST biométrica responde con veredicto | Recibimos match + liveness score y lo persistimos como evidencia | Ajustar payload/formato con el cliente |
| H3 | La PKI firma PDF (PAdES) FEA y FEC | Se generan 2 PDFs firmados válidos + verificables | Definir con el cliente firma remota/HSM/one-shot |
| H4 | Arranque externo por REST | `POST .../runs` envía el mensaje que abre el flujo | — |
| H5 | Cobro opcional | QR DeUna o redirect confirma pago por webhook | — |

## 4. Arquitectura del PoC

```
Empresa (REST)  ──POST /runs──►  Backend PoC ──► envía mensaje WhatsApp (Flow/CTA)
                                     │
Usuario (WhatsApp)                   │
   │ abre Flow/webview               │
   ▼                                 ▼
Webview HTTPS (captura) ──► Endpoint Flows (AES-GCM) / API PoC
   - cédula frontal/posterior             │
   - selfie / liveness                    ├─► API REST biométrica (cliente)   [H2]
                                          ├─► Servicio de firma / PKI (cliente) → PAdES  [H3]
                                          ├─► Pasarela (DeUna QR / redirect)   [H5]
                                          └─► Arma PDF firmado + paquete probatorio
                                                   │
                                                   ▼
                                     Entrega PDF por WhatsApp (documento) + webhook a la empresa
```

## 5. Experimentos (orden de ejecución)

- **E1 — Cámara en webview (H1).** Publicar un Flow con una pantalla webview que intente
  `getUserMedia`. Medir en Android y iOS. Registrar si hay permiso de cámara o bloqueo.
- **E2 — Biometría REST (H2).** Enviar las imágenes capturadas al backend PoC → llamar a la API
  del cliente → registrar veredicto (match, liveness, score, id de transacción biométrica).
- **E3 — Firma PAdES (H3).** Firmar un PDF de ejemplo con la PKI del cliente en FEA y en FEC.
  Verificar validez (validador PAdES) y binding con la evidencia biométrica (hash + timestamp).
- **E4 — Arranque externo (H4).** `POST /flows/firma-transaccional/runs` con `to`, `prefill`,
  `callbackUrl` → confirmar que llega el mensaje al usuario y que el `runId` reporta estado.
- **E5 — Cobro opcional (H5).** Insertar paso `payment` (QR DeUna y, alternativamente, redirect) y
  confirmar el pago por webhook antes de continuar el flujo.

## 6. Contratos mínimos a acordar con el cliente (PENDIENTES)

- **API REST biométrica:** URL(s), auth, formato de request (¿multipart de imágenes? ¿base64?),
  formato de response (match/liveness/score), sandbox y límites.
- **Servicio de firma / PKI:** cómo se invoca (endpoint REST / HSM / SDK), formato de entrada/salida,
  **cómo se selecciona FEA vs FEC**, si emite **certificado efímero one-shot** por transacción, y si
  hay entorno de pruebas con certificados de test.
- **Pago:** credenciales sandbox de DeUna (`DEUNA_API_KEY`, `DEUNA_POS_ID`) y/o de la pasarela para redirect.

## 7. Requisitos para ejecutar el PoC

- App de Meta con **WhatsApp Flows habilitado** + número de prueba (Cloud API).
- Endpoint **HTTPS público** para el webview y el endpoint de Flows (túnel tipo ngrok/cloudflared).
- Cifrado **AES-GCM** en el endpoint de Flows (obligatorio en producción de Flows).
- Documentación + credenciales sandbox de: API biométrica, servicio de firma/PKI, DeUna.

## 8. Entregables del PoC

- Reporte por experimento con resultado go/no-go y evidencias.
- **Decisión de superficie de captura**: webview de Flows vs navegador vía CTA URL.
- PDF de ejemplo firmado en **FEA y FEC** + paquete probatorio de muestra.
- Recomendación de diseño para formalizar la fase "Sign & Pay" (pasos del motor, contratos REST,
  modelo de datos de `flows`, `flow_runs`, `evidence`).

## 9. Riesgos conocidos

- Meta puede **restringir la cámara** en el webview de Flows → dependeríamos del fallback a navegador.
- Firma remota: latencia y formato de la PKI; disponibilidad de sandbox.
- Legal: la **FEC cualificada** exige PKI acreditada en Ecuador; confirmar acreditación por caso de uso.

## 10. Fuera de alcance del PoC

- Builder visual de flujos, multi-tenant productivo, UI definitiva, escalado y observabilidad.
- Estos se abordan al formalizar la fase, solo si el PoC es go.
