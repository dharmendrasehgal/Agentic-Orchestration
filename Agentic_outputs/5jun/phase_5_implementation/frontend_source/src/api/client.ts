// =============================================================================
// DCMS Frontend — Axios HTTP Client
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError } from '../types/index';

// ---------------------------------------------------------------------------
// Base configuration
// ---------------------------------------------------------------------------

const BASE_URL = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true, // send httpOnly cookies for session
});

// ---------------------------------------------------------------------------
// Token refresh — single-flight deduplication
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

export async function refreshToken(): Promise<string> {
  if (refreshPromise) {
    // Another refresh is already in-flight — return the same promise so we
    // never send two simultaneous refresh requests.
    return refreshPromise;
  }

  refreshPromise = (async (): Promise<string> => {
    try {
      const response = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newToken = response.data.accessToken;

      // Dynamically import to avoid circular dependency at module load time.
      const { useAuthStore } = await import('../stores/authStore');
      useAuthStore.getState().setToken(newToken);

      return newToken;
    } finally {
      // Always clear the in-flight promise so future failures can retry.
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    // Dynamic import to prevent circular deps at module init.
    const { useAuthStore } = await import('../stores/authStore');
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor — 401 refresh, 403 redirect, error normalization
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError): Promise<never> => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // 401 Unauthorized: attempt a single token refresh and retry.
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        const newToken = await refreshToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest) as Promise<never>;
      } catch (_refreshError) {
        // Refresh failed — log the user out.
        const { useAuthStore } = await import('../stores/authStore');
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(normalizeError(error));
      }
    }

    // 403 Forbidden: redirect to a dedicated access-denied page.
    if (error.response?.status === 403) {
      window.location.href = '/forbidden';
      return Promise.reject(normalizeError(error));
    }

    return Promise.reject(normalizeError(error));
  },
);

// ---------------------------------------------------------------------------
// Error normalization helper
// ---------------------------------------------------------------------------

function normalizeError(error: AxiosError): ApiError {
  const timestamp = new Date().toISOString();

  if (error.response) {
    // The server returned a response with an error status code.
    const body = error.response.data as Partial<ApiError>;
    return {
      status: error.response.status,
      code: body.code ?? `HTTP_${error.response.status}`,
      message:
        body.message ??
        (error.response.statusText || `Request failed with status ${error.response.status}`),
      details: body.details,
      requestId:
        body.requestId ??
        (error.response.headers['x-request-id'] as string | undefined),
      timestamp: body.timestamp ?? timestamp,
    };
  }

  if (error.request) {
    // Request was sent but no response was received (network error / timeout).
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the DCMS API. Check your network connection.',
      timestamp,
    };
  }

  // Something went wrong setting up the request.
  return {
    status: 0,
    code: 'CLIENT_ERROR',
    message: error.message || 'An unexpected client error occurred.',
    timestamp,
  };
}

export type { ApiError };
