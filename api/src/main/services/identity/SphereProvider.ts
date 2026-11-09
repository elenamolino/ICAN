import { createHash, createPublicKey, KeyObject } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { IdentityProvider, LoginTransaction, ProviderProfile } from './IdentityProvider';

const env = (name: string) => process.env[name] ?? '';
const TIMEOUT_MS = 5000;
const METADATA_TTL_MS = 10 * 60 * 1000;
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

interface Metadata {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

/** HTTPS only, except loopback HTTP for local development. Never credentials or fragments. */
export function trustedUrl(value: string): URL {
  const url = new URL(value);
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname);
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !loopbackHttp)) {
    throw new Error('SPHERE sign-in URLs must use HTTPS (HTTP is only allowed on loopback)');
  }
  return url;
}

function usernameBase(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) : '';
}

/**
 * Identity provider for SPHERE (OpenID Connect, authorization code flow with PKCE).
 *
 * SPHERE publishes its endpoints at `<issuer>/.well-known/openid-configuration`; the
 * callback exchanges the code with the client secret and the PKCE verifier, then checks
 * the RS256 ID token against SPHERE's JWKS (issuer, audience, expiry, age and nonce).
 * The account is identified by SPHERE's `sub` only: SPHERE lets users change their email
 * without verifying it again, so the email never links the sign-in to an existing ICAN
 * account (users connect SPHERE from Settings instead). Mirrors SPACE's SPHERE client.
 * Requires SPHERE_OIDC_ISSUER, SPHERE_OIDC_CLIENT_ID, SPHERE_OIDC_CLIENT_SECRET and
 * SPHERE_OIDC_REDIRECT_URI (see api/docs/sso-sphere.md).
 */
export class SphereProvider implements IdentityProvider {
  name = 'sphere' as const;
  usesState = true;

  private metadataCache?: { issuer: string; value: Metadata; expiresAt: number };
  private keys = new Map<string, KeyObject>();
  private keysUrl?: string;

  isConfigured(): boolean {
    return Boolean(
      env('SPHERE_OIDC_ISSUER') && env('SPHERE_OIDC_CLIENT_ID') &&
      env('SPHERE_OIDC_CLIENT_SECRET') && env('SPHERE_OIDC_REDIRECT_URI'),
    );
  }

  // Read per call so env changes (tests, dotenv load order) are always picked up.
  private config() {
    if (!this.isConfigured()) throw new Error('SPHERE sign-in is not configured');
    const issuer = trustedUrl(env('SPHERE_OIDC_ISSUER'));
    if (issuer.pathname !== '/' || issuer.search) throw new Error('SPHERE_OIDC_ISSUER must be an origin');
    return {
      issuer: issuer.origin,
      clientId: env('SPHERE_OIDC_CLIENT_ID'),
      clientSecret: env('SPHERE_OIDC_CLIENT_SECRET'),
      redirectUri: trustedUrl(env('SPHERE_OIDC_REDIRECT_URI')).href,
    };
  }

  private async metadata(issuer: string): Promise<Metadata> {
    const cached = this.metadataCache;
    if (cached && cached.issuer === issuer && cached.expiresAt > Date.now()) return cached.value;

    const response = await fetch(issuer + '/.well-known/openid-configuration', {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`SPHERE discovery answered ${response.status}`);
    const metadata = (await response.json()) as Record<string, unknown>;
    if (metadata.issuer !== issuer) throw new Error('SPHERE issuer mismatch');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      const value = metadata[key];
      if (typeof value !== 'string' || trustedUrl(value).origin !== issuer) {
        throw new Error(`Invalid SPHERE ${key}`);
      }
    }
    const value = metadata as unknown as Metadata;
    this.metadataCache = { issuer, value, expiresAt: Date.now() + METADATA_TTL_MS };
    return value;
  }

  async buildLoginUrl(state: string, transaction: LoginTransaction): Promise<string> {
    const config = this.config();
    const metadata = await this.metadata(config.issuer);
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      // ICAN accounts need an email; SPHERE shows the user what it shares on its consent page.
      scope: 'openid profile email',
      state,
      nonce: transaction.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(transaction.codeVerifier).digest('base64url'),
    }).toString();
    return url.href;
  }

  async handleCallback(query: Record<string, string>, transaction?: LoginTransaction): Promise<ProviderProfile | null> {
    const code = query.code;
    if (!transaction || typeof code !== 'string' || !code || code.length > 512) return null;

    const config = this.config();
    const metadata = await this.metadata(config.issuer);
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
        code_verifier: transaction.codeVerifier,
      }),
    });
    if (!response.ok) {
      // 4xx: the code was used, expired or does not match this client. Not a server fault.
      if (response.status < 500) return null;
      throw new Error(`SPHERE token endpoint answered ${response.status}`);
    }
    const tokens = (await response.json()) as { id_token?: unknown };
    if (typeof tokens.id_token !== 'string') return null;

    const payload = await this.verifyIdToken(tokens.id_token, metadata.jwks_uri, config);
    if (!payload) return null;
    if (payload.nonce !== transaction.nonce) return null;
    if (typeof payload.email !== 'string' || !payload.email) return null;

    const sub = payload.sub as string;
    const names = typeof payload.name === 'string' ? payload.name.trim().split(/\s+/).filter(Boolean) : [];
    const emailLocalPart = payload.email.split('@')[0];
    const suggested = [usernameBase(payload.preferred_username), usernameBase(emailLocalPart)]
      .find((candidate) => candidate.length >= 3) ?? 'sphere-user';

    return {
      provider: this.name,
      providerId: sub,
      email: payload.email,
      // Never trusted for linking: SPHERE does not re-verify an email after it changes.
      emailVerified: false,
      firstName: (typeof payload.given_name === 'string' && payload.given_name.trim()) || names[0] || suggested,
      lastName: (typeof payload.family_name === 'string' && payload.family_name.trim()) || names.slice(1).join(' ') || 'SPHERE',
      suggestedUsername: suggested,
    };
  }

  /** Returns the verified claims, or null when the token is not a valid SPHERE ID token for ICAN. */
  private async verifyIdToken(
    idToken: string,
    jwksUri: string,
    config: { issuer: string; clientId: string },
  ): Promise<JwtPayload | null> {
    const decoded = jwt.decode(idToken, { complete: true });
    const kid = decoded?.header.kid;
    if (!decoded || decoded.header.alg !== 'RS256' || typeof kid !== 'string') return null;

    const key = await this.signingKey(jwksUri, kid);
    if (!key) return null;

    let payload: JwtPayload;
    try {
      payload = jwt.verify(idToken, key, {
        algorithms: ['RS256'],
        issuer: config.issuer,
        audience: config.clientId,
        maxAge: '5m',
      }) as JwtPayload;
    } catch (err: any) {
      console.warn('[SSO] SPHERE ID token rejected:', err?.message);
      return null;
    }
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      return null;
    }
    // With several audiences the token must name ICAN as its authorized party.
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) return null;
    return payload;
  }

  /** Key by `kid`, refetching the JWKS once when SPHERE rotated its signing key. */
  private async signingKey(jwksUri: string, kid: string): Promise<KeyObject | null> {
    if (this.keysUrl !== jwksUri) {
      this.keys.clear();
      this.keysUrl = jwksUri;
    }
    if (!this.keys.has(kid)) {
      const response = await fetch(jwksUri, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`SPHERE JWKS answered ${response.status}`);
      const { keys } = (await response.json()) as { keys?: Array<Record<string, unknown>> };
      this.keys.clear();
      for (const jwk of keys ?? []) {
        if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.use && jwk.use !== 'sig')) continue;
        this.keys.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e } as any, format: 'jwk' }));
      }
    }
    return this.keys.get(kid) ?? null;
  }
}
