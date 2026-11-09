import crypto from 'crypto';
import container from '../config/container';
import AuthProviderService, { SsoAccountError } from '../services/AuthProviderService';
import CacheService from '../services/CacheService';
import { LoginTransaction } from '../services/identity/IdentityProvider';
import { configuredProviders, getProvider } from '../services/identity/providerRegistry';
import { handleError } from '../utils/users/helpers';

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';
const SSO_CODE_TTL = 30; // seconds; single-use exchange code
const SSO_STATE_TTL = 600; // seconds; OAuth2 CSRF state, single use
const SSO_LINK_TTL = 60; // seconds; single-use ticket that starts a connection from Settings
const BROWSER_COOKIE = 'ican_sso_browser';
const HEX_64 = /^[a-f0-9]{64}$/;

const randomHex = (bytes: number) => crypto.randomBytes(bytes).toString('hex');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** What the server keeps with an OAuth2 `state` until the callback takes it. */
interface PendingSignIn extends LoginTransaction {
  /** Hash of the browser cookie: the callback must come from the browser that started. */
  browserHash: string;
  /** Present when the user is connecting the provider to their account from Settings. */
  linkUserId?: string;
}

function readCookie(req: any, name: string): string | undefined {
  const header: string = req.headers?.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * Social login controller, generic over identity providers (/users/auth/sso/:provider/*).
 * The provider translates its protocol (CAS ticket, OAuth2 code...) into a normalized
 * profile; everything else (state, PKCE and nonce secrets, browser binding, account
 * resolution, one-time code, JWT) is common.
 */
class SSOController {
  private authProviderService: AuthProviderService;
  private cacheService: CacheService;

  constructor() {
    this.authProviderService = container.resolve('authProviderService');
    this.cacheService = container.resolve('cacheService');
    this.providers = this.providers.bind(this);
    this.initiate = this.initiate.bind(this);
    this.link = this.link.bind(this);
    this.callback = this.callback.bind(this);
    this.exchange = this.exchange.bind(this);
  }

  /** The sign-in page only offers the providers this deployment configured. */
  providers(_req: any, res: any) {
    return res.json({ providers: configuredProviders() });
  }

  async initiate(req: any, res: any) {
    const provider = getProvider(req.params.provider);
    if (!provider) {
      return res.status(404).json({ error: 'Unknown identity provider' });
    }
    const linkTicket = typeof req.query.link === 'string' ? req.query.link : undefined;
    const mode: Record<string, string> = linkTicket !== undefined ? { mode: 'link' } : {};
    if (provider.isConfigured && !provider.isConfigured()) {
      return this.toFrontend(res, { sso_error: 'provider_unavailable', ...mode });
    }

    // `state` is consumed by OAuth2 providers (Google, SPHERE); CAS ignores it. Only
    // OAuth2 providers need it stored: the callback checks it for CSRF protection.
    const state = randomHex(16);
    const transaction: LoginTransaction = {
      codeVerifier: crypto.randomBytes(32).toString('base64url'),
      nonce: randomHex(16),
    };

    try {
      if (provider.usesState) {
        let linkUserId: string | undefined;
        if (linkTicket !== undefined) {
          const ticket = HEX_64.test(linkTicket)
            ? await this.cacheService.take(`sso:link:${linkTicket}`)
            : null;
          if (!ticket || ticket.provider !== req.params.provider) {
            return this.toFrontend(res, { sso_error: 'invalid_state', mode: 'link' });
          }
          linkUserId = ticket.userId;
        }

        // Reuse the browser's cookie so two sign-ins in two tabs do not cancel each other.
        const existing = readCookie(req, BROWSER_COOKIE);
        const browser = existing && HEX_64.test(existing) ? existing : randomHex(32);
        const pending: PendingSignIn = { ...transaction, browserHash: sha256(browser), linkUserId };
        await this.cacheService.set(`sso:state:${state}`, pending, SSO_STATE_TTL);
        res.cookie(BROWSER_COOKIE, browser, {
          httpOnly: true,
          sameSite: 'lax',
          secure: FRONTEND_URL().startsWith('https:'),
          path: (process.env.BASE_URL_PATH ?? '') + '/api/v1/users/auth/sso',
          maxAge: SSO_STATE_TTL * 1000,
        });
      } else if (linkTicket !== undefined) {
        return this.toFrontend(res, { sso_error: 'invalid_state', mode: 'link' });
      }

      return res.redirect(await provider.buildLoginUrl(state, transaction));
    } catch (err: any) {
      console.error('[SSO] initiate error:', err);
      return this.toFrontend(res, { sso_error: 'provider_unavailable', ...mode });
    }
  }

  /**
   * Starts connecting a provider to the signed-in account. Answers a single-use ticket
   * that the browser takes to /initiate?link=<ticket> with a full page navigation, so
   * the state is bound to that browser like any other sign-in.
   */
  async link(req: any, res: any) {
    const provider = getProvider(req.params.provider);
    if (!provider) {
      return res.status(404).json({ error: 'Unknown identity provider' });
    }
    if (!req.user || req.authType !== 'token') {
      return res.status(401).json({ error: 'UNAUTHORIZED: Sign in to ICAN to connect an account' });
    }
    if (!provider.usesState) {
      return res.status(400).json({ error: 'INVALID DATA: This provider cannot be connected from Settings' });
    }
    if (provider.isConfigured && !provider.isConfigured()) {
      return res.status(503).json({ error: 'This sign-in method is not available' });
    }

    try {
      const ticket = randomHex(32);
      await this.cacheService.set(
        `sso:link:${ticket}`,
        { userId: String(req.user.id), provider: req.params.provider },
        SSO_LINK_TTL,
      );
      return res.json({ ticket });
    } catch (err: any) {
      const { status, message } = handleError(err);
      return res.status(status).json({ error: message });
    }
  }

  async callback(req: any, res: any) {
    const provider = getProvider(req.params.provider);
    if (!provider) {
      return this.toFrontend(res, { sso_error: 'unknown_provider' });
    }

    let pending: PendingSignIn | null = null;
    let mode: Record<string, string> = {};
    try {
      if (provider.usesState) {
        const state = req.query.state;
        const browser = readCookie(req, BROWSER_COOKIE);
        const stored: PendingSignIn | null = typeof state === 'string' && /^[a-f0-9]{32}$/.test(state)
          ? await this.cacheService.get(`sso:state:${state}`)
          : null;
        // Taken only by the browser that started: a callback URL sent to someone else fails.
        if (!stored || typeof stored !== 'object' || !browser || stored.browserHash !== sha256(browser) ||
          !(await this.cacheService.take(`sso:state:${state}`))) {
          return this.toFrontend(res, { sso_error: 'invalid_state' });
        }
        pending = stored;
        mode = pending.linkUserId ? { mode: 'link' } : {};
      }

      if (req.query.error) {
        const cancelled = req.query.error === 'access_denied';
        return this.toFrontend(res, { sso_error: cancelled ? 'access_denied' : 'invalid_response', ...mode });
      }

      const transaction = pending ? { codeVerifier: pending.codeVerifier, nonce: pending.nonce } : undefined;
      const profile = await provider.handleCallback(req.query, transaction);
      if (!profile) {
        return this.toFrontend(res, { sso_error: 'invalid_response', ...mode });
      }

      if (pending?.linkUserId) {
        await this.authProviderService.linkIdentity(pending.linkUserId, profile);
        return this.toFrontend(res, { linked: req.params.provider });
      }

      const { token } = await this.authProviderService.findOrCreateUser(profile);

      // Never expose the JWT in a redirect URL: hand out a short-lived single-use
      // code instead, which the frontend exchanges through a direct API call.
      const code = randomHex(16);
      await this.cacheService.set(`sso:code:${code}`, { token }, SSO_CODE_TTL);

      return this.toFrontend(res, { code });
    } catch (err: any) {
      if (err instanceof SsoAccountError) {
        return this.toFrontend(res, { sso_error: err.code, ...mode });
      }
      console.error('[SSO] callback error:', err);
      return this.toFrontend(res, { sso_error: 'server_error', ...mode });
    }
  }

  async exchange(req: any, res: any) {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    try {
      const data = await this.cacheService.take(`sso:code:${code}`); // single use
      if (!data) {
        return res.status(401).json({ error: 'Invalid or expired SSO code' });
      }

      return res.json({ token: data.token });
    } catch (err: any) {
      const { status, message } = handleError(err);
      return res.status(status).json({ error: message });
    }
  }

  private toFrontend(res: any, params: Record<string, string>) {
    return res.redirect(`${FRONTEND_URL()}/sso/callback?${new URLSearchParams(params).toString()}`);
  }
}

export default SSOController;
