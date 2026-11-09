# Iniciar sesión en ICAN con SPHERE

ICAN acepta la cuenta de SPHERE (https://sphere.score.us.es) como un proveedor más del
login social, junto a UVUS y Google. Es el mismo flujo que ya usa SPACE: SPHERE actúa como
proveedor OpenID Connect y ICAN es un cliente registrado en él (`ican`).

## Cómo funciona

1. El botón **Continue with SPHERE** (login y registro) lleva a
   `GET /api/v1/users/auth/sso/sphere/initiate`. Solo aparece si
   `GET /api/v1/users/auth/sso/providers` incluye `sphere`, es decir, si las cuatro
   variables `SPHERE_OIDC_*` están puestas.
2. `SSOController.initiate` genera el `state`, un verificador PKCE y un `nonce`, los guarda
   en Redis (10 min) junto al hash de la cookie HttpOnly `ican_sso_browser` y redirige a
   SPHERE. `SphereProvider` lee los endpoints de
   `<SPHERE_OIDC_ISSUER>/.well-known/openid-configuration` y exige que sean del mismo origen.
3. SPHERE pide iniciar sesión (si hace falta) y muestra su consentimiento: "Continue to ICAN",
   con lo que se comparte (identificador, usuario, nombre y email).
4. SPHERE vuelve a `/api/v1/users/auth/sso/sphere/callback`. ICAN comprueba que el `state`
   existe, se usa una vez y viene del mismo navegador (cookie), canjea el código con el
   secreto y el verificador PKCE, y verifica el ID token RS256 con el JWKS de SPHERE
   (emisor, audiencia `ican`, caducidad, antigüedad máxima de 5 min y `nonce`).
5. Con el perfil normalizado, `AuthProviderService` entra en la cuenta que tiene esa
   identidad (`identities: { provider: 'sphere', providerId: <sub> }`) o crea una nueva con
   su organización personal. El navegador recibe un código de un solo uso (30 s) que el
   frontend canjea por el JWT en `/sso/callback`, como con UVUS y Google.

## Cuentas

- La cuenta se identifica por el `sub` de SPHERE, nunca por el email ni por el usuario: un
  cambio de nombre o de email en SPHERE no cambia de cuenta.
- **El email de SPHERE no se usa para vincular cuentas.** SPHERE deja cambiar el email sin
  volver a verificarlo, así que `email_verified` no prueba que el email sea de quien inicia
  sesión. Si ya hay una cuenta de ICAN con ese email, el login con SPHERE no entra en ella:
  muestra `email_in_use` y explica cómo conectarlo.
- **Conectar SPHERE a una cuenta existente:** Settings → **Sign-in methods** → *Connect
  SPHERE*. El frontend pide `POST /users/auth/sso/sphere/link` (con la sesión web; las API
  keys no valen), que devuelve un ticket de un solo uso (60 s); el navegador va a
  `/initiate?link=<ticket>` y pasa por SPHERE. A la vuelta **no se conecta nada todavía**:
  el callback guarda la conexión pendiente (5 min, ligada a la cookie del navegador) y
  Settings muestra qué cuenta de SPHERE es y pide confirmarla. Solo la cuenta que pidió el
  ticket, con su sesión y en ese navegador, puede confirmarla
  (`GET`/`POST /users/auth/sso/sphere/link/<pendiente>`); otra cuenta recibe 403
  (`wrong_account`). Así, un enlace de conexión enviado a otra persona no conecta su
  SPHERE a la cuenta de quien lo envió. Una identidad de SPHERE solo puede estar en una
  cuenta (`identity_in_use`) y una cuenta solo tiene una de SPHERE
  (`provider_already_linked`).
- El primer usuario se toma de `preferred_username` en minúsculas (solo letras, dígitos,
  `_` y `-`; hasta 30). Si ya lo usa un usuario o una organización (la organización
  personal se llama como el usuario), se añade `-2`, `-3`... Nombre y apellidos salen de
  `given_name`/`family_name` (o de `name`).
- Las claves `sso:*` de Redis (state, tickets, conexiones pendientes y códigos) no se
  pueden leer ni escribir por el endpoint público `/cache`, ni siquiera como ADMIN.
- No hay desvincular, ni cierre de sesión compartido, ni sincronización de organizaciones.

## Configuración

ICAN (`api/.env.production` ya trae las tres primeras; el secreto va en
`docker/production/.env`, que no está en el repositorio):

```dotenv
SPHERE_OIDC_ISSUER=https://sphere.score.us.es
SPHERE_OIDC_CLIENT_ID=ican
SPHERE_OIDC_REDIRECT_URI=https://ican.score.us.es/api/v1/users/auth/sso/sphere/callback
SPHERE_OIDC_CLIENT_SECRET=<el mismo valor que OIDC_ICAN_CLIENT_SECRET en SPHERE>
```

SPHERE (en su `docker/production/.env`; ver `docs/sphere-space-sign-in.md` en SPHERE):

```dotenv
OIDC_ICAN_CLIENT_ID=ican
OIDC_ICAN_CLIENT_SECRET=<secreto compartido>
OIDC_ICAN_REDIRECT_URI=https://ican.score.us.es/api/v1/users/auth/sso/sphere/callback
OIDC_SIGNING_PRIVATE_KEY=<ya configurada si SPACE usa SPHERE>
```

- El emisor tiene que ser un origen HTTPS (HTTP solo en `localhost`/`127.0.0.1`) y coincidir
  exactamente con el `issuer` que publica SPHERE (`OAUTH_ISSUER_URL` en SPHERE).
- El servidor de ICAN llama a SPHERE con `fetch` (discovery, token y JWKS), igual que el
  proveedor UVUS llama al CAS: tiene que llegar a `https://sphere.score.us.es`.
- Sin alguna de las cuatro variables, el botón no aparece y el resto de logins sigue igual.

## En local

Los dos proyectos usan por defecto los mismos puertos (Vite 5173, API 8080), así que hay
que mover uno. Por ejemplo, el que se usó para probar esta función:

| | Front (Vite) | API |
|---|---|---|
| SPHERE | `5186` (`VITE_API_PROXY_TARGET=http://localhost:8186`) | `8186`, con `FRONTEND_URL` y `OAUTH_ISSUER_URL` = `http://localhost:5186` |
| ICAN | `5187` (`VITE_API_PROXY_TARGET=http://localhost:8187`) | `8187`, con `FRONTEND_URL=http://localhost:5187` |

1. SPHERE: `OIDC_SIGNING_PRIVATE_KEY` (RSA de 2048 bits o más) y
   `OIDC_ICAN_CLIENT_ID`/`OIDC_ICAN_CLIENT_SECRET`/`OIDC_ICAN_REDIRECT_URI=http://localhost:5187/api/v1/users/auth/sso/sphere/callback`.
2. ICAN (`api/.env`): `SPHERE_OIDC_ISSUER=http://localhost:5186`, el mismo client ID y
   secreto, y `SPHERE_OIDC_REDIRECT_URI` igual que en SPHERE.
3. Usa siempre `localhost` (no mezcles con `127.0.0.1`): la cookie del navegador va por
   nombre de host.

## Tests

- `api/src/test/unit-tests/sphere-provider.test.ts`: URL de autorización, discovery, ID token
  (firma, emisor, audiencia, algoritmo, caducidad, nonce), nombres y rotación de clave.
- `api/src/test/sso.test.ts`: flujo completo contra un SPHERE simulado
  (`utils/auth/fakeSphere.ts`, con PKCE y códigos de un solo uso como SPHERE): alta,
  vuelta, colisiones de email, usuario y organización, cookie del navegador, conexión
  desde Settings con confirmación, CSRF de la conexión y errores.
- `api/src/test/cache.test.ts`: el endpoint `/cache` rechaza las claves `sso:*`.
