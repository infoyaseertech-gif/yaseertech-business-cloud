import { AuthTokens } from './types';

// localStorage, not an httpOnly cookie -- a known, deliberate rough edge for
// this phase, called out plainly in the README. It's the simplest thing
// that works for local verification of Phase 3; moving to an httpOnly
// cookie + a small backend-for-frontend layer is worth doing before this
// ever handles a real subscriber's session, since localStorage tokens are
// readable by any script that runs on the page (XSS exposure).
const ACCESS_TOKEN_KEY = 'yaseetech_access_token';
const REFRESH_TOKEN_KEY = 'yaseetech_refresh_token';

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiresIn: '' };
}

export function setStoredTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
