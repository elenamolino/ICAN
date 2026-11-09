import { motion } from 'framer-motion';
import { fadeUp } from '../auth-layout';
import { ssoInitiateUrl } from '../../api/usersApi';
import { useSsoProvider } from '../../hooks/useSsoProviders';

/**
 * "Continue with SPHERE" button (OpenID Connect). Plain anchor with a full page
 * navigation, like the UVUS and Google buttons: the flow relies on browser redirects
 * and a cookie that binds it to this browser. Hidden while SPHERE is not configured.
 */
export default function SphereLoginButton() {
  const available = useSsoProvider('sphere');
  if (!available) return null;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="mt-3">
      <a
        href={ssoInitiateUrl('sphere')}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-tp-input-border bg-tp-input-bg text-sm font-medium text-tp-ink transition-colors duration-200 hover:border-tp-primary"
      >
        <img src="/assets/logo/SPHERE-logo-short.svg" alt="" aria-hidden="true" className="h-4 w-4" />
        Continue with SPHERE
      </a>
    </motion.div>
  );
}
