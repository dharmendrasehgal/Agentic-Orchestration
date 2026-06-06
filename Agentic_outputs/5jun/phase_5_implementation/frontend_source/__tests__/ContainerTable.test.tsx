// =============================================================================
// DCMS Frontend — ContainerTable unit tests (Vitest 1.6)
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ContainerTable from '../src/components/containers/ContainerTable';
import { ContainerStatus } from '../src/types/index';
import type { Container } from '../src/types/index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock react-window FixedSizeList to render all items (removes virtualisation
// complexity from unit tests while keeping the component contract intact).
vi.mock('react-window', () => ({
  FixedSizeList: ({
    itemCount,
    itemData,
    children: RowComponent,
  }: {
    itemCount: number;
    itemData: unknown;
    children: React.ComponentType<{ index: number; style: React.CSSProperties; data: unknown }>;
  }) => (
    <div>
      {Array.from({ length: itemCount }).map((_, index) => (
        <RowComponent
          key={index}
          index={index}
          style={{}}
          data={itemData}
        />
      ))}
    </div>
  ),
}));

// Stub out mutation hooks — we test that they are called, not their internals.
const mockStartMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockStopMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockRestartMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockDeleteMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/api/containers', () => ({
  useStartContainer: () => ({ mutateAsync: mockStartMutateAsync, isPending: false }),
  useStopContainer: () => ({ mutateAsync: mockStopMutateAsync, isPending: false }),
  useRestartContainer: () => ({ mutateAsync: mockRestartMutateAsync, isPending: false }),
  useDeleteContainer: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

// Stub uiStore — we only need addToast.
const mockAddToast = vi.fn();
vi.mock('../src/stores/uiStore', () => ({
  useUiStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}));

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-container',
    image: 'nginx:latest',
    imageId: 'sha256:abc123',
    status: ContainerStatus.Running,
    createdAt: '2026-06-06T00:00:00Z',
    startedAt: '2026-06-06T00:00:00Z',
    finishedAt: null,
    restartCount: 0,
    command: ['nginx', '-g', 'daemon off;'],
    entrypoint: [],
    env: [],
    labels: {},
    ports: [],
    mounts: [],
    networks: [],
    namespace: 'default',
    nodeId: 'node-1',
    nodeName: 'worker-01',
    cpuPercent: 12.5,
    memoryUsageBytes: 64 * 1024 * 1024,
    memoryLimitBytes: 512 * 1024 * 1024,
    ...overrides,
  };
}

const RUNNING_CONTAINER = makeContainer({ id: 'c-1', name: 'web-server', status: ContainerStatus.Running });
const STOPPED_CONTAINER = makeContainer({ id: 'c-2', name: 'db-backup', status: ContainerStatus.Stopped });
const ERROR_CONTAINER = makeContainer({ id: 'c-3', name: 'worker-dead', status: ContainerStatus.Dead });

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderTable(
  containers: Container[],
  props: Partial<React.ComponentProps<typeof ContainerTable>> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContainerTable containers={containers} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContainerTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders all containers in the list', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER, ERROR_CONTAINER]);
      expect(screen.getByText('web-server')).toBeInTheDocument();
      expect(screen.getByText('db-backup')).toBeInTheDocument();
      expect(screen.getByText('worker-dead')).toBeInTheDocument();
    });

    it('renders the container image name for each row', () => {
      renderTable([RUNNING_CONTAINER]);
      expect(screen.getByText('nginx:latest')).toBeInTheDocument();
    });

    it('shows the correct status badge for each container', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      // StatusBadge renders role="status" with aria-label matching the status label
      const runningBadges = screen.getAllByRole('status', { name: /running/i });
      expect(runningBadges.length).toBeGreaterThanOrEqual(1);
      const stoppedBadges = screen.getAllByRole('status', { name: /stopped/i });
      expect(stoppedBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('shows loading skeleton when isLoading is true', () => {
      renderTable([], { isLoading: true });
      expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('empty states', () => {
    it('shows generic empty state when no containers and no active filter', () => {
      renderTable([]);
      expect(screen.getByText('No containers yet')).toBeInTheDocument();
    });

    it('shows filtered empty state when containers array is empty due to filter', async () => {
      renderTable([RUNNING_CONTAINER]);
      // Click the "Stopped" filter pill
      const stoppedPill = screen.getByRole('button', { name: /^stopped$/i });
      fireEvent.click(stoppedPill);
      expect(await screen.findByText('No containers match your filters')).toBeInTheDocument();
    });
  });

  describe('status filter pills', () => {
    it('filters containers by "Running" status pill', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      fireEvent.click(screen.getByRole('button', { name: /^running$/i }));
      expect(screen.getByText('web-server')).toBeInTheDocument();
      expect(screen.queryByText('db-backup')).not.toBeInTheDocument();
    });

    it('resets to all containers when "All" pill is clicked', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      // First narrow to Running
      fireEvent.click(screen.getByRole('button', { name: /^running$/i }));
      expect(screen.queryByText('db-backup')).not.toBeInTheDocument();
      // Then reset to All
      fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
      expect(screen.getByText('db-backup')).toBeInTheDocument();
    });
  });

  describe('bulk selection', () => {
    it('selects all visible rows when the header checkbox is checked', async () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await userEvent.click(selectAllCheckbox);
      // Both individual row checkboxes should now be checked
      const rowCheckboxes = screen.getAllByRole('checkbox', { name: /select /i });
      rowCheckboxes.forEach((cb) => expect(cb).toBeChecked());
    });

    it('deselects all rows when header checkbox is clicked again', async () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await userEvent.click(selectAllCheckbox); // select all
      await userEvent.click(selectAllCheckbox); // deselect all
      const rowCheckboxes = screen.getAllByRole('checkbox', { name: /select /i });
      rowCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });

    it('shows bulk action buttons when rows are selected', async () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await userEvent.click(selectAllCheckbox);
      expect(screen.getByRole('button', { name: /stop selected/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove selected/i })).toBeInTheDocument();
    });
  });

  describe('action menu', () => {
    it('calls stopContainer mutation when Stop is clicked in the action menu', async () => {
      // Use a running container so "Stop" appears in the menu
      renderTable([RUNNING_CONTAINER]);
      const actionsBtn = screen.getByRole('button', { name: /actions for web-server/i });
      await userEvent.click(actionsBtn);
      const stopBtn = await screen.findByRole('menuitem', { name: /stop/i });
      await userEvent.click(stopBtn);
      await waitFor(() => {
        expect(mockStopMutateAsync).toHaveBeenCalledWith(RUNNING_CONTAINER.id);
      });
    });

    it('calls deleteContainer mutation when Remove is clicked in the action menu', async () => {
      renderTable([RUNNING_CONTAINER]);
      const actionsBtn = screen.getByRole('button', { name: /actions for web-server/i });
      await userEvent.click(actionsBtn);
      const removeBtn = await screen.findByRole('menuitem', { name: /remove/i });
      await userEvent.click(removeBtn);
      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith(RUNNING_CONTAINER.id);
      });
    });

    it('calls restartContainer mutation when Restart is clicked', async () => {
      renderTable([RUNNING_CONTAINER]);
      const actionsBtn = screen.getByRole('button', { name: /actions for web-server/i });
      await userEvent.click(actionsBtn);
      const restartBtn = await screen.findByRole('menuitem', { name: /restart/i });
      await userEvent.click(restartBtn);
      await waitFor(() => {
        expect(mockRestartMutateAsync).toHaveBeenCalledWith(RUNNING_CONTAINER.id);
      });
    });

    it('shows a Logs link in the action menu', async () => {
      renderTable([RUNNING_CONTAINER]);
      const actionsBtn = screen.getByRole('button', { name: /actions for web-server/i });
      await userEvent.click(actionsBtn);
      const logsLink = await screen.findByRole('link', { name: /logs/i });
      expect(logsLink).toHaveAttribute('href', `/containers/${RUNNING_CONTAINER.id}/logs`);
    });
  });

  describe('footer count', () => {
    it('displays the correct container count in the footer', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER, ERROR_CONTAINER]);
      expect(screen.getByText(/showing 3 of 3/i)).toBeInTheDocument();
    });

    it('updates the footer count after filtering', () => {
      renderTable([RUNNING_CONTAINER, STOPPED_CONTAINER]);
      fireEvent.click(screen.getByRole('button', { name: /^running$/i }));
      expect(screen.getByText(/showing 1 of 2/i)).toBeInTheDocument();
    });
  });
});
