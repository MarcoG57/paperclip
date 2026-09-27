# Operación: de código a instalación pausada

## Requisitos

Usar este fork construido con sus dependencias fijadas. Ejecutar una release upstream sin el nuevo catálogo no funciona: el cliente lo detecta como drift/ausencia. Paperclip exige Node >=24.11 y el repositorio usa pnpm 9.15.4. Seguir `doc/DEVELOPING.md` para desarrollo y `doc/INSTALLING.md` para servicios. No ejecutar `curl | bash` ni sustituir instalaciones existentes sin inspección.

El cliente necesita una **company vacía y pausada**, creada por un humano en una instancia ya autorizada. No pausa por sorpresa una empresa activa, no crea hosts y no abre puertos. Autenticación, backup de DB y master key deben prepararse antes de operaciones reales.

## Plan y aplicación

Guardar bindings fuera del repositorio, permisos 0600. Copiar la estructura de `bindings.example.json`, sustituyendo el UUID y el identificador real de usuario. No son direcciones de email ni nombres inventados.

```bash
node scripts/company/index.mjs plan --bindings /ruta/privada/bindings.json
node scripts/company/index.mjs preview --bindings /ruta/privada/bindings.json
node scripts/company/index.mjs apply --bindings /ruta/privada/bindings.json --approve-plan sha256:HASH_DEL_PLAN_REVISADO
node scripts/company/index.mjs doctor --bindings /ruta/privada/bindings.json
```

`plan` es offline. `preview` usa POST nativo y puede registrar actividad; no ejecuta agentes. `apply` establece gobernanza/budget mientras la empresa sigue pausada, importa con hash fijado y comprueba el resultado. Una segunda aplicación no modifica una instalación idéntica. Si hay drift o import parcial se bloquea, no intenta sobrescribirlo.

Credenciales de operador solo en `PAPERCLIP_API_KEY` **o** `PAPERCLIP_OPERATOR_COOKIE`, nunca ambos. No pegarlas en shell history ni mensajes. Para HTTPS remoto se exigen credenciales; localhost solo debe utilizarse conforme al modo de autenticación real de la instancia. Los presupuestos propuestos no autorizan configurar una API de pago.

El comando nativo equivalente para el catálogo acepta `--expected-content-hash` y conserva automations pausadas. No usar `--no-pause-automations` durante commissioning. El cliente propio no expone ese opt-out.

## Supervisor Linux

`company-bwrap` debe instalarlo un operador en el PATH del servicio con propietario confiable; no puede residir en un workspace que modifique un agente. Instalar `scripts/company/company_bwrap.py` como ejecutable y verificar `/usr/bin/bwrap`, Python 3 y `/run/user/<uid>` para el usuario de servicio. No cambiar permisos del host indiscriminadamente.

```bash
company-bwrap --company-status
company-bwrap --company-stop
# Solo tras resolver la causa y revisar la company pausada:
company-bwrap --company-resume
```

Cuatro slots compartidos entre las ejecuciones de ese usuario que pasan por el wrapper. Espera máxima 300 s, ejecución máxima 3600 s; señales cancelan el grupo de procesos, timeout=124 y rechazo/STOP=75. STOP cancela nuevas y actuales ejecuciones gestionadas. `--company-resume` elimina el STOP del wrapper, **no reanuda Paperclip**. Como `/run` es temporal, la pausa nativa de company es el mecanismo persistente.

Las pruebas locales del wrapper usan procesos falsos. Probar con el adapter real en staging: acceso denegado fuera del workspace, proxy/egress, cancelación, herencia de procesos y no lectura de DB/master key. Nunca compensar un fallo con `--yolo`.

## Activación humana — no automatizada

Antes de reanudar: modelos/esfuerzos reales, credenciales explícitas, egress revisado, supervisor instalado, dos worktrees aislados, permissions/tools y grants revisados, backup **restaurado** y presupuesto aprobado. Vincular responsables y una policy de revisión a cada tipo de tarea. Activar wake-on-demand solo para los roles probados; mantener timers OFF.

```bash
node scripts/company/index.mjs review-policy --role engineer-a --ids /ruta/privada/ids.json --owner ID_USUARIO
```

`ids.json` mapea slug a UUID de agente. El resultado se aplica a `executionPolicy` de tareas nativas por el operador. Contiene review distinto del implementador cuando corresponde, aprobación humana final y máximo dos rondas. No intercepta herramientas externas. El preset no configura email, clientes Git con escritura, pagos ni despliegues.

## Evidencia y costes

Guardar artefactos privados fuera de Git. `evidence.mjs` comprueba un registro contra `acceptance-cases.json` y un hash del estado evaluado; PASS no se acepta sin archivo/hash/commit/ejecución. Ver ejemplos de tests para el contrato completo. Los doce casos de modelo requieren binding y runId exactos.

```bash
node scripts/company/evidence.mjs /privado/record.json /privado/artifacts company/acceptance-cases.json sha256:HASH_ESTADO
python3 scripts/company/costs.py /privado/ledger.csv
```

CSV: `charge_id,task_id,currency,amount,kind,task_status`. `kind=actual|estimate`. Estado `accepted|rejected|in_progress|unknown`. Importe decimal, incluidas devoluciones negativas. La métrica divide el coste observado total entre tareas aceptadas observadas; incluye retrabajo y fallos. No implica cobertura de tareas sin entradas en el ledger.

## Incidentes y recuperación

- `REMOTE_CATALOG_DRIFT`: revisar el fork desplegado y regenerar un plan; no ignorar el hash.
- `WRITE_OUTCOME_UNKNOWN...`: inspeccionar la instancia antes de repetir. Mantener pausada.
- `PARTIAL_IMPORT_OR_DRIFT...`: comparar recursos, backup y plan; reparar manualmente sin borrar ajenos.
- `INSTALL_LOCK_EXISTS`: comprobar proceso y destino. Un lock tras crash se retira solo después de verificar que no hay otro instalador.
- Cuota agotada, missing model, esfuerzo rechazado: parar y escalar. No cambiar proveedor ni degradar esfuerzo.
- Fallo de aislamiento o lectura fuera de scope: pausar company y wrapper, conservar logs, corregir causa y repetir prueba negativa.

No se incluyen SLAs medidos, jobs de backup ficticios ni una certificación de producción.
