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
  `/initiate?link=<ticket>` y, a la vuelta, la identidad se añade a esa cuenta. Una
  identidad de SPHERE solo puede estar en una cuenta (`identity_in_use`) y una cuenta solo
  tiene una de SPHERE (`provider_already_linked`).
- El primer usuario se toma de `preferred_username` (solo letras, dígitos, `_` y `-`; hasta
  30). Si está ocupado se añade un sufijo, como con UVUS. Nombre y apellidos salen de
  `given_name`/`family_name` (o de `name`).
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

1. Arranca SPHERE (`http://localhost:5173`, API en 8080 por defecto) con
   `OIDC_SIGNING_PRIVATE_KEY` y `OIDC_ICAN_*`, y ICAN en otros puertos.
2. En `api/.env` de ICAN pon `SPHERE_OIDC_ISSUER` igual al `issuer` de SPHERE, el mismo
   client ID y secreto, y `SPHERE_OIDC_REDIRECT_URI` apuntando a la API de ICAN
   (`http://localhost:<puerto>/api/v1/users/auth/sso/sphere/callback`).

## Tests

- `api/src/test/unit-tests/sphere-provider.test.ts`: URL de autorización, discovery, ID token
  (firma, emisor, audiencia, algoritmo, caducidad, nonce), nombres y rotación de clave.
- `api/src/test/sso.test.ts`: flujo completo contra un SPHERE simulado
  (`utils/auth/fakeSphere.ts`, con PKCE y códigos de un solo uso como SPHERE): alta,
  vuelta, colisiones, cookie del navegador, conexión desde Settings y errores.
