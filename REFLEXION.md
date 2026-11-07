# Reflexión: CI/CD con Firebase Hosting y hardening de headers

## Mediciones

### Antes (B1)
Nota securityheaders.com: **[F o D, la que viste]**

```
▶ HTML: https://practica-cicd.web.app/
  status 200
  ✘ content-security-policy (falta)
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✘ x-content-type-options (falta)
  ✘ x-frame-options (falta)
  ✘ referrer-policy (falta)
  ✘ permissions-policy (falta)
  · cache-control: max-age=3600

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✘ cache-control: max-age=3600

❌ 6 control(es) pendiente(s).
```

### Después (B5)
Nota securityheaders.com: **A**

```
▶ HTML: https://practica-cicd.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' https://picsum.photos …
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: camera=(), microphone=(), geolocation=()
  · cache-control: no-cache

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

### Trazabilidad (A6)
- SHA antes del merge: 5379fac completar workflows de preview y produccion
- SHA después del merge: fa3df4d (origin/feat/titulo, feat/titulo) feat: cambiar titulo
- SHA después del rollback: e4f5a6b Merge pull request #2 from joenhedav/feat/headers
- Tras el rollback, `main` sigue con el código nuevo: el próximo merge lo volvería a desplegar. Se resuelve con `git revert` del commit en `main` (por PR).

## Preguntas

**1. ¿Por qué el preview tiene vencimiento?**
Cada preview es una copia accesible del sitio. Si no vence, se acumulan versiones viejas sin mantenimiento, con código o datos desactualizados expuestos, y consumen cuota. `expires: 3d` limita esa superficie.

**2. Desplegar vs liberar**
Desplegar es poner una versión en un entorno; liberar es hacerla visible a los usuarios finales. El preview es un despliegue sin liberación. El merge a `live` libera; el rollback y `hosting:clone` también son liberaciones.

**3. Service account en secreto**
Si la clave estuviera en el repo (público), cualquiera podría desplegar contenido arbitrario en el Hosting (defacement, scripts maliciosos). Para limitar el daño: rol mínimo, rotar la clave, Environment con aprobación y no exponer secretos a forks.

**4. La CSP rompió la app**
Next.js genera scripts inline que `script-src 'self'` bloquea. Opciones: `'unsafe-inline'` (simple, pero un XSS inline se ejecutaría); hashes sha256 (más seguro, hay que recalcularlos en cada build); nonce (requiere servidor, no aplica en Hosting estático). Usé `'unsafe-inline'` solo en `script-src`. La imagen necesitó dos orígenes (`picsum.photos` y `fastly.picsum.photos`) por una redirección 302.

**5. Ataque que mitiga cada header**
- HSTS: downgrade a HTTP y man-in-the-middle.
- X-Content-Type-Options: ejecución de archivos por MIME sniffing.
- X-Frame-Options: clickjacking.
- Referrer-Policy: fuga de URLs a terceros.
- Permissions-Policy: abuso de cámara, micrófono y ubicación por scripts de terceros.

**6. Caché de assets vs HTML**
Los assets de `/_next/static/` llevan hash de contenido: si cambian, cambia la URL, así que cachearlos un año es seguro. El HTML mantiene su URL, así que con `no-cache` se revalida y un deploy o rollback se ve enseguida.

**7. Si la app necesitara SSR**
Habría que usar App Hosting (Cloud Run), que exige plan Blaze con facturación. La arquitectura pasa de archivos estáticos en CDN a un servidor. En la CSP se podría usar nonce por request en lugar de `'unsafe-inline'`.



---

# Clase 2: SQL Connect, modelo relacional y autorización

## Auditoría (`npm run atacar`)

### Antes de corregir
(salida abajo)

### Después de corregir
(salida abajo)

**Corrección de L4:** `ListAlumnos` pasó de `PUBLIC` a `NO_ACCESS`. Devolvía id, nombre y email de todos los alumnos sin login. Son datos personales, y el "panel de admin" no justifica exponerlos a internet.

## Preguntas

**1. ¿Por qué ninguna operación recibe el id del alumno? ¿Qué es IDOR y cómo lo evita `auth.uid`?**
Si el id viniera del cliente, cualquiera podría cambiarlo y leer o modificar datos de otro usuario. Eso es IDOR (referencia directa a un objeto sin verificar que pertenezca a quien llama). Con `auth.uid` el servidor toma el id del token firmado, que el cliente no puede falsificar, así que cada operación solo alcanza los datos del usuario que llama.

**2. ¿Qué criterio usaste para `PUBLIC` y `NO_ACCESS`? ¿Cómo haría el panel de admin?**
`PUBLIC` solo para información pública por naturaleza (el catálogo). `USER` para datos del propio usuario. `NO_ACCESS` para datos personales que no deben salir del servidor sin control, como `ListAlumnos`. `USER` no servía ahí: cualquier alumno vería los emails de los demás. El panel de admin correría en un backend con el Admin SDK (por ejemplo Cloud Functions), verificando un rol de administrador con custom claims, y devolviendo solo los campos necesarios.

**3. ¿Qué ventaja tiene la clave primaria compuesta en `Matricula`?**
La regla "un alumno no se inscribe dos veces al mismo curso" vive en la base de datos y se cumple sin importar quién escriba (la app, un script de un atacante o una operación futura mal escrita). Una validación en el cliente se saltea llamando a la API directamente. Con un UUID propio, nada impediría filas duplicadas salvo una restricción única aparte. Además permite que `Inscribirme` sea idempotente con `upsert`.

**4. La config de Firebase es pública. ¿Por qué no compromete la base? ¿Qué falta?**
La `apiKey` solo identifica el proyecto, no da permisos. La protección está en `@auth` de cada operación y en el token de Firebase Auth. Lo que falta es una capa contra scripts que usen esa config sin ser nuestra app: **App Check**, que verifica que las llamadas vienen de una app legítima. También se podrían limitar cuotas.

**5. SQL Connect vs. API propia (Express + pg)**
Gana: sin servidor que mantener, SQL inyección cerrada por diseño (solo operaciones con nombre), autorización declarada junto a cada operación, SDK generado e integración con Auth. Pierde: control fino de la lógica, portabilidad (depende de Firebase/Google Cloud), flexibilidad para consultas complejas, y la prueba sin costo vence a los 90 días (después exige plan Blaze).

**6. ¿Por qué no alcanzó la CSP de la clase 1 y por qué dominios exactos en `connect-src`?**
La CSP no definía `connect-src`, así que caía en `default-src 'self'` y bloqueaba toda conexión a otros orígenes. La consola mostró que la app llamaba a `firebasedataconnect.googleapis.com`; para Auth se agregaron `identitytoolkit.googleapis.com` y `securetoken.googleapis.com`. Se listan orígenes exactos porque un comodín como `https://*.googleapis.com` permitiría conectar con cualquier API de Google; si un XSS inyectara código, tendría muchos más destinos para exfiltrar datos.

## Deploy (L7)
- Servicio `catalogo`, conector `cursos`, región `us-east4`, instancia `catalogo-fdc`.
- El CLI avisó que omitía la migración de esquema porque Cloud SQL seguía creándose; mientras tanto usa una base temporal.
- [Si hiciste `dataconnect:sql:diff`, comentá acá el SQL que mostró.]

## Salida de atacar ANTES

```
npm notice run practica-firebase-cicd@1.0.0 atacar
npm notice run node scripts/atacar.mjs

Auditoría de SQL Connect · proyecto practica-cicd · emuladores locales

[32m✔[0m ListCursos responde sin login (7 cursos) — público por diseño
[31m✘[0m ListAlumnos devuelve datos personales SIN login
[90m    Ejemplo filtrado: {"email":"ana@ejemplo.test","id":"seed-uid-ana","nombre":"Ana Ficticia"}[0m
[2026-11-07T19:57:08.884Z]  @firebase/data-connect: DataConnect (13.1.0): Error while performing request: {"code":16,"message":"unauthenticated: this operation requires a signed-in user","details":[{"@type":"type.googleapis.com/google.firebase.dataconnect.http.GraphqlError","message":"@auth rejected the request","locations":[],"path":null,"extensions":{"file":"","code":"UNAUTHENTICATED","debugDetails":"@auth(level: USER) requires a signed-in user","resource":"","warningLevel":"WARNING_LEVEL_UNKNOWN","workarounds":[]}}]}
[32m✔[0m Inscribirme rechazada sin login
[90m    unauthenticated: this operation requires a signed-in user[0m
[32m✔[0m Inscribirme es idempotente (repetir no falla)
[32m✔[0m MisInscripciones solo devuelve lo del usuario que llama
[32m✔[0m B no puede dar de baja a A
[31m
❌ 1 vulnerabilidad(es) · 0 pendiente(s)
[0m
```

## Salida de atacar DESPUES

```
npm notice run practica-firebase-cicd@1.0.0 atacar
npm notice run node scripts/atacar.mjs

Auditoría de SQL Connect · proyecto practica-cicd · emuladores locales

[32m✔[0m ListCursos responde sin login (7 cursos) — público por diseño
[2026-11-07T20:00:45.631Z]  @firebase/data-connect: DataConnect (13.1.0): Error while performing request: {"code":7,"message":"unauthorized: you are not authorized to perform this operation","details":[{"@type":"type.googleapis.com/google.firebase.dataconnect.http.GraphqlError","message":"@auth rejected the request","locations":[],"path":null,"extensions":{"file":"","code":"PERMISSION_DENIED","debugDetails":"@auth(level: NO_ACCESS) always reject non-admin requests","resource":"","warningLevel":"WARNING_LEVEL_UNKNOWN","workarounds":[]}}]}
[32m✔[0m ListAlumnos rechazada para un cliente
[90m    unauthorized: you are not authorized to perform this operation[0m
[2026-11-07T20:00:45.644Z]  @firebase/data-connect: DataConnect (13.1.0): Error while performing request: {"code":16,"message":"unauthenticated: this operation requires a signed-in user","details":[{"@type":"type.googleapis.com/google.firebase.dataconnect.http.GraphqlError","message":"@auth rejected the request","locations":[],"path":null,"extensions":{"file":"","code":"UNAUTHENTICATED","debugDetails":"@auth(level: USER) requires a signed-in user","resource":"","warningLevel":"WARNING_LEVEL_UNKNOWN","workarounds":[]}}]}
[32m✔[0m Inscribirme rechazada sin login
[90m    unauthenticated: this operation requires a signed-in user[0m
[32m✔[0m Inscribirme es idempotente (repetir no falla)
[32m✔[0m MisInscripciones solo devuelve lo del usuario que llama
[32m✔[0m B no puede dar de baja a A
[32m
✅ Todos los controles pasaron
[0m
```
