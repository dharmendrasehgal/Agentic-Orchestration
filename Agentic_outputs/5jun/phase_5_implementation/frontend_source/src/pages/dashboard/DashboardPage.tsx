// =============================================================================
// DCMS Frontend — DashboardPage
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import StatusBadge from '../../components/ui/StatusBadge';
import type {
  Cluster,
  ContainerStats,
  SseAuditEvent,
  SseEvent,
} from '../../types/index';
import { ContainerStatus, NodeStatus } from '../../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardSummary {
  running: number;
  stopped: number;
  error: number;
  totalImages: number;
}

interface SparkDataPoint {
  time: string;
  value: number;
}

interface RecentAuditEvent {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userEmail: string;
  namespace: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: number | string;
  delta?: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'gray';
  link?: string;
}

const COLOR_MAP: Record<StatCardProps['color'], string> = {
  blue: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900',
  green: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900',
  red: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900',
  gray: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700',
};

const StatCard: React.FC<StatCardProps> = ({ title, value, delta, icon, color, link }) => {
  const inner = (
    <div
      className={[
        'rounded-xl border p-5 flex items-start gap-4',
        link ? 'hover:shadow-md transition-shadow cursor-pointer' : '',
        'bg-white dark:bg-slate-900',
      ].join(' ')}
    >
      <div className={['rounded-lg p-2.5 border', COLOR_MAP[color]].join(' ')}>{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
          {value}
        </p>
        {delta !== undefined && (
          <p
            className={[
              'mt-1 text-xs font-medium',
              delta >= 0 ? 'text-emerald-600' : 'text-red-500',
            ].join(' ')}
          >
            {delta >= 0 ? '+' : ''}{delta} from last hour
          </p>
        )}
      </div>
    </div>
  );

  if (link) {
    return <Link to={link} className="no-underline">{inner}</Link>;
  }
  return inner;
};

// ---------------------------------------------------------------------------
// Sparkline chart
// ---------------------------------------------------------------------------

const Sparkline: React.FC<{
  data: SparkDataPoint[];
  color: string;
  label: string;
  unit?: string;
}> = ({ data, color, label, unit = '%' }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{label}</p>
    {data.length === 0 ? (
      <div className="h-20 flex items-center justify-center text-xs text-slate-400">
        Waiting for data…
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
            formatter={(v: number) => [`${v.toFixed(1)}${unit}`, label]}
            labelFormatter={() => ''}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${label})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    )}
    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
      Current: {data.length > 0 ? `${data[data.length - 1].value.toFixed(1)}${unit}` : '—'}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Cluster health table
// ---------------------------------------------------------------------------

const ClusterHealthTable: React.FC<{ cluster: Cluster | undefined; isLoading: boolean }> = ({
  cluster,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }
  if (!cluster || cluster.nodes.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
        No cluster nodes registered.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Cluster node health">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th scope="col" className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Hostname</th>
            <th scope="col" className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
            <th scope="col" className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Containers</th>
            <th scope="col" className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">CPU%</th>
            <th scope="col" className="text-right py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Mem%</th>
          </tr>
        </thead>
        <tbody>
          {cluster.nodes.map((node) => {
            const memPct = node.stats && node.resources.memoryBytes > 0
              ? ((node.stats.memoryUsedBytes / node.resources.memoryBytes) * 100).toFixed(1)
              : '—';
            return (
              <tr key={node.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="py-2 pr-4">
                  <Link
                    to={`/clusters/${node.id}`}
                    className="font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {node.hostname}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">{node.role}</span>
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge
                    status={
                      node.status === NodeStatus.Active
                        ? ContainerStatus.Running
                        : node.status === NodeStatus.Unavailable
                        ? ContainerStatus.Dead
                        : ContainerStatus.Paused
                    }
                    size="sm"
                    showLabel={false}
                  />
                  <span className="ml-1.5 text-xs text-slate-600 dark:text-slate-400 capitalize">{node.status}</span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {node.stats
                    ? `${node.stats.runningContainerCount}/${node.stats.containerCount}`
                    : '—'}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {node.stats ? `${node.stats.cpuPercent.toFixed(1)}%` : '—'}
                </td>
                <td className="py-2 text-right tabular-nums">{memPct !== '—' ? `${memPct}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recent events feed (SSE)
// ---------------------------------------------------------------------------

const MAX_EVENTS = 10;

const RecentEventsFeed: React.FC = () => {
  const [events, setEvents] = useState<RecentAuditEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiUrl = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? '/api/v1';
    const es = new EventSource(`${apiUrl}/events/stream`, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const parsed: SseEvent = JSON.parse(evt.data);
        if (parsed.type === 'audit.event') {
          const ae = (parsed as SseAuditEvent).data;
          setEvents((prev) => {
            const next: RecentAuditEvent[] = [
              {
                id: ae.id,
                action: ae.action,
                resource: ae.resource,
                resourceId: ae.resourceId,
                userEmail: ae.userEmail,
                namespace: ae.namespace,
                timestamp: ae.timestamp,
              },
              ...prev,
            ];
            return next.slice(0, MAX_EVENTS);
          });
        }
      } catch {
        // malformed — skip
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
        No recent events. Actions will appear here in real-time.
      </p>
    );
  }

  return (
    <ul className="space-y-1" aria-label="Recent audit events">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
              <span className="font-medium text-blue-600 dark:text-blue-400">{ev.action}</span>
              {' '}
              <span className="text-slate-500 dark:text-slate-400">{ev.resource}</span>
              {' '}
              <span className="font-mono text-xs text-slate-400">{ev.resourceId.slice(0, 12)}</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {ev.userEmail} · {ev.namespace} · {new Date(ev.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

const DashboardPage: React.FC = () => {
  const activeNamespace = useUiStore((s) => s.activeNamespace);
  const navigate = useNavigate();

  // Summary stats
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard', 'summary', activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardSummary>('/dashboard/summary', {
        params: { namespace: activeNamespace },
      });
      return data;
    },
    refetchInterval: 15_000,
  });

  // Cluster
  const { data: cluster, isLoading: clusterLoading } = useQuery({
    queryKey: ['dashboard', 'cluster'],
    queryFn: async () => {
      const { data } = await apiClient.get<Cluster>('/clusters/default');
      return data;
    },
    refetchInterval: 30_000,
  });

  // Live sparklines — seed with 30 data points collected from stats SSE
  const [cpuHistory, setCpuHistory] = useState<SparkDataPoint[]>([]);
  const [memHistory, setMemHistory] = useState<SparkDataPoint[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiUrl = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? '/api/v1';
    const es = new EventSource(`${apiUrl}/dashboard/stats/stream?namespace=${activeNamespace}`, {
      withCredentials: true,
    });
    esRef.current = es;

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const stats: ContainerStats = JSON.parse(evt.data);
        const time = new Date(stats.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setCpuHistory((prev) => {
          const next = [...prev, { time, value: stats.cpuPercent }];
          return next.length > 30 ? next.slice(next.length - 30) : next;
        });
        setMemHistory((prev) => {
          const next = [...prev, { time, value: stats.memoryPercent }];
          return next.length > 30 ? next.slice(next.length - 30) : next;
        });
      } catch {
        // skip
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [activeNamespace]);

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          System overview for namespace{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{activeNamespace}</span>
        </p>
      </div>

      {/* Stats cards */}
      <section aria-label="Summary statistics">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Running Containers"
            value={summaryLoading ? '…' : (summary?.running ?? 0)}
            color="green"
            link="/containers"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Stopped Containers"
            value={summaryLoading ? '…' : (summary?.stopped ?? 0)}
            color="gray"
            link="/containers"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10h6v4H9z" />
              </svg>
            }
          />
          <StatCard
            title="Error Containers"
            value={summaryLoading ? '…' : (summary?.error ?? 0)}
            color="red"
            link="/containers"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <StatCard
            title="Total Images"
            value={summaryLoading ? '…' : (summary?.totalImages ?? 0)}
            color="blue"
            link="/images"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Sparklines */}
      <section aria-label="Resource usage over the last 5 minutes">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Resource Usage (last 5 min)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Sparkline data={cpuHistory} color="#3b82f6" label="Aggregate CPU Usage" unit="%" />
          <Sparkline data={memHistory} color="#8b5cf6" label="Aggregate Memory Usage" unit="%" />
        </div>
      </section>

      {/* Cluster health + Recent events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="Cluster node health"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Cluster Health
            </h2>
            <Link
              to="/clusters"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all
            </Link>
          </div>
          <ClusterHealthTable cluster={cluster} isLoading={clusterLoading} />
        </section>

        <section
          aria-label="Recent events"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Recent Events
          </h2>
          <RecentEventsFeed />
        </section>
      </div>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/images')}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-400 transition-colors"
          >
            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Pull Image
          </button>
          <button
            type="button"
            onClick={() => navigate('/containers')}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-400 transition-colors"
          >
            <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Deploy Container
          </button>
        </div>
      </section>
    </div>
  );
};

DashboardPage.displayName = 'DashboardPage';

export default DashboardPage;
