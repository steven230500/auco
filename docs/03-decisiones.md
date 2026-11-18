# Decisiones y mejoras futuras

1. La raíz contiene la guía de ejecución, la documentación y Docker Compose. `api/` contiene el servicio y sus pruebas.
2. JavaScript ESM y Express: suficiente para dos rutas, sin compilación adicional; invariantes comprobadas en la entrada y por pruebas. El driver Mongo evita introducir un ODM para un único modelo.
3. Agify en lugar de usar datos aleatorios: aporta una estimación basada en el primer nombre. Se verificó una respuesta real sin clave el 18 de noviembre de 2026. La [referencia actual](https://agify.io/documentation/api/reference) describe autenticación por API key; por eso el acceso anónimo observado no se promete a futuro. No se incluyen claves ni suscripciones. Si el proveedor retira acceso o agota cuota, se devuelve 502 y debe revisarse su plan gratuito o elegirse otro proveedor antes de continuar. Timeout 4 s, sin reintentos externos para no multiplicar consumo.
4. Llaves Dynamo por documento y fecha + UUID: responden al historial cronológico, conservan ceros y evitan colisiones. Un documento muy activo puede producir una partición caliente; para esta prueba no se fragmenta la llave. Documento visible simplifica la exigencia, pero en producción se evaluaría HMAC con gestión de clave y alcance por país/tipo, porque números iguales de distintas clases pueden colisionar conceptualmente.
5. Intención de auditoría embebida en Mongo y conciliación manual: recuperable sin requerir replica set, colas o transacciones Mongo. Éxito HTTP exige ambas escrituras. Limitaciones detalladas en arquitectura.
6. Bases en volúmenes persistentes y puertos loopback; DynamoDB Local con credenciales ficticias. [AWS documenta](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html) el endpoint local y `-sharedDb`. Los tags de imágenes se fijan por versión; para reproducción estricta futura conviene fijar digests. Los datos sobreviven al reinicio de contenedores.

## Mejoras priorizadas

- Worker de conciliación con backoff, métricas de pendientes, edad del pendiente y alertas; pruebas de caídas en cada frontera.
- Idempotency-Key por cliente, índice único y recuperación de respuesta para evitar duplicados tras timeout HTTP.
- Autenticación/autorización por registro, límites de peticiones, cifrado y retención/eliminación coherente del dato personal y auditoría.
- Verificación de contrato externa periódica, cache de enriquecimiento acotada y circuito de fallos; revisar calidad de predicciones por nombres compuestos.
- CI con Mongo/Dynamo reales y pruebas de recuperación/timeout ambiguo, además de las pruebas aisladas actuales.
- Tipos estáticos y contrato OpenAPI si se amplía el API; no se necesitan para demostrar las dos rutas.
