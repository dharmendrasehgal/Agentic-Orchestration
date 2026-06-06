// =============================================================================
// DCMS Frontend — Shared TypeScript Types
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ContainerStatus {
  Creating = 'creating',
  Running = 'running',
  Paused = 'paused',
  Restarting = 'restarting',
  Removing = 'removing',
  Exited = 'exited',
  Dead = 'dead',
  Stopped = 'stopped',
}

export enum ScanStatus {
  Pending = 'pending',
  Scanning = 'scanning',
  Completed = 'completed',
  Failed = 'failed',
}

export enum NetworkDriver {
  Bridge = 'bridge',
  Host = 'host',
  Overlay = 'overlay',
  Macvlan = 'macvlan',
  None = 'none',
}

export enum NodeStatus {
  Active = 'active',
  Drain = 'drain',
  Pause = 'pause',
  Unavailable = 'unavailable',
}

export enum AlertSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

export enum AlertStatus {
  Firing = 'firing',
  Resolved = 'resolved',
  Acknowledged = 'acknowledged',
  Silenced = 'silenced',
}

export enum UserRole {
  Admin = 'admin',
  Operator = 'operator',
  Developer = 'developer',
  Viewer = 'viewer',
}

// ---------------------------------------------------------------------------
// Container domain
// ---------------------------------------------------------------------------

export interface ContainerPort {
  containerPort: number;
  hostPort: number | null;
  protocol: 'tcp' | 'udp';
  hostIp?: string;
}

export interface ContainerMount {
  type: 'bind' | 'volume' | 'tmpfs';
  source: string;
  destination: string;
  mode: string;
  readWrite: boolean;
}

export interface ContainerNetworkEndpoint {
  networkId: string;
  networkName: string;
  ipAddress: string;
  gateway: string;
  macAddress: string;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: ContainerStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  restartCount: number;
  command: string[];
  entrypoint: string[];
  env: string[];
  labels: Record<string, string>;
  ports: ContainerPort[];
  mounts: ContainerMount[];
  networks: ContainerNetworkEndpoint[];
  namespace: string;
  nodeId: string;
  nodeName: string;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
}

export interface ContainerStats {
  containerId: string;
  timestamp: string;
  cpuPercent: number;
  cpuSystemDelta: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
}

export interface ContainerCreateRequest {
  name: string;
  image: string;
  namespace: string;
  command?: string[];
  entrypoint?: string[];
  env?: string[];
  labels?: Record<string, string>;
  ports?: ContainerPort[];
  mounts?: ContainerMount[];
  networkMode?: string;
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  memoryLimitBytes?: number;
  cpuQuota?: number;
  cpuPeriod?: number;
  nodeId?: string;
}

// ---------------------------------------------------------------------------
// Image domain
// ---------------------------------------------------------------------------

export enum VulnerabilitySeverity {
  Critical = 'CRITICAL',
  High = 'HIGH',
  Medium = 'MEDIUM',
  Low = 'LOW',
  Negligible = 'NEGLIGIBLE',
  Unknown = 'UNKNOWN',
}

export interface Vulnerability {
  id: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string | null;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  cvss: number | null;
  references: string[];
}

export interface ImageScanResult {
  imageId: string;
  status: ScanStatus;
  scannedAt: string | null;
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    negligible: number;
    unknown: number;
  };
}

export interface Image {
  id: string;
  repoTags: string[];
  repoDigests: string[];
  createdAt: string;
  sizeBytes: number;
  architecture: string;
  os: string;
  labels: Record<string, string>;
  scanResult: ImageScanResult | null;
  inUse: boolean;
}

// ---------------------------------------------------------------------------
// Network domain
// ---------------------------------------------------------------------------

export interface IpamConfig {
  subnet: string;
  ipRange: string | null;
  gateway: string;
}

export interface Network {
  id: string;
  name: string;
  driver: NetworkDriver;
  scope: 'local' | 'swarm' | 'global';
  internal: boolean;
  attachable: boolean;
  ingress: boolean;
  ipv6Enabled: boolean;
  ipamConfigs: IpamConfig[];
  labels: Record<string, string>;
  options: Record<string, string>;
  createdAt: string;
  containers: Record<string, { name: string; ipv4Address: string; ipv6Address: string; macAddress: string }>;
}

// ---------------------------------------------------------------------------
// Volume domain
// ---------------------------------------------------------------------------

export interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
  scope: 'local' | 'global';
  labels: Record<string, string>;
  options: Record<string, string>;
  createdAt: string;
  usageBytes: number | null;
  refCount: number | null;
  nodeId: string;
  nodeName: string;
}

// ---------------------------------------------------------------------------
// Cluster / Node domain
// ---------------------------------------------------------------------------

export interface NodeResources {
  cpuCount: number;
  memoryBytes: number;
  diskBytes: number;
}

export interface NodeStats {
  cpuPercent: number;
  memoryUsedBytes: number;
  diskUsedBytes: number;
  containerCount: number;
  runningContainerCount: number;
}

export interface Node {
  id: string;
  hostname: string;
  ip: string;
  status: NodeStatus;
  role: 'manager' | 'worker';
  availability: 'active' | 'pause' | 'drain';
  engineVersion: string;
  os: string;
  architecture: string;
  resources: NodeResources;
  stats: NodeStats | null;
  labels: Record<string, string>;
  joinedAt: string;
  lastSeenAt: string;
}

export interface Cluster {
  id: string;
  name: string;
  swarmId: string | null;
  nodes: Node[];
  managerCount: number;
  workerCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Alerting domain
// ---------------------------------------------------------------------------

export type AlertRuleMetric = 'cpu_percent' | 'memory_percent' | 'restart_count' | 'exit_code';

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertRuleMetric;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  durationSeconds: number;
  severity: AlertSeverity;
  namespaces: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  containerId: string | null;
  containerName: string | null;
  nodeId: string | null;
  nodeName: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ---------------------------------------------------------------------------
// Auth / User domain
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  namespaces: string[];
  createdAt: string;
  lastLoginAt: string | null;
  oidcProvider: string | null;
  mfaEnabled: boolean;
}

// ---------------------------------------------------------------------------
// API utilities
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  containerId: string;
  containerName: string;
  timestamp: string;
  stream: 'stdout' | 'stderr';
  message: string;
}

// ---------------------------------------------------------------------------
// SSE event discriminated union
// ---------------------------------------------------------------------------

export interface SseContainerStatusEvent {
  type: 'container.status';
  data: {
    containerId: string;
    containerName: string;
    previousStatus: ContainerStatus;
    currentStatus: ContainerStatus;
    namespace: string;
    timestamp: string;
  };
}

export interface SseContainerStatsEvent {
  type: 'container.stats';
  data: ContainerStats;
}

export interface SseContainerLogEvent {
  type: 'container.log';
  data: LogEntry;
}

export interface SseNodeStatusEvent {
  type: 'node.status';
  data: {
    nodeId: string;
    nodeName: string;
    previousStatus: NodeStatus;
    currentStatus: NodeStatus;
    timestamp: string;
  };
}

export interface SseAlertFiredEvent {
  type: 'alert.fired';
  data: Alert;
}

export interface SseAlertResolvedEvent {
  type: 'alert.resolved';
  data: Alert;
}

export interface SseAuditEvent {
  type: 'audit.event';
  data: {
    id: string;
    userId: string;
    userEmail: string;
    action: string;
    resource: string;
    resourceId: string;
    namespace: string;
    timestamp: string;
    metadata: Record<string, unknown>;
  };
}

export interface SseHeartbeatEvent {
  type: 'heartbeat';
  data: { timestamp: string };
}

export type SseEvent =
  | SseContainerStatusEvent
  | SseContainerStatsEvent
  | SseContainerLogEvent
  | SseNodeStatusEvent
  | SseAlertFiredEvent
  | SseAlertResolvedEvent
  | SseAuditEvent
  | SseHeartbeatEvent;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  durationMs?: number;
}

export interface ContainerFilters {
  status?: ContainerStatus | 'all';
  search?: string;
  namespace?: string;
  nodeId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'status' | 'cpuPercent' | 'memoryUsageBytes' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
