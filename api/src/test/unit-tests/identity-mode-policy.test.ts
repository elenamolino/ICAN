import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../main/config/container', () => ({ default: { resolve: () => ({}) } }));

import { identityModePolicy } from '../../main/controllers/ScoretechIdentityController';

function run(method: string, path: string, body: Record<string, unknown> = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  identityModePolicy({ method, path, body } as any, res as any, next);
  return { blocked: res.status.mock.calls[0]?.[0] === 409, passed: next.mock.calls.length === 1 };
}

describe('identityModePolicy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lets everything through outside identity mode', () => {
    vi.stubEnv('AUTH_PROVIDER', 'local');
    expect(run('POST', '/api/v1/users/login').passed).toBe(true);
  });

  describe('with AUTH_PROVIDER=scoretech', () => {
    it.each([
      ['POST', '/api/v1/users/login', {}],
      ['POST', '/api/v1/users/register', {}],
      ['GET', '/api/v1/users/auth/sso/us/initiate', {}],
      ['GET', '/api/v1/users/auth/sso/google/initiate', {}],
      ['PUT', '/api/v1/users/me/settings', { email: 'new@example.org' }],
      ['PUT', '/api/v1/users/ada', { password: 'secret' }],
      ['PUT', '/api/v1/users/ada/refresh-token', {}],
    ])('blocks %s %s', (method, path, body) => {
      vi.stubEnv('AUTH_PROVIDER', 'scoretech');
      expect(run(method, path, body).blocked).toBe(true);
    });

    it.each([
      ['GET', '/api/v1/users/me', {}],
      ['PUT', '/api/v1/users/me/settings', { firstName: 'Ada', phone: '600' }],
      ['PUT', '/api/v1/users/ada', { role: 'ADMIN' }],
      ['GET', '/api/v1/auth/identity/login', {}],
    ])('allows %s %s', (method, path, body) => {
      vi.stubEnv('AUTH_PROVIDER', 'scoretech');
      expect(run(method, path, body).passed).toBe(true);
    });
  });
});
