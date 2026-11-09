import { createHash, generateKeyPairSync, KeyObject, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

export const SPHERE_ISSUER = 'https://sphere.test';
export const SPHERE_CLIENT_ID = 'ican-test';
export const SPHERE_CLIENT_SECRET = 'ican-test-secret';

export interface SphereAccount {
  sub: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
}

/** Ways to make the next token response wrong, to check that ICAN refuses it. */
export interface TokenTampering {
  nonce?: string;
  audience?: string | string[];
  issuer?: string;
  signWithOtherKey?: boolean;
  expiresIn?: number;
  algorithm?: 'HS256';
  omitIdToken?: boolean;
  status?: number;
}

interface IssuedCode {
  account: SphereAccount;
  challenge: string;
  nonce: string;
  redirectUri: string;
  clientId: string;
}

const newKey = () => generateKeyPairSync('rsa', { modulusLength: 2048 });

/**
 * In-memory SPHERE OIDC provider that answers ICAN's server-side fetch calls with the
 * same rules as SPHERE's OidcService: S256 PKCE, single-use codes, client secret,
 * redirect URI binding and RS256 ID tokens with the nonce of the authorization request.
 */
export class FakeSphere {
  readonly kid = 'test-key-1';
  private key = newKey();
  private otherKey = newKey();
  private codes = new Map<string, IssuedCode>();
  private originalFetch: typeof fetch = globalThis.fetch;
  tampering: TokenTampering = {};
  metadataOverrides: Record<string, unknown> = {};
  tokenRequests: URLSearchParams[] = [];

  env() {
    return {
      SPHERE_OIDC_ISSUER: SPHERE_ISSUER,
      SPHERE_OIDC_CLIENT_ID: SPHERE_CLIENT_ID,
      SPHERE_OIDC_CLIENT_SECRET: SPHERE_CLIENT_SECRET,
      SPHERE_OIDC_REDIRECT_URI: `http://localhost:${process.env.SERVER_PORT}${process.env.BASE_URL_PATH ?? ''}/api/v1/users/auth/sso/sphere/callback`,
    };
  }

  install() {
    Object.assign(process.env, this.env());
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = this.fetch as typeof fetch;
  }

  uninstall() {
    globalThis.fetch = this.originalFetch;
    for (const name of Object.keys(this.env())) process.env[name] = '';
  }

  reset() {
    this.tampering = {};
    this.metadataOverrides = {};
    this.tokenRequests = [];
  }

  /** Rotates SPHERE's signing key (new kid), as a redeploy with a new key would. */
  rotateKey(kid: string) {
    (this as { kid: string }).kid = kid;
    this.key = newKey();
  }

  /**
   * What SPHERE does when the user approves its consent page: validates the
   * authorization request and answers the redirect back to ICAN with a code.
   */
  approve(authorizationUrl: string, account: SphereAccount): string {
    const url = new URL(authorizationUrl);
    const params = url.searchParams;
    if (url.origin + url.pathname !== SPHERE_ISSUER + '/api/v1/oidc/authorize') throw new Error('Unexpected authorize URL');
    if (params.get('response_type') !== 'code' || params.get('code_challenge_method') !== 'S256') throw new Error('Not PKCE');
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') ?? '')) throw new Error('Bad challenge');
    if ((params.get('nonce') ?? '').length < 16 || (params.get('state') ?? '').length < 16) throw new Error('Short state/nonce');
    const code = randomBytes(16).toString('hex');
    this.codes.set(code, {
      account,
      challenge: params.get('code_challenge')!,
      nonce: params.get('nonce')!,
      redirectUri: params.get('redirect_uri')!,
      clientId: params.get('client_id')!,
    });
    const back = new URL(params.get('redirect_uri')!);
    back.searchParams.set('code', code);
    back.searchParams.set('state', params.get('state')!);
    return back.pathname + back.search;
  }

  /** What SPHERE does when the user denies consent. */
  deny(authorizationUrl: string): string {
    const params = new URL(authorizationUrl).searchParams;
    const back = new URL(params.get('redirect_uri')!);
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('state', params.get('state')!);
    return back.pathname + back.search;
  }

  private json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  private publicJwk(key: KeyObject) {
    return { ...key.export({ format: 'jwk' }), kid: this.kid, alg: 'RS256', use: 'sig' };
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(SPHERE_ISSUER + '/')) return this.originalFetch(input, init);

    if (url === SPHERE_ISSUER + '/.well-known/openid-configuration') {
      return this.json({
        issuer: SPHERE_ISSUER,
        authorization_endpoint: SPHERE_ISSUER + '/api/v1/oidc/authorize',
        token_endpoint: SPHERE_ISSUER + '/api/v1/oidc/token',
        jwks_uri: SPHERE_ISSUER + '/api/v1/oidc/jwks',
        ...this.metadataOverrides,
      });
    }
    if (url === SPHERE_ISSUER + '/api/v1/oidc/jwks') {
      return this.json({ keys: [this.publicJwk(this.key.publicKey)] });
    }
    if (url === SPHERE_ISSUER + '/api/v1/oidc/token' && init?.method === 'POST') {
      return this.token(new URLSearchParams(String(init.body)));
    }
    return this.json({ error: 'not_found' }, 404);
  };

  private token(body: URLSearchParams): Response {
    this.tokenRequests.push(body);
    const t = this.tampering;
    if (t.status) return this.json({ error: 'server_error' }, t.status);
    if (body.get('client_id') !== SPHERE_CLIENT_ID || body.get('client_secret') !== SPHERE_CLIENT_SECRET) {
      return this.json({ error: 'invalid_client' }, 401);
    }
    const code = body.get('code') ?? '';
    const issued = this.codes.get(code);
    const verifier = body.get('code_verifier') ?? '';
    if (!issued || issued.clientId !== body.get('client_id') || issued.redirectUri !== body.get('redirect_uri') ||
      createHash('sha256').update(verifier).digest('base64url') !== issued.challenge) {
      return this.json({ error: 'invalid_grant' }, 400);
    }
    this.codes.delete(code); // single use
    if (t.omitIdToken) return this.json({ access_token: 'sph_oid_x', token_type: 'Bearer' });

    const { sub, ...claims } = issued.account;
    const idToken = t.algorithm === 'HS256'
      ? jwt.sign({ ...claims, nonce: t.nonce ?? issued.nonce }, SPHERE_CLIENT_SECRET, {
        algorithm: 'HS256', keyid: this.kid, subject: sub, issuer: SPHERE_ISSUER, audience: SPHERE_CLIENT_ID, expiresIn: 300,
      })
      : jwt.sign({ ...claims, nonce: t.nonce ?? issued.nonce }, (t.signWithOtherKey ? this.otherKey : this.key).privateKey, {
        algorithm: 'RS256',
        keyid: this.kid,
        subject: sub,
        issuer: t.issuer ?? SPHERE_ISSUER,
        audience: t.audience ?? SPHERE_CLIENT_ID,
        expiresIn: t.expiresIn ?? 300,
      });
    return this.json({ access_token: 'sph_oid_x', token_type: 'Bearer', expires_in: 300, id_token: idToken });
  }
}
