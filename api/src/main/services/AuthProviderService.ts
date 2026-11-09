import container from '../config/container';
import UserRepository from '../repositories/mongoose/UserRepository';
import OrganizationRepository from '../repositories/mongoose/OrganizationRepository';
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

/** Matches the account holding this exact identity (both fields in the same array element). */
const identityFilter = (provider: string, providerId: string) => ({
  identities: { $elemMatch: { provider, providerId } },
});

/**
 * Provider-agnostic account logic for social logins: finds or creates the SPHERE user
 * behind a normalized ProviderProfile and issues a session JWT. Knows nothing about
 * CAS, OAuth2 or any specific provider.
 */
class AuthProviderService {
  private userRepository: UserRepository;
  private organizationService: OrganizationService;
  private organizationRepository: OrganizationRepository;

  constructor() {
    this.userRepository = container.resolve('userRepository');
    this.organizationService = container.resolve('organizationService');
    this.organizationRepository = container.resolve('organizationRepository');
  }

  async findOrCreateUser(profile: ProviderProfile): Promise<{ token: string }> {
    const { provider, providerId, email, emailVerified, firstName, lastName } = profile;

    if (!email) {
      throw new Error('INVALID DATA: identity provider did not supply an email');
    }

    // 1. Same external identity already linked to an account.
    let user = await this.userRepository.findOne(identityFilter(provider, providerId));

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
      // Another account already uses this (unverified) email: the user has to sign in to
      // that account and connect the provider from Settings. Checked here so it does not
      // depend on the email index; the index still catches a concurrent registration.
      if (await this.userRepository.findByEmail(email)) {
        throw new SsoAccountError('email_in_use');
      }

      const username = await this.resolveFreeUsername(profile.suggestedUsername ?? providerId, provider);

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
        // Lost a race with a registration using the same email. Other duplicates
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

    const owner = await this.userRepository.findOne(identityFilter(provider, providerId));
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
      const newOwner = await this.userRepository.findOne(identityFilter(provider, providerId));
      throw new SsoAccountError(newOwner && String(newOwner.id) !== String(userId) ? 'identity_in_use' : 'provider_already_linked');
    }
  }

  /**
   * A username no account uses and whose personal organization name (the username in
   * lowercase) no organization uses either, or creating that organization would fail.
   */
  private async resolveFreeUsername(suggested: string, provider: string): Promise<string> {
    const base = suggested.toLowerCase();
    const isFree = async (candidate: string) =>
      !(await this.userRepository.findByUsername(candidate)) &&
      !(await this.organizationRepository.findOne({ name: candidate.toLowerCase() }));

    if (await isFree(base)) return base;
    // UVUS accounts keep their historical `-us` suffix as the first alternative.
    if (provider === 'us-sso' && (await isFree(`${base}-us`))) return `${base}-us`;

    let i = 2;
    while (!(await isFree(`${base}-${i}`))) i++;
    return `${base}-${i}`;
  }
}

export default AuthProviderService;
