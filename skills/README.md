# Skills (Playbooks) — whatsapp-core

Los "skills" son procedimientos operativos (SOPs) que definen **qué hacer y cuándo**.
Antes de ejecutar una tarea, revisá si hay un skill aplicable y seguilo.

## Índice

| Skill | Cuándo usarlo |
|---|---|
| [00 — Flujo de trabajo](./00-flujo-de-trabajo.md) | Siempre, al iniciar/terminar cualquier tarea. |
| [10 — Onboarding Cloud API](./10-onboarding-cloud-api.md) | Al implementar o depurar el Embedded Signup y registro de número. |
| [20 — Conexión Baileys](./20-conexion-baileys.md) | Al implementar o depurar la conexión por QR y sesiones. |
| [30 — Agregar un adaptador de canal](./30-agregar-canal.md) | Al crear un nuevo canal o modificar la abstracción `ChannelAdapter`. |
| [40 — Pasarelas de pago](./40-pasarelas-pago.md) | Al implementar o modificar el cobro (Stripe, PagoPlux, Kushki, DeUna). |

## Reglas de oro

- Un skill nunca contradice `.trae/rules/project_rules.md`. Si hay conflicto, gana la regla.
- Si una tarea repetitiva no tiene skill y la vas a hacer más de una vez, creá el skill.
