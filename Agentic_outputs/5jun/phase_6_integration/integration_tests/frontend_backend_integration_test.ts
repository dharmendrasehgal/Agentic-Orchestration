/**
 * DCMS Frontend ↔ Backend Integration Tests (Playwright)
 *
 * Phase 6 — Integration | Agent: integration_developer_agent
 * Generated: 2026-06-06
 *
 * Prerequisites:
 *   - Backend services running (or mocked via Playwright route intercept)
 *   - Frontend dev/preview server on http://localhost:3000
 *   - Playwright installed: npm install -D @playwright/test
 *   - Run: npx playwright test integration_tests/frontend_backend_integration_test.ts
 *
 * Configuration: playwright.config.ts sets baseURL to PLAYWRIGHT_BASE_URL or
 * http://localhost:3000. API base URL is set to DCMS_API_URL or
 * http://localhost:8080.
 *
 * Seed strategy:
 *   - Admin credentials are read from env DCMS_ADMIN_EMAIL / DCMS_ADMIN_PASSWORD.
 *   - Container fixtures are seeded via direct API calls in beforeEach hooks
 *     using the admin session, then cleaned up in afterEach.
 */

import { test, expect, Page, APIRequestContext, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.DCMS_API_URL ?? 'http://localhost:8080';

const ADMIN_EMAIL = process.env.DCMS_ADMIN_EMAIL ?? 'admin@dcms.test';
const ADMIN_PASSWORD = process.env.DCMS_ADMIN_PASSWORD ?? 'Admin1234!';

/** Performs a browser-level login and stores auth state in localStorage. */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('[data-testid="email-input"]').fill(ADMIN_EMAIL);
  await page.locator('[data-testid="password-input"]').fill(ADMIN_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  // Wait for navigation away from /login to confirm authentication succeeded.
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10_000 });
}

/** Obtains a fresh admin access token directly via the API (bypasses browser UI). */
async function getAdminToken(apiContext: APIRequestContext): Promise<string> {
  const resp = await apiContext.post(`${API_URL}/v1/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  return body.access_token as string;
}

interface SeedContainerOptions {
  name: string;
  image?: string;
  namespaceId?: string;
}

/** Seeds a container via the API and returns its ID. */
async function seedContainer(
  apiContext: APIRequestContext,
  token: string,
  opts: SeedContainerOptions,
): Promise<string> {
  const resp = await apiContext.post(`${API_URL}/v1/containers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: opts.name,
      image: opts.image ?? 'nginx:1.25-alpine',
      namespace_id: opts.namespaceId ?? '00000000-0000-0000-0000-000000000001',
      restart_policy: 'unless-stopped',
      cpu_quota: 0.5,
      memory_mb: 128,
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  return body.data.id as string;
}

/** Deletes a container via the API (cleanup helper). */
async function deleteContainer(
  apiContext: APIRequestContext,
  token: string,
  containerId: string,
): Promise<void> {
  await apiContext.delete(`${API_URL}/v1/containers/${containerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Injects a Bearer token into localStorage so the frontend app treats the
 *  browser session as authenticated without going through the login UI. */
async function injectAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((t: string) => {
    localStorage.setItem('dcms_access_token', t);
  }, token);
}

// ---------------------------------------------------------------------------
// Test group: authenticated container views
// ---------------------------------------------------------------------------

test.describe('Authenticated container views', () => {
  let adminToken: string;
  let seededContainerIds: string[] = [];
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({ baseURL: API_URL });
    adminToken = await getAdminToken(apiContext);
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test.afterEach(async () => {
    // Clean up any containers seeded during a test.
    for (const id of seededContainerIds) {
      await deleteContainer(apiContext, adminToken, id).catch(() => {});
    }
    seededContainerIds = [];
  });

  /**
   * Test 1: should display containers after login
   *
   * Verifies the full auth → navigate → render flow:
   *   1. User logs in via the login form.
   *   2. User navigates to /containers.
   *   3. The container table (data-testid="container-table") renders with at
   *      least one row from the seeded container.
   */
  test('should display containers after login', async ({ page }) => {
    const id = await seedContainer(apiContext, adminToken, {
      name: 'pw-display-test',
    });
    seededContainerIds.push(id);

    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/containers`);

    const table = page.locator('[data-testid="container-table"]');
    await expect(table).toBeVisible({ timeout: 8_000 });

    // At least one row with the seeded container name must appear.
    const row = table.locator('tr', { hasText: 'pw-display-test' });
    await expect(row).toBeVisible({ timeout: 5_000 });
  });

  /**
   * Test 2: should show running container status badge
   *
   * Seeds a container and patches its status to "running" via the API, then
   * navigates to the containers list and asserts the green "Running" badge is
   * visible for that specific row.
   */
  test('should show running container status badge', async ({ page }) => {
    const id = await seedContainer(apiContext, adminToken, {
      name: 'pw-running-badge',
    });
    seededContainerIds.push(id);

    // Start the container so it transitions to running.
    await apiContext.post(`${API_URL}/v1/containers/${id}/start`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await injectAuthToken(page, adminToken);
    await page.goto(`${BASE_URL}/containers`);

    const row = page.locator('[data-testid="container-table"]').locator(
      'tr',
      { hasText: 'pw-running-badge' },
    );
    await expect(row).toBeVisible({ timeout: 8_000 });

    const badge = row.locator('[data-testid="status-badge"]');
    await expect(badge).toHaveText(/running/i);
    // The badge must carry the green colour token class.
    await expect(badge).toHaveClass(/badge-running|bg-green|status-running/i);
  });

  /**
   * Test 3: should create container via UI form
   *
   * Opens the "New Container" modal, fills in name and image, submits the form,
   * and asserts that the new row appears in the containers table.
   */
  test('should create container via UI form', async ({ page }) => {
    await injectAuthToken(page, adminToken);
    await page.goto(`${BASE_URL}/containers`);

    // Open the create modal.
    await page.locator('[data-testid="create-container-btn"]').click();
    const modal = page.locator('[data-testid="create-container-modal"]');
    await expect(modal).toBeVisible({ timeout: 4_000 });

    const containerName = `pw-ui-create-${Date.now()}`;

    // Fill form fields.
    await modal.locator('[data-testid="input-name"]').fill(containerName);
    await modal.locator('[data-testid="input-image"]').fill('alpine:3.19');
    // Namespace selector — pick first option if it's a <select>.
    const nsSelect = modal.locator('[data-testid="select-namespace"]');
    if (await nsSelect.isVisible()) {
      await nsSelect.selectOption({ index: 0 });
    }

    // Submit.
    await modal.locator('[data-testid="submit-create-container"]').click();

    // Modal must close.
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    // The new container row must appear in the table.
    const table = page.locator('[data-testid="container-table"]');
    const newRow = table.locator('tr', { hasText: containerName });
    await expect(newRow).toBeVisible({ timeout: 8_000 });

    // Record ID for cleanup (extracted from a data attribute set by the frontend).
    const dataId = await newRow.getAttribute('data-container-id');
    if (dataId) seededContainerIds.push(dataId);
  });

  /**
   * Test 4: should stop container via action menu
   *
   * Seeds a running container, locates its row in the table, opens the kebab
   * action menu, clicks "Stop", and asserts the status badge changes to "Stopped".
   */
  test('should stop container via action menu', async ({ page }) => {
    const id = await seedContainer(apiContext, adminToken, {
      name: 'pw-action-stop',
    });
    seededContainerIds.push(id);

    // Start it so it is in the running state.
    await apiContext.post(`${API_URL}/v1/containers/${id}/start`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await injectAuthToken(page, adminToken);
    await page.goto(`${BASE_URL}/containers`);

    const row = page.locator('[data-testid="container-table"]').locator(
      `tr[data-container-id="${id}"]`,
    );
    await expect(row).toBeVisible({ timeout: 8_000 });

    // Open the action menu for this row.
    await row.locator('[data-testid="action-menu-trigger"]').click();
    const menu = page.locator('[data-testid="action-menu"]');
    await expect(menu).toBeVisible({ timeout: 2_000 });

    // Click "Stop".
    await menu.locator('[data-testid="action-stop"]').click();

    // Confirm the stop in the confirmation dialog (if present).
    const confirmBtn = page.locator('[data-testid="confirm-stop-btn"]');
    if (await confirmBtn.isVisible({ timeout: 1_500 })) {
      await confirmBtn.click();
    }

    // Badge must transition to stopped.
    const badge = row.locator('[data-testid="status-badge"]');
    await expect(badge).toHaveText(/stopped/i, { timeout: 8_000 });
  });

  /**
   * Test 5: should display real-time stats on container detail page
   *
   * Navigates to the container detail page and verifies that the "Stats" tab
   * renders CPU and memory chart components that update within the assertion window.
   */
  test('should display real-time stats on container detail page', async ({ page }) => {
    const id = await seedContainer(apiContext, adminToken, {
      name: 'pw-stats-detail',
    });
    seededContainerIds.push(id);

    // Start container so stats SSE stream is non-trivial.
    await apiContext.post(`${API_URL}/v1/containers/${id}/start`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await injectAuthToken(page, adminToken);
    await page.goto(`${BASE_URL}/containers/${id}`);

    // Navigate to the Stats tab.
    const statsTab = page.locator('[data-testid="tab-stats"]');
    await expect(statsTab).toBeVisible({ timeout: 6_000 });
    await statsTab.click();

    // CPU and memory chart wrappers must appear.
    await expect(
      page.locator('[data-testid="chart-cpu"]'),
    ).toBeVisible({ timeout: 6_000 });

    await expect(
      page.locator('[data-testid="chart-memory"]'),
    ).toBeVisible({ timeout: 6_000 });

    // A live data label (e.g. "12.5%") must appear inside the CPU chart
    // within 5 seconds of the SSE stream emitting the first frame.
    const cpuLabel = page.locator('[data-testid="chart-cpu"] [data-testid="stat-value"]');
    await expect(cpuLabel).not.toBeEmpty({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test group: unauthenticated / security flows
// ---------------------------------------------------------------------------

test.describe('Unauthenticated and security flows', () => {
  /**
   * Test 6: should redirect unauthenticated user to login
   *
   * Navigates directly to /containers without any auth token in localStorage
   * and asserts the browser is redirected to /login.
   */
  test('should redirect unauthenticated user to login', async ({ page }) => {
    // Ensure no residual auth state.
    await page.addInitScript(() => {
      localStorage.removeItem('dcms_access_token');
      localStorage.removeItem('dcms_refresh_token');
    });

    await page.goto(`${BASE_URL}/containers`);

    // Should land on /login within 5 seconds.
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });

    // Login form must be visible.
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
  });

  /**
   * Test 7: should show toast on error
   *
   * Intercepts the containers list API call, forces a 500 Internal Server Error,
   * and asserts that an error toast notification appears in the UI.
   */
  test('should show toast on error', async ({ page }) => {
    let apiContext: APIRequestContext;
    // Obtain a real admin token so the middleware passes; only the data API
    // endpoint is stubbed to 500.
    const pwApiCtx = await page.context().newCDPSession(page).catch(() => null);
    // Use route interception instead of CDP to stub the API.

    // Inject a valid token so auth middleware passes.
    const tempApiCtx = await page.context().request.newContext();
    const loginResp = await tempApiCtx.post(`${API_URL}/v1/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const loginBody = await loginResp.json().catch(() => ({ access_token: 'stub-token' }));
    const token = loginBody.access_token ?? 'stub-token';
    await tempApiCtx.dispose();

    await injectAuthToken(page, token);

    // Intercept the GET /containers API request and return a 500 error.
    await page.route(`${API_URL}/v1/containers**`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal server error' }),
      });
    });

    await page.goto(`${BASE_URL}/containers`);

    // An error toast must appear. The frontend wraps API errors in a toast with
    // data-testid="toast-error".
    const toast = page.locator('[data-testid="toast-error"]');
    await expect(toast).toBeVisible({ timeout: 6_000 });
    await expect(toast).toContainText(/error|failed/i);
  });

  /**
   * Test 8: should log out and clear session
   *
   * Logs in as admin, clicks the logout button, asserts redirection to /login,
   * then attempts to navigate to /containers and asserts redirection back to
   * /login (proving the token was cleared).
   */
  test('should log out and clear session', async ({ page }) => {
    await loginAsAdmin(page);

    // Confirm we are authenticated (on dashboard or containers page).
    await expect(page).toHaveURL(/\/(dashboard|containers)/, { timeout: 5_000 });

    // Locate and click the logout button (typically in a user menu or nav bar).
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"]');
    if (await userMenuTrigger.isVisible({ timeout: 2_000 })) {
      await userMenuTrigger.click();
    }

    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    await expect(logoutBtn).toBeVisible({ timeout: 4_000 });
    await logoutBtn.click();

    // Must redirect to /login after logout.
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });

    // Verify the access token was cleared from localStorage.
    const storedToken = await page.evaluate(() =>
      localStorage.getItem('dcms_access_token'),
    );
    expect(storedToken).toBeNull();

    // Navigating to /containers must redirect back to /login.
    await page.goto(`${BASE_URL}/containers`);
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
