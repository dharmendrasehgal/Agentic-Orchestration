// =============================================================================
// DCMS Frontend — UI Zustand Store
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Toast } from '../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark';

interface UiState {
  sidebarOpen: boolean;
  activeNamespace: string;
  theme: Theme;
  toasts: Toast[];
}

interface UiActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setNamespace: (namespace: string) => void;
  setTheme: (theme: Theme) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export type UiStore = UiState & UiActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Store definition
// ---------------------------------------------------------------------------

export const useUiStore = create<UiStore>()(
  devtools(
    persist(
      (set, _get) => ({
        // ------- Initial state -------
        sidebarOpen: true,
        activeNamespace: 'default',
        theme: 'light',
        toasts: [],

        // ------- Actions -------

        toggleSidebar: () =>
          set(
            (state) => ({ sidebarOpen: !state.sidebarOpen }),
            false,
            'ui/toggleSidebar',
          ),

        setSidebarOpen: (open: boolean) =>
          set({ sidebarOpen: open }, false, 'ui/setSidebarOpen'),

        setNamespace: (namespace: string) =>
          set({ activeNamespace: namespace }, false, 'ui/setNamespace'),

        setTheme: (theme: Theme) => {
          // Apply the class to <html> so TailwindCSS dark-mode utilities work.
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          }
          set({ theme }, false, 'ui/setTheme');
        },

        addToast: (toast: Omit<Toast, 'id'>) => {
          const id = generateId();
          const full: Toast = { id, durationMs: 4000, ...toast };
          set(
            (state) => ({ toasts: [...state.toasts, full] }),
            false,
            'ui/addToast',
          );

          // Auto-dismiss after durationMs.
          if (full.durationMs && full.durationMs > 0) {
            window.setTimeout(() => {
              set(
                (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
                false,
                'ui/autoRemoveToast',
              );
            }, full.durationMs);
          }
        },

        removeToast: (id: string) =>
          set(
            (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
            false,
            'ui/removeToast',
          ),

        clearToasts: () => set({ toasts: [] }, false, 'ui/clearToasts'),
      }),
      {
        // Persist sidebar preference and theme only — toasts and namespace
        // are ephemeral and should not survive a page reload.
        name: 'dcms-ui-prefs',
        partialize: (state) => ({
          sidebarOpen: state.sidebarOpen,
          theme: state.theme,
          activeNamespace: state.activeNamespace,
        }),
        onRehydrateStorage: () => (state) => {
          // Re-apply the theme class after hydration.
          if (state?.theme === 'dark' && typeof document !== 'undefined') {
            document.documentElement.classList.add('dark');
          }
        },
      },
    ),
    { name: 'uiStore' },
  ),
);
