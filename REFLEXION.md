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
