# Contrato de trabajo con LLMs

Lee primero el `AGENTS.md` de la raíz y luego este documento. No necesitas cargar todo el monorepo para cada tarea.

## Fuentes de autoridad

| Cambio | Fuente que editar | Pruebas mínimas |
|---|---|---|
| Modelos, esfuerzos, pesos, organigrama, tareas | `company/evidence-first/preset.json` | Generador, Node, catálogo y DB import |
| Conducta de agentes | `COMMON.md` o `roles/<slug>.md` | Generador y diff de instrucciones |
| Contrato REST del catálogo | validators/types + routes/services nativos | Schema y service tests |
| Plan/apply/readback | `scripts/company/install.mjs` | Fixture end-to-end, negativos y contrato nativo |
| Aislamiento/límite de procesos | `company_bwrap.py` | Python + host staging real antes de activar |
| Costes | `costs.py` | Decimal, duplicados y monedas separadas |
| Evidencia | `evidence.mjs` | Pruebas adversariales y correspondencia con caso/commit |

`packages/teams-catalog/catalog/optional/company-defaults/evidence-first-company/` y `generated/catalog.json` son salidas generadas. No almacenar configuración viva ni credenciales. No leer o copiar repositorios privados para completar documentación pública.

## Un único integrador

Una sesión principal mantiene el plan y aplica cambios compartidos. Hasta tres subagentes pueden investigar o implementar en worktrees con ownership de archivos disjunto. Entregar a cada subagente: objetivo, base SHA, archivos permitidos, interfaces, aceptación, comandos de prueba y límites. No habilitar subagentes internos de los workers de la empresa solo porque la instalación use delegación.

Antes de escribir: `git status`, lectura de arquitectura y tests afectados. No descartar cambios ajenos. No modificar el lockfile manualmente: conservar el proceso de upstream. Evitar una abstracción nueva cuando la API nativa cubra la necesidad.

## Bucle de implementación

1. Reproducir el problema o escribir un test negativo.
2. Cambiar la fuente de autoridad, no el síntoma ni la salida generada.
3. Regenerar lo necesario; revisar diff y permisos, también los valores omitidos.
4. Ejecutar pruebas concretas. Declarar cuáles no se ejecutaron y por qué.
5. Entregar estado, archivos, evidencia, riesgos y siguiente bloqueo concreto.

No cambiar modelos, esfuerzos, proveedor o red silenciosamente. Un hash valida integridad, no una aprobación humana. Un test con mocks no valida una base de datos. Un import a DB temporal no valida credenciales, sandbox, facturación ni una empresa comercial.

## Definición de terminado

Código implementado + test relevante + documentación que distingue diseñado/configurado/probado/activado. No dar por terminada una tarea de producción porque `doctor` confirme configuración. No activar gasto, acceso público, contratación o mensajería sin intervención humana explícita.

Mantén las modificaciones a upstream pequeñas y documentadas en [AUDIT.md](AUDIT.md). Para cambios incompatibles, añade una decisión breve con alternativa descartada, motivo y rollback. No mezcles reformat de todo upstream con una feature.
