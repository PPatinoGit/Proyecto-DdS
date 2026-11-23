# Decisiones técnicas

## Stack y despliegue
- **Node.js + Vercel Functions**: Vercel no ofrece runtime Deno; se eligió Node.js para compatibilidad directa con el despliegue.
- **SQLite vía `@libsql/client`**: `file:./data/dev.db` en local y Turso en producción, sin cambiar la lógica de acceso.
- **Rutas API agrupadas**: el plan Hobby de Vercel limita a 12 funciones; se consolidaron las rutas en 7 funciones catch-all bajo `api/` que delegan a `src/api-handlers/`.

## Autenticación
- **Contraseña + cookie firmada**: hash `scrypt` y cookie `vote_session` HMAC firmada, `HttpOnly`, `SameSite=Lax`, `Secure` en producción, TTL 2 h.
- **Google SSO (OAuth 2.0)**: Authorization Code con `state` firmado en cookie de corta vida; solo se acepta `email_verified` y correo presente en `data/users.json` (allowlist, sin registro). Reutiliza la sesión existente y registra auditoría con `metadata.method="google"`.

## Datos e integridad
- **Papeleta congelada tras votos**: evita cambiar opciones después de que existan votos.
- **Un voto por persona/moción**: `UNIQUE (motion_id, person_id)` + transacción.
- **Token como credencial**: token aleatorio enviado por correo; se marca `used_at` y se registran filas de voto en la misma transacción.
- **Resultados agregados**: el endpoint de resultados no expone la elección individual.

## Internacionalización
- **Diccionarios propios**: `src/i18n/{es,en,ru}.json`, español como fuente de verdad, claves tipadas y validación con `npm run i18n:check`. Sin APIs externas de traducción.

## Uso de IA
- Se utilizó IA como apoyo de implementación y depuración. Los cambios generados fueron revisados, adaptados e integrados por el equipo, verificando su funcionamiento con build, lint, chequeo i18n y tests.
