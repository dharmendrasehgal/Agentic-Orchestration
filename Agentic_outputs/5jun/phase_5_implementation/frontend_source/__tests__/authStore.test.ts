// =============================================================================
// DCMS Frontend — authStore unit tests (Vitest 1.6)
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { useAuthStore } from '../src/stores/authStore';
import type { User } from '../src/types/index';
import { UserRole } from '../src/types/index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(),
      get: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

const mockedAxios = vi.mocked(axios, true);

// Prevent Zustand devtools from throwing in non-browser envs.
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  return {
    ...actual,
    devtools: (fn: unknown) => fn,
  };
});

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const MOCK_USER: User = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice Smith',
  role: UserRole.Admin,
  avatarUrl: null,
  namespaces: ['default', 'production'],
  createdAt: '2026-01-01T00:00:00Z',
  lastLoginAt: '2026-06-06T08:00:00Z',
  oidcProvider: null,
  mfaEnabled: false,
};

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test.access';
const MOCK_REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test.refresh';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshTokenValue: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('starts with an unauthenticated, idle state', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('login()', () => {
    it('sets user, token, and isAuthenticated on successful login', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          accessToken: MOCK_TOKEN,
          refreshToken: MOCK_REFRESH_TOKEN,
          user: MOCK_USER,
        },
      });

      await useAuthStore.getState().login('alice@example.com', 'secret');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBe(MOCK_TOKEN);
      expect(state.refreshTokenValue).toBe(MOCK_REFRESH_TOKEN);
      expect(state.user).toEqual(MOCK_USER);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error and isLoading=false on failed login', async () => {
      const axiosError = Object.assign(new Error('Invalid credentials'), {
        isAxiosError: true,
        response: { data: { message: 'Invalid credentials' } },
      });
      mockedAxios.post.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(
        useAuthStore.getState().login('alice@example.com', 'wrong'),
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  describe('logout()', () => {
    it('clears all auth state after logout', async () => {
      // Seed authenticated state first
      useAuthStore.setState({
        user: MOCK_USER,
        token: MOCK_TOKEN,
        refreshTokenValue: MOCK_REFRESH_TOKEN,
        isAuthenticated: true,
      });

      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.refreshTokenValue).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('clears state even when the server logout request fails', async () => {
      useAuthStore.setState({ user: MOCK_USER, token: MOCK_TOKEN, isAuthenticated: true });
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().token).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('refreshAccessToken()', () => {
    it('updates the token in the store on successful refresh', async () => {
      const newToken = 'eyJhbGciOiJIUzI1NiJ9.new.access';
      mockedAxios.post.mockResolvedValueOnce({ data: { accessToken: newToken } });

      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(newToken);
      expect(useAuthStore.getState().token).toBe(newToken);
    });

    it('deduplicates concurrent refresh calls — only one HTTP request is fired', async () => {
      const newToken = 'eyJhbGciOiJIUzI1NiJ9.dedup.access';
      // The mock resolves after a tick so both calls are in-flight simultaneously.
      mockedAxios.post.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { accessToken: newToken } }), 10)),
      );

      const [r1, r2] = await Promise.all([
        useAuthStore.getState().refreshAccessToken(),
        useAuthStore.getState().refreshAccessToken(),
      ]);

      // Both callers should receive the same token.
      expect(r1).toBe(newToken);
      expect(r2).toBe(newToken);
      // Only one actual HTTP call should have been made.
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('calls logout when the refresh request fails', async () => {
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Refresh expired')) // refresh fails
        .mockResolvedValueOnce({ data: {} }); // logout succeeds

      await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow();
      // After the failed refresh, the user should be logged out.
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('setUser()', () => {
    it('updates the user object in the store', () => {
      const updated: User = { ...MOCK_USER, name: 'Alice Updated' };
      useAuthStore.getState().setUser(updated);
      expect(useAuthStore.getState().user?.name).toBe('Alice Updated');
    });
  });
});
