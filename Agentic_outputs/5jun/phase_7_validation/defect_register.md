# DCMS Phase 7 Validation — Defect Register

**Project:** Generic Docker Container Management System (DCMS)
**Phase:** 7 — Validation
**Period:** 2026-05-26 to 2026-06-06
**Prepared by:** qa_developer_agent
**Reviewed by:** qa_lead_agent

---

## Defect Log

| DEF-ID | Title | Severity | Status | Found In | Root Cause | Fix Applied | Fixed By | Verified By |
|--------|-------|----------|--------|----------|------------|-------------|----------|-------------|
| DEF-001 | SSE log-stream connection drops silently after 60 s on Chrome | Critical | Closed | CP-004 E2E / log-stream service | No heartbeat frame sent by server; Chrome's SSE implementation closes idle connections after 60 s with no keep-alive | Added 30 s server-side `comment: ping` heartbeat in the SSE handler (`log_stream.go`); client reconnect back-off also hardened | backend_developer_agent | qa_lead_agent |
| DEF-002 | JWT refresh race condition causes double-logout for concurrent tab users | High | Closed | NEG-001 negative test / auth service | Two in-flight `/auth/refresh` requests both received 401 then each triggered logout; no single-flight guard existed | Introduced `golang.org/x/sync/singleflight` mutex on the refresh endpoint key per user session; only first caller executes, others wait and reuse result | backend_developer_agent | qa_lead_agent |
| DEF-003 | Container log output truncated at 4 096 bytes per SSE frame | High | Closed | CP-004 E2E / log-stream service | `bufio.Scanner` default buffer size of 4 096 bytes; long log lines (e.g., stack traces) silently split across frames causing truncated display | Increased scanner buffer to 1 MiB (`bufio.NewReaderSize`) and added frame-continuation logic in the log relay goroutine | backend_developer_agent | qa_lead_agent |
| DEF-004 | Image scan CVE results not persisted on second scan of same image digest | High | Closed | CP-003 E2E / image-service | `INSERT INTO scan_results` used `INSERT` without `ON CONFLICT`; second scan silently failed due to unique constraint violation on `(image_id, scan_run_id)` | Replaced with `INSERT ... ON CONFLICT (image_id, scan_run_id) DO UPDATE SET ...` (upsert); added integration test for idempotent scans | backend_developer_agent | qa_lead_agent |
| DEF-005 | Dashboard CPU utilisation chart displays NaN% on first render before metrics arrive | Medium | Closed | CP-001 E2E / dashboard UI | `metricsData.cpu` was `undefined` for ~800 ms before first WebSocket push; chart renderer divided by `undefined` producing `NaN` | Added null-guard (`metricsData?.cpu ?? 0`) and skeleton placeholder animation in `CpuChart.tsx` | frontend_developer_agent | qa_developer_agent |
| DEF-006 | Container "Stop" action returns 200 but container stays in "Running" state for up to 30 s with no UI feedback | Medium | Closed | CP-001 E2E / container-service | Docker daemon `StopTimeout` defaults to 10 s; API returned immediately without polling; UI polling interval was 60 s | Added optimistic status update to "Stopping" in the UI immediately on action; backend now streams status transitions via SSE until terminal state | frontend_developer_agent | qa_developer_agent |
| DEF-007 | Cluster page shows stale replica counts after manual scale if page is not refreshed | Medium | Closed | CP-002 E2E / cluster UI | React Query cache TTL was set to 5 minutes; after a scale mutation the query was not invalidated | Added `queryClient.invalidateQueries(['services', clusterId])` in the `onSuccess` callback of the scale mutation hook | frontend_developer_agent | qa_developer_agent |
| DEF-008 | Pull Image dialog accepts empty image reference and sends malformed POST to registry-proxy | Medium | Closed | CP-003 E2E / image-service API | No client-side or server-side validation on `image_ref` field; `docker pull ""` returned a cryptic daemon error surfaced as HTTP 500 | Added `required` + regex validation (`^[a-z0-9/._:-]+$`) both on the React form and as a middleware guard in `registry_proxy.go` | backend_developer_agent | qa_developer_agent |
| DEF-009 | User invite email field accepts invalid email formats (e.g., `user@@domain`) | Medium | Closed | CP-005 E2E / auth-service | Email validation used a simple `strings.Contains(email, "@")` check | Replaced with `net/mail.ParseAddress` validation; frontend mirrors with HTML5 `type="email"` + custom regex | backend_developer_agent | qa_developer_agent |
| DEF-010 | Namespace selector dropdown missing `aria-label`; screen reader announces "combobox" only | Low | Closed | Accessibility audit / all pages | `<Select>` component rendered without an associated `<label>` or `aria-label` attribute | Added `aria-label="Select namespace"` and linked a visible `<label htmlFor="namespace-select">` to all instances | frontend_developer_agent | qa_developer_agent |
| DEF-011 | Disabled button text colour contrast ratio 3.8:1 fails WCAG 2.1 AA (minimum 4.5:1) | Low | Closed | Accessibility audit / container list, image list pages | Tailwind `text-gray-400` on `bg-white` disabled buttons yields 3.8:1 contrast | Changed disabled text to `text-gray-500` on `bg-gray-100`; verified new ratio 4.8:1 using axe-core browser extension | frontend_developer_agent | qa_developer_agent |
| DEF-012 | Containers data table missing column `<th>` elements on mobile breakpoint (<768 px); screen reader reads cells as data without header context | Low | Closed | Accessibility audit / containers page (mobile viewport) | Responsive table collapsed to card layout but omitted `scope="col"` headers and `aria-label` on each cell value | Refactored responsive table to use `<caption>` and `data-label` attributes per cell for narrow viewports; NVDA re-tested and confirmed pass | frontend_developer_agent | qa_developer_agent |

---

## Defect Summary

| Severity | Total Found | Closed | Open | Deferred |
|----------|-------------|--------|------|----------|
| Critical | 1           | 1      | 0    | 0        |
| High     | 3           | 3      | 0    | 0        |
| Medium   | 5           | 5      | 0    | 0        |
| Low      | 3           | 3      | 0    | 0        |
| **Total**| **12**      | **12** | **0**| **0**    |

All Critical and High severity defects resolved and verified before Phase 7 exit gate.
Zero open defects at gate closure.

---

## QA Lead Verification

| Field | Value |
|-------|-------|
| QA Lead | qa_lead_agent |
| Verification Date | 2026-06-06 |
| Gate Decision | APPROVED — all defects closed, zero open |
| Next Action | Proceed to Phase 9 (Release) |

> Signed off: **qa_lead_agent** — 2026-06-06
