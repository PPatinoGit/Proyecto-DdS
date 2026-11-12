# Proyecto DdS

Sistema de votación electrónico y cuestionarios. Administra múltiples votaciones, con
ponderación de votos, links únicos de un solo uso y cuestionarios delegables por categoría.

**Caso seleccionado:** N.º 6 — "Sistema de votación electrónico y cuestionario".

---

## Descripción

El sistema administra múltiples votaciones, con un funcionamiento similar a SurveyMonkey
pero orientado a votaciones. Cada votante recibe un link único por correo y puede emitir
su voto una sola vez. Los cuestionarios se dividen automáticamente por categorías y pueden
delegarse a distintas personas de la organización.

---

## Funcionalidades

### 1. Portal de administración

- Crear votaciones.
- Carga masiva (`.csv`) de la lista de votantes: correos, nombres, fechas de nacimiento,
  género y ponderación de voto.
- Envío de correo personalizado a cada votante (usando su nombre y género).
- Adjuntar archivos en el correo.

### 2. Sistema de votación mediante link único

- Con el link único recibido se puede votar **una vez** por una o múltiples mociones.
- Si ya se respondió, no se puede volver a votar.
- El sistema pondera la votación por cada moción.

### 3. Cuestionarios masivos

- Las preguntas se dividen automáticamente por categorías clave: finanzas, operaciones,
  medio ambiente, marketing, etc.
- Cada cuestionario se dirige a una única persona inicial, que puede delegar una o varias
  preguntas/categorías a otras personas de la organización.
- Quien recibe el cuestionario ve el progreso de todas las respuestas de forma consolidada.
- Solo una persona puede ser responsable de cada pregunta. El responsable puede delegarla,
  perdiendo ese título en favor de la nueva persona.

---

## Características de la página

- **Responsiva:** se adapta a cualquier tamaño de pantalla.
- **Autenticación:** login con usuario y contraseña para administradores.
- **Multilenguaje a medida:** diccionarios propios (sin API externa como Google Translate).

## Características del código

- El código se escribe **en inglés** (nombres de variables, funciones, tablas y columnas).
- Se permite el uso de IA, **mencionando al autor** y estudiando cómo funciona y qué hace
  cada parte del código generado.

---

## Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| Hosting | Vercel (sitio estático + Vercel Functions) |
| Backend | Node.js (Vercel Functions en `/api`) |
| Base de datos | SQLite vía libSQL (`file:` en local, **Turso** en producción) |
| Usuarios | Catálogo fijo de administradores en `data/users.json` |
| Autenticación | Usuario y contraseña (hash `scrypt`) + cookie `HttpOnly` |
| Validación | Zod |
| Correo | Resend o Nodemailer (SMTP) |

> **Nota sobre Deno:** se evaluó usar Deno, pero Vercel no ofrece runtime de Deno y, desde
> octubre de 2026, el equipo de Deno se unió a Cloudflare (el runtime queda en
> mantenimiento por un año y Deno Deploy cierra en ~6 meses). Por eso el despliegue va
> sobre Node.js.

---

## Estructura del proyecto

> Estructura **completa prevista**. Implementado hasta ahora:
>
> `data/users.json` · `db/schema.sql` · `scripts/hash-password.mjs` · `scripts/init-db.mjs` ·
> `src/lib/auth.ts` · `src/lib/db.ts` · `src/lib/users.ts` ·
> `api/auth/login.ts` · `api/auth/logout.ts` · `api/auth/me.ts`
>
> El frontend sigue siendo el template de Vite: todavía no hay páginas propias.

```
Proyecto DdS/
├── api/                          # Vercel Functions (backend)
│   ├── auth/
│   │   ├── login.ts              # POST /api/auth/login
│   │   ├── logout.ts             # POST /api/auth/logout
│   │   └── me.ts                 # GET  /api/auth/me
│   ├── elections/
│   │   ├── index.ts              # crear / listar votaciones
│   │   └── voters-import.ts      # carga masiva de CSV
│   ├── vote/
│   │   └── [token].ts            # emitir voto con link único
│   └── questionnaires/
│       ├── index.ts
│       └── questions/
│           └── [id]/
│               ├── answer.ts
│               └── delegate.ts   # transferir responsabilidad
├── data/
│   ├── users.json                # cuentas de administrador (solo lectura, se versiona)
│   └── dev.db                    # SQLite local (NO se versiona)
├── db/
│   ├── schema.sql                # esquema inicial (dialecto SQLite)
│   └── migrations/               # migraciones versionadas
├── docs/
│   ├── decisiones.md             # decisiones técnicas y su justificación
│   └── modelo-datos.md           # detalle del modelo de datos
├── scripts/
│   └── hash-password.mjs         # genera hashes para data/users.json
├── public/                       # assets estáticos
├── src/                          # frontend
│   ├── components/
│   │   ├── layout/               # shell, navbar, footer
│   │   ├── forms/                # inputs, validación
│   │   └── ui/                   # botones, tablas, modales
│   ├── pages/
│   │   ├── admin/                # portal de administración
│   │   ├── vote/                 # flujo de votación
│   │   └── questionnaire/        # cuestionarios y delegación
│   ├── i18n/
│   │   ├── es.json
│   │   ├── en.json
│   │   └── index.ts
│   ├── lib/
│   │   ├── api.ts                # cliente HTTP
│   │   ├── auth.ts               # sesión y permisos
│   │   ├── db.ts                 # cliente libSQL (archivo local o Turso)
│   │   ├── users.ts              # lectura de data/users.json
│   │   └── validation.ts         # esquemas Zod
│   ├── hooks/
│   ├── types/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example                  # variables de entorno (sin valores reales)
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.server.json          # tipos de Node para api/ y src/lib (servidor)
├── vite.config.ts
└── README.md
```

---

## Usuarios y autenticación

El proyecto separa dos cosas que suelen confundirse:

| Tipo de usuario | Dónde vive | Cómo entra |
| --- | --- | --- |
| **Administrador** | `data/users.json` (solo lectura) | Login con correo y contraseña |
| **Votante** | Base de datos (cargado por CSV) | Link único enviado por correo |

Esto significa que **no hay registro de cuentas**: los administradores existen porque están
en el archivo, y los votantes existen porque el administrador los cargó.

Reglas:

- `data/users.json` guarda `passwordHash` (scrypt), **nunca** contraseñas en texto plano.
- El archivo se versiona, por lo que solo puede contener **cuentas de prueba**. Las
  credenciales demo se documentan en este README.
- Si el enunciado exige que los votantes también inicien sesión, se agrega la columna
  `password_hash` a `person` y se asigna durante la importación del CSV.

---

## API de autenticación

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `200` + cookie firmada · `401` credenciales inválidas |
| `GET` | `/api/auth/me` | `200` con el usuario · `401` sin sesión válida |
| `POST` | `/api/auth/logout` | `204` y cookie eliminada |

Flujo:

1. `login` valida el cuerpo con Zod, busca al administrador en `data/users.json` y verifica
   la contraseña con `scrypt` (sal aleatoria por cuenta).
2. Si coincide, firma un token HMAC-SHA256 con `{ userId, exp }` y lo envía en una cookie
   `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
3. En cada petición el servidor **solo verifica la firma**: no consulta ninguna sesión.
4. `logout` borra la cookie con `Max-Age=0`.

Códigos de error: `invalid_json` (400), `invalid_input` (400), `invalid_credentials` (401),
`method_not_allowed` (405).

> **Limitación conocida:** al no guardar sesiones en la base de datos, una sesión robada
> no se puede revocar antes de expirar (2 horas). Es un intercambio asumido para la demo.
> Si hiciera falta, habría que mover las sesiones a SQLite y consultarlas en cada petición.

---

## Modelo de datos

| Tabla | Propósito |
| --- | --- |
| `person` | Votantes cargados por CSV (email único, nombre, fecha de nacimiento, género). |
| `election` | Votación: título, estado, apertura y cierre. |
| `voter_roll` | Quién vota en cada votación y con qué **ponderación**. |
| `motion` | Mociones de una votación. |
| `ballot_token` | Token del **link único**; `used_at` marca el voto ya emitido. |
| `vote` | Voto emitido, con el peso guardado al momento de votar. |
| `questionnaire` | Cuestionario y su dueño inicial. |
| `category` | Categorías: finanzas, operaciones, medio ambiente, marketing, etc. |
| `question` | Pregunta de un cuestionario, asignada a una categoría. |
| `assignment` | **Responsable único** de cada pregunta. |
| `answer` | Respuesta de cada pregunta. |
| `delegation_log` | Historial de delegaciones (quién delegó a quién y cuándo). |

### Invariantes del sistema

Estas tres reglas se garantizan en la base de datos, no solo en la aplicación:

1. **Un voto por persona:** `UNIQUE (motion_id, person_id)` en `vote`, más el marcado de
   `ballot_token.used_at` dentro de la misma transacción.
2. **Un solo responsable por pregunta:** `UNIQUE (question_id)` en `assignment`. Delegar es
   un `UPDATE` atómico que registra además el cambio en `delegation_log`.
3. **Ponderación histórica:** `vote.weight_at_cast` guarda el peso al momento de votar, para
   que cambiar pesos después no altere resultados ya emitidos.

---

## Puesta en marcha

### Requisitos

- Node.js 22 o superior
- npm 10 o superior

No hace falta instalar un servidor de base de datos: en local se usa un archivo SQLite.

### Instalación

```bash
npm install
```

### Variables de entorno

Copiar `.env.example` a `.env` y completar los valores:

```bash
cp .env.example .env
```

```
# Local: un archivo. Producción: libsql://<tu-base>.turso.io
DATABASE_URL=file:./data/dev.db
DATABASE_AUTH_TOKEN=
SESSION_SECRET=<32 bytes aleatorios en hex>
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
```

`.env` **no** se versiona. Para generar `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Base de datos

```bash
mkdir -p data
node scripts/init-db.mjs    # aplica db/schema.sql
```

### Credenciales de prueba

| Correo | Contraseña |
| --- | --- |
| `admin@demo.com` | `demo1234` |

Generar el hash de una contraseña para `data/users.json`:

```bash
node scripts/hash-password.mjs "mi-contraseña"
```

### Desarrollo

```bash
npm run dev        # solo frontend (http://localhost:5173)
vercel dev         # frontend + funciones de /api (http://localhost:3000)
```

> **Importante:** `npm run dev` (Vite) **no** sirve las funciones de `api/`. Cualquier llamada a
> `/api/auth/login` con ese servidor devuelve `index.html` o un `404`. Para probar el backend hay
> que usar `vercel dev`.

Comprobar el ciclo de sesión completo por HTTP:

```bash
# 1. login y guardar la cookie
curl -s -c /tmp/dds-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@demo.com","password":"demo1234"}'

# 2. recuperar la sesión
curl -i -b /tmp/dds-cookies.txt http://localhost:3000/api/auth/me

# 3. cerrar sesión (con -c para guardar la cookie borrada)
curl -i -b /tmp/dds-cookies.txt -c /tmp/dds-cookies.txt \
  -X POST http://localhost:3000/api/auth/logout
```

### Despliegue

```bash
vercel
```

Crea la base en Turso, copia su URL y token como variables de entorno en Vercel y el mismo
código funciona sin cambios.

---

## Convenciones

- **Ramas:** `main` estable; el trabajo va en `feat/...` o `fix/...`.
- **Commits:** en inglés, modo imperativo (`add csv voter import`).
- **Base de datos:** migraciones versionadas en `db/migrations/`; sin cambios manuales.
- **IA:** documentar qué se generó, qué se modificó y por qué (ver `docs/decisiones.md`).

---

## Decisiones técnicas

| Fecha | Decisión | Motivo |
| --- | --- | --- |
| 2026-11-02 | Node.js en lugar de Deno | Vercel no ejecuta Deno; el equipo de Deno se unió a Cloudflare (oct. 2026) y Deno Deploy cierra en ~6 meses. |
| 2026-11-02 | SQLite (libSQL) en lugar de PostgreSQL | La demo es pequeña. Un solo archivo en local y Turso permite desplegar en Vercel sin cambiar código. |
| 2026-11-02 | Un JSON solo como base de datos: descartado | Vercel no tiene disco escribible y no hay transacciones que impidan el voto doble. |
| 2026-11-02 | Administradores en `data/users.json` | Evita registro, recuperación de contraseña y verificación por correo. |
| 2026-11-02 | Votantes por CSV, no en JSON | La carga masiva es una funcionalidad obligatoria del enunciado. |
| 2026-11-10 | Cookie de sesión firmada y sin estado | Evita una tabla de sesiones y una consulta por petición. El servidor solo verifica el HMAC; el coste es que una sesión robada no se puede revocar antes de expirar. |
| 2026-11-10 | `scrypt` desde `node:crypto` en lugar de bcrypt/argon2 | Sin dependencias nativas que compilar en Vercel. `scrypt` es una KDF recomendada y viene en la biblioteca estándar. |

---

## Estado del proyecto

- [x] Definición de requisitos
- [x] Definición de stack y modelo de datos
- [x] Configuración del proyecto (React + TypeScript + Vite)
- [x] Esquema de base de datos (`db/schema.sql`, 12 tablas)
- [x] Autenticación en el backend (`login`, `me`, `logout` + cookie firmada)
- [ ] Layout responsivo e internacionalización
- [ ] Autenticación en el frontend (formulario, guardias de ruta, `useAuth`)
- [ ] Portal de administración y carga de CSV
- [ ] Envío de correos con adjuntos
- [ ] Votación por link único con ponderación
- [ ] Cuestionarios con categorías y delegación
- [ ] Endurecimiento (rate limiting, auditoría, pruebas)
