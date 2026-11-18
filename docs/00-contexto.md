# Contexto y aceptación

Prueba técnica de AUCO: crear un servicio Node.js que reciba nombre y número de documento, enriquezca con una API pública gratuita, guarde en MongoDB y permita consultar por id. Cada creación escribe un evento de auditoría en DynamoDB Local con llaves por documento y fecha.

Aceptación: POST devuelve 201 con id después de persistir y auditar; GET devuelve registro o 404; entradas inválidas se rechazan antes de consultar al proveedor; fallos externos se controlan; al menos tres pruebas automatizadas; ejecución reproducible y decisiones escritas. Se incluyen diez pruebas aisladas y una integración con bases reales.

Alcance asumido: documento numérico de 5 a 20 dígitos como cadena para conservar ceros iniciales; nombre de 2 a 120 caracteres, letras Unicode, espacios y puntuación común. No se comprueba autenticidad ni titularidad. Repetir el documento crea otra validación; no es una restricción única.

El servicio está diseñado para ejecución local con datos ficticios. Antes de exponerlo fuera del equipo local harían falta controles de acceso y tratamiento de datos. La auditoría usa el número de documento en su llave.
