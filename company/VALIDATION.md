# Validación y estado real

## Capas de prueba

| Capa | Comando / prueba | Qué demuestra |
|---|---|---|
| Autoría | `node scripts/company/generate.mjs --check` | Contenido generado coincide con fuentes |
| Herramientas | `node --test tests/company/*.test.mjs` | Contratos, readback con fixture, idempotencia, errores y evidencia |
| Procesos/ledger | `python3 -m unittest discover -s tests/company -p 'test_*.py' -v` | Slots, señales, STOP, Decimal y duplicados |
| Catálogo | `pnpm --filter @paperclipai/teams-catalog test` | Parser y manifest nativos |
| Adapter/schema/service | Vitest de archivos afectados | Defaults, opciones, hashes y adaptadores preservados |
| Persistencia nativa | `teams-catalog-install-no-overrides.test.ts` | Import en PostgreSQL temporal; no ejecución de modelos |
| Host y modelos | `acceptance-cases.json` | **Pendiente**: no sustituible por mocks/CI |

`PAPERCLIP_REQUIRE_EMBEDDED_TESTS=1` convierte la ausencia de soporte de PostgreSQL temporal en error del job; no se acepta un skip como éxito de integración.

Los registros de CI del commit exacto son la evidencia de la suite nativa. Los tests locales usan Node 22.16 para las herramientas independientes; el runtime Paperclip y la CI nativa requieren Node 24.11+. No se afirma compatibilidad de todo Paperclip con Node 22.

## Distinciones obligatorias

- Generación/plan offline no es importación.
- Preview puede registrar actividad, pero no activa agentes.
- Import DB temporal no valida credenciales, cuota, filesystem, red ni modelo real.
- `doctor.configured=true` sigue devolviendo `runtimeReady=false`.
- Tests de supervisor con procesos falsos no prueban Bubblewrap en el host destino.
- Evidencia con hash correcto acredita integridad, no autenticidad de quien la generó.
- US$100 y pesos por rol no son gasto activado ni presupuesto personal confirmado.

La suite completa y build de todo el monorepo no se sustituyen por las pruebas focalizadas. No marcar checks de PR que no se hayan ejecutado.
