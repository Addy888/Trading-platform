const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
export const AUTH_TOKEN_REFRESHED_EVENT = 'app:auth-token-refreshed';
export const AUTH_SESSION_EXPIRED_EVENT = 'app:auth-session-expired';

let refreshAccessTokenRequest: Promise<string | null> | null = null;

export async function authenticatedFetch(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const currentToken = typeof window === 'undefined'
    ? token
    : window.localStorage.getItem('accessToken') || token;
  
  let response: Response;
  try {
    response = await fetch(url, withAuthorization(options, currentToken));
  } catch (error) {
    // Network error - API server might be down or CORS issue
    console.error('Network error fetching:', url, error);
    throw new Error('Unable to reach the API server. Please ensure the backend is running on http://localhost:3001');
  }
  
  if (response.status !== 401 || await isProviderAuthorizationFailure(response)) return response;

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;

  try {
    const retryResponse = await fetch(url, withAuthorization(options, refreshedToken));
    if (retryResponse.status === 401 && !(await isProviderAuthorizationFailure(retryResponse))) {
      dispatchSessionExpired();
    }
    return retryResponse;
  } catch (error) {
    console.error('Network error on retry:', url, error);
    throw new Error('Unable to reach the API server after token refresh');
  }
}

function withAuthorization(options: RequestInit, token: string): RequestInit {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...options, headers };
}

async function isProviderAuthorizationFailure(response: Response): Promise<boolean> {
  try {
    const body = await response.clone().json() as { provider?: unknown; category?: unknown };
    return body.provider === 'OANDA' || typeof body.category === 'string';
  } catch {
    return false;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshAccessTokenRequest) {
    refreshAccessTokenRequest = performAccessTokenRefresh().finally(() => {
      refreshAccessTokenRequest = null;
    });
  }
  return refreshAccessTokenRequest;
}

async function performAccessTokenRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = window.localStorage.getItem('refreshToken');
  if (!refreshToken) {
    dispatchSessionExpired();
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) dispatchSessionExpired();
      return null;
    }

    const data = await response.json() as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken || !data.refreshToken) {
      dispatchSessionExpired();
      return null;
    }
    window.localStorage.setItem('accessToken', data.accessToken);
    window.localStorage.setItem('refreshToken', data.refreshToken);
    window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, { detail: data.accessToken }));
    return data.accessToken;
  } catch {
    return null;
  }
}

function dispatchSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
}
