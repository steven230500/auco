# AUCO · API de validaciones

Servicio Node.js que recibe un nombre y un número de documento. Agify estima una edad a partir del primer nombre. MongoDB guarda el registro y DynamoDB Local guarda el evento de creación. Solo se envía el primer nombre a Agify.

## Ejecutar

Requisitos: Node.js 20.9 o posterior, npm, Docker y Docker Compose v2.

Desde la raíz del repositorio:

```bash
docker compose up -d --wait
cd api
cp .env.example .env
npm ci
npm start
```

El servidor inicializa la tabla de auditoría y los índices de MongoDB al arrancar. La API escucha en `127.0.0.1:3000`.

## Pruebas

Desde `api/`:

```bash
npm run check
npm run test:integration
```

- `check` ejecuta diez pruebas con dobles para las bases y el proveedor. Cubre creación y consulta, entradas inválidas, errores externos, preservación de ceros iniciales y fallos de persistencia y auditoría.
- `test:integration` usa MongoDB y DynamoDB Local con un proveedor simulado. Comprueba creación, consulta, escritura del evento y conciliación idempotente. Usa documentos ficticios.

Con el servidor y las bases activos, prueba el flujo completo con Agify desde otra terminal:

```bash
curl -i http://127.0.0.1:3000/validations \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana María","documentNumber":"0012345"}'
```

El `POST` debe devolver `201` con un `id`. Usa ese id para consultar el registro:

```bash
curl -i http://127.0.0.1:3000/validations/REEMPLAZAR_ID
```

El `GET` debe devolver `200` con `auditStatus: completed` y `enrichment.source: agify`. La consulta externa está sujeta a disponibilidad y cuota. Usa solo datos ficticios en esta demostración.

Para detener las bases y conservar sus datos, ejecuta `docker compose stop` desde la raíz.

## Arquitectura

El servicio valida la entrada, consulta Agify, inserta el registro en MongoDB como pendiente, escribe la auditoría en DynamoDB Local y confirma el estado en MongoDB. Si falla la auditoría, devuelve `503` con el id y conserva el registro para `npm run audit:reconcile`.

[Arquitectura y llaves] · [Contrato HTTP] · [Decisiones y mejoras]

[Arquitectura y llaves]: docs/01-arquitectura.md
[Contrato HTTP]: docs/02-contrato-api.md
[Decisiones y mejoras]: docs/03-decisiones.md
