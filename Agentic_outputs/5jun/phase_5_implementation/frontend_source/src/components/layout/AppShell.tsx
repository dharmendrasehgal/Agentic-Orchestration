// =============================================================================
// DCMS Frontend — AppShell Layout Component
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import type { Toast } from '../../types/index';

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
      </svg>
    ),
  },
  {
    label: 'Containers',
    to: '/containers',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    label: 'Images',
    to: '/images',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Networks',
    to: '/networks',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
  },
  {
    label: 'Volumes',
    to: '/volumes',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
  {
    label: 'Monitoring',
    to: '/monitoring',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Logs',
    to: '/logs',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: 'Clusters',
    to: '/clusters',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Toast notification item
// ---------------------------------------------------------------------------

const TOAST_VARIANT_CLASSES: Record<Toast['variant'], string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200',
  error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-700 dark:text-red-200',
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200',
  info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => (
  <div
    role="alert"
    aria-live="polite"
    className={[
      'flex items-start gap-3 rounded-lg border p-4 shadow-md',
      'min-w-[280px] max-w-[400px] animate-in slide-in-from-right-5',
      TOAST_VARIANT_CLASSES[toast.variant],
    ].join(' ')}
  >
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-sm truncate">{toast.title}</p>
      {toast.description && (
        <p className="mt-0.5 text-xs opacity-80">{toast.description}</p>
      )}
    </div>
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={() => onDismiss(toast.id)}
      className="shrink-0 rounded hover:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Namespace selector
// ---------------------------------------------------------------------------

const DEMO_NAMESPACES = ['default', 'production', 'staging', 'dev'];

const NamespaceSelector: React.FC = () => {
  const activeNamespace = useUiStore((s) => s.activeNamespace);
  const setNamespace = useUiStore((s) => s.setNamespace);

  return (
    <select
      aria-label="Active namespace"
      value={activeNamespace}
      onChange={(e) => setNamespace(e.target.value)}
      className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {DEMO_NAMESPACES.map((ns) => (
        <option key={ns} value={ns}>
          {ns}
        </option>
      ))}
    </select>
  );
};

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

const TopBar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { theme, setTheme } = useUiStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <header className="h-14 flex items-center gap-4 px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 z-20">
      {/* Sidebar toggle */}
      <button
        type="button"
        aria-label="Toggle navigation sidebar"
        onClick={toggleSidebar}
        className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg className="h-5 w-5 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Logo */}
      <Link to="/dashboard" className="flex items-center gap-2 no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white font-bold text-xs select-none">
          DC
        </span>
        <span className="hidden sm:block font-semibold text-sm text-slate-800 dark:text-slate-100">
          DCMS
        </span>
      </Link>

      <div className="flex-1" />

      {/* Namespace selector */}
      <NamespaceSelector />

      {/* Theme toggle */}
      <button
        type="button"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-slate-600 dark:text-slate-300"
      >
        {theme === 'light' ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
      </button>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Open user menu"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold select-none">
              {initials}
            </span>
          )}
          <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
            {user?.name ?? 'Guest'}
          </span>
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-52 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-50"
          >
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
            <Link
              to="/settings/profile"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 no-underline"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); void handleLogout(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

const Sidebar: React.FC = () => {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => useUiStore.getState().setSidebarOpen(false)}
        />
      )}

      <nav
        aria-label="Main navigation"
        className={[
          'fixed md:relative inset-y-0 left-0 z-20 flex flex-col',
          'border-r border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-900',
          'transition-all duration-200 ease-in-out overflow-hidden',
          sidebarOpen ? 'w-56 translate-x-0' : 'w-0 md:w-14 -translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <ul className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium',
                    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    'whitespace-nowrap overflow-hidden',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
                  ].join(' ')
                }
              >
                <span className="shrink-0">{item.icon}</span>
                <span
                  className={[
                    'transition-opacity duration-150',
                    sidebarOpen ? 'opacity-100' : 'opacity-0 md:hidden',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
};

// ---------------------------------------------------------------------------
// Toast stack
// ---------------------------------------------------------------------------

const ToastStack: React.FC = () => {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export const AppShell: React.FC = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />

        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-6"
          aria-label="Main content"
        >
          <Outlet />
        </main>
      </div>

      <ToastStack />
    </div>
  );
};

AppShell.displayName = 'AppShell';

export default AppShell;
