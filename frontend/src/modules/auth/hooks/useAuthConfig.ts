import { useEffect, useState } from 'react';
import { AuthConfig, getAuthConfig } from '../api/identityApi';

/** Sign-in configuration exposed by the API. Null while it loads or if it could not be loaded. */
export function useAuthConfig(): AuthConfig | null {
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let active = true;
    getAuthConfig()
      .then(value => active && setConfig(value))
      .catch(() => active && setConfig(null));
    return () => {
      active = false;
    };
  }, []);

  return config;
}
