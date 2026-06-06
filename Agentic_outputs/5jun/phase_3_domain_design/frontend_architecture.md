# Frontend Architecture — Generic Docker Container Management System (DCMS)

**Phase:** 3 — Domain Design
**Agent:** frontend_architect_agent
**Date:** 2026-06-05
**Stack:** React 18, TypeScript 5.4, Vite 5, TailwindCSS 3, React Query 5, Zustand 4, Recharts 2.12

---

## 1. Overview

The DCMS frontend is a Single-Page Application (SPA) served by Nginx. It communicates
exclusively with the `api-gateway` service via REST (JSON) and Server-Sent Events (SSE)
for real-time container state updates. Authentication uses JWT tokens stored in
httpOnly cookies. Role-Based Access Control (RBAC) gates all route access and UI
affordances at three levels: `admin`, `operator`, and `viewer`.

---

## 2. Component Hierarchy

### 2.1 Application Shell

```
<App>                                 # Vite entry, QueryClientProvider, RouterProvider
  <ThemeProvider>                     # Reads UIStore.theme, applies TailwindCSS dark class
    <AuthGuard>                       # Redirects unauthenticated users to /login
      <RootLayout>                    # Persistent shell: sidebar + topbar + outlet
        <Sidebar>
          <NavItem />                 # Rendered per route manifest
          <NamespaceSwitcher />       # Reads/writes UIStore.activeNamespace
          <UserMenu />
        </Sidebar>
        <Topbar>
          <GlobalSearch />
          <NotificationBell />        # Badge count from NotificationStore
          <ThemeToggle />
          <UserAvatar />
        </Topbar>
        <MainContent>
          <Outlet />                  # Page-level components via React Router
          <ToastStack />              # Consumes NotificationStore.toasts
        </MainContent>
      </RootLayout>
    </AuthGuard>
  </ThemeProvider>
</App>
```

### 2.2 Page-Level Components

| Route Path              | Component                  | Lazy | RBAC           |
|-------------------------|----------------------------|------|----------------|
| `/login`                | `LoginPage`                | No   | Public         |
| `/`                     | `DashboardPage`            | Yes  | viewer+        |
| `/containers`           | `ContainerListPage`        | Yes  | viewer+        |
| `/containers/:id`       | `ContainerDetailPage`      | Yes  | viewer+        |
| `/images`               | `ImageRegistryPage`        | Yes  | viewer+        |
| `/networks`             | `NetworkingPage`           | Yes  | viewer+        |
| `/volumes`              | `VolumesPage`              | Yes  | viewer+        |
| `/monitoring`           | `MonitoringDashboardPage`  | Yes  | viewer+        |
| `/logs`                 | `LogsPage`                 | Yes  | viewer+        |
| `/clusters`             | `ClustersPage`             | Yes  | admin          |
| `/settings`             | `SettingsPage`             | Yes  | admin          |
| `/users`                | `UserManagementPage`       | Yes  | admin          |
| `*`                     | `NotFoundPage`             | No   | Public         |

### 2.3 Shared Component Library (`src/components/`)

```
components/
  ui/
    Button/           Button.tsx, Button.stories.tsx, Button.test.tsx
    Badge/            Badge.tsx (variants: success | warning | error | info | neutral)
    Card/             Card.tsx, CardHeader.tsx, CardBody.tsx, CardFooter.tsx
    DataTable/        DataTable.tsx, TablePagination.tsx, TableFilter.tsx
    VirtualList/      VirtualList.tsx   # react-virtual for 1000+ row lists
    Modal/            Modal.tsx, ModalHeader.tsx, ModalBody.tsx, ModalFooter.tsx
    Drawer/           Drawer.tsx
    Tabs/             Tabs.tsx, TabPanel.tsx
    Form/             TextInput.tsx, Select.tsx, Checkbox.tsx, Toggle.tsx
    Spinner/          Spinner.tsx
    EmptyState/       EmptyState.tsx
    ErrorBoundary/    ErrorBoundary.tsx, ErrorFallback.tsx
    Tooltip/          Tooltip.tsx
    ProgressBar/      ProgressBar.tsx
  charts/
    CpuChart/         CpuChart.tsx      # Recharts LineChart wrapper
    MemoryChart/      MemoryChart.tsx   # Recharts AreaChart wrapper
    DiskChart/        DiskChart.tsx     # Recharts BarChart wrapper
    NetworkIOChart/   NetworkIOChart.tsx
    HeatmapGrid/      HeatmapGrid.tsx   # Custom SVG heatmap for monitoring
  container/
    ContainerStatusBadge/   ContainerStatusBadge.tsx
    ContainerActionMenu/    ContainerActionMenu.tsx
    ContainerRow/           ContainerRow.tsx
    ContainerMetricBar/     ContainerMetricBar.tsx
  layout/
    Sidebar/          Sidebar.tsx, NavItem.tsx, NamespaceSwitcher.tsx
    Topbar/           Topbar.tsx, GlobalSearch.tsx, NotificationBell.tsx
    RootLayout/       RootLayout.tsx
    AuthGuard/        AuthGuard.tsx
    RbacGuard/        RbacGuard.tsx
  terminal/
    XTermWrapper/     XTermWrapper.tsx  # xterm.js integration for exec sessions
  logs/
    LogViewer/        LogViewer.tsx     # Virtualised SSE log stream renderer
```

### 2.4 Feature-Specific Sub-Trees (selected)

**ContainerDetailPage** tabs:
```
<ContainerDetailPage>
  <ContainerDetailHeader />           # name, status badge, action buttons
  <Tabs>
    <TabPanel label="Overview">
      <ContainerOverviewPanel />      # image, created, ports, environment vars
    </TabPanel>
    <TabPanel label="Logs">
      <LogViewer containerId={id} />  # SSE-backed live log stream
    </TabPanel>
    <TabPanel label="Stats">
      <ContainerStatsPanel>
        <CpuChart />
        <MemoryChart />
        <NetworkIOChart />
        <DiskChart />
      </ContainerStatsPanel>
    </TabPanel>
    <TabPanel label="Exec">
      <XTermWrapper containerId={id} /> # WebSocket exec session
    </TabPanel>
    <TabPanel label="Networks">
      <ContainerNetworksPanel />
    </TabPanel>
    <TabPanel label="Volumes">
      <ContainerVolumesPanel />
    </TabPanel>
  </Tabs>
</ContainerDetailPage>
```

---

## 3. State Management (Zustand 4)

All stores live in `src/stores/`. Each store uses the `immer` middleware for
immutable updates and `persist` middleware (sessionStorage) where noted.

### 3.1 AuthStore (`src/stores/authStore.ts`)

```typescript
interface AuthState {
  user: User | null;            // decoded JWT payload
  role: 'admin' | 'operator' | 'viewer' | null;
  isAuthenticated: boolean;
  isRefreshing: boolean;
  login: (credentials: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  hasPermission: (action: Permission) => boolean;
}
```

- JWT is stored in an httpOnly cookie set by the api-gateway; the store holds
  the decoded payload only (no raw token in JS memory).
- `hasPermission(action)` performs an in-memory RBAC check against a static
  permission matrix imported from `src/config/permissions.ts`.
- On mount, `AuthStore` calls `GET /auth/me` to rehydrate from the cookie.

### 3.2 ContainerStore (`src/stores/containerStore.ts`)

```typescript
interface ContainerState {
  containers: Record<string, Container>;  // keyed by container ID
  selectedIds: Set<string>;               // bulk selection
  filters: ContainerFilters;
  sortConfig: SortConfig;
  setContainers: (list: Container[]) => void;
  patchContainer: (id: string, patch: Partial<Container>) => void;
  removeContainer: (id: string) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setFilter: (key: keyof ContainerFilters, value: unknown) => void;
}
```

- Containers are seeded by React Query and pushed into this store so SSE
  partial-update patches (`patchContainer`) can be applied without a full
  refetch.
- The store is NOT persisted — it is rebuilt from the query cache on mount.

### 3.3 NotificationStore (`src/stores/notificationStore.ts`)

```typescript
interface NotificationState {
  toasts: Toast[];
  alerts: Alert[];
  unreadCount: number;
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  addAlert: (alert: Alert) => void;
  markAllRead: () => void;
}
```

- Toasts auto-dismiss after `duration` ms via a `setTimeout` registered in
  `addToast`.
- SSE `alert` events are routed here by `SSEManager`.

### 3.4 UIStore (`src/stores/uiStore.ts`)

```typescript
interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  activeNamespace: string;
  availableNamespaces: string[];
  globalSearchOpen: boolean;
  setTheme: (theme: UIState['theme']) => void;
  toggleSidebar: () => void;
  setNamespace: (ns: string) => void;
}
```

- Persisted to `localStorage` via `persist` middleware (theme, sidebar state,
  last-active namespace).

---

## 4. Data Fetching Strategy (React Query 5)

### 4.1 Query Client Configuration (`src/api/queryClient.ts`)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30 s — matches SSE real-time updates
      gcTime: 5 * 60_000,         // 5 min garbage collection
      retry: 2,
      refetchOnWindowFocus: false, // SSE handles live updates
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### 4.2 Query Key Conventions

All query keys follow the tuple convention `[resource, scope?, id?]` to allow
precise invalidation:

| Query                           | Key                                          |
|---------------------------------|----------------------------------------------|
| Container list                  | `['containers', namespace]`                  |
| Single container                | `['containers', namespace, containerId]`     |
| Container stats (polling)       | `['containers', namespace, id, 'stats']`     |
| Image list                      | `['images', namespace]`                      |
| Single image                    | `['images', namespace, imageId]`             |
| Network list                    | `['networks', namespace]`                    |
| Volume list                     | `['volumes', namespace]`                     |
| Cluster list                    | `['clusters']`                               |
| User list                       | `['users']`                                  |
| Auth me                         | `['auth', 'me']`                             |
| Host metrics                    | `['metrics', 'hosts', namespace]`            |

### 4.3 Cache Invalidation on SSE Events

The `SSEManager` (`src/services/sseManager.ts`) maps incoming event types to
`queryClient.invalidateQueries()` calls or direct `queryClient.setQueryData()`
patches for low-latency updates:

| SSE Event Type           | Strategy                                             |
|--------------------------|------------------------------------------------------|
| `container.state_change` | `setQueryData(['containers', ns, id], patch)`        |
| `container.created`      | `invalidateQueries(['containers', ns])`              |
| `container.removed`      | Remove entry, `invalidateQueries(['containers', ns])`|
| `container.stats`        | `setQueryData(['containers', ns, id, 'stats'], data)`|
| `image.pulled`           | `invalidateQueries(['images', ns])`                  |
| `network.created`        | `invalidateQueries(['networks', ns])`                |
| `alert.fired`            | Route to `NotificationStore.addAlert()`              |
| `log.line`               | Streamed directly to `LogViewer` via callback ref    |

### 4.4 Optimistic Updates

Mutations that change container state use React Query's optimistic update
pattern:

```typescript
// src/api/mutations/containerMutations.ts
export function useStartContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/containers/${id}/start`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['containers', ns, id] });
      const prev = queryClient.getQueryData(['containers', ns, id]);
      queryClient.setQueryData(['containers', ns, id], (old: Container) => ({
        ...old, status: 'starting',
      }));
      return { prev };
    },
    onError: (_err, id, ctx) => {
      queryClient.setQueryData(['containers', ns, id], ctx?.prev);
      notificationStore.addToast({ variant: 'error', message: 'Start failed' });
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: ['containers', ns, id] });
    },
  });
}
```

---

## 5. Routing Structure (React Router v6)

### 5.1 Route Definition (`src/router/index.tsx`)

```tsx
const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AuthGuard><RootLayout /></AuthGuard>,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true,              element: lazy('DashboardPage') },
      { path: 'containers',       element: lazy('ContainerListPage') },
      { path: 'containers/:id',   element: lazy('ContainerDetailPage') },
      { path: 'images',           element: lazy('ImageRegistryPage') },
      { path: 'networks',         element: lazy('NetworkingPage') },
      { path: 'volumes',          element: lazy('VolumesPage') },
      { path: 'monitoring',       element: lazy('MonitoringDashboardPage') },
      { path: 'logs',             element: lazy('LogsPage') },
      {
        path: 'clusters',
        element: <RbacGuard roles={['admin']}><Outlet /></RbacGuard>,
        children: [{ index: true, element: lazy('ClustersPage') }],
      },
      {
        path: 'settings',
        element: <RbacGuard roles={['admin']}><Outlet /></RbacGuard>,
        children: [{ index: true, element: lazy('SettingsPage') }],
      },
      {
        path: 'users',
        element: <RbacGuard roles={['admin']}><Outlet /></RbacGuard>,
        children: [{ index: true, element: lazy('UserManagementPage') }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

### 5.2 Lazy Loading Helper

```typescript
// src/router/lazy.tsx
import { lazy, Suspense } from 'react';
import { PageSpinner } from '@/components/ui/Spinner';

export function lazy(name: string) {
  const Page = lazy(() => import(`../pages/${name}`));
  return (
    <Suspense fallback={<PageSpinner />}>
      <Page />
    </Suspense>
  );
}
```

### 5.3 Protected Route Behaviour

- `AuthGuard` reads `AuthStore.isAuthenticated`. If false, redirects to
  `/login?redirect=<current-path>`. After successful login the redirect param
  is used to return the user to their intended destination.
- `RbacGuard` reads `AuthStore.role`. If the user's role is not in the allowed
  list, renders a `403 Forbidden` page instead of redirecting.

---

## 6. SSE Integration Pattern

### 6.1 SSEManager (`src/services/sseManager.ts`)

A single `EventSource` connection per active namespace is maintained by the
`SSEManager` singleton. Namespace switches tear down the old connection and
open a new one.

```typescript
class SSEManager {
  private source: EventSource | null = null;
  private namespace: string = '';
  private handlers: Map<string, Set<SSEHandler>> = new Map();

  connect(namespace: string): void {
    if (this.source && this.namespace === namespace) return;
    this.disconnect();
    this.namespace = namespace;
    this.source = new EventSource(
      `${API_BASE}/events?namespace=${namespace}`,
      { withCredentials: true }   // sends httpOnly cookie
    );
    this.source.onmessage = this.dispatch.bind(this);
    this.source.onerror = this.handleError.bind(this);
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
  }

  on(eventType: string, handler: SSEHandler): () => void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler);
    return () => this.handlers.get(eventType)?.delete(handler); // unsubscribe
  }

  private dispatch(event: MessageEvent): void {
    const data: SSEEvent = JSON.parse(event.data);
    this.handlers.get(data.type)?.forEach(h => h(data));
    this.handlers.get('*')?.forEach(h => h(data));
  }

  private handleError(): void {
    // Exponential back-off reconnection is handled by the browser's
    // EventSource spec; we additionally notify the user after 3 consecutive
    // failures via NotificationStore.
  }
}

export const sseManager = new SSEManager();
```

### 6.2 React Hook (`src/hooks/useSSE.ts`)

```typescript
export function useSSE(eventType: string, handler: SSEHandler): void {
  const ns = useUIStore(s => s.activeNamespace);
  useEffect(() => {
    sseManager.connect(ns);
    const unsub = sseManager.on(eventType, handler);
    return unsub;
  }, [ns, eventType, handler]);
}
```

### 6.3 SSE Event Schema

All SSE events conform to:
```typescript
interface SSEEvent {
  type: string;           // 'container.state_change' | 'container.stats' | ...
  namespace: string;
  resourceId: string;
  timestamp: string;      // ISO 8601
  payload: unknown;       // type-specific payload
}
```

---

## 7. Error Boundary Strategy

### 7.1 Boundary Placement

| Boundary               | Location                        | Fallback                          |
|------------------------|---------------------------------|-----------------------------------|
| `AppErrorBoundary`     | Wraps `<App>`                   | Full-page crash screen            |
| `RouteErrorBoundary`   | `errorElement` on root route    | In-layout error with retry button |
| `PageErrorBoundary`    | Each lazy page `<Suspense>`     | Page-level skeleton + error card  |
| `ChartErrorBoundary`   | Wraps each chart component      | "Chart unavailable" placeholder   |
| `WidgetErrorBoundary`  | Dashboard stat cards            | Card with error icon              |

### 7.2 Error Fallback Pattern

```tsx
// src/components/ui/ErrorBoundary/ErrorFallback.tsx
function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  useEffect(() => {
    logger.error('Render error', { error: error.message, stack: error.stack });
  }, [error]);
  return (
    <div role="alert" className="flex flex-col items-center gap-4 p-8">
      <AlertIcon className="text-error-500 h-12 w-12" />
      <p className="text-neutral-700 dark:text-neutral-300">{error.message}</p>
      <Button onClick={resetErrorBoundary} variant="secondary">Retry</Button>
    </div>
  );
}
```

---

## 8. Authentication Flow

### 8.1 Login Sequence

```
Browser                      api-gateway                 AuthStore
  |                               |                           |
  |-- POST /auth/login ---------->|                           |
  |   { username, password }      |                           |
  |                               |-- validate credentials -->|
  |<-- 200 Set-Cookie: jwt=... ---|                           |
  |   (httpOnly, Secure, SameSite=Strict)                     |
  |-- GET /auth/me -------------->|                           |
  |<-- 200 { user, role } --------|                           |
  |                               |-- AuthStore.login() ----->|
  |-- navigate to / ------------>|                           |
```

### 8.2 Token Refresh

- `api.ts` Axios interceptor checks the response for `401 Unauthorized`.
- On 401, it calls `POST /auth/refresh` (httpOnly cookie is sent automatically).
- If the refresh succeeds the failed request is retried once.
- If the refresh fails, `AuthStore.logout()` is called and the user is
  redirected to `/login`.

### 8.3 MFA Flow

- After primary credential validation the api-gateway returns `202 Accepted`
  with `{ mfaRequired: true, mfaToken: '<opaque>' }`.
- The `LoginPage` state machine transitions to the `MFA_PROMPT` view.
- The user submits the TOTP code with the `mfaToken`; on success the full
  `jwt` httpOnly cookie is set.

### 8.4 SSO Flow

- The `Login` button triggers `GET /auth/sso/redirect?provider=saml` which
  the api-gateway resolves to the IdP redirect URL.
- After the IdP callback the api-gateway sets the JWT cookie and redirects
  to `/auth/sso/callback` which the SPA handles to complete the
  `AuthStore.login()` flow.

---

## 9. Performance Strategy

### 9.1 Code Splitting

All page-level components are lazy-loaded via `React.lazy()`. Each page forms
its own Rollup chunk. Shared component chunks are configured in
`vite.config.ts`:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
        'vendor-query':   ['@tanstack/react-query'],
        'vendor-charts':  ['recharts'],
        'vendor-zustand': ['zustand'],
        'vendor-xterm':   ['xterm', 'xterm-addon-fit', 'xterm-addon-web-links'],
      },
    },
  },
},
```

### 9.2 Virtual Scrolling

The `ContainerListPage` may render thousands of rows. `VirtualList` wraps
`@tanstack/react-virtual`:

```typescript
const virtualizer = useVirtualizer({
  count: filteredContainers.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 52,         // 52px per row (table row height token)
  overscan: 10,
});
```

Only ~20 DOM rows are rendered at any time regardless of list size.

### 9.3 Memoisation Strategy

- `ContainerRow` is wrapped in `React.memo` with a custom `areEqual` comparator
  that compares only `status`, `cpuPercent`, and `memUsage` fields.
- Chart data selectors use `useMemo` with 1 s debounced SSE updates to avoid
  per-tick rerenders.
- `useCallback` used for all event handlers passed to virtualised rows.

### 9.4 Bundle Size Targets

| Chunk             | Target gzipped |
|-------------------|----------------|
| `index.html` + entry | < 10 KB   |
| `vendor-react`    | < 45 KB        |
| `vendor-query`    | < 15 KB        |
| `vendor-charts`   | < 60 KB        |
| Per-page chunk    | < 30 KB        |

---

## 10. Testing Strategy

### 10.1 Unit / Component Tests (Vitest + React Testing Library)

Location: `src/**/__tests__/` and co-located `*.test.tsx` files.

```
Coverage targets:
  - Statements: 80%
  - Branches:   75%
  - Functions:  80%
```

Key test suites:
- `AuthStore.test.ts` — login/logout/refresh flows, `hasPermission` matrix
- `ContainerStore.test.ts` — patch, remove, filter, sort selectors
- `SSEManager.test.ts` — connect/disconnect, event dispatch, reconnect logic
- `ContainerRow.test.tsx` — renders correct status badge, action menu gated by role
- `AuthGuard.test.tsx` — unauthenticated redirect, authenticated passthrough
- `RbacGuard.test.tsx` — 403 render for insufficient role
- `useSSE.test.ts` — mounts listener, cleans up on unmount

### 10.2 E2E Tests (Playwright)

Location: `e2e/` at repo root.

Test scenarios:
```
e2e/
  auth/
    login.spec.ts           # credential login, MFA flow, SSO redirect
    logout.spec.ts
    session-expiry.spec.ts  # 401 → refresh → retry
  containers/
    list.spec.ts            # filters, sort, bulk select, virtual scroll
    start-stop.spec.ts      # optimistic update, SSE state confirm
    detail.spec.ts          # tabs navigation, live logs, exec terminal
  monitoring/
    dashboard.spec.ts       # charts render, alert notification appears
  users/
    user-management.spec.ts # invite, role change, RBAC matrix
```

Playwright config uses the `baseURL` env var so the same specs run against
local dev, staging, and production.

### 10.3 Visual Regression (Playwright Snapshots)

Snapshot tests run for:
- Dashboard (light + dark theme)
- ContainerDetailPage: all 6 tabs
- MonitoringDashboard with seeded metric data

---

## 11. Build and Deployment

### 11.1 Vite Build Configuration (`vite.config.ts`)

```typescript
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
  },
  server: {
    proxy: {
      '/api': { target: 'http://api-gateway:8080', changeOrigin: true },
      '/events': {
        target: 'http://api-gateway:8080',
        changeOrigin: true,
      },
    },
  },
});
```

### 11.2 Docker Multi-Stage Build (`Dockerfile`)

```dockerfile
# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

# Stage 2 — serve
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/security-headers.conf /etc/nginx/conf.d/security-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 11.3 Nginx Configuration (`nginx/nginx.conf`)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to api-gateway (in-cluster)
    location /api/ {
        proxy_pass http://api-gateway:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SSE — disable buffering
    location /events {
        proxy_pass http://api-gateway:8080/events;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding on;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # Immutable asset caching
    location ~* \.(js|css|woff2|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    include /etc/nginx/conf.d/security-headers.conf;
}
```

### 11.4 Security Headers (`nginx/security-headers.conf`)

```nginx
add_header Content-Security-Policy
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
   img-src 'self' data:; connect-src 'self'; font-src 'self';
   frame-ancestors 'none';" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

---

## 12. Folder Structure

```
frontend/
  src/
    api/                    # Axios instance, query client, per-resource API modules
      index.ts              # Axios instance + interceptors
      queryClient.ts
      containers.ts
      images.ts
      networks.ts
      volumes.ts
      clusters.ts
      users.ts
      auth.ts
      metrics.ts
    components/             # Reusable UI (see section 2.3)
    config/
      permissions.ts        # Static RBAC permission matrix
      routes.ts             # Route manifest (path, component, roles)
      constants.ts
    hooks/                  # Custom React hooks
      useSSE.ts
      useContainerActions.ts
      useNamespace.ts
      usePagination.ts
      useDebounce.ts
      useVirtualScroll.ts
      useTheme.ts
      usePermission.ts
    mutations/              # React Query useMutation wrappers
      containerMutations.ts
      imageMutations.ts
      networkMutations.ts
      userMutations.ts
    pages/                  # Lazy-loaded page components
      DashboardPage/
      ContainerListPage/
      ContainerDetailPage/
      ImageRegistryPage/
      NetworkingPage/
      VolumesPage/
      MonitoringDashboardPage/
      LogsPage/
      ClustersPage/
      SettingsPage/
      UserManagementPage/
      LoginPage/
      NotFoundPage/
    router/
      index.tsx
      lazy.tsx
    services/
      sseManager.ts
      logger.ts
    stores/
      authStore.ts
      containerStore.ts
      notificationStore.ts
      uiStore.ts
    types/
      container.ts
      image.ts
      network.ts
      volume.ts
      cluster.ts
      user.ts
      metrics.ts
      sse.ts
      auth.ts
    utils/
      formatBytes.ts
      formatDuration.ts
      cn.ts                 # clsx + tailwind-merge helper
      statusColor.ts        # container status -> design token colour mapping
    main.tsx
    index.css               # Tailwind base/components/utilities directives
  e2e/                      # Playwright tests
  public/
    favicon.ico
    robots.txt
  nginx/
    nginx.conf
    security-headers.conf
  Dockerfile
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
```

---

## 13. Environment Variables

| Variable                 | Description                          | Example                        |
|--------------------------|--------------------------------------|--------------------------------|
| `VITE_API_BASE_URL`      | api-gateway base URL (dev only)      | `http://localhost:8080`        |
| `VITE_SSE_RECONNECT_MS`  | Initial SSE reconnect delay          | `2000`                         |
| `VITE_BUILD_VERSION`     | Injected by CI at build time         | `1.2.0-abc1234`                |
| `VITE_SENTRY_DSN`        | Sentry error reporting DSN           | `https://...@sentry.io/...`    |

In production all `/api` and `/events` traffic is proxied by Nginx so no
base URL env var is needed at runtime.

---

_End of frontend_architecture.md_
