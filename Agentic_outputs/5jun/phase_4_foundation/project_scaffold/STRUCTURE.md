# DCMS Monorepo Structure
# Generated:   2026-06-06
# Approved-by: dependency_manager_agent
# Pipeline:    Software Factory — Phase 4 (Foundation)
# Project:     Generic Docker Container Management System (DCMS)

## Directory Tree

```
dcms/                                             # Monorepo root. All services, frontend,
│                                                 # infrastructure, and tooling live here.
│                                                 # A single git repository; each service has
│                                                 # its own go.mod to enable independent builds
│                                                 # and container images.
│
├── .github/                                      # GitHub-specific configuration
│   ├── workflows/
│   │   ├── pr.yml                                # PR validation: lint, unit tests, build
│   │   │                                         # smoke test, dependency gate check
│   │   ├── main.yml                              # Main branch CI/CD: full test suite,
│   │   │                                         # Docker build + push, staging deploy
│   │   ├── nightly.yml                           # Nightly: Trivy CVE scan, govulncheck,
│   │   │                                         # npm audit, dependency drift detection
│   │   └── release.yml                           # Release: tag-triggered, builds release
│   │                                             # artifacts, updates Swarm stack, changelog
│   ├── CODEOWNERS                                # Code ownership rules per directory;
│   │                                             # enforces review assignments on PRs
│   └── PULL_REQUEST_TEMPLATE.md                  # PR checklist: tests, docs, dependency
│                                                 # review, migration included
│
├── services/                                     # All Go microservices. Each service is an
│                                                 # independent Go module (go.mod / go.sum).
│                                                 # No service may import another service's
│                                                 # internal packages — see inter-service
│                                                 # dependency rules below.
│   │
│   ├── auth-service/                             # Authentication & authorisation service.
│   │   │                                         # Issues JWTs, manages users, RBAC roles.
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go                       # Entry point. Wires dependencies, starts
│   │   │                                         # Gin HTTP server and gRPC server.
│   │   ├── internal/                             # Private to this service; never imported
│   │   │   │                                     # by any other service package.
│   │   │   ├── handler/                          # HTTP handlers (Gin). One file per
│   │   │   │   ├── auth_handler.go               # resource group. Handles request parsing,
│   │   │   │   ├── user_handler.go               # validation, delegates to service layer.
│   │   │   │   └── health_handler.go             # GET /healthz and GET /readyz
│   │   │   ├── service/                          # Business logic. Orchestrates repository
│   │   │   │   ├── auth_service.go               # calls and external integrations.
│   │   │   │   ├── token_service.go              # JWT creation, refresh, revocation.
│   │   │   │   └── user_service.go               # User CRUD, password hashing.
│   │   │   ├── repository/                       # Database access layer (GORM).
│   │   │   │   ├── user_repository.go            # Implements UserRepository interface.
│   │   │   │   └── token_repository.go           # Refresh token store.
│   │   │   ├── middleware/                        # Gin middleware specific to this service.
│   │   │   │   ├── auth_middleware.go             # JWT validation for protected routes.
│   │   │   │   └── rate_limit_middleware.go       # Per-IP rate limiter (Redis-backed).
│   │   │   ├── model/                            # GORM model structs (DB schema DTOs).
│   │   │   │   ├── user.go
│   │   │   │   └── refresh_token.go
│   │   │   └── dto/                              # Request/response data transfer objects.
│   │   │       ├── login_request.go
│   │   │       └── token_response.go
│   │   ├── pkg/                                  # Exported packages that other services
│   │   │   │                                     # MAY import (e.g., shared client SDK).
│   │   │   └── authclient/                       # gRPC client stub for auth-service.
│   │   │       └── client.go                     # Thin wrapper over generated gRPC code.
│   │   ├── proto/                                # Service-local proto definitions
│   │   │   └── auth/v1/auth.proto                # AuthService gRPC contract.
│   │   ├── migrations/                           # SQL migrations specific to this service.
│   │   │   ├── 000001_create_users.up.sql
│   │   │   └── 000001_create_users.down.sql
│   │   ├── config/
│   │   │   └── config.go                         # Viper config struct and loader.
│   │   ├── Dockerfile                            # Multi-stage build: builder -> distroless.
│   │   ├── go.mod                                # Module: dcms/auth-service
│   │   └── go.sum
│   │
│   ├── container-service/                        # Container lifecycle management.
│   │   │                                         # Create, start, stop, remove, exec,
│   │   │                                         # inspect, rename, copy files.
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── container_handler.go          # CRUD + lifecycle endpoints.
│   │   │   │   ├── exec_handler.go               # WebSocket exec / attach endpoint.
│   │   │   │   └── health_handler.go
│   │   │   ├── service/
│   │   │   │   ├── container_service.go          # Orchestrates Docker SDK calls.
│   │   │   │   └── exec_service.go               # Container exec session management.
│   │   │   ├── repository/
│   │   │   │   └── container_repository.go       # Persists container metadata in Postgres.
│   │   │   ├── docker/                           # Thin wrapper around Moby SDK.
│   │   │   │   ├── client.go                     # Initialises docker.Client with TLS.
│   │   │   │   └── adapter.go                    # Maps SDK types to internal domain types.
│   │   │   ├── model/
│   │   │   │   └── container.go
│   │   │   ├── dto/
│   │   │   │   ├── create_container_request.go
│   │   │   │   └── container_response.go
│   │   │   └── middleware/
│   │   │       └── auth_middleware.go            # Validates JWT via authclient.
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/
│   │   │   └── config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/container-service
│   │   └── go.sum
│   │
│   ├── image-service/                            # Container image management.
│   │   │                                         # Pull, push, list, remove, inspect,
│   │   │                                         # build (via BuildKit), vulnerability scan.
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── image_handler.go
│   │   │   │   ├── registry_handler.go           # Private registry CRUD.
│   │   │   │   └── scan_handler.go               # Trigger + retrieve Trivy scans.
│   │   │   ├── service/
│   │   │   │   ├── image_service.go
│   │   │   │   ├── registry_service.go
│   │   │   │   └── scan_service.go               # Calls Trivy sidecar REST API.
│   │   │   ├── repository/
│   │   │   │   ├── image_repository.go
│   │   │   │   └── registry_repository.go
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   ├── image.go
│   │   │   │   ├── registry.go
│   │   │   │   └── scan_result.go
│   │   │   ├── dto/
│   │   │   └── middleware/
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/
│   │   │   └── config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/image-service
│   │   └── go.sum
│   │
│   ├── network-service/                          # Docker network management.
│   │   │                                         # Create, inspect, remove networks,
│   │   │                                         # connect/disconnect containers.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   └── network_handler.go
│   │   │   ├── service/
│   │   │   │   └── network_service.go
│   │   │   ├── repository/
│   │   │   │   └── network_repository.go
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   └── network.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/network-service
│   │   └── go.sum
│   │
│   ├── volume-service/                           # Docker volume management.
│   │   │                                         # CRUD, backup (tar archive to S3/local),
│   │   │                                         # restore, usage reporting.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── volume_handler.go
│   │   │   │   └── backup_handler.go
│   │   │   ├── service/
│   │   │   │   ├── volume_service.go
│   │   │   │   └── backup_service.go             # Tar, compress, upload to storage backend.
│   │   │   ├── repository/
│   │   │   │   └── volume_repository.go
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   ├── volume.go
│   │   │   │   └── backup.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/volume-service
│   │   └── go.sum
│   │
│   ├── monitor-service/                          # Container and host metrics collection.
│   │   │                                         # Streams Docker stats API, exposes
│   │   │                                         # Prometheus metrics, stores short-term
│   │   │                                         # time-series data in embedded TSDB.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── metrics_handler.go            # GET /metrics (Prometheus scrape endpoint)
│   │   │   │   └── stats_handler.go              # REST API for current/historical stats.
│   │   │   ├── service/
│   │   │   │   ├── collector_service.go          # Streams Docker stats per container.
│   │   │   │   ├── aggregator_service.go         # Aggregates raw stats into time buckets.
│   │   │   │   └── alert_service.go              # Threshold evaluation; emits events
│   │   │   │                                     # to notification-service via Redis pub/sub.
│   │   │   ├── repository/
│   │   │   │   └── metrics_repository.go         # Reads/writes embedded TSDB.
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   └── metric.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/monitor-service
│   │   └── go.sum
│   │
│   ├── log-service/                              # Container log aggregation and streaming.
│   │   │                                         # Tails Docker log driver output, ships
│   │   │                                         # to Loki, serves real-time WebSocket
│   │   │                                         # stream and paginated REST queries.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── log_handler.go                # REST: paginated log query.
│   │   │   │   └── stream_handler.go             # WebSocket: live log stream.
│   │   │   ├── service/
│   │   │   │   ├── log_service.go
│   │   │   │   ├── tail_service.go               # Reads from Docker log driver.
│   │   │   │   └── loki_service.go               # Ships batched logs to Loki push API.
│   │   │   ├── repository/
│   │   │   │   └── log_repository.go
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   └── log_entry.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/log-service
│   │   └── go.sum
│   │
│   ├── cluster-service/                          # Docker Swarm cluster management.
│   │   │                                         # Node registration, service deployment,
│   │   │                                         # stack management, rolling updates.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── cluster_handler.go
│   │   │   │   ├── node_handler.go
│   │   │   │   └── service_handler.go            # Swarm service (not Go service) CRUD.
│   │   │   ├── service/
│   │   │   │   ├── cluster_service.go
│   │   │   │   ├── node_service.go
│   │   │   │   └── deployment_service.go         # Rolling update orchestration.
│   │   │   ├── repository/
│   │   │   │   ├── cluster_repository.go
│   │   │   │   └── node_repository.go
│   │   │   ├── agent/                            # gRPC client to remote agents.
│   │   │   │   ├── client.go
│   │   │   │   └── pool.go                       # Connection pool across cluster nodes.
│   │   │   ├── docker/
│   │   │   │   └── client.go
│   │   │   ├── model/
│   │   │   │   ├── cluster.go
│   │   │   │   └── node.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/cluster-service
│   │   └── go.sum
│   │
│   ├── notification-service/                     # Alert and notification delivery.
│   │   │                                         # Receives events from Redis pub/sub,
│   │   │                                         # dispatches to email, Slack, webhooks.
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── handler/
│   │   │   │   ├── notification_handler.go       # REST: notification history, preferences.
│   │   │   │   └── webhook_handler.go            # CRUD for webhook destinations.
│   │   │   ├── service/
│   │   │   │   ├── notification_service.go
│   │   │   │   ├── email_service.go
│   │   │   │   ├── slack_service.go
│   │   │   │   └── webhook_service.go
│   │   │   ├── subscriber/                       # Redis pub/sub consumer.
│   │   │   │   └── event_subscriber.go
│   │   │   ├── repository/
│   │   │   │   ├── notification_repository.go
│   │   │   │   └── webhook_repository.go
│   │   │   ├── template/                         # HTML email templates.
│   │   │   │   ├── alert.html.tmpl
│   │   │   │   └── digest.html.tmpl
│   │   │   ├── model/
│   │   │   │   ├── notification.go
│   │   │   │   └── webhook.go
│   │   │   └── dto/
│   │   ├── pkg/
│   │   ├── migrations/
│   │   ├── config/config.go
│   │   ├── Dockerfile
│   │   ├── go.mod                                # Module: dcms/notification-service
│   │   └── go.sum
│   │
│   └── agent/                                    # Lightweight host agent.
│       │                                         # Deployed on each managed Docker host.
│       │                                         # Relays Docker daemon data back to
│       │                                         # cluster-service via mTLS gRPC.
│       ├── cmd/
│       │   └── agent/
│       │       └── main.go                       # Single binary entry point.
│       ├── internal/
│       │   ├── docker/                           # Docker daemon client (local socket).
│       │   │   ├── client.go
│       │   │   └── poller.go                     # Polls containers/events at interval.
│       │   ├── grpc/                             # gRPC server exposing agent API.
│       │   │   ├── server.go
│       │   │   └── handler.go                    # Implements AgentService proto.
│       │   ├── heartbeat/                        # Periodic heartbeat to cluster-service.
│       │   │   └── heartbeat.go
│       │   └── sysinfo/                          # Host system metrics (gopsutil).
│       │       └── collector.go
│       ├── proto/                                # Agent-specific proto (symlinked from
│       │   └── agent/v1/agent.proto              # /proto/agent/v1/agent.proto).
│       ├── config/
│       │   └── config.go
│       ├── Dockerfile                            # Scratch-based image; statically linked.
│       ├── go.mod                                # Module: dcms/agent
│       └── go.sum
│
├── frontend/                                     # React 18 / TypeScript 5.4 / Vite 5 SPA.
│   │                                             # Single deployable unit served by Nginx.
│   ├── src/
│   │   ├── components/                           # Reusable UI building blocks.
│   │   │   ├── ui/                               # Primitive design-system components.
│   │   │   │   ├── Button.tsx                    # Variants: primary, secondary, danger.
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Modal.tsx                     # Wraps Radix Dialog.
│   │   │   │   ├── Table.tsx                     # Sortable, paginated data table.
│   │   │   │   ├── Badge.tsx                     # Status badges (running, stopped, etc.)
│   │   │   │   ├── Spinner.tsx
│   │   │   │   ├── Toast.tsx                     # Wraps Radix Toast.
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   ├── Dropdown.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── Switch.tsx
│   │   │   │   ├── Checkbox.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Separator.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   └── CodeBlock.tsx                 # Syntax-highlighted code display.
│   │   │   ├── containers/                       # Container-domain components.
│   │   │   │   ├── ContainerCard.tsx             # Summary card for grid view.
│   │   │   │   ├── ContainerTable.tsx            # Tabular list with bulk actions.
│   │   │   │   ├── ContainerDetail.tsx           # Full inspect panel.
│   │   │   │   ├── ContainerActions.tsx          # Start/stop/restart/remove actions.
│   │   │   │   ├── ContainerLogs.tsx             # Embedded log viewer.
│   │   │   │   ├── ContainerExec.tsx             # xterm.js exec terminal.
│   │   │   │   └── ContainerStats.tsx            # CPU/mem/net mini charts.
│   │   │   ├── images/                           # Image-domain components.
│   │   │   │   ├── ImageTable.tsx
│   │   │   │   ├── ImageDetail.tsx
│   │   │   │   ├── ImagePullForm.tsx
│   │   │   │   └── ScanResultsPanel.tsx          # Trivy vulnerability report.
│   │   │   ├── networks/
│   │   │   │   ├── NetworkTable.tsx
│   │   │   │   └── NetworkDetail.tsx
│   │   │   ├── volumes/
│   │   │   │   ├── VolumeTable.tsx
│   │   │   │   └── VolumeDetail.tsx
│   │   │   ├── monitoring/                       # Metrics and alerting components.
│   │   │   │   ├── CpuChart.tsx
│   │   │   │   ├── MemoryChart.tsx
│   │   │   │   ├── NetworkChart.tsx
│   │   │   │   ├── DiskChart.tsx
│   │   │   │   ├── AlertRuleForm.tsx
│   │   │   │   └── AlertHistory.tsx
│   │   │   ├── clusters/
│   │   │   │   ├── ClusterCard.tsx
│   │   │   │   ├── NodeTable.tsx
│   │   │   │   └── SwarmServiceTable.tsx
│   │   │   └── layout/                           # Application shell components.
│   │   │       ├── AppShell.tsx                  # Root layout with sidebar + main area.
│   │   │       ├── Sidebar.tsx                   # Navigation sidebar with collapse.
│   │   │       ├── TopBar.tsx                    # Header: breadcrumb, user menu, search.
│   │   │       ├── Breadcrumb.tsx
│   │   │       └── PageContainer.tsx             # Consistent page-level wrapper.
│   │   │
│   │   ├── pages/                                # Route-level page components.
│   │   │   │                                     # Each page owns its data-fetching hooks
│   │   │   │                                     # and passes data to domain components.
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.tsx             # System overview: counts, health, charts.
│   │   │   ├── containers/
│   │   │   │   ├── ContainerListPage.tsx
│   │   │   │   └── ContainerDetailPage.tsx
│   │   │   ├── images/
│   │   │   │   ├── ImageListPage.tsx
│   │   │   │   └── ImageDetailPage.tsx
│   │   │   ├── networks/
│   │   │   │   ├── NetworkListPage.tsx
│   │   │   │   └── NetworkDetailPage.tsx
│   │   │   ├── volumes/
│   │   │   │   ├── VolumeListPage.tsx
│   │   │   │   └── VolumeDetailPage.tsx
│   │   │   ├── monitoring/
│   │   │   │   └── MonitoringPage.tsx
│   │   │   ├── logs/
│   │   │   │   └── LogsPage.tsx                  # Full-page log viewer with filter bar.
│   │   │   ├── clusters/
│   │   │   │   ├── ClusterListPage.tsx
│   │   │   │   └── ClusterDetailPage.tsx
│   │   │   ├── settings/
│   │   │   │   ├── SettingsPage.tsx
│   │   │   │   ├── NotificationSettingsPage.tsx
│   │   │   │   └── RegistrySettingsPage.tsx
│   │   │   └── auth/
│   │   │       ├── LoginPage.tsx
│   │   │       └── ProfilePage.tsx
│   │   │
│   │   ├── stores/                               # Zustand stores — client-only UI state.
│   │   │   ├── authStore.ts                      # Token, current user, permissions.
│   │   │   ├── uiStore.ts                        # Sidebar open/closed, theme, toasts.
│   │   │   ├── filterStore.ts                    # Shared table filter/sort state.
│   │   │   └── clusterStore.ts                   # Active cluster selection.
│   │   │
│   │   ├── hooks/                                # Custom React hooks.
│   │   │   ├── useContainers.ts                  # React Query hooks for containers API.
│   │   │   ├── useImages.ts
│   │   │   ├── useNetworks.ts
│   │   │   ├── useVolumes.ts
│   │   │   ├── useMonitoring.ts
│   │   │   ├── useLogs.ts
│   │   │   ├── useClusters.ts
│   │   │   ├── useWebSocket.ts                   # Reconnecting WebSocket abstraction.
│   │   │   ├── useTerminal.ts                    # xterm.js lifecycle management.
│   │   │   └── useDebounce.ts
│   │   │
│   │   ├── api/                                  # API client layer.
│   │   │   ├── client.ts                         # Axios instance with JWT interceptors.
│   │   │   ├── containers.ts                     # Container API request functions.
│   │   │   ├── images.ts
│   │   │   ├── networks.ts
│   │   │   ├── volumes.ts
│   │   │   ├── monitoring.ts
│   │   │   ├── logs.ts
│   │   │   ├── clusters.ts
│   │   │   ├── auth.ts
│   │   │   ├── notifications.ts
│   │   │   └── queryKeys.ts                      # Centralized React Query key factory.
│   │   │
│   │   ├── types/                                # TypeScript interfaces and type aliases.
│   │   │   ├── container.ts
│   │   │   ├── image.ts
│   │   │   ├── network.ts
│   │   │   ├── volume.ts
│   │   │   ├── metric.ts
│   │   │   ├── log.ts
│   │   │   ├── cluster.ts
│   │   │   ├── notification.ts
│   │   │   ├── auth.ts
│   │   │   └── api.ts                            # Generic API response wrappers, pagination.
│   │   │
│   │   ├── utils/                                # Pure utility functions.
│   │   │   ├── bytes.ts                          # Human-readable bytes formatting.
│   │   │   ├── duration.ts                       # Uptime / duration formatting.
│   │   │   ├── color.ts                          # Status-to-colour mappings.
│   │   │   └── cn.ts                             # clsx + tailwind-merge helper.
│   │   │
│   │   ├── router.tsx                            # React Router v6 route definitions.
│   │   ├── main.tsx                              # Application entry point.
│   │   └── App.tsx                               # Root component: providers, theme setup.
│   │
│   ├── public/                                   # Static assets served directly by Vite.
│   │   ├── favicon.ico
│   │   └── logo.svg
│   │
│   ├── tests/
│   │   ├── unit/                                 # Vitest unit tests (co-located .test.tsx
│   │   │                                         # files are also acceptable per component).
│   │   ├── e2e/                                  # Playwright E2E tests.
│   │   │   ├── containers.spec.ts
│   │   │   ├── images.spec.ts
│   │   │   └── auth.spec.ts
│   │   └── mocks/                                # MSW request handlers for tests.
│   │       └── handlers.ts
│   │
│   ├── package.json
│   ├── package-lock.json                         # Lockfile committed to VCS.
│   ├── vite.config.ts                            # Vite build config; proxy to API gateway.
│   ├── vitest.config.ts                          # Vitest configuration.
│   ├── playwright.config.ts                      # Playwright project configuration.
│   ├── tailwind.config.ts                        # Tailwind theme extension.
│   ├── postcss.config.js
│   ├── tsconfig.json                             # Base TS config (strict: true).
│   ├── tsconfig.app.json                         # App-specific TS config.
│   ├── eslint.config.js                          # ESLint flat config.
│   ├── .prettierrc                               # Prettier config.
│   └── Dockerfile                                # Multi-stage: node build -> nginx:alpine.
│
├── infra/                                        # All infrastructure-as-code and
│   │                                             # environment configuration.
│   ├── docker-compose/
│   │   ├── docker-compose.yml                    # Full dev environment: all services,
│   │   │                                         # Postgres, Redis, Loki, Prometheus,
│   │   │                                         # Grafana, Jaeger, Trivy server, Kong.
│   │   ├── docker-compose.prod.yml               # Production overrides: resource limits,
│   │   │                                         # secrets from Docker secrets, no debug.
│   │   └── docker-compose.test.yml               # Minimal stack for integration tests:
│   │                                             # Postgres + Redis + service under test.
│   │
│   ├── swarm/                                    # Docker Swarm deployment.
│   │   ├── stack.yml                             # Full Swarm stack definition.
│   │   ├── configs/                              # Docker configs (non-secret config files).
│   │   │   ├── kong.yml                          # Kong declarative config (deck format).
│   │   │   ├── prometheus.yml                    # Prometheus scrape config.
│   │   │   └── otel-collector.yml                # OpenTelemetry Collector pipeline.
│   │   └── secrets/                              # Docker secrets references (not values).
│   │       └── README.md                         # Instructions for injecting secrets.
│   │
│   ├── helm/                                     # Kubernetes Helm charts (Phase 2 target).
│   │   └── dcms/                                 # Umbrella chart.
│   │       ├── Chart.yaml
│   │       ├── values.yaml
│   │       └── templates/
│   │
│   ├── prometheus/
│   │   ├── prometheus.yml                        # Scrape jobs for all services.
│   │   └── rules/
│   │       ├── container_alerts.yml
│   │       └── service_alerts.yml
│   │
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── dashboards/
│   │   │   │   ├── dcms-overview.json            # System overview dashboard.
│   │   │   │   ├── container-metrics.json
│   │   │   │   └── service-latency.json
│   │   │   └── datasources/
│   │   │       └── datasources.yaml              # Prometheus + Loki datasources.
│   │   └── grafana.ini
│   │
│   └── loki/
│       └── loki-config.yaml                      # Loki single-binary config for dev;
│                                                 # microservices mode config for prod.
│
├── proto/                                        # Canonical gRPC proto definitions.
│   │                                             # These are the ONLY approved contracts
│   │                                             # for inter-service communication.
│   │                                             # Each service generates its own stubs
│   │                                             # locally via buf generate.
│   ├── buf.yaml                                  # Buf module configuration.
│   ├── buf.gen.yaml                              # Code generation config (Go + gateway).
│   └── agent/
│       └── v1/
│           └── agent.proto                       # AgentService: Heartbeat, GetStats,
│                                                 # ListContainers, ExecuteCommand.
│
├── db/                                           # Database artefacts shared across services.
│   ├── migrations/                               # Master migration index (each service
│   │   │                                         # has its own migrations/ folder; this
│   │   │                                         # directory holds cross-service schema
│   │   │                                         # documentation only).
│   │   └── README.md
│   └── seeds/                                    # Development seed data scripts.
│       ├── 001_seed_users.sql
│       └── 002_seed_registries.sql
│
├── scripts/                                      # Developer and CI utility scripts.
│   ├── setup-dev.sh                              # Bootstraps local dev env: installs
│   │                                             # tools, starts docker-compose, runs
│   │                                             # migrations, seeds DB.
│   ├── run-tests.sh                              # Runs unit + integration tests for all
│   │                                             # services and the frontend.
│   ├── release.sh                                # Tags, builds, and pushes release images.
│   ├── gen-proto.sh                              # Runs buf generate for all proto files.
│   ├── check-deps.sh                             # Validates go.mod versions against
│   │                                             # dependency_manifest.lock (CI gate).
│   └── lint-all.sh                               # Runs golangci-lint + eslint across repo.
│
├── docs/                                         # Project documentation.
│   ├── architecture/
│   │   ├── system-overview.md
│   │   └── adr/                                  # Architecture Decision Records.
│   │       ├── 001-monorepo-structure.md
│   │       ├── 002-grpc-for-agent.md
│   │       └── 003-kong-api-gateway.md
│   ├── api/
│   │   └── openapi.yaml                          # OpenAPI 3.1 spec (generated from
│   │                                             # grpc-gateway annotations).
│   └── runbooks/
│       ├── incident-response.md
│       └── dependency-update.md
│
├── Makefile                                       # Top-level convenience targets.
│                                                 # make build, make test, make lint,
│                                                 # make proto, make dev, make release.
└── README.md                                     # Repository overview, quick-start guide.
```


## Naming Conventions

### Go Packages

| Scope | Convention | Example |
|---|---|---|
| Package names | Single lowercase word; no underscores | `handler`, `service`, `repository` |
| File names | `snake_case`, noun-first for types | `container_handler.go`, `user_service.go` |
| Interface names | Noun or noun phrase, no "I" prefix | `ContainerRepository`, `TokenService` |
| Constructor functions | `New<Type>` | `NewContainerHandler`, `NewUserService` |
| Error variables | `Err<Reason>` (exported) or `err<Reason>` (unexported) | `ErrContainerNotFound`, `ErrUnauthorized` |
| Constants | `UPPER_SNAKE_CASE` for package-level config; `CamelCase` for typed constants | `DefaultTimeoutSeconds`, `StatusRunning` |
| Test files | Same file name with `_test.go` suffix | `container_service_test.go` |
| Mock files | Generated by mockgen; placed in `internal/mock/` sub-package | `mock/mock_container_repository.go` |

### Go Modules

Each service module is named `dcms/<service-name>` (e.g., `dcms/container-service`). The shared proto stubs generated into each service are placed in the `gen/` directory and are not committed; they are regenerated in CI.

### TypeScript / React

| Scope | Convention | Example |
|---|---|---|
| Component files | `PascalCase.tsx` | `ContainerCard.tsx`, `AppShell.tsx` |
| Hook files | `camelCase.ts`, prefixed with `use` | `useContainers.ts`, `useWebSocket.ts` |
| Store files | `camelCase` + `Store` suffix | `authStore.ts`, `uiStore.ts` |
| API module files | `camelCase.ts`, noun matching domain | `containers.ts`, `images.ts` |
| Type files | `camelCase.ts`, noun matching domain | `container.ts`, `metric.ts` |
| Utility files | `camelCase.ts`, descriptive noun | `bytes.ts`, `duration.ts` |
| Test files | Same name with `.test.ts(x)` suffix | `ContainerCard.test.tsx` |
| E2E spec files | `<feature>.spec.ts` | `containers.spec.ts` |
| CSS classes | Tailwind utilities only; no custom class names unless extracted to `@layer components` |
| Constants | `UPPER_SNAKE_CASE` in a `constants.ts` file per domain | `MAX_CONTAINER_NAME_LENGTH` |

### Docker Images

All DCMS service images follow the naming pattern: `ghcr.io/dcms/<service-name>:<version>`.

Tag format: `YYYY.MM.DD-<short-sha>` for pre-release builds; `vMAJOR.MINOR.PATCH` for releases.


## Inter-Service Dependency Rules

These rules are enforced by `scripts/check-deps.sh` in CI and reviewed at each dependency gate.

### Rule 1: No Cross-Service Internal Package Imports

Services **must not** import each other's `internal/` packages. The `internal` directory is a Go language-level enforcement mechanism — Go will reject such imports at compile time. This rule is the primary isolation boundary.

```
# FORBIDDEN
import "dcms/container-service/internal/service"  // from any other service

# ALLOWED
import "dcms/auth-service/pkg/authclient"         // public pkg/ only
```

### Rule 2: gRPC Contracts Are the Only Cross-Service Communication Path

All synchronous cross-service calls must go through the gRPC contracts defined in `/proto/`. No shared domain structs or HTTP client calls between services. This enforces schema evolution through backward-compatible proto changes.

```
# FORBIDDEN — direct HTTP call to another service
resp, _ := http.Get("http://auth-service/internal/users")

# REQUIRED — use generated gRPC client
authClient.ValidateToken(ctx, &authv1.ValidateTokenRequest{Token: token})
```

### Rule 3: Asynchronous Communication via Redis Pub/Sub Only

For event-driven flows (e.g., monitor-service emitting a threshold alert consumed by notification-service), the only approved async mechanism is Redis pub/sub. Message schemas are defined as protobuf messages in `/proto/events/`.

### Rule 4: Shared Database Access Is Forbidden

Each service owns exactly one logical database schema (its own Postgres schema or database). No service may connect to another service's database. Shared data is accessed through the owning service's API.

### Rule 5: The `pkg/` Directory Is the Only Shareable Internal Code

A service may expose code to other services only through its `pkg/` directory. Everything under `internal/` is strictly private. Currently approved cross-service `pkg` exports:

| Service | Exported Package | Consumer(s) |
|---|---|---|
| auth-service | `pkg/authclient` | All other services (JWT validation) |
| cluster-service | `pkg/agentclient` | monitor-service, log-service |

### Rule 6: No Service May Import the Agent Module

The `agent` binary is a leaf node in the dependency graph. It depends on services (via gRPC) but no service may import the agent's packages. The agent's proto stubs are generated independently per consumer.

### Rule 7: Dependency Manifest Is Authoritative

Any dependency not listed in `dependency_manifest.lock` is **blocked** at the CI dependency gate (`scripts/check-deps.sh`). Adding a new dependency requires:
1. A PR updating `dependency_manifest.lock` and `approved_packages.json`.
2. Approval from the `dependency_manager_agent` role (enforced via CODEOWNERS).
3. The gate check must pass before any service PR referencing the new dependency can merge.
