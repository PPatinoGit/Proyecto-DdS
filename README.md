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

> Estructura **completa prevista**; las carpetas vacías son bloques futuros. Implementado
> hasta ahora:
>
> `data/users.json` · `db/schema.sql` · `scripts/hash-password.mjs` · `scripts/init-db.mjs` ·
> `scripts/check-i18n.mjs` · `api/auth/login.ts` · `api/auth/logout.ts` · `api/auth/me.ts` ·
> `api/elections/index.ts` · `api/elections/voters.ts` ·
> `src/lib/{auth,db,users,api,auth-api,elections,elections-api,voters,voters-api,csv,session,types}.ts` ·
> `src/hooks/useAuth.ts` · `src/components/auth/{AuthProvider,route-guards}` ·
> `src/components/ui/{LanguageSwitcher,FullScreenLoader}` · `src/i18n/` ·
> `src/pages/Login.tsx` · `src/pages/admin/{AdminHome,Elections,Voters}.tsx` · `src/App.tsx` ·
> `src/main.tsx` · `vercel.json`

```
Proyecto DdS/
├── api/                          # Vercel Functions (backend)
│   ├── auth/
│   │   ├── login.ts              # POST /api/auth/login
│   │   ├── logout.ts             # POST /api/auth/logout
│   │   └── me.ts                 # GET  /api/auth/me
│   ├── elections/
│   │   ├── index.ts              # GET/POST /api/elections (listar / crear)
│   │   └── voters.ts             # GET/POST /api/elections/voters (censo / importar CSV)
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
│   ├── check-i18n.mjs            # valida claves, valores y placeholders
│   ├── hash-password.mjs         # genera hashes para data/users.json
│   └── init-db.mjs               # aplica db/schema.sql
├── public/                       # assets estáticos
├── src/                          # frontend
│   ├── components/
│   │   ├── auth/                 # AuthProvider + guardias de ruta
│   │   ├── layout/               # shell, navbar, footer
│   │   ├── forms/                # inputs, validación
│   │   └── ui/                   # LanguageSwitcher, FullScreenLoader, botones, tablas
│   ├── pages/
│   │   ├── admin/                # portal de administración (AdminHome, Elections, Voters)
│   │   ├── vote/                 # flujo de votación
│   │   ├── questionnaire/        # cuestionarios y delegación
│   │   └── Login.tsx
│   ├── i18n/
│   │   ├── es.json               # fuente de verdad de las claves
│   │   ├── en.json
│   │   ├── ru.json
│   │   ├── i18n-context.ts       # contexto + useI18n()
│   │   ├── I18nProvider.tsx      # idioma actual y persistencia
│   │   └── index.ts              # tipos, diccionarios y translate()
│   ├── lib/
│   │   ├── api.ts                # cliente HTTP (ApiError)
│   │   ├── auth.ts               # sesión y permisos (servidor)
│   │   ├── auth-api.ts           # llamadas tipadas a /api/auth
│   │   ├── csv.ts                # parser y validación de CSV (cliente y servidor)
│   │   ├── db.ts                 # cliente libSQL (archivo local o Turso)
│   │   ├── elections.ts          # consultas de votaciones (servidor)
│   │   ├── elections-api.ts      # llamadas tipadas a /api/elections
│   │   ├── session.ts            # usuario de la sesión en el servidor
│   │   ├── types.ts              # tipos compartidos cliente/servidor
│   │   ├── users.ts              # lectura de data/users.json
│   │   ├── validation.ts         # esquemas Zod
│   │   ├── voters.ts             # censo e importación (servidor)
│   │   └── voters-api.ts         # llamadas tipadas a /api/elections/voters
│   ├── hooks/
│   │   └── useAuth.ts            # contexto de sesión + hook
│   ├── App.tsx                   # tabla de rutas
│   ├── main.tsx                  # providers: i18n, router, sesión
│   └── index.css
├── .env.example                  # variables de entorno (sin valores reales)
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.server.json          # tipos de Node para api/ y src/lib (servidor)
├── vercel.json                   # rewrite de rutas del cliente a index.html
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

Códigos de error: `invalid_json` (400), `invalid_input` (400), `invalid_credentials` (401).
Un método distinto del declarado lo rechaza Vercel antes de entrar al handler (`405`).

> **Firma de las funciones:** cada archivo exporta el método HTTP que atiende
> (`export function GET` / `export async function POST`). Con `export default`, Vercel
> entrega los objetos `req`/`res` de Node y el código basado en `Request`/`Response`
> falla (`request.headers.get is not a function`). Con exportaciones nombradas recibe un
> `Request` web y el `Response` que se devuelve se envía tal cual, incluida la cabecera
> `set-cookie`.

> **Limitación conocida:** al no guardar sesiones en la base de datos, una sesión robada
> no se puede revocar antes de expirar (2 horas). Es un intercambio asumido para la demo.
> Si hiciera falta, habría que mover las sesiones a SQLite y consultarlas en cada petición.

---

## API de elecciones

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `GET` | `/api/elections` | `200` con `{ elections }` · `401` sin sesión |
| `POST` | `/api/elections` | `201` con `{ election }` · `400` `invalid_json` / `invalid_input` · `401` sin sesión |

Ambas rutas exigen una sesión de administrador válida: las votaciones no son datos públicos.
La lista llega ordenada de la más nueva a la más antigua.

Reglas de creación:

- La votación nace en estado **`draft`** (borrador). Publicarla y enviar los links será un
  paso posterior.
- `opensAt` y `closesAt` son **opcionales** (`null` significa «sin definir»).
- `closesAt` debe ser posterior a `opensAt`; si no, responde `invalid_input`.
- El formulario usa `<input type="datetime-local">`, que no lleva zona horaria. El navegador
  la interpreta en la hora local del administrador y la API guarda un ISO 8601 en **UTC**.
  Al mostrarla, el frontend la vuelve a formatear con `Intl.DateTimeFormat` en el idioma activo.

```bash
# listar (con la cookie del login)
curl -s -b /tmp/dds-cookies.txt http://localhost:3000/api/elections

# crear un borrador con fechas
curl -s -b /tmp/dds-cookies.txt -X POST http://localhost:3000/api/elections \
  -H "content-type: application/json" \
  -d '{"title":"Elecciones al consejo 2026","opensAt":"2026-12-01T09:30","closesAt":"2026-12-02T18:00"}'
```

En la interfaz: `/admin` → tarjeta **Votaciones** → **Gestionar** (`/admin/elections`).
La página lista las votaciones existentes y permite crear nuevas; los errores del servidor se
traducen a partir de su código y la lista se puede reintentar si falla la carga.

---

## Carga de votantes por CSV

Los votantes de cada votación se cargan desde un archivo CSV; no hay formulario individual.

Columnas (la cabecera es obligatoria y no distingue mayúsculas):

| Columna | Obligatoria | Regla |
| --- | --- | --- |
| `email` | Sí | Correo válido y único dentro del archivo. Se guarda en minúsculas. |
| `name` | Sí | Hasta 200 caracteres. |
| `birthdate` | No | Fecha real en formato `AAAA-MM-DD` y no futura. |
| `gender` | No | Texto libre de hasta 40 caracteres. |
| `weight` | No | Número entre `0.01` y `1000`. Por defecto `1`. |

Límites y formato: máximo **1000 filas** y **2 000 000 de caracteres** por archivo. El parser
admite campos entre comillas (con comas y saltos de línea dentro), comillas escapadas (`""`),
finales de línea `\r\n` / `\n` y BOM al inicio.

La misma función (`parseVoterCsv` en `src/lib/csv.ts`) valida en el navegador y en el servidor,
así que la vista previa no puede aceptar algo que la API luego rechace. Los errores se devuelven
como códigos (`required`, `duplicate_email`, `invalid_birthdate`, `weight_range`, …) y el
frontend los traduce; cada uno indica la línea y la columna.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `GET` | `/api/elections/voters?electionId=1` | `200` con `{ election, voters }` · `400` `invalid_input` · `404` `election_not_found` · `401` sin sesión |
| `POST` | `/api/elections/voters` | `200` con `{ summary }` · `400` `invalid_csv` (con `fatal` o `issues`) · `404` `election_not_found` · `401` sin sesión |

El CSV se envía como JSON (`{ "electionId": 1, "csv": "email,name\n..." }`) en lugar de
`multipart/form-data`: el mismo parser corre en ambos lados y el límite de tamaño es explícito.

La importación es **atómica e idempotente**. Todo ocurre en un único `batch` de escritura:

- `person` se inserta o actualiza por `email` (el votante se reutiliza entre votaciones).
- `voter_roll` se inserta o actualiza por `(election_id, person_id)`, así que **reimportar no
  duplica**: actualiza nombre, fecha, género y el peso de esa votación.
- Si una sola fila tiene un error, no se escribe ninguna.

```bash
# censo de una votación
curl -s -b /tmp/dds-cookies.txt \
  "http://localhost:3000/api/elections/voters?electionId=1"

# importar (el CSV va escapado dentro del JSON)
curl -s -b /tmp/dds-cookies.txt -X POST http://localhost:3000/api/elections/voters \
  -H "content-type: application/json" \
  -d '{"electionId":1,"csv":"email,name,birthdate,gender,weight\nana@example.com,Ana Pérez,2000-05-14,female,2\nluis@example.com,Luis Gómez,1999-11-02,male,1\n"}'
```

En la interfaz: `/admin` → tarjeta **Votantes** (`/admin/voters`), o el enlace **Votantes** de
cada fila en `/admin/elections`, que abre la página con la votación preseleccionada
(`?election=1`). Allí se elige la votación, se descarga una **plantilla** con las columnas
correctas, se selecciona el archivo y se revisa la **vista previa**: las primeras filas, las
filas con error resaltadas y la lista de problemas por línea. El botón de importar solo se
habilita cuando no hay errores. Debajo se muestra el **censo** actual de la votación,
ordenado por nombre, con la ponderación de cada votante.

---

## Internacionalización (es / en / ru)

Sin librerías de i18n y sin APIs externas de traducción: los textos viven en el repositorio.

- `src/i18n/es.json` es la **fuente de verdad**. De sus claves se deriva el tipo `TranslationKey`.
- `en.json` y `ru.json` deben contener todas las claves de `es.json`. Si falta una,
  `npm run build` falla con `TS2741`; un typo en `t("...")` también es un error de compilación.
- Los componentes solo usan `t("clave")`; **nunca** concatenan frases. Los errores del backend
  llegan como códigos (`invalid_credentials`) y el frontend los convierte en claves.
- Interpolación con `{name}` / `{code}`. Si falta el valor, el placeholder queda visible en
  lugar de imprimir `undefined`.
- `npm run i18n:check` cubre lo que los tipos no ven: valores vacíos, claves sobrantes y
  placeholders distintos entre idiomas.

El idioma se guarda en `localStorage` (`app.language`), se detecta con `navigator.languages`
y se refleja en `<html lang="...">` para lectores de pantalla y correctores.

**Ruso:** necesita cuatro formas de plural (`one` / `few` / `many` / `other`), que se
resolverán con `Intl.PluralRules`; fechas y números siempre con `Intl.DateTimeFormat` y
`Intl.NumberFormat`.

> Las traducciones iniciales al inglés y al ruso se generaron con IA y están pendientes de
> revisión humana. Ver la convención de IA más abajo.

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

Comprobaciones antes de commitear:

```bash
npm run build       # tipos + bundle
npm run lint
npm run i18n:check  # claves, valores y placeholders de los tres idiomas
```

Flujo en el navegador (con `vercel dev`): `/` redirige a `/admin`; sin sesión, la guardia
manda a `/login`; al entrar con las credenciales demo se llega al panel; al recargar se
restaura la sesión con `/api/auth/me`; «Cerrar sesión» vuelve a `/login`. Desde el panel, la
tarjeta **Votaciones** abre `/admin/elections`, donde se crean y listan borradores, y la tarjeta
**Votantes** abre `/admin/voters`, donde se importa el censo de una votación desde CSV.

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

> **Rutas nuevas:** como el enrutado es del cliente, cada ruta pública debe añadirse a los
> `rewrites` de `vercel.json` (`/login`, `/admin`, `/vote`, `/questionnaire`). Si falta, abrir
> esa URL directamente devuelve 404 en producción.

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
| 2026-11-16 | i18n propio con diccionarios tipados | Sin dependencia ni API externa. El español define las claves y el compilador obliga a completar inglés y ruso; `i18n:check` añade valores vacíos y placeholders. |
| 2026-11-16 | Exportaciones nombradas `GET` / `POST` en `api/` | Con `export default`, el runtime de Vercel entrega `req`/`res` de Node y el código con `Request`/`Response` falla. Las exportaciones nombradas reciben un `Request` web. |
| 2026-11-16 | `vercel.json` con rewrites explícitos por ruta | El enrutado es del cliente (`BrowserRouter`): sin rewrite, abrir `/admin` directamente en producción daría 404. Se listan `/login`, `/admin`, `/vote` y `/questionnaire` en vez de un comodín: un `/(.*)` también capturaba los módulos de Vite y los assets en `vercel dev` y los servía como `index.html`. |
| 2026-11-16 | Votaciones nuevas en `draft` y fechas opcionales | Crear una votación no debe publicarla ni enviar links todavía. Las fechas pueden definirse después; `closesAt` debe ser posterior a `opensAt` y ambas se guardan en UTC para que no dependan de la zona del servidor. |
| 2026-11-16 | Un único parser de CSV para cliente y servidor | La vista previa usa exactamente la misma validación que la importación, así que no puede mostrar «válido» para un archivo que la API rechazará. Es TypeScript puro, sin APIs de Node ni del DOM. |
| 2026-11-16 | Importación atómica con `batch` de libSQL | `person` se reutiliza por `email` y `voter_roll` por `(election_id, person_id)`. Todo se escribe en una sola transacción: o entran todas las filas o ninguna, y reimportar actualiza en vez de duplicar. |

---

## Estado del proyecto

- [x] Definición de requisitos
- [x] Definición de stack y modelo de datos
- [x] Configuración del proyecto (React + TypeScript + Vite)
- [x] Esquema de base de datos (`db/schema.sql`, 12 tablas)
- [x] Autenticación en el backend (`login`, `me`, `logout` + cookie firmada)
- [x] Layout responsivo e internacionalización (es / en / ru)
- [x] Autenticación en el frontend (formulario, guardias de ruta, `useAuth`)
- [x] Rutas protegidas y panel inicial (`/login`, `/admin`)
- [x] Portal de administración: crear y listar votaciones (`/admin/elections`)
- [x] Carga masiva de votantes por CSV con vista previa (`/admin/voters`)
- [ ] Envío de correos con adjuntos
- [ ] Votación por link único con ponderación
- [ ] Cuestionarios con categorías y delegación
- [ ] Endurecimiento (rate limiting, auditoría, pruebas)
