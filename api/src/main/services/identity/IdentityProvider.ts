export type ProviderName = 'us-sso' | 'google' | 'sphere';

/**
 * Normalized identity profile. Every external provider (CAS, OAuth2, ...) translates
 * its raw response into this shape; the rest of the system never sees provider-specific
 * data. Providers are responsible for resolving their own fallbacks/defaults.
 */
export interface ProviderProfile {
  provider: ProviderName;
  providerId: string;
  email: string;
  /**
   * Whether the provider guarantees the email belongs to the user (Google: yes, US CAS
   * and SPHERE: no). Only a verified email links a sign-in to the account that uses it.
   */
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  /** Optional human-readable username base. Defaults to providerId when absent. */
  suggestedUsername?: string;
}

/**
 * Secrets of one sign-in that never leave the server: the common layer generates them
 * for every provider that uses `state`, keeps them with the state and hands them back
 * on the callback. OIDC providers use them for PKCE and the ID token nonce.
 */
export interface LoginTransaction {
  codeVerifier: string;
  nonce: string;
}

export interface IdentityProvider {
  name: ProviderName;

  /**
   * Whether the provider relies on the OAuth2 `state` parameter for CSRF protection.
   * When true, the common layer stores the state on initiate, binds it to the browser
   * and requires a matching, unexpired state on callback (single use). Only these
   * providers can be connected to an existing account from Settings. CAS providers
   * don't need it: the ticket is single-use and validated server-side.
   */
  usesState: boolean;

  /**
   * Whether the deployment configured this provider. Providers without this method are
   * always considered configured. Unconfigured providers are hidden from the sign-in page.
   */
  isConfigured?(): boolean;

  /** Absolute URL to redirect the browser to for login. `state` is used by OAuth2 providers; CAS ignores it. */
  buildLoginUrl(state: string, transaction: LoginTransaction): string | Promise<string>;

  /** Translates the callback query params (ticket | code) into a normalized profile, or null if invalid. */
  handleCallback(query: Record<string, string>, transaction?: LoginTransaction): Promise<ProviderProfile | null>;
}
