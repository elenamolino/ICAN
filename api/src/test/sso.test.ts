import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import testContainer from './utils/config/testContainer';
import { createTestUser } from './utils/users/userTestUtils';
import { BASE_PATH } from './utils/config/variables';
import { FakeSphere, SphereAccount } from './utils/auth/fakeSphere';
import UserMongoose from '../main/repositories/mongoose/models/UserMongoose';
import OrganizationMongoose from '../main/repositories/mongoose/models/OrganizationMongoose';
import { randomBytes } from 'crypto';

const SSO = `${BASE_PATH}/users/auth/sso`;
let counter = 0;
const uniqueAccount = (overrides: Partial<SphereAccount> = {}): SphereAccount => {
  const id = `${Date.now()}${counter++}`;
  return {
    sub: `sphere-${id}`,
    preferred_username: `sph_${id}`,
    given_name: 'Grace',
    family_name: 'Hopper',
    email: `sph_${id}@example.com`,
    email_verified: true,
    ...overrides,
  };
};

/** Location of a redirect, relative to its origin, plus its query parameters. */
const redirectOf = (response: request.Response) => {
  const location = new URL(response.headers.location);
  return { url: location.href, params: Object.fromEntries(location.searchParams) };
};
const cookieOf = (response: request.Response) => {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (header ?? []).map((value) => value.split(';')[0]).find((value) => value.startsWith('ican_sso_browser='));
};

describe('Sign in with SPHERE (SSO)', { timeout: 20000 }, () => {
  let app: TestApp;
  const sphere = new FakeSphere();
  const usersToDelete: Set<string> = testContainer.resolve('usersToDelete');

  beforeAll(async () => {
    app = testContainer.resolve('app');
    sphere.install();
  });

  beforeEach(() => sphere.reset());

  afterEach(async () => {
    for (const username of usersToDelete) {
      await UserMongoose.deleteOne({ username });
    }
    usersToDelete.clear();
  });

  afterAll(async () => {
    sphere.uninstall();
    await shutdownApp();
  });

  /** Starts a sign-in in a browser: answers SPHERE's authorization URL and the browser cookie. */
  const start = async (query = '', cookie?: string) => {
    const req = request(app).get(`${SSO}/sphere/initiate${query}`);
    if (cookie) req.set('Cookie', cookie);
    const response = await req;
    expect(response.status).toBe(302);
    return { authorizationUrl: response.headers.location as string, cookie: cookieOf(response) ?? cookie };
  };

  const callback = (path: string, cookie?: string) => {
    const req = request(app).get(path);
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  /** Full browser sign-in through SPHERE; answers ICAN's final redirect. */
  const signIn = async (account: SphereAccount) => {
    const { authorizationUrl, cookie } = await start();
    const response = await callback(sphere.approve(authorizationUrl, account), cookie);
    expect(response.status).toBe(302);
    return redirectOf(response);
  };

  /**
   * Settings -> Connect SPHERE in the browser of `token`'s owner: ticket, SPHERE approval
   * and the pending connection the callback hands back. Confirming is a separate step.
   */
  const startConnection = async (token: string, account: SphereAccount, cookie?: string) => {
    const link = await request(app).post(`${SSO}/sphere/link`).set('Authorization', `Bearer ${token}`);
    expect(link.status).toBe(200);
    expect(link.body.ticket).toMatch(/^[a-f0-9]{64}$/);
    const started = await start(`?link=${link.body.ticket}`, cookie);
    const back = redirectOf(await callback(sphere.approve(started.authorizationUrl, account), started.cookie));
    return { params: back.params, cookie: started.cookie! };
  };
  const confirmConnection = (pending: string, token?: string, cookie?: string, method: 'get' | 'post' = 'post') => {
    const req = request(app)[method](`${SSO}/sphere/link/${pending}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  const exchange = async (code: string) => {
    const response = await request(app).get(`${SSO}/sphere/exchange`).query({ code });
    expect(response.status).toBe(200);
    return response.body.token as string;
  };

  const me = async (token: string) => {
    const response = await request(app).get(`${BASE_PATH}/users/me`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return response.body;
  };

  describe('GET /users/auth/sso/providers', () => {
    it('lists SPHERE only while it is configured', async () => {
      const configured = await request(app).get(`${SSO}/providers`);
      expect(configured.status).toBe(200);
      expect(configured.body.providers).toEqual(['us', 'google', 'sphere']);

      process.env.SPHERE_OIDC_CLIENT_SECRET = '';
      try {
        const hidden = await request(app).get(`${SSO}/providers`);
        expect(hidden.body.providers).toEqual(['us', 'google']);
        const initiate = await request(app).get(`${SSO}/sphere/initiate`);
        expect(redirectOf(initiate).params).toEqual({ sso_error: 'provider_unavailable' });
      } finally {
        Object.assign(process.env, sphere.env());
      }
    });
  });

  describe('first sign-in and returning sign-in', () => {
    it('sends the browser to SPHERE with a state bound to an HttpOnly cookie', async () => {
      const response = await request(app).get(`${SSO}/sphere/initiate`);
      expect(response.status).toBe(302);
      const authorize = new URL(response.headers.location);
      expect(authorize.searchParams.get('scope')).toBe('openid profile email');
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
      const setCookie = (response.headers['set-cookie'] as unknown as string[]).join(';');
      expect(setCookie).toMatch(/ican_sso_browser=[a-f0-9]{64}/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/users\/auth\/sso/);
    });

    it('creates an ICAN account with a personal organization on the first sign-in', async () => {
      const account = uniqueAccount();
      const { params } = await signIn(account);
      expect(params.code).toMatch(/^[a-f0-9]{32}$/);

      const user = await me(await exchange(params.code));
      usersToDelete.add(user.username);
      expect(user).toMatchObject({
        username: account.preferred_username,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: account.email,
        role: 'USER',
      });
      expect(user.identities).toEqual([expect.objectContaining({ provider: 'sphere', providerId: account.sub })]);

      const orgs = await request(app).get(`${BASE_PATH}/users/me/orgs`).set('Authorization', `Bearer ${await exchange((await signIn(account)).params.code)}`);
      expect(orgs.status).toBe(200);
      expect(JSON.stringify(orgs.body)).toContain(account.preferred_username!.toLowerCase());
    });

    it('signs a returning user into the same account, even after a rename in SPHERE', async () => {
      const account = uniqueAccount();
      const first = await me(await exchange((await signIn(account)).params.code));
      usersToDelete.add(first.username);

      const renamed = { ...account, preferred_username: `${account.preferred_username}_new`, email: `new_${account.email}` };
      const second = await me(await exchange((await signIn(renamed)).params.code));
      expect(second.id).toBe(first.id);
      expect(second.username).toBe(first.username);
      expect(await UserMongoose.countDocuments({ 'identities.providerId': account.sub })).toBe(1);
    });

    it('lowercases the username and skips names an organization already uses', async () => {
      const taken = `Acme${Date.now()}`;
      const org = await OrganizationMongoose.create({ name: taken.toLowerCase(), displayName: 'Acme', isPersonal: false, ancestors: [] });
      try {
        const account = uniqueAccount({ preferred_username: taken });
        const { params } = await signIn(account);
        expect(params.code).toBeDefined();
        const user = await me(await exchange(params.code));
        usersToDelete.add(user.username);
        expect(user.username).toBe(`${taken.toLowerCase()}-2`);
      } finally {
        await OrganizationMongoose.deleteOne({ _id: org._id });
      }
    });

    it('picks a free username when the SPHERE one is taken in ICAN', async () => {
      const { user: local } = await createTestUser('USER');
      const account = uniqueAccount({ preferred_username: local.username });
      const user = await me(await exchange((await signIn(account)).params.code));
      usersToDelete.add(user.username);
      expect(user.username).not.toBe(local.username);
      expect(user.username.startsWith(local.username)).toBe(true);
    });
  });

  describe('accounts that already exist in ICAN', () => {
    it('never takes over an ICAN account by email: it explains how to connect SPHERE instead', async () => {
      const { user: local } = await createTestUser('USER');
      const account = uniqueAccount({ email: local.email, email_verified: true });

      const { params } = await signIn(account);
      expect(params).toEqual({ sso_error: 'email_in_use', provider: 'sphere' });
      const stored = await UserMongoose.findById(local.id).lean();
      expect(stored?.identities ?? []).toEqual([]);
      expect(await UserMongoose.countDocuments({ 'identities.providerId': account.sub })).toBe(0);
    });

    it('connects SPHERE from Settings, and then SPHERE signs into that account', async () => {
      const { user: local } = await createTestUser('USER');
      const account = uniqueAccount({ email: local.email });

      const { params, cookie } = await startConnection(local.token!, account);
      expect(params).toEqual({ mode: 'link', provider: 'sphere', pending: expect.stringMatching(/^[a-f0-9]{64}$/) });
      // Nothing is connected until the account owner confirms.
      expect((await UserMongoose.findById(local.id).lean())?.identities ?? []).toEqual([]);

      const preview = await confirmConnection(params.pending, local.token, cookie, 'get');
      expect(preview.status).toBe(200);
      expect(preview.body).toEqual({ provider: 'sphere', email: account.email, name: 'Grace Hopper' });
      const confirmed = await confirmConnection(params.pending, local.token, cookie);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toEqual({ linked: 'sphere' });
      expect((await confirmConnection(params.pending, local.token, cookie)).status).toBe(400);

      const stored = await UserMongoose.findById(local.id).lean();
      expect(stored?.identities).toEqual([expect.objectContaining({ provider: 'sphere', providerId: account.sub })]);

      const user = await me(await exchange((await signIn(account)).params.code));
      expect(user.id).toBe(local.id);
    });

    it('refuses to connect a SPHERE identity that another ICAN account already uses', async () => {
      const account = uniqueAccount();
      const owner = await me(await exchange((await signIn(account)).params.code));
      usersToDelete.add(owner.username);
      const { user: other } = await createTestUser('USER');

      const { params, cookie } = await startConnection(other.token!, account);
      const response = await confirmConnection(params.pending, other.token, cookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('identity_in_use');
      expect((await UserMongoose.findById(other.id).lean())?.identities ?? []).toEqual([]);
    });

    it('refuses a second SPHERE identity on an account that already has one', async () => {
      const { user: local } = await createTestUser('USER');
      for (const [index, status] of [[0, 200], [1, 409]] as const) {
        const { params, cookie } = await startConnection(local.token!, uniqueAccount({ sub: `second-${index}-${Date.now()}` }));
        const response = await confirmConnection(params.pending, local.token, cookie);
        expect(response.status).toBe(status);
        if (status === 409) expect(response.body.code).toBe('provider_already_linked');
      }
      expect((await UserMongoose.findById(local.id).lean())?.identities).toHaveLength(1);
    });

    it('only starts a connection with a web session, and each ticket works once', async () => {
      expect((await request(app).post(`${SSO}/sphere/link`)).status).toBe(401);

      const { user: local } = await createTestUser('USER');
      const apiKey = `usr_${randomBytes(16).toString('hex')}`;
      await UserMongoose.updateOne({ _id: local.id }, { $push: { apiKeys: { key: apiKey, name: 'sso-test', scopes: [] } } });
      const withKey = await request(app).post(`${SSO}/sphere/link`).set('x-api-key', apiKey);
      expect(withKey.status).toBe(401);
      expect(withKey.body.error).toMatch(/Sign in to ICAN/);

      expect((await request(app).post(`${SSO}/unknown/link`).set('Authorization', `Bearer ${local.token}`)).status).toBe(404);
      expect((await request(app).post(`${SSO}/us/link`).set('Authorization', `Bearer ${local.token}`)).status).toBe(400);

      const link = await request(app).post(`${SSO}/sphere/link`).set('Authorization', `Bearer ${local.token}`);
      await start(`?link=${link.body.ticket}`);
      const reused = await request(app).get(`${SSO}/sphere/initiate?link=${link.body.ticket}`);
      expect(redirectOf(reused).params).toEqual({ sso_error: 'invalid_state', mode: 'link' });

      const otherProvider = await request(app).post(`${SSO}/sphere/link`).set('Authorization', `Bearer ${local.token}`);
      const google = await request(app).get(`${SSO}/google/initiate?link=${otherProvider.body.ticket}`);
      expect(redirectOf(google).params).toEqual({ sso_error: 'invalid_state', mode: 'link' });
    });
  });

  describe('connection CSRF', () => {
    it('a connection link sent to someone else never connects their SPHERE to the sender', async () => {
      const { user: attacker } = await createTestUser('USER');
      const { user: victim } = await createTestUser('USER');
      const victimSphere = uniqueAccount();

      // The attacker asks for a ticket and gets the victim's browser to use it; the victim
      // approves on SPHERE, so the callback runs in the victim's browser.
      const { params, cookie: victimBrowser } = await startConnection(attacker.token!, victimSphere);
      expect(params.pending).toBeDefined();

      // The pending connection is in the victim's browser, but it is not the victim's to confirm,
      const asVictim = await confirmConnection(params.pending, victim.token, victimBrowser);
      expect(asVictim.status).toBe(403);
      expect(asVictim.body.code).toBe('wrong_account');
      // and the attacker cannot confirm it from another browser.
      const fromAttackerBrowser = await confirmConnection(params.pending, attacker.token, `ican_sso_browser=${'1'.repeat(64)}`);
      expect(fromAttackerBrowser.status).toBe(400);
      expect((await confirmConnection(params.pending, undefined, victimBrowser)).status).toBe(401);

      for (const id of [attacker.id, victim.id]) {
        expect((await UserMongoose.findById(id).lean())?.identities ?? []).toEqual([]);
      }
      expect(await UserMongoose.countDocuments({ 'identities.providerId': victimSphere.sub })).toBe(0);
    });
  });

  describe('callback protections', () => {
    it('refuses a callback from another browser (login CSRF) and keeps the state for the right one', async () => {
      const account = uniqueAccount();
      const { authorizationUrl, cookie } = await start();
      const path = sphere.approve(authorizationUrl, account);

      expect(redirectOf(await callback(path)).params).toEqual({ sso_error: 'invalid_state' });
      expect(redirectOf(await callback(path, `ican_sso_browser=${'0'.repeat(64)}`)).params).toEqual({ sso_error: 'invalid_state' });

      const ok = redirectOf(await callback(path, cookie));
      expect(ok.params.code).toBeDefined();
      usersToDelete.add((await me(await exchange(ok.params.code))).username);
    });

    it('takes each state once', async () => {
      const { authorizationUrl, cookie } = await start();
      const path = sphere.approve(authorizationUrl, uniqueAccount());
      const first = redirectOf(await callback(path, cookie));
      usersToDelete.add((await me(await exchange(first.params.code))).username);
      expect(redirectOf(await callback(path, cookie)).params).toEqual({ sso_error: 'invalid_state' });
    });

    it('lets two sign-ins in two tabs of the same browser finish', async () => {
      const first = await start();
      const second = await start('', first.cookie);
      expect(second.cookie).toBe(first.cookie);
      for (const tab of [first, second]) {
        const result = redirectOf(await callback(sphere.approve(tab.authorizationUrl, uniqueAccount()), first.cookie));
        usersToDelete.add((await me(await exchange(result.params.code))).username);
      }
    });

    it('explains a cancelled consent and an ID token that does not verify', async () => {
      const denied = await start();
      expect(redirectOf(await callback(sphere.deny(denied.authorizationUrl), denied.cookie)).params).toEqual({ sso_error: 'access_denied' });

      sphere.tampering = { nonce: 'x'.repeat(32) };
      const forged = await start();
      const response = await callback(sphere.approve(forged.authorizationUrl, uniqueAccount()), forged.cookie);
      expect(redirectOf(response).params).toEqual({ sso_error: 'invalid_response' });
    });

    it('shows a server error when SPHERE is down, and the exchange code works once', async () => {
      sphere.tampering = { status: 503 };
      const down = await start();
      const response = await callback(sphere.approve(down.authorizationUrl, uniqueAccount()), down.cookie);
      expect(redirectOf(response).params).toEqual({ sso_error: 'server_error' });

      sphere.reset();
      const { params } = await signIn(uniqueAccount());
      usersToDelete.add((await me(await exchange(params.code))).username);
      expect((await request(app).get(`${SSO}/sphere/exchange`).query({ code: params.code })).status).toBe(401);
    });
  });
});
