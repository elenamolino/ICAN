import container from '../config/container';
import UserRepository from '../repositories/mongoose/UserRepository';
import OrganizationService from './OrganizationService';
import { ProviderProfile } from './identity/IdentityProvider';
import { generateJwtToken, generateUserTokenDTO } from '../utils/users/helpers';

/**
 * Account outcomes of a social login that the user can act on. `code` is the
 * `sso_error` the frontend's /sso/callback page explains.
 */
export class SsoAccountError extends Error {
  constructor(readonly code: 'email_in_use' | 'identity_in_use' | 'provider_already_linked') {
    super(`SSO account error: ${code}`);
  }
}

/**
 * Provider-agnostic account logic for social logins: finds or creates the SPHERE user
 * behind a normalized ProviderProfile and issues a session JWT. Knows nothing about
 * CAS, OAuth2 or any specific provider.
 */
class AuthProviderService {
  private userRepository: UserRepository;
  private organizationService: OrganizationService;

  constructor() {
    this.userRepository = container.resolve('userRepository');
    this.organizationService = container.resolve('organizationService');
  }

  async findOrCreateUser(profile: ProviderProfile): Promise<{ token: string }> {
    const { provider, providerId, email, emailVerified, firstName, lastName } = profile;

    if (!email) {
      throw new Error('INVALID DATA: identity provider did not supply an email');
    }

    // 1. Same external identity already linked to an account.
    let user = await this.userRepository.findOne({
      'identities.provider': provider,
      'identities.providerId': providerId,
    });

    // 2. Link by email ONLY when the provider verifies email ownership (Google does,
    //    the US CAS does not). Linking on unverified email would allow account takeover.
    if (!user && emailVerified) {
      const existing = await this.userRepository.findByEmail(email);
      if (existing) {
        await this.userRepository.updateById(existing.id, {
          $push: { identities: { provider, providerId, email } },
        });
        user = await this.userRepository.findById(existing.id);
      }
    }

    // 3. New account. Resolve username collisions BEFORE creating the personal
    //    organization: its name derives from the username and duplicates throw CONFLICT.
    if (!user) {
      const username = await this.resolveFreeUsername(profile.suggestedUsername ?? providerId);

      try {
        user = await this.userRepository.create({
          username,
          identities: [{ provider, providerId, email }],
          firstName,
          lastName,
          email,
          // Same default as local registration; aggregators expect the key to exist.
          settings: { avatar: '' },
          ...generateUserTokenDTO(),
        });
      } catch (err: any) {
        // Another account already uses this (unverified) email: the user has to sign in
        // to that account and connect the provider from Settings. Other duplicates
        // (username, identity) and database failures keep their own error.
        if (err?.code === 11000 && err?.keyPattern?.email === 1 && Object.keys(err.keyPattern).length === 1) {
          throw new SsoAccountError('email_in_use');
        }
        throw err;
      }

      // Business rule shared with local registration: every user has a personal
      // organization. If this fails we must not leave a half-created account.
      try {
        await this.organizationService.ensurePersonalOrganizationForUser({
          id: user.id,
          username: user.username,
        });
      } catch (err) {
        await this.userRepository.destroy(user.username);
        throw err;
      }
    }

    const token = generateJwtToken({ id: user!.id, username: user!.username, role: user!.role });
    return { token };
  }

  /**
   * Connects an external identity to the signed-in account (Settings → Sign-in methods).
   * An identity belongs to one account only, and an account has at most one identity
   * per provider. Connecting the identity it already has is a no-op.
   */
  async linkIdentity(userId: string, profile: ProviderProfile): Promise<void> {
    const { provider, providerId, email } = profile;
    const identityFilter = { 'identities.provider': provider, 'identities.providerId': providerId };

    const owner = await this.userRepository.findOne(identityFilter);
    if (owner) {
      if (String(owner.id) === String(userId)) return;
      throw new SsoAccountError('identity_in_use');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('NOT FOUND: User not found');
    }
    if ((user.identities ?? []).some((identity) => identity.provider === provider)) {
      throw new SsoAccountError('provider_already_linked');
    }

    // The provider guard in the filter closes the race of two concurrent connections.
    const updated = await this.userRepository.updateOne(
      { _id: userId, 'identities.provider': { $ne: provider } },
      { $push: { identities: { provider, providerId, email } } },
    );
    if (!updated) {
      // Lost a race: the unique identity index or the provider guard refused the write.
      const newOwner = await this.userRepository.findOne(identityFilter);
      throw new SsoAccountError(newOwner && String(newOwner.id) !== String(userId) ? 'identity_in_use' : 'provider_already_linked');
    }
  }

  private async resolveFreeUsername(base: string): Promise<string> {
    if (!(await this.userRepository.findByUsername(base))) return base;
    if (!(await this.userRepository.findByUsername(`${base}-us`))) return `${base}-us`;

    let i = 2;
    while (await this.userRepository.findByUsername(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
}

export default AuthProviderService;
