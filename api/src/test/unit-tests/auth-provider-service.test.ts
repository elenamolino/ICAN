import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '../../main/services/identity/IdentityProvider';

// Fake repositories, so each rule is checked without database indexes behind it.
const { fakes } = vi.hoisted(() => ({
  fakes: {} as Record<string, any>,
}));

vi.mock('../../main/config/container', () => ({
  default: { resolve: (name: string) => fakes[name] },
}));

const { default: AuthProviderService, SsoAccountError } = await import('../../main/services/AuthProviderService');

const profile = (overrides: Partial<ProviderProfile> = {}): ProviderProfile => ({
  provider: 'sphere',
  providerId: 'sub-1',
  email: 'grace@example.com',
  emailVerified: false,
  firstName: 'Grace',
  lastName: 'Hopper',
  suggestedUsername: 'grace',
  ...overrides,
});

describe('AuthProviderService', () => {
  let takenUsernames: Set<string>;
  let takenOrganizations: Set<string>;
  let existingEmail: string | null;

  beforeEach(() => {
    takenUsernames = new Set();
    takenOrganizations = new Set();
    existingEmail = null;
    fakes.userRepository = {
      findOne: vi.fn(async () => null),
      findByEmail: vi.fn(async (email: string) => (email === existingEmail ? { id: 'other', email } : null)),
      findByUsername: vi.fn(async (username: string) => (takenUsernames.has(username) ? { username } : null)),
      create: vi.fn(async (data: any) => ({ id: 'new-id', role: 'USER', ...data })),
      destroy: vi.fn(),
    };
    fakes.organizationRepository = {
      findOne: vi.fn(async ({ name }: { name: string }) => (takenOrganizations.has(name) ? { name } : null)),
    };
    fakes.organizationService = { ensurePersonalOrganizationForUser: vi.fn(async () => undefined) };
  });

  it('refuses an unverified email another account uses, before trying to create anything', async () => {
    existingEmail = 'grace@example.com';
    const service = new AuthProviderService();

    await expect(service.findOrCreateUser(profile())).rejects.toEqual(new SsoAccountError('email_in_use'));
    expect(fakes.userRepository.create).not.toHaveBeenCalled();
    expect(fakes.organizationService.ensurePersonalOrganizationForUser).not.toHaveBeenCalled();
  });

  it('keeps the historical -us suffix for UVUS and numbers the others', async () => {
    takenUsernames.add('grace');
    const service = new AuthProviderService();

    await service.findOrCreateUser(profile({ provider: 'us-sso' }));
    expect(fakes.userRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'grace-us' }));

    await service.findOrCreateUser(profile({ provider: 'sphere', providerId: 'sub-2' }));
    expect(fakes.userRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'grace-2' }));
  });

  it('skips usernames whose personal organization name is taken, in lowercase', async () => {
    takenOrganizations.add('grace');
    const service = new AuthProviderService();

    await service.findOrCreateUser(profile({ suggestedUsername: 'Grace' }));
    expect(fakes.userRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'grace-2' }));
  });
});
