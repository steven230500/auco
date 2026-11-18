# Contrato HTTP

## POST /validations

`Content-Type: application/json`. Solo estos campos, ambos obligatorios:

```json
{"name":"Ana María","documentNumber":"0012345"}
```

Nombre: trim, espacios consecutivos normalizados, 2–120 caracteres. Documento: trim, cadena de 5–20 dígitos. Campos desconocidos, tipos incorrectos y nombres sin letras válidas se rechazan. Cuerpo máximo 8kb.

Respuesta 201 y cabecera `Location: /validations/<id>`:

```json
{"id":"c1fa302d-afbb-4f00-a1f3-5c9d9ff90b01"}
```

## GET /validations/:id

UUID v4 obligatorio. Ejemplo de respuesta 200 para un registro nuevo:

```json
{
  "id":"c1fa302d-afbb-4f00-a1f3-5c9d9ff90b01",
  "name":"Ana María",
  "documentNumber":"0012345",
  "createdAt":"2026-11-18T12:00:00.000Z",
  "enrichment":{"source":"frankfurter","base":"USD","quote":"COP","rate":3311.44,"date":"2026-11-18"},
  "auditStatus":"completed"
}
```

`rate` indica cuántos pesos colombianos (COP) corresponden a un dólar estadounidense (USD) según la tasa de referencia publicada para `date`. La fecha del proveedor puede ser anterior a `createdAt`. Los registros ya guardados devuelven su enriquecimiento original. `auditStatus` puede ser `pending` si el registro se guardó y falta confirmar su auditoría.

| Estado | Código | Circunstancia |
| --- | --- | --- |
| 400 | `INVALID_INPUT`, `INVALID_JSON`, `INVALID_ID` | Datos inválidos |
| 404 | `NOT_FOUND` | Registro o ruta inexistente |
| 413 | `PAYLOAD_TOO_LARGE` | Más de 8kb |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST sin application/json |
| 502 | `ENRICHMENT_UNAVAILABLE` | Error de red, estado HTTP externo de error o respuesta inválida |
| 504 | `ENRICHMENT_TIMEOUT` | Consulta externa excede el plazo |
| 503 | `AUDIT_PENDING` | Registro persistido, auditoría o confirmación pendiente |
| 500 | `INTERNAL_ERROR` | Error de persistencia u otro fallo inesperado |

Errores: `{"error":{"code":"…","message":"…"}}`. En 503 se añade `error.details.id`; no repetir POST ciegamente, consultar ese id y ejecutar conciliación. Todas las respuestas llevan `Cache-Control: no-store`; errores internos no incluyen credenciales, stacks ni payload del proveedor.
