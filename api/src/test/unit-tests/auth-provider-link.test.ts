import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOne, findById, updateById } = vi.hoisted(() => ({
  findOne: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
}));

vi.mock('../../main/config/container', () => ({
  default: {
    resolve: (name: string) =>
      ({
        userRepository: { findOne, findById, updateById },
        organizationService: {},
      })[name],
  },
}));

import AuthProviderService from '../../main/services/AuthProviderService';
import type { ProviderProfile } from '../../main/services/identity/IdentityProvider';

const profile: ProviderProfile = {
  provider: 'scoretech',
  providerId: 'identity-1',
  email: 'Ada@Example.org',
  emailVerified: true,
  firstName: 'Ada',
  lastName: 'Lovelace',
};

describe('AuthProviderService.linkIdentity', () => {
  const service = new AuthProviderService();

  beforeEach(() => {
    vi.clearAllMocks();
    findOne.mockResolvedValue(null);
    findById.mockResolvedValue({ id: 'user-1', identities: [] });
  });

  it('adds the identity to the account', async () => {
    await service.linkIdentity('user-1', profile);

    expect(updateById).toHaveBeenCalledWith('user-1', {
      $push: {
        identities: expect.objectContaining({
          provider: 'scoretech',
          providerId: 'identity-1',
          email: 'ada@example.org',
        }),
      },
    });
  });

  it('does nothing when the same identity is already connected', async () => {
    findOne.mockResolvedValue({ id: 'user-1' });
    findById.mockResolvedValue({
      id: 'user-1',
      identities: [{ provider: 'scoretech', providerId: 'identity-1' }],
    });

    await service.linkIdentity('user-1', profile);
    expect(updateById).not.toHaveBeenCalled();
  });

  it('refuses an identity that belongs to another account', async () => {
    findOne.mockResolvedValue({ id: 'user-2' });

    await expect(service.linkIdentity('user-1', profile)).rejects.toThrow(/another account/);
    expect(updateById).not.toHaveBeenCalled();
  });

  it('refuses a second identity of the same provider', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      identities: [{ provider: 'scoretech', providerId: 'identity-0' }],
    });

    await expect(service.linkIdentity('user-1', profile)).rejects.toThrow(/CONFLICT/);
    expect(updateById).not.toHaveBeenCalled();
  });
});
