import { createHash } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SphereProvider, trustedUrl } from '../../main/services/identity/SphereProvider';
import { FakeSphere, SPHERE_CLIENT_ID, SPHERE_ISSUER } from '../utils/auth/fakeSphere';

const transaction = { codeVerifier: 'v'.repeat(43), nonce: 'n'.repeat(32) };
const account = {
  sub: '64f0c0ffee0000000000abcd',
  preferred_username: 'fran.garcia',
  name: 'Fran García López',
  given_name: 'Fran',
  family_name: 'García López',
  email: 'fran@example.com',
  email_verified: true,
};

describe('SphereProvider', () => {
  const sphere = new FakeSphere();
  let provider: SphereProvider;

  beforeAll(() => sphere.install());
  afterAll(() => sphere.uninstall());
  beforeEach(() => {
    sphere.reset();
    Object.assign(process.env, sphere.env());
    // A fresh instance per test: metadata and keys are cached per instance.
    provider = new SphereProvider();
  });

  const signIn = async (who = account, tx = transaction) => {
    const url = await provider.buildLoginUrl('s'.repeat(32), tx);
    const callback = new URL(sphere.approve(url, who), 'http://localhost');
    return provider.handleCallback(Object.fromEntries(callback.searchParams), tx);
  };

  describe('configuration', () => {
    it('is configured only with issuer, client id, secret and redirect URI', () => {
      expect(provider.isConfigured()).toBe(true);
      for (const name of Object.keys(sphere.env())) {
        const value = process.env[name];
        process.env[name] = '';
        expect(provider.isConfigured()).toBe(false);
        process.env[name] = value;
      }
    });

    it('refuses an issuer that is not an HTTPS origin', async () => {
      process.env.SPHERE_OIDC_ISSUER = 'http://sphere.example.com';
      await expect(provider.buildLoginUrl('s'.repeat(32), transaction)).rejects.toThrow(/HTTPS/);
      process.env.SPHERE_OIDC_ISSUER = SPHERE_ISSUER + '/path';
      await expect(provider.buildLoginUrl('s'.repeat(32), transaction)).rejects.toThrow(/origin/);
    });

    it('allows plain HTTP only on loopback', () => {
      expect(trustedUrl('http://localhost:5173').origin).toBe('http://localhost:5173');
      expect(trustedUrl('http://127.0.0.1:5173').origin).toBe('http://127.0.0.1:5173');
      expect(() => trustedUrl('http://10.0.0.2')).toThrow();
      expect(() => trustedUrl('https://user:pw@sphere.test')).toThrow();
    });
  });

  describe('buildLoginUrl', () => {
    it('asks SPHERE for openid, profile and email with S256 PKCE, state and nonce', async () => {
      const url = new URL(await provider.buildLoginUrl('state-0123456789abcdef', transaction));
      expect(url.origin + url.pathname).toBe(SPHERE_ISSUER + '/api/v1/oidc/authorize');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: SPHERE_CLIENT_ID,
        redirect_uri: sphere.env().SPHERE_OIDC_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        state: 'state-0123456789abcdef',
        nonce: transaction.nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(transaction.codeVerifier).digest('base64url'),
      });
    });

    it('refuses discovery documents from another issuer or with foreign endpoints', async () => {
      sphere.metadataOverrides = { issuer: 'https://evil.test' };
      await expect(provider.buildLoginUrl('s'.repeat(32), transaction)).rejects.toThrow(/issuer/);
      sphere.metadataOverrides = { token_endpoint: 'https://evil.test/token' };
      await expect(new SphereProvider().buildLoginUrl('s'.repeat(32), transaction)).rejects.toThrow(/token_endpoint/);
    });
  });

  describe('handleCallback', () => {
    it('exchanges the code with the secret and verifier and returns the SPHERE profile', async () => {
      const profile = await signIn();
      expect(profile).toEqual({
        provider: 'sphere',
        providerId: account.sub,
        email: account.email,
        emailVerified: false,
        firstName: 'Fran',
        lastName: 'García López',
        suggestedUsername: 'frangarcia',
      });
      const body = sphere.tokenRequests[0];
      expect(body.get('code_verifier')).toBe(transaction.codeVerifier);
      expect(body.get('grant_type')).toBe('authorization_code');
    });

    it('never trusts the email for linking, even when SPHERE says it is verified', async () => {
      expect((await signIn({ ...account, email_verified: true }))?.emailVerified).toBe(false);
    });

    it('falls back to the full name, then to the username, for first and last name', async () => {
      const fromName = await signIn({ sub: 'a1', name: 'Ada Lovelace Byron', email: 'ada@example.com', preferred_username: 'ada' });
      expect(fromName).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace Byron', suggestedUsername: 'ada' });
      const bare = await signIn({ sub: 'a2', email: 'x@example.com', preferred_username: 'bob_99' });
      expect(bare).toMatchObject({ firstName: 'bob_99', lastName: 'SPHERE', suggestedUsername: 'bob_99' });
      const noName = await signIn({ sub: 'a3', email: 'x@example.com', preferred_username: 'é' });
      expect(noName?.suggestedUsername).toBe('sphere-user');
    });

    it('refuses an ID token with another nonce', async () => {
      sphere.tampering = { nonce: 'x'.repeat(32) };
      expect(await signIn()).toBeNull();
    });

    it('refuses an ID token for another audience, issuer, key, algorithm or already expired', async () => {
      for (const tampering of [
        { audience: 'space' },
        { audience: [SPHERE_CLIENT_ID, 'space'] },
        { issuer: 'https://evil.test' },
        { signWithOtherKey: true },
        { algorithm: 'HS256' as const },
        { expiresIn: -60 },
      ]) {
        sphere.tampering = tampering;
        expect(await signIn(), JSON.stringify(tampering)).toBeNull();
      }
    });

    it('refuses a response without ID token, a token without email, or a code SPHERE rejects', async () => {
      sphere.tampering = { omitIdToken: true };
      expect(await signIn()).toBeNull();
      sphere.reset();
      expect(await signIn({ sub: 'no-mail', preferred_username: 'nomail' })).toBeNull();
      expect(await provider.handleCallback({ code: 'unknown', state: 's' }, transaction)).toBeNull();
    });

    it('needs the server-side transaction: a code alone is not enough', async () => {
      const url = await provider.buildLoginUrl('s'.repeat(32), transaction);
      const callback = new URL(sphere.approve(url, account), 'http://localhost');
      expect(await provider.handleCallback(Object.fromEntries(callback.searchParams))).toBeNull();
      expect(await provider.handleCallback(Object.fromEntries(callback.searchParams), { ...transaction, codeVerifier: 'w'.repeat(43) })).toBeNull();
    });

    it('fails loudly when SPHERE is down, so the user sees a server error', async () => {
      sphere.tampering = { status: 503 };
      await expect(signIn()).rejects.toThrow(/503/);
    });

    it('picks up a rotated signing key', async () => {
      expect(await signIn()).not.toBeNull();
      sphere.rotateKey('test-key-2');
      expect(await signIn()).not.toBeNull();
    });
  });
});
