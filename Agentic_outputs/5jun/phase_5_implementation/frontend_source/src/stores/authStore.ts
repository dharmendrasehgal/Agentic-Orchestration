// =============================================================================
// DCMS Frontend — Auth Zustand Store
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import axios from 'axios';
import type { User } from '../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshTokenValue: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  loginWithOidc: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  initialize: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? '/api/v1';

// Single-flight guard: only one token refresh can be in-flight at a time.
// Shared with api/client.ts via the store's refreshAccessToken action.
let _refreshInFlight: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Store definition
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      // ------- Initial state -------
      user: null,
      token: null,
      refreshTokenValue: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // ------- Actions -------

      /**
       * Authenticate with email + password credentials.
       * The server sets an httpOnly refresh-token cookie; the access token is
       * returned in the JSON body and stored in memory only (not localStorage).
       */
      login: async (email: string, password: string): Promise<void> => {
        set({ isLoading: true, error: null }, false, 'auth/loginStart');
        try {
          const { data } = await axios.post<LoginResponse>(
            `${BASE_URL}/auth/login`,
            { email, password },
            { withCredentials: true },
          );
          set(
            {
              user: data.user,
              token: data.accessToken,
              refreshTokenValue: data.refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
            false,
            'auth/loginSuccess',
          );
        } catch (err) {
          const message =
            axios.isAxiosError(err)
              ? (err.response?.data as { message?: string })?.message ?? err.message
              : 'Login failed. Please try again.';
          set({ isLoading: false, error: message }, false, 'auth/loginFailure');
          throw err;
        }
      },

      /**
       * Exchange an OIDC authorization code for tokens (OAuth2 PKCE flow).
       */
      loginWithOidc: async (code: string): Promise<void> => {
        set({ isLoading: true, error: null }, false, 'auth/oidcStart');
        try {
          const { data } = await axios.post<LoginResponse>(
            `${BASE_URL}/auth/oidc/callback`,
            { code },
            { withCredentials: true },
          );
          set(
            {
              user: data.user,
              token: data.accessToken,
              refreshTokenValue: data.refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
            false,
            'auth/oidcSuccess',
          );
        } catch (err) {
          const message =
            axios.isAxiosError(err)
              ? (err.response?.data as { message?: string })?.message ?? err.message
              : 'OIDC login failed.';
          set({ isLoading: false, error: message }, false, 'auth/oidcFailure');
          throw err;
        }
      },

      /**
       * Invalidate the server-side session and clear local auth state.
       * The server will also clear the httpOnly refresh-token cookie.
       */
      logout: async (): Promise<void> => {
        try {
          await axios.post(`${BASE_URL}/auth/logout`, {}, { withCredentials: true });
        } catch {
          // Ignore server errors on logout — clear local state regardless.
        } finally {
          _refreshInFlight = null;
          set(
            {
              user: null,
              token: null,
              refreshTokenValue: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            },
            false,
            'auth/logout',
          );
        }
      },

      /**
       * Refresh the access token using the httpOnly refresh-token cookie.
       * Uses single-flight deduplication so concurrent callers share one request.
       */
      refreshAccessToken: async (): Promise<string> => {
        if (_refreshInFlight) {
          return _refreshInFlight;
        }

        _refreshInFlight = (async (): Promise<string> => {
          try {
            const { data } = await axios.post<{ accessToken: string }>(
              `${BASE_URL}/auth/refresh`,
              {},
              { withCredentials: true },
            );
            set({ token: data.accessToken }, false, 'auth/tokenRefreshed');
            return data.accessToken;
          } catch (err) {
            // If refresh fails, log the user out.
            await get().logout();
            throw err;
          } finally {
            _refreshInFlight = null;
          }
        })();

        return _refreshInFlight;
      },

      /**
       * Overwrite the stored user object (e.g., after profile update).
       */
      setUser: (user: User): void => {
        set({ user }, false, 'auth/setUser');
      },

      /**
       * Update the in-memory access token (called by the Axios interceptor).
       */
      setToken: (token: string): void => {
        set({ token }, false, 'auth/setToken');
      },

      /**
       * Called once on app boot: fetch the current user from /auth/me.
       * If the request succeeds the stored httpOnly cookie was valid.
       * If it fails the user is treated as logged out.
       */
      initialize: async (): Promise<void> => {
        set({ isLoading: true }, false, 'auth/initStart');
        try {
          // Attempt a silent token refresh first so the access token is fresh.
          const { data: refreshData } = await axios.post<{ accessToken: string }>(
            `${BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          );

          const { data: user } = await axios.get<User>(`${BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${refreshData.accessToken}` },
            withCredentials: true,
          });

          set(
            {
              user,
              token: refreshData.accessToken,
              isAuthenticated: true,
              isLoading: false,
            },
            false,
            'auth/initSuccess',
          );
        } catch {
          // No valid session — show the login page.
          set(
            {
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            },
            false,
            'auth/initFailure',
          );
        }
      },
    }),
    { name: 'authStore' },
  ),
);
