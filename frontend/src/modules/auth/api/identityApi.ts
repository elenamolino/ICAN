const API_URL = import.meta.env.VITE_API_URL;

export interface AuthConfig {
  /** 'scoretech' when SCORETech Identity is the only way to sign in. */
  provider: 'local' | 'scoretech';
  identityAvailable: boolean;
  loginUrl: string;
  registerUrl: string;
  accountUrl?: string;
}

let configPromise: Promise<AuthConfig> | undefined;

export function getAuthConfig(): Promise<AuthConfig> {
  configPromise ??= fetch(`${API_URL}/auth/config`, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Unable to load the sign-in configuration.');
      return (await response.json()) as AuthConfig;
    })
    .catch(error => {
      configPromise = undefined;
      throw error;
    });
  return configPromise;
}

let pending: Promise<{ token: string; tokenExpiration: string }> | undefined;

/** Trades the HttpOnly identity session cookie for a short-lived API token. */
export function identitySession() {
  pending ??= fetch(`${API_URL}/auth/identity/session`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async response => {
      const value = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(new Error(value.error || 'Unable to renew your session.'), {
          status: response.status,
        });
      return value as { token: string; tokenExpiration: string };
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

export function identityLogout() {
  return fetch(`${API_URL}/auth/identity/logout`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  }).catch(() => undefined);
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function jwtExpiration(token: string): Date | null {
  const value = jwtPayload(token)?.exp;
  return typeof value === 'number' ? new Date(value * 1000) : null;
}

/** Tokens issued for a SCORETech Identity session carry its id and last five minutes. */
export function isIdentityToken(token: string | null | undefined): boolean {
  return !!token && typeof jwtPayload(token)?.identitySessionId === 'string';
}

/** Only same-site paths are accepted as a post-login destination. */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value)
    ? value
    : '/';
}
