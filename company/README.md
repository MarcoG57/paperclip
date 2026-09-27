# Evidence-first company: personalización del fork

**Código y configuración nativa, no una segunda plataforma de agentes.** Este directorio define un equipo opcional de doce perfiles, cinco proyectos y siete tareas iniciales. Se integra en el catálogo de Paperclip. Importar no inicia la empresa, no hace llamadas a modelos y no autoriza gasto.

El repositorio es público. Aquí no se almacenan datos de fundadores, clientes, empleadores, credenciales ni el estado de una instancia real. Los nombres de modelos son bindings solicitados, no garantía de acceso en una cuenta ni un benchmark propio. El presupuesto de US$100/mes es un ejemplo revisable, **no una autorización de consumo**.

## Lectura y navegación

- [Cómo modificarlo con LLMs](AGENTS.md).
- [Instalación y operación](OPERATIONS.md).
- [Arquitectura y límites de seguridad](ARCHITECTURE.md).
- [Revisión del código y alcance](AUDIT.md).
- [Backlog priorizado](ROADMAP.md).
- [Pruebas y estado real](VALIDATION.md).
- [Configuración canónica](evidence-first/preset.json), [contrato compartido](evidence-first/COMMON.md) y [roles](evidence-first/roles/).

## Cambios efectivos sobre Paperclip

1. El valor predeterminado de bypass de Codex pasa a `false` en su fuente compartida: UI, onboarding y ejecución consumen esa constante. Se conservan los overrides explícitos existentes; esto no migra agentes ya guardados.
2. La instalación desde el catálogo transmite `pauseAutomations=true` por defecto al importador nativo. Existe un opt-out explícito para operadores, no utilizado por este preset.
3. Los adaptadores declarados por el paquete dejan de ser sustituidos silenciosamente por el fallback de catálogo. Un override explícito del operador sigue teniendo precedencia.
4. Se puede fijar `expectedContentHash` entre preview e instalación. Un cambio de paquete produce un conflicto antes de importar.
5. Se incorpora un equipo nativo `evidence-first-company`, opcional y sin skills externos ni tareas recurrentes.

La capa adicional se limita a un generador, un cliente de instalación que valida el resultado, un supervisor de procesos Linux y herramientas offline de evidencia/costes. No modifica tablas, no sustituye el scheduler ni implementa otra cola de tareas.

## Inicio para desarrolladores: sin servidor ni credenciales

Desde la raíz del fork, con Node compatible con Paperclip y Python 3:

```bash
node scripts/company/index.mjs validate
node --test tests/company/*.test.mjs
python3 -m unittest discover -s tests/company -p 'test_*.py' -v
```

Después de instalar las dependencias normales del monorepo:

```bash
pnpm --filter @paperclipai/teams-catalog validate
pnpm --filter @paperclipai/teams-catalog test
```

Para editar el equipo: modificar `company/evidence-first/`, ejecutar `node scripts/company/generate.mjs`, después `pnpm --filter @paperclipai/teams-catalog build:manifest`, revisar el diff y repetir pruebas. Nunca corregir directamente los archivos generados.

## Equipo y forma de trabajar

| Función | Binding inicial | Trabajo |
|---|---|---|
| Dirección, Producto, Arquitectura/review | Astra medium | Decisiones delimitadas y revisión de hitos |
| Research, Ingeniería A/B, QA, Plataforma | Luna max | Investigación e implementación acotadas con evidencias |
| Diseño, Growth | Sol high | Entregables revisables, sin publicación autónoma |
| Soporte, Finanzas | Luna medium | Clasificación e interpretación de inputs y cálculos verificados |

No son doce agentes funcionando permanentemente. Se importan pausados, sin timers ni wake-on-demand, con un máximo por agente de uno. El supervisor `company-bwrap`, una vez instalado y probado en el host, limita a cuatro los procesos que pasan por él. No controla otras sesiones personales ni todo posible consumo HTTP.

Las instrucciones promueven: español claro, fuentes y supuestos explícitos, mínima complejidad, root cause antes de parchear, tests deterministas, revisión separada del implementador y resultados visibles. No se simulan empleados humanos, clientes, entrevistas ni ingresos.

## Estado

Consultar [VALIDATION.md](VALIDATION.md) y la CI del commit exacto. El código de instalación no se ha ejecutado contra una instancia del propietario. Las pruebas de importación usan una DB temporal. Las pruebas de procesos usan ejecutables falsos, no certifican el sandbox del host. Ningún resultado de configuración implica `runtimeReady=true`.
