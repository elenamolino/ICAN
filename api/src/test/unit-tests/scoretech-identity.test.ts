import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import jwt from 'jsonwebtoken';

const { cache, findOrCreateUser, linkIdentity, findById } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cache: {
      store,
      get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null),
      set: async (key: string, value: unknown) => void store.set(key, JSON.stringify(value)),
      del: async (key: string) => void store.delete(key),
      take: async (key: string) => {
        const value = store.get(key);
        store.delete(key);
        return value ? JSON.parse(value) : null;
      },
      setIfAbsent: async (key: string, value: unknown) => {
        if (store.has(key)) return false;
        store.set(key, JSON.stringify(value));
        return true;
      },
      replace: async (key: string, value: unknown, _seconds: number, onlyIfPresent = false) => {
        if (onlyIfPresent && !store.has(key)) return false;
        store.set(key, JSON.stringify(value));
        return true;
      },
    },
    findOrCreateUser: vi.fn(),
    linkIdentity: vi.fn(),
    findById: vi.fn(),
  };
});

vi.mock('../../main/config/container', () => ({
  default: {
    resolve: (name: string) =>
      ({
        cacheService: cache,
        userRepository: { findById },
        authProviderService: { findOrCreateUser, linkIdentity },
      })[name],
  },
}));

import ScoretechIdentityService, {
  scoretechIdentityId,
} from '../../main/services/ScoretechIdentityService';
import { scoretechConfig } from '../../main/services/scoretech/config';

const ISSUER = 'https://identity.example.org/identity/auth/realms/score';
const FRONTEND = 'https://ican.example.org';
const CLIENT_ID = 'ican';
const CALLBACK = FRONTEND + '/api/v1/auth/identity/callback';
const USER = { id: 'user-1', username: 'ada', role: 'USER' };

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
});

const sign = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setSubject('subject-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

/** Fake SCORETech Identity: discovery, JWKS and a token endpoint answering with `tokens`. */
function mockIdentityServer(tokens: () => Promise<Record<string, unknown>>) {
  const token = vi.fn(async () => Response.json(await tokens()));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/.well-known/openid-configuration'))
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: ISSUER + '/protocol/openid-connect/auth',
          token_endpoint: ISSUER + '/protocol/openid-connect/token',
          jwks_uri: ISSUER + '/protocol/openid-connect/certs',
          end_session_endpoint: ISSUER + '/protocol/openid-connect/logout',
        });
      if (url.endsWith('/certs')) return Response.json({ keys: [publicJwk] });
      if (url.endsWith('/token')) return token();
      throw new Error('Unexpected request to ' + url);
    })
  );
  return token;
}

async function signIn(service: ScoretechIdentityService, nonceOverride?: string, linkUserId?: string) {
  const start = await service.begin('/contracts', false, linkUserId);
  const nonce = nonceOverride ?? new URL(start.url).searchParams.get('nonce');
  mockIdentityServer(async () => ({
    access_token: await sign({ azp: CLIENT_ID }),
    id_token: await sign({
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      nonce,
      email: 'Ada@Example.org',
      email_verified: true,
      given_name: 'Ada',
      family_name: 'Lovelace',
    }),
    refresh_token: 'refresh-1',
    expires_in: 300,
  }));
  return { start, result: () => service.complete(start.state, start.binding, 'code-1') };
}

describe('SCORETech Identity', () => {
  let service: ScoretechIdentityService;

  beforeEach(() => {
    vi.stubEnv('SCORETECH_IDENTITY_ISSUER', ISSUER);
    vi.stubEnv('SCORETECH_IDENTITY_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('SCORETECH_IDENTITY_CLIENT_SECRET', 'secret');
    vi.stubEnv('SCORETECH_IDENTITY_CALLBACK_URL', CALLBACK);
    vi.stubEnv('FRONTEND_URL', FRONTEND);
    vi.stubEnv('BASE_URL_PATH', '');
    vi.stubEnv('AUTH_PROVIDER', 'local');
    cache.store.clear();
    findOrCreateUser.mockReset().mockResolvedValue({ token: 'unused', user: USER });
    linkIdentity.mockReset().mockResolvedValue(undefined);
    findById.mockReset().mockResolvedValue(USER);
    mockIdentityServer(async () => ({}));
    service = new ScoretechIdentityService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('configuration', () => {
    it('rejects a callback outside the frontend origin', () => {
      vi.stubEnv('SCORETECH_IDENTITY_CALLBACK_URL', 'https://elsewhere.example.org/api/v1/auth/identity/callback');
      expect(() => scoretechConfig()).toThrow(/SCORETECH_IDENTITY_CALLBACK_URL/);
    });

    it('requires the client credentials', () => {
      vi.stubEnv('SCORETECH_IDENTITY_CLIENT_SECRET', '');
      expect(() => scoretechConfig()).toThrow(/CLIENT_SECRET/);
    });
  });

  describe('begin', () => {
    it('sends an Authorization Code request with PKCE to the registered callback', async () => {
      const start = await service.begin('/contracts', false);
      const url = new URL(start.url);

      expect(url.origin + url.pathname).toBe(ISSUER + '/protocol/openid-connect/auth');
      expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid profile email');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe(start.state);
      expect(cache.store.has('sso:scoretech:flow:' + start.state)).toBe(true);
    });

    it('never keeps an off-site return path', async () => {
      const start = await service.begin('//evil.example.org', false);
      expect(JSON.parse(cache.store.get('sso:scoretech:flow:' + start.state)!).returnTo).toBe('/');
    });
  });

  describe('complete', () => {
    it('signs in the user keyed by issuer and subject', async () => {
      const { result } = await signIn(service);
      const { sessionId, returnTo } = await result();

      expect(returnTo).toBe('/contracts');
      expect(sessionId).toMatch(/^[a-f0-9]{64}$/);
      expect(findOrCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'scoretech',
          providerId: scoretechIdentityId(ISSUER, 'subject-1'),
          email: 'ada@example.org',
          firstName: 'Ada',
          lastName: 'Lovelace',
        })
      );
    });

    it('rejects a callback from another browser', async () => {
      const { start } = await signIn(service);
      await expect(service.complete(start.state, 'a'.repeat(64), 'code-1')).rejects.toThrow(
        /browser binding/
      );
      expect(findOrCreateUser).not.toHaveBeenCalled();
    });

    it('rejects an ID token issued for another request', async () => {
      const { result } = await signIn(service, 'another-nonce');
      await expect(result()).rejects.toThrow(/nonce/);
    });

    it('accepts each sign-in flow only once', async () => {
      const { start, result } = await signIn(service);
      await result();
      await expect(service.complete(start.state, start.binding, 'code-1')).rejects.toThrow(
        /UNAUTHORIZED/
      );
    });
  });

  describe('link', () => {
    it('asks SCORETech to sign in again before connecting an account', async () => {
      const start = await service.begin('/me/settings', false, USER.id);
      const url = new URL(start.url);
      expect(url.searchParams.get('prompt')).toBe('login');
      expect(url.searchParams.get('max_age')).toBe('0');
    });

    it('connects the identity to the signed-in account without opening a session', async () => {
      const { result } = await signIn(service, undefined, USER.id);
      const outcome = await result();

      expect(outcome.sessionId).toBeUndefined();
      expect(outcome.returnTo).toContain('identity_linked=scoretech');
      expect(linkIdentity).toHaveBeenCalledWith(
        USER.id,
        expect.objectContaining({ providerId: scoretechIdentityId(ISSUER, 'subject-1') })
      );
      expect(findOrCreateUser).not.toHaveBeenCalled();
    });
  });

  describe('session', () => {
    it('issues a short-lived API token bound to the identity session', async () => {
      const { result } = await signIn(service);
      const { sessionId } = await result();

      const { token } = await service.session(sessionId!);
      const payload = jwt.decode(token) as jwt.JwtPayload;

      expect(payload.id).toBe(USER.id);
      expect(payload.identitySessionId).toBe(sessionId);
      expect(payload.exp! - payload.iat!).toBe(300);
      await expect(service.authenticate(sessionId!, USER.id)).resolves.toBeUndefined();
      await expect(service.authenticate(sessionId!, 'someone-else')).rejects.toThrow(/mismatch/);
    });

    it('ends on logout', async () => {
      const { result } = await signIn(service);
      const { sessionId } = await result();

      await service.logout(sessionId!);
      await expect(service.session(sessionId!)).rejects.toThrow(/session has ended/);
    });
  });
});
