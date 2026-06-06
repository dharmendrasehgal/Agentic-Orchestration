// =============================================================================
// DCMS Frontend — ContainersPage
// Generated: 2026-06-06 | Agent: frontend_developer_agent
// =============================================================================

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContainers, useCreateContainer } from '../../api/containers';
import { useUiStore } from '../../stores/uiStore';
import ContainerTable from '../../components/containers/ContainerTable';
import type { ContainerCreateRequest, ContainerFilters } from '../../types/index';

// ---------------------------------------------------------------------------
// CreateContainerModal
// ---------------------------------------------------------------------------

interface CreateContainerModalProps {
  namespace: string;
  onClose: () => void;
}

const INITIAL_FORM: ContainerCreateRequest = {
  name: '',
  image: '',
  namespace: '',
  command: [],
  env: [],
  restartPolicy: 'unless-stopped',
};

const CreateContainerModal: React.FC<CreateContainerModalProps> = ({
  namespace,
  onClose,
}) => {
  const [form, setForm] = useState<ContainerCreateRequest>({
    ...INITIAL_FORM,
    namespace,
  });
  const [envInput, setEnvInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ContainerCreateRequest, string>>>({});

  const createMutation = useCreateContainer();
  const addToast = useUiStore((s) => s.addToast);

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!form.name.trim()) errors.name = 'Container name is required.';
    if (!form.image.trim()) errors.image = 'Image name is required.';
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(form.name)) {
      errors.name = 'Name must be lowercase alphanumeric and may contain _, -, .';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: ContainerCreateRequest = {
      ...form,
      env: envInput
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    };

    try {
      await createMutation.mutateAsync(payload);
      addToast({ variant: 'success', title: `Container "${form.name}" created` });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create container.';
      addToast({ variant: 'error', title: message });
    }
  };

  const field = (
    id: keyof ContainerCreateRequest,
    label: string,
    inputProps: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        value={(form[id] as string) ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        className={[
          'block w-full rounded-md border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          fieldErrors[id]
            ? 'border-red-400 dark:border-red-600'
            : 'border-slate-300 dark:border-slate-600',
        ].join(' ')}
        aria-describedby={fieldErrors[id] ? `${id}-error` : undefined}
        aria-invalid={Boolean(fieldErrors[id])}
      />
      {fieldErrors[id] && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {fieldErrors[id]}
        </p>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-container-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="create-container-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Deploy New Container
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {field('name', 'Container name *', { placeholder: 'my-app', required: true, autoFocus: true })}
            {field('image', 'Image *', { placeholder: 'nginx:latest', required: true })}

            <div>
              <label htmlFor="restartPolicy" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Restart policy
              </label>
              <select
                id="restartPolicy"
                value={form.restartPolicy ?? 'unless-stopped'}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    restartPolicy: e.target.value as ContainerCreateRequest['restartPolicy'],
                  }))
                }
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="unless-stopped">Unless stopped</option>
                <option value="on-failure">On failure</option>
              </select>
            </div>

            <div>
              <label htmlFor="envVars" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Environment variables
                <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">(one per line, KEY=value)</span>
              </label>
              <textarea
                id="envVars"
                rows={4}
                value={envInput}
                onChange={(e) => setEnvInput(e.target.value)}
                placeholder={'DATABASE_URL=postgres://...\nPORT=8080'}
                className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {createMutation.isPending ? 'Deploying…' : 'Deploy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContainersPage
// ---------------------------------------------------------------------------

const ContainersPage: React.FC = () => {
  const activeNamespace = useUiStore((s) => s.activeNamespace);
  const addToast = useUiStore((s) => s.addToast);
  const [filters, setFilters] = useState<ContainerFilters>({});
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError, error, refetch } = useContainers(activeNamespace, filters);

  const handleFiltersChange = useCallback((updated: ContainerFilters) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  }, []);

  React.useEffect(() => {
    if (isError && error) {
      addToast({
        variant: 'error',
        title: 'Failed to load containers',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [isError, error, addToast]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-100">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-800 dark:text-slate-100 font-medium" aria-current="page">
            Containers
          </li>
        </ol>
      </nav>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Containers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Namespace: <span className="font-medium text-slate-700 dark:text-slate-300">{activeNamespace}</span>
            {data && (
              <span className="ml-3">
                {data.pagination.total} container{data.pagination.total !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            aria-label="Refresh container list"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Container
          </button>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div role="alert" className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to load containers. Check your API connection and try again.
        </div>
      )}

      {/* Container table */}
      <ContainerTable
        containers={data?.data ?? []}
        isLoading={isLoading}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="rounded-md px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="rounded-md px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create container modal */}
      {showCreateModal && (
        <CreateContainerModal
          namespace={activeNamespace}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

ContainersPage.displayName = 'ContainersPage';

export default ContainersPage;
