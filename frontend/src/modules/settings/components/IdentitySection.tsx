import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiExternalLink, FiLink, FiLoader, FiShield } from 'react-icons/fi';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAuthConfig } from '../../auth/hooks/useAuthConfig';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * When SCORETech is the only way to sign in (AUTH_PROVIDER=scoretech), the account lives
 * there: this replaces the account settings with a link to the SCORETech profile.
 */
export function ScoretechAccountSection() {
  const config = useAuthConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-tp-ink">Account</h2>
        <p className="mt-0.5 text-sm text-tp-steel">
          Your account is managed by SCORETech Identity
        </p>
      </div>

      <div className="rounded-[12px] border border-tp-hairline bg-tp-canvas p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-tp-primary/10">
            <FiShield className="h-5 w-5 text-tp-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-tp-ink">SCORETech Identity</h3>
            <p className="mt-1 text-sm text-tp-steel">
              Update your personal details, email and password, or manage how you sign in, in your
              SCORE account. The changes apply to every SCORE service.
            </p>
            {config?.accountUrl && (
              <a
                href={config.accountUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-tp-primary px-4 py-2.5 text-sm font-medium text-tp-on-primary transition-all"
              >
                Open my SCORETech profile
                <FiExternalLink className="h-4 w-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Connects SCORETech Identity to the signed-in account, so that signing in with
 * SCORETech opens this same account, with its organizations and data.
 */
export default function IdentitySection() {
  const [params] = useSearchParams();
  const { fetchWithInterceptor } = useAuth();
  const config = useAuthConfig();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const justLinked = params.get('identity_linked') === 'scoretech';
  const linkFailed = params.get('identity_error') === 'link_failed';

  useEffect(() => {
    let active = true;
    fetchWithInterceptor(`${API_URL}/users/me`)
      .then(response => (response.ok ? response.json() : null))
      .then(user => {
        if (!active) return;
        const identities: { provider: string }[] = user?.identities ?? [];
        setLinked(identities.some(identity => identity.provider === 'scoretech'));
      })
      .catch(() => active && setLinked(false));
    return () => {
      active = false;
    };
    // Only on mount: fetchWithInterceptor changes identity whenever the token renews.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const response = await fetchWithInterceptor(`${API_URL}/auth/identity/link`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to start the connection.');
      window.location.assign(data.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to start the connection.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-tp-ink">SCORETech Identity</h2>
        <p className="mt-0.5 text-sm text-tp-steel">
          Sign in to ICAN with your SCORE account and keep this account, its organizations and data
        </p>
      </div>

      {justLinked && (
        <p
          role="status"
          className="rounded-[8px] border border-tp-hairline bg-tp-surface px-4 py-3 text-sm text-tp-ink"
        >
          Your account is now connected to SCORETech Identity. Next time, sign in with SCORETech.
        </p>
      )}
      {linkFailed && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            The connection could not be completed and your account is unchanged. This SCORETech
            account may already belong to another ICAN account. Try again or contact an
            administrator.
          </p>
        </div>
      )}

      <div className="rounded-[12px] border border-tp-hairline bg-tp-canvas p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-tp-primary/10">
            <FiShield className="h-5 w-5 text-tp-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-tp-ink">
              {linked ? 'Connected' : 'Connect your SCORE account'}
            </h3>
            <p className="mt-1 text-sm text-tp-steel">
              {linked
                ? 'Signing in with SCORETech opens this account.'
                : 'You will be asked to sign in to SCORETech to confirm the account is yours.'}
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {linked ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-tp-primary">
                <FiCheckCircle className="h-4 w-4" />
                SCORETech connected
              </p>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => void connect()}
                disabled={busy || linked === null || !config?.identityAvailable}
                className="mt-4 flex cursor-pointer items-center gap-2 rounded-md bg-tp-primary px-4 py-2.5 text-sm font-medium text-tp-on-primary transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiLink className="h-4 w-4" />}
                {busy ? 'Connecting…' : 'Connect SCORETech'}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
