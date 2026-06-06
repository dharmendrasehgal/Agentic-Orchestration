# Phase 2: Architecture Finalization
## Frontend Architecture - Detailed Design

**Phase:** 2 | **Duration:** Weeks 2-4 | **Status:** In Development  
**Owner:** Frontend Team Lead | **Date:** June 5, 2026

---

## 1. Frontend Architecture Overview

### 1.1 Architectural Layers

```
┌────────────────────────────────────────┐
│     Presentation Layer (Pages)         │
│  • Dashboard, Containers, Hosts, etc.  │
└────────────┬─────────────────────────┘
             │
┌────────────▼──────────────────────────┐
│     Component Layer (Reusable)        │
│  • Tables, Forms, Cards, Modals, etc. │
└────────────┬─────────────────────────┘
             │
┌────────────▼──────────────────────────┐
│     State Management (Redux)          │
│  • Slices, Actions, Selectors         │
└────────────┬─────────────────────────┘
             │
┌────────────▼──────────────────────────┐
│     Service Layer (API Clients)       │
│  • HTTP, WebSocket, Error Handling    │
└────────────┬─────────────────────────┘
             │
┌────────────▼──────────────────────────┐
│     Data Layer (External APIs)        │
│  • Backend REST API, WebSocket        │
└────────────────────────────────────────┘
```

### 1.2 Technology Stack (Finalized)

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | React | 18.2+ | Component framework |
| **Language** | TypeScript | 5.0+ | Type safety |
| **Build Tool** | Vite | 4.3+ | Fast builds |
| **State** | Redux Toolkit | 1.9+ | State management |
| **UI Framework** | Material-UI | 5.13+ | UI components |
| **CSS** | Tailwind CSS | 3.3+ | Utility styling |
| **HTTP** | Axios | 1.4+ | REST API calls |
| **Real-time** | Socket.io Client | 4.5+ | WebSocket connection |
| **Charts** | Recharts | 2.7+ | Data visualization |
| **Forms** | React Hook Form | 7.4+ | Form management |
| **Validation** | Zod | 3.21+ | Schema validation |
| **Router** | React Router | 6.10+ | Client-side routing |
| **Testing** | Jest/RTL | Latest | Unit/component tests |
| **E2E** | Cypress | 12.12+ | End-to-end tests |

---

## 2. Component Architecture

### 2.1 Component Hierarchy

```
App (Root)
├── Layout
│   ├── Header (Logo, Search, Notifications, User Menu)
│   ├── Sidebar (Navigation)
│   └── MainContent
│
├── Pages
│   ├── Dashboard
│   │   ├── QuickStats
│   │   ├── ResourceChart
│   │   ├── RecentIncidents
│   │   └── AlertSummary
│   │
│   ├── Containers
│   │   ├── ContainerList
│   │   │   ├── ContainerTable
│   │   │   ├── FilterBar
│   │   │   └── BulkActions
│   │   ├── ContainerDetail
│   │   │   ├── OverviewTab
│   │   │   ├── MetricsTab
│   │   │   ├── LogsTab
│   │   │   └── SettingsTab
│   │   └── CreateContainer (Modal)
│   │
│   ├── Hosts
│   │   ├── HostList
│   │   ├── HostDetail
│   │   └── HostRegistration
│   │
│   ├── Images
│   │   ├── ImageRegistry
│   │   ├── ImageBrowser
│   │   └── VulnerabilityScanner
│   │
│   ├── Monitoring
│   │   ├── MetricsDashboard
│   │   ├── AlertCenter
│   │   └── Logs
│   │
│   ├── Security
│   │   ├── UserManagement
│   │   ├── RoleManagement
│   │   └── AuditLogs
│   │
│   └── Settings
│       ├── SystemConfig
│       ├── Integrations
│       └── About
│
└── Common Components
    ├── DataTable
    ├── FormBuilder
    ├── Modal
    ├── Toast
    ├── Loading
    ├── Error
    └── Pagination
```

### 2.2 Component Design Patterns

**Container Components (Smart):**
```typescript
// Handles logic, data fetching, state management
export const ContainerListPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { containers, loading } = useAppSelector(state => state.containers);
  
  useEffect(() => {
    dispatch(fetchContainers());
  }, []);
  
  return <ContainerListView containers={containers} loading={loading} />;
};
```

**Presentational Components (Dumb):**
```typescript
// Pure UI rendering, receives props only
interface ContainerListViewProps {
  containers: Container[];
  loading: boolean;
}

export const ContainerListView: React.FC<ContainerListViewProps> = ({
  containers,
  loading
}) => {
  return (
    <div className="container-list">
      {loading && <LoadingSpinner />}
      {containers.map(c => <ContainerRow key={c.id} container={c} />)}
    </div>
  );
};
```

---

## 3. State Management Architecture

### 3.1 Redux Store Structure

```
store/
├── store.ts                  # Store configuration
├── hooks.ts                  # Custom hooks (useAppDispatch, useAppSelector)
├── slices/
│   ├── authSlice.ts         # Authentication state
│   ├── containerSlice.ts    # Containers CRUD
│   ├── hostSlice.ts         # Hosts CRUD
│   ├── imageSlice.ts        # Images registry
│   ├── metricsSlice.ts      # Real-time metrics
│   ├── alertSlice.ts        # Alerts & notifications
│   ├── userSlice.ts         # User management
│   ├── settingsSlice.ts     # User preferences
│   └── uiSlice.ts           # UI state (modals, loading)
│
├── middleware/
│   ├── apiMiddleware.ts     # Handle API calls
│   ├── errorMiddleware.ts   # Error handling
│   └── loggingMiddleware.ts # Debug logging
│
└── selectors/
    ├── containerSelectors.ts
    ├── hostSelectors.ts
    └── ... (per domain)
```

### 3.2 Redux Slice Example

```typescript
// slices/containerSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchContainers = createAsyncThunk(
  'containers/fetchContainers',
  async (params: FetchParams) => {
    return containerService.list(params);
  }
);

export const containerSlice = createSlice({
  name: 'containers',
  initialState: {
    items: [],
    loading: false,
    error: null,
    filters: {}
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchContainers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchContainers.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      })
      .addCase(fetchContainers.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      });
  }
});
```

### 3.3 Data Flow

```
User Action (Click)
    ↓
Component Event Handler
    ↓
Redux Thunk (API Call)
    ↓
Action Creator
    ↓
Reducer
    ↓
Store Updated
    ↓
Selector
    ↓
Component Re-render
    ↓
UI Updated
```

---

## 4. API Integration Architecture

### 4.1 API Client Structure

```typescript
// services/api.ts - Axios instance with interceptors
export const apiClient = axios.create({
  baseURL: process.env.VITE_API_URL,
  timeout: 30000,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
    }
    return Promise.reject(error);
  }
);
```

### 4.2 Service Modules

```
services/
├── api.ts               # Axios instance
├── auth.ts              # Authentication
├── containers.ts        # Container operations
├── hosts.ts             # Host operations
├── images.ts            # Image registry
├── metrics.ts           # Metrics API
├── alerts.ts            # Alert API
├── users.ts             # User management
└── websocket.ts         # Real-time connection
```

**Container Service Example:**
```typescript
// services/containers.ts
export const containerService = {
  async list(params: ListParams) {
    return apiClient.get('/containers', { params });
  },
  
  async create(data: ContainerCreate) {
    return apiClient.post('/containers', data);
  },
  
  async start(id: string) {
    return apiClient.post(`/containers/${id}/start`);
  },
  
  async stop(id: string) {
    return apiClient.post(`/containers/${id}/stop`);
  },
  
  async delete(id: string) {
    return apiClient.delete(`/containers/${id}`);
  }
};
```

---

## 5. Real-time Updates with WebSocket

### 5.1 WebSocket Integration

```typescript
// services/websocket.ts
import io from 'socket.io-client';

export class WebSocketManager {
  private socket: Socket;
  
  connect() {
    this.socket = io(process.env.VITE_WS_URL, {
      auth: {
        token: localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
    
    this.socket.on('container:update', (data) => {
      store.dispatch(updateContainer(data));
    });
    
    this.socket.on('metrics:update', (data) => {
      store.dispatch(updateMetrics(data));
    });
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}
```

### 5.2 Real-time Data Flow

```
Server Event (Container Status Change)
    ↓
WebSocket Message to Client
    ↓
Socket Handler
    ↓
Redux Action
    ↓
State Updated
    ↓
Selectors
    ↓
Components Re-render (Subscribed)
    ↓
UI Reflects Change (Real-time)
```

---

## 6. Routing Architecture

### 6.1 Route Structure

```typescript
// routes/index.ts
const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'containers',
        children: [
          { index: true, element: <ContainerList /> },
          { path: ':id', element: <ContainerDetail /> }
        ]
      },
      {
        path: 'hosts',
        children: [
          { index: true, element: <HostList /> },
          { path: ':id', element: <HostDetail /> }
        ]
      },
      // ... more routes
    ]
  },
  {
    path: 'login',
    element: <LoginPage />
  },
  {
    path: '*',
    element: <NotFound />
  }
];
```

### 6.2 Protected Routes

```typescript
// components/ProtectedRoute.tsx
export const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({
  element
}) => {
  const { isAuthenticated } = useAuth();
  
  return isAuthenticated ? element : <Navigate to="/login" />;
};
```

---

## 7. Error Handling Architecture

### 7.1 Error Types

```typescript
// types/errors.ts
export enum ErrorType {
  NETWORK = 'NETWORK',
  API = 'API',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  UNKNOWN = 'UNKNOWN'
}

export interface AppError {
  type: ErrorType;
  message: string;
  statusCode?: number;
  details?: Record<string, any>;
}
```

### 7.2 Error Handling Strategy

```typescript
// utils/errorHandler.ts
export const handleError = (error: unknown): AppError => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return {
        type: ErrorType.AUTHENTICATION,
        message: 'Authentication failed',
        statusCode: 401
      };
    }
    if (error.response?.status === 403) {
      return {
        type: ErrorType.AUTHORIZATION,
        message: 'Permission denied',
        statusCode: 403
      };
    }
    return {
      type: ErrorType.API,
      message: error.response?.data?.message || 'API Error',
      statusCode: error.response?.status
    };
  }
  
  return {
    type: ErrorType.UNKNOWN,
    message: error instanceof Error ? error.message : 'Unknown error'
  };
};
```

---

## 8. Performance Optimization

### 8.1 Code Splitting Strategy

```typescript
// Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ContainerList = lazy(() => import('./pages/containers/List'));
const ContainerDetail = lazy(() => import('./pages/containers/Detail'));

// Suspense boundary
<Suspense fallback={<LoadingSpinner />}>
  <Outlet />
</Suspense>
```

### 8.2 Memoization Strategy

```typescript
// Prevent unnecessary re-renders
const ContainerRow = memo(({ container }: Props) => {
  return <tr>{/* ... */}</tr>;
}, (prev, next) => {
  return prev.container.id === next.container.id &&
         prev.container.status === next.container.status;
});
```

### 8.3 Image Optimization

```typescript
// Lazy load images
<img 
  src={image} 
  loading="lazy" 
  alt="Container logo"
/>

// Use WebP with fallback
<picture>
  <source srcSet={`${image}.webp`} type="image/webp" />
  <img src={image} alt="Container logo" />
</picture>
```

---

## 9. Testing Architecture

### 9.1 Testing Structure

```
src/
└── __tests__/
    ├── unit/
    │   ├── components/
    │   ├── services/
    │   ├── utils/
    │   └── selectors/
    ├── integration/
    │   ├── pages/
    │   └── workflows/
    └── e2e/
        └── cypress/
```

### 9.2 Testing Examples

**Unit Test (Component):**
```typescript
// __tests__/unit/components/ContainerRow.test.tsx
describe('ContainerRow', () => {
  it('renders container information', () => {
    const container = { id: '1', name: 'web-app', status: 'running' };
    render(<ContainerRow container={container} />);
    expect(screen.getByText('web-app')).toBeInTheDocument();
  });
});
```

**Integration Test:**
```typescript
// __tests__/integration/pages/ContainerList.test.tsx
describe('ContainerList Page', () => {
  it('displays containers from API', async () => {
    render(<ContainerList />);
    await waitFor(() => {
      expect(screen.getByText('web-app-1')).toBeInTheDocument();
    });
  });
});
```

---

## 10. Accessibility & Compliance

### 10.1 WCAG 2.1 AA Requirements

- ✅ Semantic HTML (proper heading hierarchy)
- ✅ ARIA labels on interactive elements
- ✅ Keyboard navigation throughout
- ✅ High contrast colors (4.5:1 minimum)
- ✅ Focus indicators visible
- ✅ Form labels properly associated
- ✅ Skip to main content link

### 10.2 Accessibility Implementation

```typescript
// Semantic buttons with ARIA
<button 
  aria-label="Delete container web-app-1"
  onClick={handleDelete}
  className="btn-danger"
>
  Delete
</button>

// Form with associated label
<label htmlFor="container-name">Container Name</label>
<input 
  id="container-name"
  type="text"
  required
  aria-required="true"
/>
```

---

## 11. Build & Deployment Configuration

### 11.1 Vite Configuration

```typescript
// vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'ES2020',
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'redux'],
          ui: ['@mui/material', 'tailwindcss']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
});
```

### 11.2 Environment Configuration

```
.env.development
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=http://localhost:8000

.env.staging
VITE_API_URL=https://staging-api.example.com/api
VITE_WS_URL=wss://staging-api.example.com

.env.production
VITE_API_URL=https://api.example.com/api
VITE_WS_URL=wss://api.example.com
```

---

## 12. Frontend Directory Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── containers/
│   │   │   ├── List.tsx
│   │   │   ├── Detail.tsx
│   │   │   └── Create.tsx
│   │   ├── hosts/
│   │   ├── images/
│   │   ├── monitoring/
│   │   ├── security/
│   │   └── settings/
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   └── Toast.tsx
│   │   ├── containers/
│   │   ├── hosts/
│   │   ├── monitoring/
│   │   └── forms/
│   │
│   ├── store/
│   │   ├── store.ts
│   │   ├── hooks.ts
│   │   └── slices/
│   │
│   ├── services/
│   │   ├── api.ts
│   │   ├── containers.ts
│   │   ├── hosts.ts
│   │   └── websocket.ts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useContainers.ts
│   │   └── useMetrics.ts
│   │
│   ├── utils/
│   │   ├── errorHandler.ts
│   │   ├── validators.ts
│   │   └── formatters.ts
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   └── variables.css
│   │
│   ├── types/
│   │   ├── api.ts
│   │   ├── domain.ts
│   │   └── errors.ts
│   │
│   ├── __tests__/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   │
│   └── App.tsx
│
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── Dockerfile
```

---

## 13. Key Frontend Metrics

| Metric | Target | Tool |
|--------|--------|------|
| **Bundle Size** | < 300 KB (gzipped) | webpack-bundle-analyzer |
| **Lighthouse Score** | > 90 | Lighthouse |
| **First Contentful Paint** | < 1.5s | WebVitals |
| **Largest Contentful Paint** | < 2.5s | WebVitals |
| **Cumulative Layout Shift** | < 0.1 | WebVitals |
| **Time to Interactive** | < 3s | WebVitals |
| **Code Coverage** | > 80% | Jest |
| **Accessibility Score** | > 95 | axe-core |

---

## 14. Next Steps (Phase 3)

1. **Component Library Finalization**
   - Storybook setup and documentation
   - Component props interface definition
   - Visual regression testing setup

2. **API Contract Definition**
   - OpenAPI specification finalization
   - Request/response schemas
   - Error response formats

3. **State Management Refinement**
   - Complete Redux slice definitions
   - Selector optimization
   - Async thunk patterns

4. **Integration Planning**
   - Backend API mocking for development
   - WebSocket event definitions
   - Error handling edge cases

---

**End of Frontend Architecture Document**
