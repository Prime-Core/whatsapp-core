# Skill 00 — Flujo de trabajo

Aplica **siempre** que se trabaje en una tarea.

## Antes de empezar

1. Abrir `docs/PLAN-MAESTRO.md` y confirmar en qué fase estamos.
2. Abrir `tasks/README.md` y elegir la **primera** tarea con estado ⬜ de la fase activa
   (no saltar de fase sin que la anterior esté ✅).
3. Abrir el archivo `tasks/TASK-XXX-*.md` y leer objetivo, alcance y checklist.
4. Revisar `skills/` por si hay un playbook aplicable.
5. Revisar `.trae/rules/project_rules.md`.

## Durante

1. Poner la tarea en 🟨 en `tasks/README.md`.
2. Implementar **solo** lo del alcance de la tarea. Nada extra.
3. Respetar la abstracción de canal y el aislamiento multi-tenant.
4. No commitear secretos.

## Al terminar

1. Marcar cada item del checklist de la tarea.
2. Verificar (build/lint/tests si aplica).
3. Cambiar el estado de la tarea a ✅ en `tasks/README.md`.
4. Actualizar el estado de la fase en `docs/PLAN-MAESTRO.md` si la tarea la completa.
5. Si aparecieron tareas nuevas, agregarlas al backlog (no ejecutarlas aún).

## Cuándo parar y preguntar

- La tarea contradice el plan o una regla.
- Falta una decisión de negocio (precios, límites de plan, país por defecto, etc.).
- Se necesita un secreto/credencial que no está disponible.
