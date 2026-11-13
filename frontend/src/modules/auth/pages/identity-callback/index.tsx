import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from '../../../core/hooks/useRouter';
import { identitySession, safeReturnTo } from '../../api/identityApi';

/**
 * Landing page after SCORETech Identity. The API has already validated the sign-in and
 * set the HttpOnly session cookie; here it is traded for the first API token.
 */
export default function IdentityCallbackPage() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const destination = safeReturnTo(params.get('returnTo'));
    identitySession()
      .then(async ({ token }) => {
        await login(token);
        router.push(destination);
      })
      .catch((e: Error) => setError(e.message));
  }, [params, login, router]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error}{' '}
            <Link to="/authentication" className="cursor-pointer font-medium underline">
              Back to sign in
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
