# Arquitectura y límites

```text
Operador humano
  ├─ plan / preview / apply / doctor — scripts/company
  └─ instancia Paperclip existente y pausada
       ├─ Teams Catalog — paquete local y hash revisado
       ├─ importador nativo — agentes, instrucciones, proyectos, blockers
       ├─ budgets y policies nativos
       └─ codex_local / engine=cli
            └─ company-bwrap → /usr/bin/bwrap → Codex
```

## Decisiones

**Integrar en vez de reescribir.** La persistencia, las dependencias y las instrucciones usan el importador nativo. No hay migraciones ni un dispatcher independiente. La UI de catálogo ya muestra el nuevo equipo; no se duplica una pantalla de onboarding.

**Importar pausado.** `pauseAutomations` ya existía en portabilidad; el catálogo no lo propagaba. Ahora es true por defecto. Los templates que no declaran adaptador conservan el fallback histórico; los que sí lo declaran conservan su tipo. El guard `expectedContentHash` compara el paquete nativo antes de importarlo.

**CLI explícito.** El código de esta base exige CLI para confinamiento local de filesystem/red. ACP no recibe un fallback automático. Los modelos GPT-6 y los esfuerzos solicitados ya estaban soportados; no se ha inventado otro adapter.

**Plan ligado a destino y contenido.** El hash incorpora company ID, responsable humano, políticas, catálogo y código del cliente. `apply` necesita ese hash explícito. Solo opera sobre una empresa pausada sin recursos ajenos. Una instalación parcial o drift requiere inspección; no se borra ni se reescribe una company para ocultar un error.

**Límites de atomicidad.** El importador no es una transacción única entre todos los servicios. Puede persistir parte del trabajo si falla una fase. El cliente no reintenta writes automáticamente. El lock local impide dos invocaciones del mismo usuario/host, no sustituye un lock distribuido entre distintos operadores. Mantener un único operador durante commissioning.

## Matriz: mecanismo y límite real

| Control | Implementación | Lo que NO acredita |
|---|---|---|
| Bypass desactivado | Default compartido + preset explícito | No revoca bypass guardado previamente |
| Arranque pausado | Opción real del importador y readback | No demuestra disponibilidad de modelos |
| Concurrencia 4 | flock sobre cuatro slots del supervisor Linux | No cuenta llamadas fuera del wrapper |
| Parada | STOP local + cancelación de process group | STOP en `/run` no sobrevive reinicio; pausar company para persistencia |
| Restricción de red | Policy allowlist del adapter nativo | Requiere probar namespace/proxy y auth en el host |
| Permisos | Flags explícitos y ausencia de nuevas conexiones | No todos los permisos de skills/tools se reducen a tres flags |
| Budget | Policy nativa billed_cents, hard stop y warning | No garantiza coste instantáneo exacto ni representa cuota de suscripción |
| Review | Payload de stages nativos con humano final | Generar el JSON no lo adjunta a las tareas |
| Evidencia | Validación de esquema, hash, ruta, fecha, binding | No autentica al autor ni hace verdadero un log inventado |
| Costes | Decimal y deduplicación de ledger | No estima cargos ausentes ni mezcla monedas |

## Protección del cliente HTTP

Origen HTTPS o loopback literal; sin credenciales en URL; `Origin` explícito; redirects rechazados; timeout y tamaño máximo; credenciales solo en entorno; respuestas de error no se vuelcan al log. El servidor decide quién es board: un token de agente no se convierte en permiso de administrador por usar este cliente.

El endpoint de configuración redacciona incluso un `OPENAI_API_KEY` vacío. `doctor` comprueba presencia/tipo y declara el valor no verificado. No compara un secreto oculto con una cadena vacía ni trata la redacción como prueba de seguridad.

## Evolución

Conservar `master`/upstream como referencia y revisar cada actualización contra los tests de este fork. Antes de cambiar catálogo/modelos: regenerar, revisar hash, tomar backup real, aplicar en staging y ejecutar readback. Para deshacer código: revert de los commits del fork. Para deshacer datos: restauración del backup verificado; no hay comando destructivo automático.

## Frontera del importador seguro

El catálogo nativo usa `agent_safe`: no acepta `executionWorkspacePolicy` en los
assets. El preset no intenta saltarse esa restricción. El plan de operador
incluye cinco políticas de workspace, las aplica con `PATCH /api/projects/:id`
después de importar y verifica de nuevo que la empresa esté pausada antes de
cada operación. Los UUID y la pertenencia a la company se validan antes del
primer PATCH. `doctor` exige el resultado final; la importación nativa por sí
sola no configura aislamiento. Un fallo parcial no activa ni reintenta trabajo:
requiere inspección y reparación humana con la empresa todavía pausada.
