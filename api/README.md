# Servicio de validaciones

Servicio hijo de [AUCO](../README.md). Ejecución, variables y comandos completos en el README raíz; contrato en [`docs/02-contrato-api.md`](../docs/02-contrato-api.md).

```bash
cp .env.example .env
npm ci
npm run db:init
npm start
```

Requiere MongoDB y DynamoDB Local levantados desde `../compose.yaml`. `npm test` no los necesita; usa dobles de repositorio, auditoría y HTTP externo. `npm run test:integration` prueba los adaptadores reales y requiere ambas bases.

| Variable | Predeterminado |
| --- | --- |
| `PORT` | `3000` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` |
| `MONGODB_DATABASE` | `auco` |
| `DYNAMODB_ENDPOINT` | `http://127.0.0.1:8000` |
| `DYNAMODB_TABLE` | `auco-audit` |

La región y las credenciales DynamoDB son ficticias y locales. El adaptador rechaza hosts distintos a localhost, 127.0.0.1 y el servicio `dynamodb`. La API se enlaza a `127.0.0.1`.
