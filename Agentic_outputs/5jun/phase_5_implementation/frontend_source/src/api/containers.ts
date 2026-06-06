// =============================================================================
// DCMS Frontend — Container API hooks (React Query v5)
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
  keepPreviousData,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from './client';
import type {
  Container,
  ContainerCreateRequest,
  ContainerFilters,
  ContainerStats,
  LogEntry,
  PaginatedResponse,
} from '../types/index';

// ---------------------------------------------------------------------------
// Query key factory — keeps keys co-located with the hooks
// ---------------------------------------------------------------------------

export const containerKeys = {
  all: ['containers'] as const,
  lists: () => [...containerKeys.all, 'list'] as const,
  list: (namespace: string, filters: ContainerFilters) =>
    [...containerKeys.lists(), namespace, filters] as const,
  details: () => [...containerKeys.all, 'detail'] as const,
  detail: (id: string) => [...containerKeys.details(), id] as const,
  logs: (id: string) => [...containerKeys.all, 'logs', id] as const,
  stats: (id: string) => [...containerKeys.all, 'stats', id] as const,
};

// ---------------------------------------------------------------------------
// API request functions
// ---------------------------------------------------------------------------

async function fetchContainers(
  namespace: string,
  filters: ContainerFilters,
): Promise<PaginatedResponse<Container>> {
  const params: Record<string, string | number | undefined> = {
    namespace,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 50,
    ...(filters.status && filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.nodeId ? { nodeId: filters.nodeId } : {}),
    ...(filters.sortBy ? { sortBy: filters.sortBy } : {}),
    ...(filters.sortOrder ? { sortOrder: filters.sortOrder } : {}),
  };
  const { data } = await apiClient.get<PaginatedResponse<Container>>('/containers', { params });
  return data;
}

async function fetchContainer(id: string): Promise<Container> {
  const { data } = await apiClient.get<Container>(`/containers/${id}`);
  return data;
}

async function createContainer(payload: ContainerCreateRequest): Promise<Container> {
  const { data } = await apiClient.post<Container>('/containers', payload);
  return data;
}

async function startContainer(id: string): Promise<void> {
  await apiClient.post(`/containers/${id}/start`);
}

async function stopContainer(id: string): Promise<void> {
  await apiClient.post(`/containers/${id}/stop`);
}

async function restartContainer(id: string): Promise<void> {
  await apiClient.post(`/containers/${id}/restart`);
}

async function deleteContainer(id: string): Promise<void> {
  await apiClient.delete(`/containers/${id}`);
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useContainers(
  namespace: string,
  filters: ContainerFilters = {},
): UseQueryResult<PaginatedResponse<Container>, Error> {
  return useQuery({
    queryKey: containerKeys.list(namespace, filters),
    queryFn: () => fetchContainers(namespace, filters),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useContainer(id: string): UseQueryResult<Container, Error> {
  return useQuery({
    queryKey: containerKeys.detail(id),
    queryFn: () => fetchContainer(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateContainer(): UseMutationResult<
  Container,
  Error,
  ContainerCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
    },
  });
}

export function useStartContainer(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startContainer,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: containerKeys.detail(id) });
    },
  });
}

export function useStopContainer(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stopContainer,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: containerKeys.detail(id) });
    },
  });
}

export function useRestartContainer(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restartContainer,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: containerKeys.detail(id) });
    },
  });
}

export function useDeleteContainer(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContainer,
    onMutate: async (id) => {
      // Optimistic removal: cancel in-flight list queries and snapshot previous data.
      await queryClient.cancelQueries({ queryKey: containerKeys.lists() });

      const previousLists = queryClient.getQueriesData<PaginatedResponse<Container>>({
        queryKey: containerKeys.lists(),
      });

      // Remove the deleted container from every cached list.
      queryClient.setQueriesData<PaginatedResponse<Container>>(
        { queryKey: containerKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((c) => c.id !== id),
            pagination: {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1),
            },
          };
        },
      );

      return { previousLists };
    },
    onError: (_error, _id, context) => {
      // Roll back the optimistic update on failure.
      const ctx = context as
        | { previousLists: [unknown, PaginatedResponse<Container> | undefined][] }
        | undefined;
      if (ctx?.previousLists) {
        for (const [queryKey, data] of ctx.previousLists) {
          queryClient.setQueryData(queryKey as readonly unknown[], data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// SSE hooks
// ---------------------------------------------------------------------------

const SSE_BASE_URL = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? '/api/v1';

export interface UseContainerLogsResult {
  logs: LogEntry[];
  connected: boolean;
  error: string | null;
}

export function useContainerLogs(id: string, enabled = true): UseContainerLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!id || !enabled) return;

    // Clean up any existing connection before opening a new one.
    esRef.current?.close();
    setLogs([]);
    setError(null);

    const { useAuthStore } = require('../stores/authStore');
    const token = useAuthStore.getState().token;
    const url = new URL(`${SSE_BASE_URL}/containers/${id}/logs/stream`);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString(), { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const entry: LogEntry = JSON.parse(evt.data);
        setLogs((prev) => {
          // Keep at most 2000 log lines to prevent unbounded memory growth.
          const next = [...prev, entry];
          return next.length > 2000 ? next.slice(next.length - 2000) : next;
        });
      } catch {
        // Malformed SSE data — skip silently.
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError('Log stream disconnected. Reconnecting…');
      // EventSource will attempt reconnection automatically per the SSE spec.
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [id, enabled]);

  return { logs, connected, error };
}

export interface UseContainerStatsResult {
  stats: ContainerStats | null;
  connected: boolean;
  error: string | null;
}

export function useContainerStats(id: string, enabled = true): UseContainerStatsResult {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!id || !enabled) return;

    esRef.current?.close();
    setError(null);

    const { useAuthStore } = require('../stores/authStore');
    const token = useAuthStore.getState().token;
    const url = new URL(`${SSE_BASE_URL}/containers/${id}/stats/stream`);
    if (token) url.searchParams.set('token', token);

    const es = new EventSource(url.toString(), { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const incoming: ContainerStats = JSON.parse(evt.data);
        setStats(incoming);
      } catch {
        // skip
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError('Stats stream disconnected.');
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [id, enabled]);

  return { stats, connected, error };
}
