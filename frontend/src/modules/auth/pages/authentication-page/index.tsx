import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../../components/auth-layout';
import LoginForm from '../../components/login-form';
import RegisterForm from '../../components/register-form';
import { useAuthConfig } from '../../hooks/useAuthConfig';

// Error keys emitted by the API in ?identity_error= when SCORETech sign-in fails.
const IDENTITY_ERRORS: Record<string, string> = {
  account_not_linked:
    'An ICAN account already uses this email. Sign in as usual, then connect SCORETech in Settings > SCORETech.',
  // In identity mode the usual sign-in is gone: only an administrator can connect it.
  account_not_linked_centralized:
    'An ICAN account already uses this email but is not connected to SCORETech yet. Contact an administrator.',
  signin_failed: 'Your SCORETech sign-in expired or was cancelled. You can safely try again.',
};

export default function AuthenticationPage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const identityError = searchParams.get('identity_error');
  const config = useAuthConfig();
  const identityOnly = config?.provider === 'scoretech';
  const target = identityOnly ? (view === 'register' ? config.registerUrl : config.loginUrl) : null;

  // In identity mode SCORETech is the only way in: go straight there unless it just failed.
  useEffect(() => {
    if (target && !identityError) window.location.replace(target);
  }, [target, identityError]);

  const errorBanner = identityError && (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
      <p className="text-sm text-red-600 dark:text-red-400">
        {IDENTITY_ERRORS[
          identityOnly && identityError === 'account_not_linked' ? 'account_not_linked_centralized' : identityError
        ] ?? 'Sign-in could not be completed.'}
      </p>
    </div>
  );

  if (identityOnly) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-3xl tracking-tight text-tp-ink sm:text-4xl">
            {identityError ? 'Sign-in could not be completed' : 'Opening SCORETech Identity…'}
          </h1>
          {errorBanner}
          <a
            href={target!}
            className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-tp-primary text-sm font-medium text-tp-on-primary"
          >
            {identityError ? 'Try again' : 'Continue to SCORETech Identity'}
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {errorBanner}
      {view === 'register' ? <RegisterForm /> : <LoginForm />}
    </AuthLayout>
  );
}
