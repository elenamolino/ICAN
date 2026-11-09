import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from '../../../core/hooks/useRouter';
import { exchangeSsoCode } from '../../api/usersApi';
import { CONNECTABLE_PROVIDERS } from '../../utils/ssoProviders';

const SIGN_IN_METHODS_SETTINGS = '/me/settings?section=signin';

// Error keys emitted by the backend SSOController in ?sso_error=
const ERROR_MESSAGES: Record<string, string> = {
  invalid_response: 'Validation with the identity provider failed.',
  unknown_provider: 'Unknown identity provider.',
  invalid_state: 'The authentication session expired or is invalid. Please try again.',
  server_error: 'There was an error processing your sign in.',
  provider_unavailable: 'This sign-in method is not available right now. Please try again later or use another one.',
  access_denied: 'You cancelled the sign in. You can try again whenever you want.',
  email_in_use: 'An ICAN account already uses this email. Sign in to it with your password or another sign-in method.',
};

function errorMessage(code: string, provider: string | null): string {
  const message = ERROR_MESSAGES[code] ?? 'Authentication error.';
  const name = provider ? CONNECTABLE_PROVIDERS[provider] : undefined;
  return code === 'email_in_use' && name
    ? `${message} Then connect ${name} in Settings → Sign-in methods to use it next time.`
    : message;
}

export default function SsoCallbackPage() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  // Errors of a connection started from Settings go back there, not to the sign-in page.
  const fromSettings = params.get('mode') === 'link';

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const ssoError = params.get('sso_error');
    if (ssoError) {
      setError(errorMessage(ssoError, params.get('provider')));
      return;
    }

    // A connection started from Settings comes back pending: the account confirms it there.
    const pending = params.get('pending');
    if (fromSettings && pending) {
      const query = new URLSearchParams({ provider: params.get('provider') ?? '', pending });
      router.push(`${SIGN_IN_METHODS_SETTINGS}&${query.toString()}`);
      return;
    }

    const code = params.get('code');
    if (!code) {
      setError('Missing authentication code.');
      return;
    }

    exchangeSsoCode(code)
      .then(async ({ token }) => {
        // The code is single-use; drop it from the URL/history before navigating.
        window.history.replaceState({}, '', '/sso/callback');
        await login(token);
        router.push('/');
      })
      .catch((e: Error) => setError(e.message));
  }, [params, login, router, fromSettings]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
        <div className="w-full max-w-[32rem] rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error}{' '}
            <Link
              to={fromSettings ? SIGN_IN_METHODS_SETTINGS : '/authentication'}
              className="cursor-pointer font-medium underline"
            >
              {fromSettings ? 'Back to settings' : 'Back to sign in'}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-tp-steel">Signing you in…</p>
    </div>
  );
}
