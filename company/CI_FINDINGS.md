# Hallazgos de integración y criterios de entrega

## Entorno limpio y persistencia real

La validación se ejecuta con Node 24.11.0, pnpm 9.15.4, lockfile existente y PostgreSQL temporal. `PAPERCLIP_REQUIRE_EMBEDDED_TESTS=1` impide presentar un skip de la DB como éxito.

1. La primera ejecución nativa identificó un prerequisito de build de `@paperclipai/plugin-sdk`. Se usa su comando `ensure-build-deps`, sin simular el SDK ni eliminar la prueba.
2. La primera importación del nuevo equipo con DB real rechazó `executionWorkspacePolicy`: Teams Catalog importa deliberadamente en modo `agent_safe`. La corrección mantiene intacto ese límite. El catálogo contiene estructura/instrucciones; un plan revisado por el operador aplica posteriormente las cinco políticas de proyecto mientras la company permanece pausada.
3. Se añadieron negativos para destino de otra company, activación concurrente y fallo de PATCH. El cliente no reintenta escrituras ni reporta una instalación completa ante un error parcial.

## Qué mirar en GitHub Actions

Consultar el workflow **Evidence-first company** del commit que se pretende utilizar. El job de autoría prueba 71 casos Node y 18 casos Python. El job nativo incluye el parser/catálogo, defaults Codex/UI, servicio/rutas, importación real y typecheck de los paquetes afectados. Una etapa no ejecutada no equivale a PASS.

No se ha ejecutado una instancia del propietario, un proveedor LLM, el sandbox real del host ni una restauración de sus datos. No está aprobada la activación de gastos o agentes.

## Integración de la rama y CI heredada

La rama de trabajo no activa los workflows de publicación vinculados a `master`. Antes de integrar en esa rama, revisar la CI heredada de upstream: Docker/GHCR, releases/npm, refresh automático del lockfile y el reviewer con credenciales de upstream. No mezclar una publicación de código solicitada con autorización de publicar imágenes, paquetes, ejecutar modelos de pago o desplegar infraestructura.

Los jobs temporales de transferencia/generación usados durante la implementación se retiran del árbol final. La CI permanente de esta personalización es read-only y no tiene credenciales de modelos.
