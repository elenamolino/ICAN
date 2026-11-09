import { useEffect, useState } from 'react';
import { getSsoProviders } from '../api/usersApi';

/**
 * Whether this deployment offers a sign-in provider. Answers false while loading and
 * when the list cannot be read, so an unconfigured provider is never offered.
 */
export function useSsoProvider(provider: string): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    getSsoProviders()
      .then((providers) => active && setAvailable(providers.includes(provider)))
      .catch(() => active && setAvailable(false));
    return () => {
      active = false;
    };
  }, [provider]);

  return available;
}
