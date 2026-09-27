# Backlog priorizado y estado

`IMPLEMENTED` = existe código; no equivale a activado en un host. Para pruebas, consultar CI/VALIDATION. Ninguna fila autoriza gasto o publicación.

| ID | Estado | Entregable y valor | Aceptación |
|---|---|---|---|
| F01 | IMPLEMENTED | Default Codex sin bypass | Direct/resume seguros; true explícito conservado |
| F02 | IMPLEMENTED | Import nativo pausado y hash revisado | Preservar adapter, conflicto de hash antes de writes |
| F03 | IMPLEMENTED | Equipo generado de 12 perfiles | Manifest consistente; import real crea jerarquía/proyectos/backlog |
| F04 | IMPLEMENTED | Plan/apply/doctor restrictivo | Negativos, segunda aplicación sin writes y drift detectado |
| F05 | IMPLEMENTED | Supervisor cuatro slots + STOP | Concurrencia/cancelación/locks probados; falta host real |
| F06 | IMPLEMENTED | Evidencias y ledger determinista | Rechazar PASS sin artefacto y separar cargos/monedas |
| H01 | NOT_RUN | Commissioning con un adapter real | Registrar modelo/effort efectivos y runId; no asumir del catálogo |
| H02 | NOT_RUN | Sandbox, egress y separación de secretos | Intentos de escape/host reads fallan; proveedor y API interna funcionan |
| H03 | NOT_RUN | Worktrees en paralelo | Dos tareas sin compartir checkout; reviewer inspecciona commit exacto |
| H04 | NOT_RUN | DB/assets/master key y restore | Restaurar en destino aislado, nunca sobre original; evidencia de lectura |
| H05 | NOT_RUN | Budget, cuotas y corte | Unknown no es cero; no retries durante cuota agotada; distinguir API/subscription |
| H06 | NOT_RUN | Enforcing permisos/grants | Probar tools/skills/hire/assignment prohibidos; no basarse solo en prompts |
| H07 | NOT_RUN | Unificar policies por tipo de tarea | Vincular review-policy a tareas antes de habilitar asignaciones |
| H08 | NOT_RUN | Workflow end-to-end completo | Handoff → code → tests → review → humano, sin self-wake loop |
| P01 | TODO | Plan/apply multi-operador atómico nativo | Reservation server-side; dos clientes no pueden duplicar import |
| P02 | TODO | Goals y decisiones nativas ligadas a proyectos | Trazabilidad sin inventar ingresos ni convertir toda actividad en KPI |
| P03 | TODO | Reproducción de pool/wake-queue concurrente | Test DB pequeño reproduce/falla antes de proponer patch; evitar parche especulativo |
| P04 | TODO | Evaluar modelos/efforts con tareas propias | Mismos inputs/baseline, aceptación inicial, retrabajo, coste y tiempo humano |
| P05 | TODO | Retención y contexto de sesiones | Límite explícito; handoff compacto; no reinicios que pierdan decisiones |
| P06 | TODO | Grabar evidencias desde runner confiable | Reducir dependencia de registros escritos por el modelo; no llamar firma a un hash |
| P07 | TODO | Primer experimento comercial | Tres oportunidades distintas, alternativa sin IA y señal real de usuario |
| P08 | DEFERRED | Email/chat/GitHub-write/deploy | Solo tras caso útil, revisión de permisos y aprobación humana de efectos |
| P09 | DEFERRED | Más agentes/proveedores/sandboxes externos | Necesidad medida; evitar otro framework y costes de cambio sin beneficio |

Orden de commissioning: H01/H02 → H03/H04/H05/H06 → H07 → H08. La investigación de P07 puede prepararse con datos públicos, pero contactar usuarios o pagar herramientas sigue siendo humano.

No convertir esta tabla en un segundo gestor de tareas activo. Al operar, importar los pendientes relevantes en Paperclip con un responsable y evidencia, manteniendo aquí solo roadmap y decisiones de producto del fork.
