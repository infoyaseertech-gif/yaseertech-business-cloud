import { ApiError, ApiErrorBody } from './types';
import { clearStoredTokens, getStoredTokens, setStoredTokens } from './token-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// Broadcast so AuthProvider can react (clear user state, redirect to
// /login) without this file needing to know about React or routing.
export const AUTH_EXPIRED_EVENT = 'yaseetech:auth-expired';

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Multiple simultaneous 401s (e.g. two components fetching at once)
  // should trigger exactly one refresh call, not a race of several --
  // refresh tokens rotate on use, so a second concurrent call would see
  // the first one's token as already revoked.
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = await res.json();
        setStoredTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
        return body.accessToken as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const tokens = getStoredTokens();

  const doFetch = async (accessToken: string | null): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });

  let response = await doFetch(skipAuth ? null : tokens?.accessToken ?? null);

  if (!skipAuth && response.status === 401 && tokens) {
    const body = (await response.clone().json().catch(() => null)) as ApiErrorBody | null;
    const isExpired = body?.error?.code === 'AUTH_TOKEN_EXPIRED';

    if (isExpired) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        response = await doFetch(newAccessToken);
      } else {
        clearStoredTokens();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    } else {
      // Invalid/malformed token, not just expired -- refreshing won't help.
      clearStoredTokens();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong.' },
    }))) as ApiErrorBody;
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
