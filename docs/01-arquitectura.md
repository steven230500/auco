# Arquitectura y consistencia

Flujo: HTTP → validación → Frankfurter (USD/COP) → inserción MongoDB pendiente → PutItem DynamoDB → confirmación MongoDB → HTTP 201.

| Archivo | Dueño de la decisión |
| --- | --- |
| `api/src/app.js` | JSON, límites de cuerpo, códigos HTTP y respuesta uniforme |
| `api/src/service.js` | Normalización, flujo de creación, UUID y evento determinista |
| `api/src/enrichment.js` | Timeout 4 s, validación de la respuesta y reducción de campos |
| `api/src/storage.js` | MongoDB, índices, tabla y cliente DynamoDB Local |
| `api/scripts/reconcile.js` | Reenvío secuencial de auditorías pendientes |

Los puertos son objetos pequeños inyectados, sin framework adicional. Pruebas HTTP ejercitan aplicación y servicio; dobles reemplazan únicamente IO. Integración adicional conecta los drivers reales.

## MongoDB

Colección `validations`: `id` UUID v4 único, `name`, `documentNumber`, `createdAt` ISO UTC, `enrichment` y `auditStatus` (`pending` o `completed`). `_id` interno nunca se expone. Índices únicos por id y de consulta por estado pendiente. Mongo es la fuente de verdad del registro y su intención de auditar.

## DynamoDB

Tabla `auco-audit`: partition key `pk = DOCUMENT#<documentNumber>` y sort key `sk = <createdAt ISO UTC>#<validationId>`. Un documento agrupa su historial; el prefijo de fecha permite consultar rangos cronológicos mediante Query. UTC de anchura fija ordena lexicográficamente. El UUID evita colisiones si dos registros tienen la misma fecha al milisegundo. No hace falta índice secundario para el patrón pedido. Ejemplo de clave: `DOCUMENT#0012345`, `2026-11-18T12:00:00.000Z#<uuid>`.

El evento guarda `eventType`, `validationId` y `createdAt`, sin nombre ni respuesta completa del proveedor. Reescribir el evento de un mismo registro usa exactamente las mismas llaves y reemplaza idéntico contenido: la conciliación es idempotente. Registros con el mismo documento y UUID distintos mantienen eventos distintos. El contrato inicial solo requiere un evento de creación; más tipos necesitarían incluir tipo/secuencia en la llave.

## Consistencia y fallos

No existe transacción atómica entre estas bases. No se promete exactamente una ejecución global ni rollback distribuido.

- Si falla Frankfurter, no se escribe ninguna base.
- Si falla Mongo antes de confirmar la inserción, no se solicita auditoría. Un timeout ambiguo de Mongo puede haber insertado: quedaría pendiente y conciliable.
- Si falla Dynamo tras la inserción, se devuelve 503 `AUDIT_PENDING`, con el id para consultar el registro guardado. No devolver 201 evita afirmar que ambas bases están completas.
- Si Dynamo escribió pero la confirmación de Mongo falla, el registro sigue pendiente; reconciliar repite el mismo evento sin duplicarlo.
- Si el proceso cae después de insertar Mongo, la intención de auditar queda durable en ese mismo documento.
- Si se pierde la respuesta HTTP después del éxito, repetir POST crea otro registro. No hay idempotencia de peticiones del cliente; consultar el id cuando está disponible y evitar reintentos ciegos.

`npm run audit:reconcile` recorre pendientes, escribe y confirma uno a uno. Se detiene ante el primer fallo y conserva pendientes para otra ejecución. No es un worker automático: una caída requiere ejecutar esta recuperación. Lecturas GET muestran pendientes para que el consumidor no confunda persistencia con auditoría completa. No hay borrado de compensación: borrarlo también podría fallar y perdería evidencia.
