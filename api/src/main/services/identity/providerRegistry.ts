import { GoogleProvider } from './GoogleProvider';
import { IdentityProvider } from './IdentityProvider';
import { SphereProvider } from './SphereProvider';
import { UsCasProvider } from './UsCasProvider';

/**
 * Maps the `:provider` URL segment to its identity provider implementation.
 * Adding a new social login = one implementation + one entry here.
 */
const providers: Record<string, IdentityProvider> = {
  us: new UsCasProvider(),
  google: new GoogleProvider(),
  sphere: new SphereProvider(),
};

export function getProvider(name: string): IdentityProvider | null {
  return Object.hasOwn(providers, name) ? providers[name] : null;
}

/** URL segments of the providers this deployment configured, in sign-in page order. */
export function configuredProviders(): string[] {
  return Object.entries(providers)
    .filter(([, provider]) => provider.isConfigured?.() ?? true)
    .map(([segment]) => segment);
}
