// =============================================================================
// DCMS Frontend — ContainerTable Component
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import type { Container, ContainerFilters } from '../../types/index';
import { ContainerStatus } from '../../types/index';
import {
  useStartContainer,
  useStopContainer,
  useRestartContainer,
  useDeleteContainer,
} from '../../api/containers';
import StatusBadge from '../ui/StatusBadge';
import { useUiStore } from '../../stores/uiStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return '—';
  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ---------------------------------------------------------------------------
// Status filter pills
// ---------------------------------------------------------------------------

const ALL_STATUSES: Array<{ label: string; value: ContainerStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: ContainerStatus.Running },
  { label: 'Stopped', value: ContainerStatus.Stopped },
  { label: 'Exited', value: ContainerStatus.Exited },
  { label: 'Error', value: ContainerStatus.Dead },
  { label: 'Paused', value: ContainerStatus.Paused },
];

// ---------------------------------------------------------------------------
// Sort config
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'status' | 'cpuPercent';
type SortDir = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  dir: SortDir;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

const TableSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-2" aria-label="Loading containers" aria-busy="true">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 h-12 px-4">
        <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyState: React.FC<{ filtered: boolean }> = ({ filtered }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center" role="status">
    <svg
      className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4"
      fill="none"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <rect x="8" y="18" width="48" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 26h48" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="22" r="2" fill="currentColor" />
      <circle cx="23" cy="22" r="2" fill="currentColor" />
      <circle cx="30" cy="22" r="2" fill="currentColor" />
    </svg>
    <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">
      {filtered ? 'No containers match your filters' : 'No containers yet'}
    </p>
    <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
      {filtered
        ? 'Try adjusting your status filter or search query.'
        : 'Deploy your first container to get started.'}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Memory usage bar
// ---------------------------------------------------------------------------

const MemoryBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div
        className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        aria-label={`Memory ${pct.toFixed(0)}%`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-14 shrink-0 text-right">
        {formatBytes(used)}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Row action menu
// ---------------------------------------------------------------------------

interface ActionMenuProps {
  container: Container;
  onClose: () => void;
}

const ActionMenu: React.FC<ActionMenuProps> = ({ container, onClose }) => {
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const deleteMutation = useDeleteContainer();
  const addToast = useUiStore((s) => s.addToast);

  const isRunning = container.status === ContainerStatus.Running;

  const handle = useCallback(
    async (
      action: () => Promise<void>,
      successMessage: string,
      errorMessage: string,
    ) => {
      try {
        await action();
        addToast({ variant: 'success', title: successMessage });
      } catch {
        addToast({ variant: 'error', title: errorMessage });
      } finally {
        onClose();
      }
    },
    [addToast, onClose],
  );

  return (
    <div
      role="menu"
      className="absolute right-0 top-full mt-1 w-40 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-30"
    >
      {!isRunning && (
        <button
          type="button"
          role="menuitem"
          disabled={startMutation.isPending}
          onClick={() =>
            handle(
              () => startMutation.mutateAsync(container.id),
              `${container.name} started`,
              `Failed to start ${container.name}`,
            )
          }
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          Start
        </button>
      )}
      {isRunning && (
        <button
          type="button"
          role="menuitem"
          disabled={stopMutation.isPending}
          onClick={() =>
            handle(
              () => stopMutation.mutateAsync(container.id),
              `${container.name} stopped`,
              `Failed to stop ${container.name}`,
            )
          }
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          Stop
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={restartMutation.isPending}
        onClick={() =>
          handle(
            () => restartMutation.mutateAsync(container.id),
            `${container.name} restarted`,
            `Failed to restart ${container.name}`,
          )
        }
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
      >
        Restart
      </button>
      <Link
        to={`/containers/${container.id}/logs`}
        onClick={onClose}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 no-underline"
      >
        Logs
      </Link>
      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
      <button
        type="button"
        role="menuitem"
        disabled={deleteMutation.isPending}
        onClick={() =>
          handle(
            () => deleteMutation.mutateAsync(container.id),
            `${container.name} removed`,
            `Failed to remove ${container.name}`,
          )
        }
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Row component (used by react-window)
// ---------------------------------------------------------------------------

interface RowData {
  rows: Container[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
}

const ROW_HEIGHT = 52;

const VirtualRow: React.FC<ListChildComponentProps<RowData>> = ({
  index,
  style,
  data,
}) => {
  const { rows, selected, onToggle, openMenuId, setOpenMenuId } = data;
  const container = rows[index];
  if (!container) return null;

  const isSelected = selected.has(container.id);
  const menuOpen = openMenuId === container.id;

  return (
    <div
      style={style}
      role="row"
      aria-selected={isSelected}
      className={[
        'flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-800',
        'text-sm transition-colors',
        isSelected ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
      ].join(' ')}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        aria-label={`Select ${container.name}`}
        checked={isSelected}
        onChange={() => onToggle(container.id)}
        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
      />

      {/* Status */}
      <div className="w-24 shrink-0">
        <StatusBadge status={container.status} size="sm" />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <Link
          to={`/containers/${container.id}`}
          className="font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate block"
        >
          {container.name}
        </Link>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{container.image}</p>
      </div>

      {/* CPU */}
      <div className="w-16 text-right tabular-nums shrink-0">
        <span
          className={[
            'text-sm',
            container.cpuPercent >= 90
              ? 'text-red-600 font-semibold'
              : container.cpuPercent >= 70
              ? 'text-amber-600'
              : 'text-slate-600 dark:text-slate-400',
          ].join(' ')}
        >
          {container.cpuPercent.toFixed(1)}%
        </span>
      </div>

      {/* Memory */}
      <div className="w-36 shrink-0">
        <MemoryBar
          used={container.memoryUsageBytes}
          limit={container.memoryLimitBytes}
        />
      </div>

      {/* Uptime */}
      <div className="w-16 text-right tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
        {formatUptime(container.startedAt)}
      </div>

      {/* Ports */}
      <div className="w-28 truncate text-xs text-slate-500 dark:text-slate-400 shrink-0">
        {container.ports.length === 0
          ? '—'
          : container.ports
              .filter((p) => p.hostPort)
              .map((p) => `${p.hostPort}:${p.containerPort}`)
              .slice(0, 2)
              .join(', ')}
        {container.ports.filter((p) => p.hostPort).length > 2 && (
          <span className="ml-1 text-slate-400">+{container.ports.filter((p) => p.hostPort).length - 2}</span>
        )}
      </div>

      {/* Actions */}
      <div className="relative w-8 shrink-0 flex justify-center">
        <button
          type="button"
          aria-label={`Actions for ${container.name}`}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setOpenMenuId(menuOpen ? null : container.id)}
          className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg className="h-4 w-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <ActionMenu
            container={container}
            onClose={() => setOpenMenuId(null)}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

interface ColHeaderProps {
  label: string;
  sortKey?: SortKey;
  currentSort: SortConfig;
  onSort: (key: SortKey) => void;
  className?: string;
}

const ColHeader: React.FC<ColHeaderProps> = ({ label, sortKey, currentSort, onSort, className = '' }) => {
  const active = sortKey && currentSort.key === sortKey;
  return (
    <div
      role={sortKey ? 'columnheader' : undefined}
      aria-sort={active ? (currentSort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={['flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide', sortKey ? 'cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-100' : '', className].join(' ')}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span aria-hidden="true">
          {active ? (currentSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContainerTable props
// ---------------------------------------------------------------------------

export interface ContainerTableProps {
  containers: Container[];
  isLoading?: boolean;
  onBulkStop?: (ids: string[]) => void;
  onBulkRemove?: (ids: string[]) => void;
  filters?: ContainerFilters;
  onFiltersChange?: (filters: ContainerFilters) => void;
}

// ---------------------------------------------------------------------------
// ContainerTable
// ---------------------------------------------------------------------------

export const ContainerTable: React.FC<ContainerTableProps> = ({
  containers,
  isLoading = false,
  onBulkStop,
  onBulkRemove,
  filters = {},
  onFiltersChange,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', dir: 'asc' });
  const [activeStatus, setActiveStatus] = useState<ContainerStatus | 'all'>(
    filters.status ?? 'all',
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filter by status pill
  const filteredContainers = useMemo(() => {
    let list = containers;
    if (activeStatus !== 'all') {
      list = list.filter((c) => c.status === activeStatus);
    }
    return list;
  }, [containers, activeStatus]);

  // Sort
  const sortedContainers = useMemo(() => {
    return [...filteredContainers].sort((a, b) => {
      let cmp = 0;
      switch (sortConfig.key) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'cpuPercent':
          cmp = a.cpuPercent - b.cpuPercent;
          break;
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [filteredContainers, sortConfig]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    sortedContainers.length > 0 &&
    sortedContainers.every((c) => selected.has(c.id));

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedContainers.map((c) => c.id)));
    }
  }, [allVisibleSelected, sortedContainers]);

  const handleStatusPill = useCallback(
    (value: ContainerStatus | 'all') => {
      setActiveStatus(value);
      setSelected(new Set());
      onFiltersChange?.({ ...filters, status: value });
    },
    [filters, onFiltersChange],
  );

  const addToast = useUiStore((s) => s.addToast);
  const stopMutation = useStopContainer();
  const deleteMutation = useDeleteContainer();

  const handleBulkStop = useCallback(async () => {
    const ids = Array.from(selected);
    if (onBulkStop) {
      onBulkStop(ids);
      return;
    }
    let failed = 0;
    await Promise.allSettled(
      ids.map((id) => stopMutation.mutateAsync(id).catch(() => { failed++; })),
    );
    addToast({
      variant: failed === 0 ? 'success' : 'warning',
      title: failed === 0 ? `Stopped ${ids.length} container(s)` : `${ids.length - failed} stopped, ${failed} failed`,
    });
    setSelected(new Set());
  }, [selected, onBulkStop, stopMutation, addToast]);

  const handleBulkRemove = useCallback(async () => {
    const ids = Array.from(selected);
    if (onBulkRemove) {
      onBulkRemove(ids);
      return;
    }
    let failed = 0;
    await Promise.allSettled(
      ids.map((id) => deleteMutation.mutateAsync(id).catch(() => { failed++; })),
    );
    addToast({
      variant: failed === 0 ? 'success' : 'warning',
      title: failed === 0 ? `Removed ${ids.length} container(s)` : `${ids.length - failed} removed, ${failed} failed`,
    });
    setSelected(new Set());
  }, [selected, onBulkRemove, deleteMutation, addToast]);

  // Close action menu on outside click.
  React.useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const listData: RowData = useMemo(
    () => ({ rows: sortedContainers, selected, onToggle: toggleRow, openMenuId, setOpenMenuId }),
    [sortedContainers, selected, toggleRow, openMenuId],
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by status">
          {ALL_STATUSES.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeStatus === value}
              onClick={() => handleStatusPill(value)}
              className={[
                'rounded-full px-3 py-0.5 text-xs font-medium border transition-colors',
                activeStatus === value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() => void handleBulkStop()}
              className="rounded px-2.5 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 border border-amber-200 dark:border-amber-700"
            >
              Stop selected
            </button>
            <button
              type="button"
              onClick={() => void handleBulkRemove()}
              className="rounded px-2.5 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 border border-red-200 dark:border-red-700"
            >
              Remove selected
            </button>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div
        role="row"
        className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
      >
        <input
          type="checkbox"
          aria-label="Select all visible containers"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
        />
        <ColHeader label="Status" className="w-24 shrink-0" sortKey="status" currentSort={sortConfig} onSort={toggleSort} />
        <ColHeader label="Name / Image" className="flex-1" sortKey="name" currentSort={sortConfig} onSort={toggleSort} />
        <ColHeader label="CPU" className="w-16 justify-end" sortKey="cpuPercent" currentSort={sortConfig} onSort={toggleSort} />
        <div className="w-36 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Memory</div>
        <div className="w-16 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Uptime</div>
        <div className="w-28 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Ports</div>
        <div className="w-8 shrink-0" aria-hidden="true" />
      </div>

      {/* Table body */}
      {sortedContainers.length === 0 ? (
        <EmptyState filtered={activeStatus !== 'all'} />
      ) : (
        <div role="table" aria-label="Container list" aria-rowcount={sortedContainers.length}>
          <FixedSizeList
            height={Math.min(sortedContainers.length * ROW_HEIGHT, 560)}
            itemCount={sortedContainers.length}
            itemSize={ROW_HEIGHT}
            width="100%"
            itemData={listData}
          >
            {VirtualRow}
          </FixedSizeList>
        </div>
      )}

      {/* Footer count */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
        Showing {sortedContainers.length} of {containers.length} container(s)
      </div>
    </div>
  );
};

ContainerTable.displayName = 'ContainerTable';

export default ContainerTable;
