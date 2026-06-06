// =============================================================================
// DCMS Frontend — StatusBadge UI Component
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React from 'react';
import { ContainerStatus } from '../../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeVariant =
  | ContainerStatus
  | 'running'
  | 'stopped'
  | 'error'
  | 'paused'
  | 'creating'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'
  | 'unknown';

export type BadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  status: BadgeVariant;
  size?: BadgeSize;
  showLabel?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

interface BadgeConfig {
  label: string;
  dotClass: string;
  textClass: string;
  bgClass: string;
  icon: React.ReactNode;
}

const BADGE_CONFIGS: Record<string, BadgeConfig> = {
  running: {
    label: 'Running',
    dotClass: 'bg-emerald-500 animate-pulse',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800',
    icon: null,
  },
  stopped: {
    label: 'Stopped',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-600 dark:text-slate-400',
    bgClass: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
    icon: null,
  },
  exited: {
    label: 'Exited',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-600 dark:text-slate-400',
    bgClass: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
    icon: null,
  },
  error: {
    label: 'Error',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    icon: null,
  },
  dead: {
    label: 'Dead',
    dotClass: 'bg-red-600',
    textClass: 'text-red-700 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    icon: null,
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-700 dark:text-amber-300',
    bgClass: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
    icon: null,
  },
  creating: {
    label: 'Creating',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    icon: (
      <svg
        className="h-3 w-3 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    ),
  },
  restarting: {
    label: 'Restarting',
    dotClass: 'bg-blue-400 animate-pulse',
    textClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    icon: (
      <svg
        className="h-3 w-3 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    ),
  },
  removing: {
    label: 'Removing',
    dotClass: 'bg-orange-400 animate-pulse',
    textClass: 'text-orange-700 dark:text-orange-300',
    bgClass: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
    icon: null,
  },
  unknown: {
    label: 'Unknown',
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-600 dark:text-gray-400',
    bgClass: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
    icon: null,
  },
};

const SIZE_CLASSES: Record<BadgeSize, { wrapper: string; dot: string; text: string }> = {
  sm: {
    wrapper: 'px-1.5 py-0.5 text-xs gap-1',
    dot: 'h-1.5 w-1.5',
    text: 'text-xs font-medium',
  },
  md: {
    wrapper: 'px-2.5 py-1 text-sm gap-1.5',
    dot: 'h-2 w-2',
    text: 'text-sm font-medium',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showLabel = true,
  className = '',
}) => {
  const config = BADGE_CONFIGS[status] ?? BADGE_CONFIGS.unknown;
  const sizeClasses = SIZE_CLASSES[size];

  const isSpinnerStatus = status === 'creating' || status === 'restarting';

  return (
    <span
      role="status"
      aria-label={config.label}
      className={[
        'inline-flex items-center rounded-full border',
        sizeClasses.wrapper,
        config.bgClass,
        config.textClass,
        className,
      ].join(' ')}
    >
      {isSpinnerStatus && config.icon ? (
        config.icon
      ) : (
        <span
          className={[
            'inline-block rounded-full flex-shrink-0',
            sizeClasses.dot,
            config.dotClass,
          ].join(' ')}
          aria-hidden="true"
        />
      )}
      {showLabel && (
        <span className={sizeClasses.text}>{config.label}</span>
      )}
    </span>
  );
};

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;
