# Modelo de datos

Base de datos SQLite (libSQL/Turso en producción). Esquema fuente: `db/schema.sql`; migraciones en `db/migrations/`.

## Tablas principales

| Tabla | Propósito |
| --- | --- |
| `person` | Censo/votantes importados desde CSV (`email,name,birthdate,gender,weight`). |
| `election` | Votación con estado (`draft`, `open`, `closed`) y metadatos. |
| `motion` | Mociones/preguntas de una elección. |
| `motion_option` | Opciones libres por moción. |
| `vote_token` | Token único por persona/elección; `used_at` marca consumo. |
| `vote` | Voto ponderado por persona y moción; `UNIQUE (motion_id, person_id)`. |
| `questionnaire` | Cuestionario masivo con estado y configuración. |
| `category` | Categorías para clasificar preguntas. |
| `question` | Preguntas del cuestionario, asociadas a categoría. |
| `assignment` | Responsable actual de cada pregunta; `UNIQUE` garantiza un solo responsable. |
| `questionnaire_token` | Link único por persona/cuestionario para responder/delegar. |
| `answer` | Respuesta de una pregunta. |
| `audit_event` | Registro redactado de mutaciones relevantes. |
| `rate_limit` | Contadores de ventana fija para límites de peticiones. |

## Invariantes relevantes
- Una persona no puede votar dos veces la misma moción (`UNIQUE (motion_id, person_id)`).
- El token de voto se consume en la misma transacción que inserta votos.
- La papeleta no se modifica después de recibir votos.
- Cada pregunta de cuestionario tiene exactamente un responsable (`assignment.question_id` PK/UNIQUE).
- La auditoría no almacena secretos, contraseñas, tokens ni contenido sensible de adjuntos.
