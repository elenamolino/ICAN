import type { LeanUser } from '../types/models/User';
import container from '../config/container';
import UserRepository from '../repositories/mongoose/UserRepository';
import OrganizationService from './OrganizationService';
import { ProviderProfile } from './identity/IdentityProvider';
import { generateJwtToken, generateUserTokenDTO } from '../utils/users/helpers';

export class SsoEmailConflictError extends Error {
  constructor(readonly cause?: unknown) {
    super('CONFLICT: An account already uses the email supplied by the identity provider.');
    this.name = 'SsoEmailConflictError';
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

  async findOrCreateUser(profile: ProviderProfile): Promise<{ token: string; user: LeanUser }> {
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
    //    SCORETech identities are keyed by (issuer, subject) only, never by email.
    if (!user && emailVerified && provider !== 'scoretech') {
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
        // Only the account email collision has this recovery path. Other unique
        // indexes (username, identity) and database failures keep their own error.
        if (err?.code === 11000 && err?.keyPattern?.email === 1 &&
            Object.keys(err.keyPattern).length === 1) {
          throw new SsoEmailConflictError(err);
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
    return { token, user: user! };
  }

  /**
   * Connects an external identity to an account that is already signed in, so that the
   * identity signs in to that account from then on. Idempotent for the same identity.
   */
  async linkIdentity(userId: string, profile: ProviderProfile): Promise<void> {
    const { provider, providerId, email } = profile;

    const owner = await this.userRepository.findOne({
      'identities.provider': provider,
      'identities.providerId': providerId,
    });
    if (owner && owner.id !== userId) {
      throw new Error('CONFLICT: This sign-in identity already belongs to another account');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('NOT FOUND: User not found');

    const current = user.identities?.find(identity => identity.provider === provider);
    if (current) {
      if (current.providerId === providerId) return;
      throw new Error('CONFLICT: This account is already connected to a different identity of that provider');
    }

    await this.userRepository.updateById(userId, {
      $push: { identities: { provider, providerId, email: email.trim().toLowerCase(), linkedAt: new Date() } },
    });
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
