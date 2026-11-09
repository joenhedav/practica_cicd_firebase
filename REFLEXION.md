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

## Práctica 4 · Firestore

### Tests de reglas
- 8 tests en verde (salida abajo).
- Prueba de "hacerlo fallar": cambié `puntaje <= 5` por `puntaje <= 6` y el test "puntaje fuera de rango" se puso rojo (salida abajo). Luego restauré la regla.

### Tiempo real
![Reseña](docs/campturas/reseña.png)

### Preguntas

**1. ¿Por qué el id del documento es el UID? ¿Qué agregarías con ids aleatorios (`addDoc`)?**
Así "una reseña por persona y curso" lo garantiza la estructura: escribir de nuevo actualiza el mismo documento, y las reglas comparan el id con `request.auth.uid`. Con `addDoc` habría que guardar un campo `uid`/`autorId` en el documento, exigir en las reglas que coincida con `request.auth.uid`, y verificar duplicados (por ejemplo con una consulta previa, que no es atómica y se puede eludir).

**2. Desnormalización del nombre del autor: ¿qué ganás y qué perdés?**
Gano que mostrar la lista no requiere una lectura extra por reseña. Pierdo consistencia: si el usuario cambia su nombre, las reseñas viejas conservan el anterior. Se resolvería con una Cloud Function que actualice las reseñas al cambiar el perfil (Práctica 5) o aceptando el dato histórico.

**3. `resource.data` vs `request.resource.data`**
`resource.data` es el documento actual en la base; `request.resource.data` es cómo quedaría tras la escritura. Ejemplo de mi regla de `update`: `request.resource.data.creadaEn == resource.data.creadaEn` (la fecha no puede cambiar).

**4. ¿Por qué `creadaEn == request.time`?**
El reloj del cliente puede estar mal o ser manipulado. `request.time` es la hora del servidor, así la fecha es confiable e imposible de inventar.

**5. Limitación de `getAggregateFromServer`**
No admite listeners en tiempo real ni funciona offline, así que el promedio y la cantidad pueden quedar desactualizados hasta que se vuelva a pedir (en mi componente se recalcula cuando cambia la cantidad de reseñas). Alternativas: mantener el resumen en el documento del curso con una Cloud Function (Práctica 5) o un contador con transacciones.

**6. Inscripciones con cupo máximo: ¿Firestore o SQL Connect?**
SQL Connect: el cupo exige integridad y consistencia (contar inscriptos y rechazar al llegar al límite sin carreras), claves compuestas y restricciones en la base. En Firestore las reglas no pueden contar documentos de una colección de forma eficiente y el control habría que hacerlo con transacciones o servidor. Además, en la clase 2 la operación `Inscribirme` era idempotente gracias a la clave compuesta.

### Índices: emulador vs producción
El emulador no exige índices compuestos, así que "Solo 5 estrellas" funciona en local aunque falte el índice; en producción falla con `FAILED_PRECONDITION` hasta que el índice (declarado en `firestore.indexes.json`) está construido.

### Salida: tests en verde

```
npm notice run practica-firebase-cicd@1.0.0 test:reglas
npm notice run firebase emulators:exec --only firestore "node --test tests/"
i  emulators: Starting emulators: firestore
i  firestore: Firestore Emulator logging to firestore-debug.log
✔  firestore: Firestore Emulator was started in standard edition.
✔  firestore: Firestore Emulator UI websocket is running on 9150.
i  Running script: node --test tests/
✔ cualquiera puede leer reseñas, incluso sin login (2520.610426ms)
✔ Ana puede crear SU reseña (435.829246ms)
[2026-11-09T23:24:43.115Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252ca6 error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ Ana NO puede crear una reseña a nombre de Bruno (125.074326ms)
[2026-11-09T23:24:43.200Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252ca7 error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ sin login no se puede escribir (84.630786ms)
[2026-11-09T23:24:43.297Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252ca8 error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L34:26 for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
[2026-11-09T23:24:43.341Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252ca9 error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L34:26 for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
✔ puntaje fuera de rango o con decimales se rechaza (139.553826ms)
[2026-11-09T23:24:43.421Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252caa error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L34:26 for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
✔ no se pueden agregar campos extra (p. ej. destacada: true) (79.358336ms)
[2026-11-09T23:24:43.505Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252cab error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
[2026-11-09T23:24:43.566Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252cac error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ la fecha de creación la pone el servidor y no se puede cambiar (168.82481ms)
[2026-11-09T23:24:43.667Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1d252cae error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L28, false for 'create' @ L48, false for 'update' @ L28, false for 'update' @ L48
✔ el cliente no puede escribir el documento del curso (76.535401ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4197.538302
✔  Script exited successfully (code 0)
i  emulators: Shutting down emulators.
i  firestore: Stopping Firestore Emulator
i  hub: Stopping emulator hub
i  logging: Stopping Logging Emulator
```

### Salida: tests con la regla rota a propósito

```
npm notice run practica-firebase-cicd@1.0.0 test:reglas
npm notice run firebase emulators:exec --only firestore "node --test tests/"
i  emulators: Starting emulators: firestore
i  firestore: Firestore Emulator logging to firestore-debug.log
✔  firestore: Firestore Emulator was started in standard edition.
✔  firestore: Firestore Emulator UI websocket is running on 9150.
i  Running script: node --test tests/
✔ cualquiera puede leer reseñas, incluso sin login (2699.661395ms)
✔ Ana puede crear SU reseña (643.232702ms)
[2026-11-09T23:25:28.482Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1343072c error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ Ana NO puede crear una reseña a nombre de Bruno (170.352272ms)
[2026-11-09T23:25:28.598Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1343072d error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ sin login no se puede escribir (114.848542ms)
✖ puntaje fuera de rango o con decimales se rechaza (129.759563ms)
[2026-11-09T23:25:28.850Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x1343072f error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L34:26 for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
✔ no se pueden agregar campos extra (p. ej. destacada: true) (118.717665ms)
[2026-11-09T23:25:28.945Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x13430730 error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L34, false for 'create' @ L48, evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'create' @ L34, false for 'create' @ L48
[2026-11-09T23:25:29.037Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x13430731 error. Code: 7 Message: 7 PERMISSION_DENIED: 
evaluation error at L38:26 for 'update' @ L38, false for 'update' @ L48, false for 'update' @ L38, false for 'update' @ L48
✔ la fecha de creación la pone el servidor y no se puede cambiar (268.716721ms)
[2026-11-09T23:25:29.263Z]  @firebase/firestore: Firestore (13.1.0): GrpcConnection RPC 'Write' stream 0x13430733 error. Code: 7 Message: 7 PERMISSION_DENIED: 
false for 'create' @ L28, false for 'create' @ L48, false for 'update' @ L28, false for 'update' @ L48
✔ el cliente no puede escribir el documento del curso (144.872349ms)
ℹ tests 8
ℹ suites 0
ℹ pass 7
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4851.306633

✖ failing tests:

test at tests/reglas.test.mjs:41:1
✖ puntaje fuera de rango o con decimales se rechaza (129.759563ms)
  Error: Expected request to fail, but it succeeded.
      at file:///home/m0rphine/me/ap/practica_cicd_firebase/node_modules/@firebase/rules-unit-testing/dist/esm/index.esm.js:572:31
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (file:///home/m0rphine/me/ap/practica_cicd_firebase/tests/reglas.test.mjs:44:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
⚠  Script exited unsuccessfully (code 1)
i  emulators: Shutting down emulators.
i  firestore: Stopping Firestore Emulator
i  hub: Stopping emulator hub
i  logging: Stopping Logging Emulator

Error: Script "node --test tests/" exited with code 1
```
