# Alcance de revisión y mapa de cambios

Fecha de referencia: 2026-09-27. Base del fork: `0f14d261233c545aa6a8a38ec253c498a5130fff`.

## Qué se revisó

Se obtuvo una copia completa de los archivos tracked y se inventariaron los subsistemas. La lectura semántica se concentró en los caminos afectados: diseño/AGENTS, catálogo/parser/manifest, portabilidad/import y estados, schemas de company/agent/project/issue/budget, instrucciones gestionadas, redacción, adaptador Codex, consumidores de defaults en UI/onboarding, permisos, pruebas y workflows.

**No es una auditoría manual línea por línea de todo el monorepo**, ni una auditoría de seguridad de todos sus módulos. Inventariar un archivo no equivale a entender y verificar todas sus ramas. No se ejecutó el código de una instancia del propietario ni se utilizaron credenciales de modelos.

## Hallazgos y decisiones

| Hallazgo en esta base | Acción |
|---|---|
| GPT-6 y `max` ya aparecen en adapter/CLI | Reutilizar; no agregar soporte duplicado |
| Default compartido Codex bypass=true | Cambiar a false con regresión direct/resume y preservar opt-in explícito |
| El catálogo no pasaba pauseAutomations al importador | Propagar true por defecto y documentar opt-out |
| Fallback del catálogo reemplazaba adaptador del sidecar | Conservar tipo declarado; no fallback silencioso |
| Preview podía aplicarse contra otro contenido | Comparación de expectedContentHash antes de import |
| El importador ya cubre jerarquía/proyectos/blockers | Generar un equipo nativo en vez de otro runtime |
| El parser portable no aplica executionPolicy de tareas | Generar PATCH aparte y mantener activación bloqueada operativamente |
| Config API redacciona incluso variables vacías | Verificar tipo/presencia y declarar valor no comprobable |
| No hay atomicidad completa entre servicios | Rechazar import parcial/drift; no retries writes ni cleanup destructivo |
| Prompts no garantizan permisos o coste | Separar policy declarada, controles nativos y pruebas host pendientes |

## Archivos propios y puntos de integración

- `company/evidence-first/`: configuración y comportamiento canónicos, sanitizados para publicación.
- `scripts/company/`: utilidades pequeñas sin dependencias de runtime nuevas.
- `tests/company/`: pruebas deterministas y de procesos; no modelos.
- `packages/teams-catalog/catalog/optional/company-defaults/evidence-first-company/`: paquete generado para importador/UI existentes.
- `server/src/services/teams-catalog.ts`: defaults, adapter declarado y guard de hash.
- `packages/shared/src/{types,validators}/teams-catalog.ts` y CLI: contrato público de las opciones.
- `packages/adapters/codex-local/`: default de sandbox y tests correspondientes.

## Privacidad y compatibilidad

La personalización aplica forma de trabajar, no datos biográficos. No se copió el repositorio privado de planificación ni información de otras personas. Se mantiene la licencia y el producto upstream. Las instrucciones y budgets propuestos son editables; el fork no presenta las asignaciones como benchmarks universales.

La release estable del plan anterior no es la base exacta de este fork. Este trabajo sigue el commit presente, sin hacer downgrade a aquel tag ni asumir que los problemas antiguos siguen sin corregir. Los problemas del pool/wake queue permanecen en backlog hasta una reproducción actual; no se publicita un fix no probado.
