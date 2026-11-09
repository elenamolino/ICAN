import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiLink2, FiLock } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { ssoInitiateUrl } from '../../auth/api/usersApi';
import { useAuth } from '../../auth/hooks/useAuth';
import { useSsoProvider } from '../../auth/hooks/useSsoProviders';
import {
  ConnectionError,
  type PendingConnection,
  type UserIdentity,
  useUserSettingsApi,
} from '../api/userSettingsApi';

interface Method {
  provider: UserIdentity['provider'];
  /** URL segment of /users/auth/sso/:provider; only methods with it can be connected here. */
  connectAs?: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const METHODS: Method[] = [
  {
    provider: 'sphere',
    connectAs: 'sphere',
    name: 'SPHERE',
    description: 'Sign in to ICAN with your SPHERE account.',
    icon: <img src="/assets/logo/SPHERE-logo-short.svg" alt="" aria-hidden="true" className="h-5 w-5 dark:invert" />,
  },
  {
    provider: 'us-sso',
    name: 'UVUS',
    description: 'Universidad de Sevilla single sign-on.',
    icon: <FiLock className="h-5 w-5 text-tp-steel" />,
  },
  {
    provider: 'google',
    name: 'Google',
    description: 'Your Google account.',
    icon: <FcGoogle className="h-5 w-5" />,
  },
];

// Reasons the server gives when a connection cannot be confirmed (ConnectionError.code).
const CONNECTION_ERRORS: Record<string, string> = {
  identity_in_use: 'That account is already connected to another ICAN account. Nothing was connected.',
  provider_already_linked: 'Your ICAN account is already connected to another account of this provider.',
};

export default function SignInMethodsSection() {
  const { authUser } = useAuth();
  const { getIdentities, startIdentityLink, getPendingConnection, confirmConnection } = useUserSettingsApi();
  const [params, setParams] = useSearchParams();
  const sphereAvailable = useSsoProvider('sphere');
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState<Method | null>(null);

  // A connection the provider approved comes back here to be confirmed by this account.
  const pendingCode = params.get('pending');
  const pendingMethod = METHODS.find((method) => method.connectAs && method.connectAs === params.get('provider'));
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadIdentities = useCallback(() => {
    getIdentities()
      .then(setIdentities)
      .catch((e: Error) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(loadIdentities, [loadIdentities]);

  useEffect(() => {
    if (!pendingCode || !pendingMethod) return;
    let active = true;
    getPendingConnection(pendingMethod.connectAs!, pendingCode)
      .then((value) => active && setPending(value))
      .catch((e: Error) => active && setConnectError(e.message));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCode, pendingMethod?.connectAs]);

  const clearPending = () => {
    setPending(null);
    const next = new URLSearchParams(params);
    next.delete('pending');
    next.delete('provider');
    setParams(next, { replace: true });
  };

  const confirm = async () => {
    if (!pendingMethod || !pendingCode) return;
    setConfirming(true);
    setConnectError(null);
    try {
      await confirmConnection(pendingMethod.connectAs!, pendingCode);
      setJustLinked(pendingMethod);
      loadIdentities();
    } catch (e) {
      const error = e as ConnectionError;
      setConnectError((error.code && CONNECTION_ERRORS[error.code]) || error.message);
    } finally {
      setConfirming(false);
      clearPending();
    }
  };

  const connect = async (method: Method) => {
    setConnecting(method.provider);
    setConnectError(null);
    try {
      const ticket = await startIdentityLink(method.connectAs!);
      // Full page navigation: the provider sends this browser back to ICAN when done.
      window.location.assign(ssoInitiateUrl(method.connectAs!, ticket));
    } catch (e) {
      setConnectError((e as Error).message);
      setConnecting(null);
    }
  };

  const connectedTo = (provider: Method['provider']) => identities?.find((identity) => identity.provider === provider);
  const visible = METHODS.filter(
    (method) => connectedTo(method.provider) || (method.provider === 'sphere' && sphereAvailable),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-tp-ink">Sign-in methods</h2>
        <p className="mt-0.5 text-sm text-tp-steel">
          Accounts you can use to sign in to ICAN besides your password
        </p>
      </div>

      {pending && pendingMethod && (
        <div className="rounded-[12px] border border-tp-primary/40 bg-tp-primary/5 p-5">
          <div className="flex items-start gap-3">
            <FiLink2 className="mt-0.5 h-5 w-5 shrink-0 text-tp-primary" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-tp-ink">Connect this {pendingMethod.name} account?</h3>
              <p className="mt-1 break-words text-sm text-tp-steel">
                <strong className="text-tp-ink">{pending.name || pending.email}</strong>
                {pending.name && pending.email ? ` (${pending.email})` : ''} will be able to sign in to your ICAN
                account <strong className="text-tp-ink">{authUser.user?.username}</strong>. Only connect it if this
                account is yours.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={confirming}
                  onClick={confirm}
                  className="cursor-pointer rounded-[8px] bg-tp-primary px-4 py-2.5 text-sm font-medium text-tp-on-primary transition-colors hover:bg-tp-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirming ? 'Connecting…' : `Connect ${pendingMethod.name}`}
                </button>
                <button
                  type="button"
                  disabled={confirming}
                  onClick={clearPending}
                  className="cursor-pointer rounded-[8px] border border-tp-hairline-strong bg-tp-canvas px-4 py-2.5 text-sm font-medium text-tp-ink transition-colors hover:bg-tp-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {justLinked && (
        <div className="flex items-center gap-2 rounded-[8px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-400">
          <FiCheckCircle className="h-4 w-4 shrink-0" />
          {justLinked.name} is now connected. Next time you can sign in with it.
        </div>
      )}

      {(loadError || connectError) && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
          {loadError || connectError}
        </div>
      )}

      <div className="divide-y divide-tp-hairline rounded-[12px] border border-tp-hairline bg-tp-canvas">
        {identities === null && !loadError && (
          <p className="px-6 py-8 text-center text-sm text-tp-steel">Loading…</p>
        )}
        {identities !== null && visible.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-tp-steel">
            No other sign-in methods are connected to your account.
          </p>
        )}
        {identities !== null &&
          visible.map((method) => {
            const identity = connectedTo(method.provider);
            return (
              <div key={method.provider} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-tp-surface">
                    {method.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tp-ink">{method.name}</p>
                    <p className="truncate text-sm text-tp-steel">
                      {identity?.email ? `Connected as ${identity.email}` : method.description}
                    </p>
                  </div>
                </div>
                {identity ? (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tp-primary/10 px-2.5 py-1 text-xs font-medium text-tp-primary">
                    <FiCheckCircle className="h-3.5 w-3.5" />
                    Connected
                  </span>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    disabled={connecting !== null || pending !== null}
                    onClick={() => connect(method)}
                    className="w-full cursor-pointer rounded-[8px] border border-tp-hairline-strong bg-tp-canvas px-4 py-2.5 text-sm font-medium text-tp-ink transition-colors hover:bg-tp-surface disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {connecting === method.provider ? 'Opening…' : `Connect ${method.name}`}
                  </motion.button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
