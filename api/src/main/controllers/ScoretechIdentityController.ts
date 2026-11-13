import type { Request, Response, NextFunction } from 'express';
import container from '../config/container';
import ScoretechIdentityService from '../services/ScoretechIdentityService';
import {
  authenticationConfig,
  identityConfigured,
  identityMode,
  scoretechConfig,
} from '../services/scoretech/config';
import { handleError } from '../utils/users/helpers';
import { SsoEmailConflictError } from '../services/AuthProviderService';

const cookieName = 'ican_identity_session';
const flowCookie = (state: string) => 'ican_identity_flow_' + state;
// Linking flows use their own cookie so a failed callback knows to return to Settings.
const linkCookie = (state: string) => 'ican_identity_link_' + state;
const SETTINGS = '/me/settings?section=identity';

function cookie(request: Request, name: string): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(name + '='))
    ?.slice(name.length + 1);
}

function options() {
  const c = scoretechConfig();
  return { httpOnly: true, secure: c.secure, sameSite: 'lax' as const, path: c.base };
}

/**
 * Sign-in through SCORETech Identity (OIDC, Authorization Code + PKCE, confidential client).
 * The browser only holds an HttpOnly cookie for the identity session; it trades it for
 * short-lived API tokens at /auth/identity/session.
 */
export default class ScoretechIdentityController {
  private service: ScoretechIdentityService = container.resolve('scoretechIdentityService');

  config = (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').json(authenticationConfig());
  };

  /** Cookie-authenticated POSTs must come from the frontend itself. */
  private csrf(req: Request) {
    if (req.get('Origin') !== new URL(scoretechConfig().frontend).origin)
      throw Error('PERMISSION ERROR: Request origin is not allowed');
  }

  private async run(res: Response, operation: () => Promise<void>) {
    try {
      res.set('Cache-Control', 'no-store');
      await operation();
    } catch (error) {
      const result = handleError(error);
      res
        .status(String(error).includes('Identity unavailable') ? 503 : result.status)
        .json({ error: result.message });
    }
  }

  login = async (req: Request, res: Response) =>
    this.run(res, async () => {
      if (!identityConfigured()) {
        res.status(404).json({ error: 'SCORETech Identity is not configured' });
        return;
      }
      const start = await this.service.begin(req.query.returnTo, req.query.screen === 'register');
      res.cookie(flowCookie(start.state), start.binding, { ...options(), maxAge: 600000 });
      res.redirect(start.url);
    });

  /** Starts connecting SCORETech to the signed-in account. Returns the URL to open. */
  link = async (req: Request, res: Response) =>
    this.run(res, async () => {
      if (!identityConfigured()) {
        res.status(404).json({ error: 'SCORETech Identity is not configured' });
        return;
      }
      this.csrf(req);
      const actor = (req as any).user;
      if (identityMode() || !actor || (req as any).authType !== 'token')
        throw Error('PERMISSION ERROR: Sign in to your account before connecting SCORETech');
      const start = await this.service.begin(SETTINGS, false, actor.id);
      res.cookie(linkCookie(start.state), start.binding, { ...options(), maxAge: 600000 });
      res.json({ url: start.url });
    });

  callback = async (req: Request, res: Response) => {
    let c: ReturnType<typeof scoretechConfig>;
    try {
      c = scoretechConfig();
    } catch {
      res.status(404).json({ error: 'SCORETech Identity is not configured' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    const state =
      typeof req.query.state === 'string' && /^[a-f0-9]{64}$/.test(req.query.state)
        ? req.query.state
        : '';
    const linking = Boolean(cookie(req, linkCookie(state)));
    try {
      const name = linking ? linkCookie(state) : flowCookie(state);
      const result = await this.service.complete(
        state,
        cookie(req, name),
        req.query.code,
        req.query.error
      );
      res.clearCookie(name, options());
      if (!result.sessionId) {
        // Account linked: the user keeps the session they already had.
        res.redirect(c.frontend + result.returnTo);
        return;
      }
      const previous = cookie(req, cookieName);
      if (previous) await this.service.clearLocal(previous);
      res.cookie(cookieName, result.sessionId, { ...options(), maxAge: 30 * 86400000 });
      res.redirect(
        c.frontend + '/sso/identity/callback?returnTo=' + encodeURIComponent(result.returnTo)
      );
    } catch (error) {
      if (linking) res.clearCookie(linkCookie(state), options());
      // Never log the callback query or tokens: only the error category.
      const detail =
        error instanceof Error &&
        /^(UNAUTHORIZED:|Identity unavailable:|CONFLICT:)/.test(error.message)
          ? error.message
          : error instanceof Error
            ? error.name
            : 'Unknown error';
      console.warn('[SCORETech Identity] callback failed:', detail);
      if (linking) {
        res.redirect(c.frontend + SETTINGS + '&identity_error=link_failed');
        return;
      }
      const code = error instanceof SsoEmailConflictError ? 'account_not_linked' : 'signin_failed';
      res.redirect(c.frontend + '/authentication?identity_error=' + code);
    }
  };

  session = async (req: Request, res: Response) =>
    this.run(res, async () => {
      if (!identityConfigured()) {
        res.status(404).end();
        return;
      }
      this.csrf(req);
      res.json(await this.service.session(cookie(req, cookieName) || ''));
    });

  logout = async (req: Request, res: Response) =>
    this.run(res, async () => {
      if (!identityConfigured()) {
        res.status(404).end();
        return;
      }
      this.csrf(req);
      const id = cookie(req, cookieName);
      res.clearCookie(cookieName, options());
      if (id) await this.service.logout(id);
      res.status(204).end();
    });
}

/**
 * In identity mode (AUTH_PROVIDER=scoretech) credentials live in SCORETech Identity:
 * local login, registration, password changes and the other SSO providers are closed.
 */
export function identityModePolicy(req: Request, res: Response, next: NextFunction) {
  if (!identityMode()) return next();
  const path = req.path
    .toLowerCase()
    .replace(((process.env.BASE_URL_PATH || '') + '/api/v1').toLowerCase(), '')
    .replace(/\/+$/, '');
  const localAuth = /^\/users\/(login|register|password\/|email-verification\/|auth\/sso\/)/.test(
    path
  );
  // Account data lives in SCORETech: only the name and phone stay editable here, and
  // admins may still change roles.
  const body = req.body || {};
  const owned =
    /^\/users\/[^/]+\/refresh-token$/.test(path) ||
    (path === '/users/me/settings' &&
      !Object.keys(body).every(key => ['firstName', 'lastName', 'phone'].includes(key))) ||
    (/^\/users\/[^/]+$/.test(path) &&
      req.method === 'PUT' &&
      !(Object.keys(body).length > 0 && Object.keys(body).every(key => key === 'role')));
  if (localAuth || (owned && req.method !== 'GET'))
    return res.status(409).json({ error: 'Manage your identity in SCORETech Identity.' });
  next();
}
