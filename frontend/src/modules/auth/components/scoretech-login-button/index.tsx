import { motion } from 'framer-motion';
import { fadeUp } from '../auth-layout';
import { useAuthConfig } from '../../hooks/useAuthConfig';

/**
 * "Continue with SCORETech" button (OIDC). Plain anchor with a full page navigation:
 * the API starts the flow and SCORETech Identity redirects back to it. Hidden while
 * the client is not configured in the API.
 */
export default function ScoretechLoginButton() {
  const config = useAuthConfig();
  if (!config?.identityAvailable) return null;

  return (
    <motion.div variants={fadeUp} className="mb-3">
      <a
        href={config.loginUrl}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-tp-input-border bg-tp-input-bg text-sm font-medium text-tp-ink transition-colors duration-200 hover:border-tp-primary"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Continue with SCORETech
      </a>
    </motion.div>
  );
}
