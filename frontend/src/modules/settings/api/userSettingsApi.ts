import { useAuth } from '../../auth/hooks/useAuth';

const BASE_PATH = import.meta.env.VITE_API_URL;

export interface UserSettings {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  settings?: {
    phone?: string;
    avatar?: string;
    avatarBgColor?: string;
    avatarFgColor?: string;
    profile?: {
      displayName?: string;
      bio?: string;
      city?: string;
      country?: string;
      dateOfBirth?: string;
    };
    socialLinks?: {
      linkedin?: string;
      instagram?: string;
      facebook?: string;
      x?: string;
    };
    notificationPrefs?: Record<string, { email: boolean; inbox: boolean }>;
  };
}

export interface UserIdentity {
  provider: 'us-sso' | 'google' | 'sphere';
  providerId: string;
  email?: string;
  linkedAt?: string;
}

export interface PendingConnection {
  provider: string;
  email?: string;
  name?: string;
}

/** `code` is the server's reason (identity_in_use, wrong_account, invalid_state...). */
export class ConnectionError extends Error {
  constructor(readonly code: string | undefined, message: string) {
    super(message);
  }
}

export function useUserSettingsApi() {
  const { fetchWithInterceptor } = useAuth();

  /** External sign-in identities connected to the account (UVUS, Google, SPHERE…). */
  async function getIdentities(): Promise<UserIdentity[]> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me`);
    if (!res.ok) throw new Error('Failed to load your sign-in methods');
    const user = await res.json();
    return Array.isArray(user.identities) ? user.identities : [];
  }

  /** Single-use ticket that lets this browser connect a provider to the account. */
  async function startIdentityLink(provider: string): Promise<string> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/auth/sso/${provider}/link`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.ticket !== 'string') throw new Error(body.error || 'Could not start the connection');
    return body.ticket;
  }

  /** A connection the provider approved and the account has to confirm (who it is). */
  async function getPendingConnection(provider: string, pending: string): Promise<PendingConnection> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/auth/sso/${provider}/link/${pending}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ConnectionError(body.code, body.error || 'Could not read the connection');
    return body;
  }

  async function confirmConnection(provider: string, pending: string): Promise<void> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/auth/sso/${provider}/link/${pending}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ConnectionError(body.code, body.error || 'Could not connect the account');
  }

  async function getSettings(): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings`);
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  }

  async function updateAccount(data: { email: string; firstName: string; lastName: string; phone?: string }): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update account');
    }
    return res.json();
  }

  async function updateProfile(data: {
    displayName?: string;
    bio?: string;
    city?: string;
    country?: string;
    dateOfBirth?: string;
  }): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update profile');
    }
    return res.json();
  }

  async function updateSocialLinks(data: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    x?: string;
  }): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/social-links`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update social links');
    }
    return res.json();
  }

  async function updateNotificationPrefs(
    prefs: Record<string, { email: boolean; inbox: boolean }>
  ): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/notifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update notification preferences');
    }
    return res.json();
  }

  async function uploadAvatar(file: File): Promise<UserSettings> {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/avatar`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to upload avatar');
    }
    return res.json();
  }

  async function removeAvatar(): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/avatar`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to remove avatar');
    }
    return res.json();
  }

  async function updateAvatarColors(data: {
    avatarPath: string;
    avatarBgColor: string;
    avatarFgColor: string;
  }): Promise<UserSettings> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/users/me/settings/avatar-colors`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update avatar colors');
    }
    return res.json();
  }

  return {
    getIdentities,
    startIdentityLink,
    getPendingConnection,
    confirmConnection,
    getSettings,
    updateAccount,
    updateProfile,
    updateSocialLinks,
    updateNotificationPrefs,
    uploadAvatar,
    removeAvatar,
    updateAvatarColors,
  };
}
