# Validación y estado real

## Resultado comprobado

Fecha: 2026-09-27. Código probado: `f2c5c87ccbb72beca5968b82760017bd9050709c`.

[GitHub Actions — ejecución completa correcta](https://github.com/MarcoG57/paperclip/actions/runs/36346188258).

| Capa | Resultado | Alcance |
|---|---|---|
| Generación determinista | PASS | El catálogo generado coincide con las fuentes |
| Herramientas Node | 71 tests PASS | Configuración, API con fixtures, plan/apply, idempotencia, errores y evidencia |
| Procesos y ledger Python | 18 tests PASS | Slots, señales, STOP, Decimal, devoluciones y duplicados |
| Catálogo nativo | 12 tests PASS | Parser, manifest, equipos existentes y equipo opcional |
| Adapter, UI, servicio, rutas e importación | 90 tests PASS | Incluye PostgreSQL temporal real, no modelos |
| Typecheck | PASS | shared, teams-catalog, adapter-codex-local, server y CLI |
| Host y modelos del propietario | NOT_RUN | No se han conectado credenciales ni activado una instancia |
| Suite/build global del monorepo | NOT_RUN | La prueba focalizada no certifica todo upstream |

Los dos jobs `authoring-and-tools` y `native-integration` terminaron correctamente. Las pruebas nativas usaron Node 24.11.0, pnpm 9.15.4 y el lockfile existente. Los tests locales de herramientas usaron Node 22.16.0 y Python 3.13; esto no declara compatible todo Paperclip con Node 22.

## Reproducción

```sh
node scripts/company/generate.mjs --check
node --test tests/company/*.test.mjs
python3 -m unittest discover -s tests/company -p 'test_*.py' -v

pnpm install --frozen-lockfile
pnpm run preflight:workspace-links
pnpm --filter @paperclipai/plugin-sdk ensure-build-deps
pnpm --filter @paperclipai/teams-catalog build:manifest
pnpm --filter @paperclipai/teams-catalog validate
pnpm --filter @paperclipai/teams-catalog test
PAPERCLIP_REQUIRE_EMBEDDED_TESTS=1 pnpm exec vitest run \
  packages/adapters/codex-local/src/index.test.ts \
  packages/adapters/codex-local/src/server/codex-args.test.ts \
  server/src/__tests__/teams-catalog-service.test.ts \
  server/src/__tests__/teams-catalog-install-no-overrides.test.ts \
  server/src/__tests__/teams-catalog-routes.test.ts \
  ui/src/lib/new-agent-runtime-config.test.ts --maxWorkers=1
pnpm --filter @paperclipai/shared --filter @paperclipai/teams-catalog \
  --filter @paperclipai/adapter-codex-local --filter @paperclipai/server \
  --filter paperclipai typecheck
```

La DB de prueba es temporal. `PAPERCLIP_REQUIRE_EMBEDDED_TESTS=1` convierte la ausencia de soporte de PostgreSQL en error; no se presenta un skip como integración correcta.

## Distinciones obligatorias

- Generación/plan offline no es importación.
- Preview puede registrar actividad, pero no activa agentes.
- Import DB temporal no valida credenciales, cuota, filesystem, red ni modelo real.
- La importación segura no aplica políticas de ejecución: el operador las escribe después y comprueba el readback.
- `doctor.configured=true` sigue devolviendo `runtimeReady=false`.
- Tests de supervisor con procesos de prueba no certifican Bubblewrap en el host destino.
- Un hash correcto acredita integridad, no autorización humana ni veracidad independiente.
- El presupuesto configurado es un límite de diseño, no permiso para activar gasto.
- La CI de esta personalización no sustituye la CI global ni los workflows de publicación heredados.

## Instalar el código correcto

La personalización vive en este fork. Una instalación estándar de `paperclipai` desde npm no incluye automáticamente estos cambios. Para staging, utiliza el checkout de esta rama o un commit exacto revisado del fork, con los requisitos de [instalación](../doc/INSTALLING.md). No sustituyas el fork por upstream al seguir un tutorial antiguo. Conserva los datos y credenciales existentes; todavía falta el commissioning de [OPERATIONS.md](OPERATIONS.md).

Los hallazgos y las correcciones que surgieron de la CI están en [CI_FINDINGS.md](CI_FINDINGS.md). Las pruebas de host y modelos pendientes están en [acceptance-cases.json](acceptance-cases.json).
