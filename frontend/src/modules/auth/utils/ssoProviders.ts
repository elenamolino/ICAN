/**
 * Sign-in providers an existing account can connect from Settings -> Sign-in methods,
 * by URL segment of /users/auth/sso/:provider, with the name shown to users. The API
 * allows it for every OAuth2/OIDC provider (`usesState`); add one here to offer it.
 */
export const CONNECTABLE_PROVIDERS: Record<string, string> = {
  sphere: 'SPHERE',
};
