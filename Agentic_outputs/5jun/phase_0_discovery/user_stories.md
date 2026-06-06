# User Stories with Acceptance Criteria
## Generic Docker Container Management System

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Document ID   | US-DCMS-001                                |
| Version       | 1.0.0                                      |
| Status        | Approved                                   |
| Date          | 2026-06-05                                 |
| Author        | Requirement Agent                          |
| Parent FRD    | FRD-DCMS-001                               |

---

## Personas

| Persona             | Role Description                                                                                       |
|---------------------|--------------------------------------------------------------------------------------------------------|
| Platform Admin      | Full control over the DCMS platform; manages users, hosts, clusters, and global configuration         |
| DevOps Engineer     | Manages container deployments, clusters, networking, and production operations; Operator role          |
| Developer           | Deploys and monitors containers in dev/staging namespaces; limited Operator role scoped to namespace  |
| Security Auditor    | Read-only access to audit logs, scan results, and compliance reports; Viewer + audit role             |
| Read-only Viewer    | Views dashboards and metrics; cannot modify any state; Viewer role                                    |

---

## User Stories

---

**US-001** — Platform Admin — User Management
As a Platform Admin, I want to create a new user account with a specific role so that new team members can access the DCMS with appropriate permissions immediately.

**Acceptance Criteria:**
- Given I am logged in as Platform Admin, when I submit a valid name, email, and role (Admin/Operator/Viewer), then a new user account is created and the user receives a welcome email with a password-setup link.
- Given I submit a duplicate email address, when I create a user, then the system returns a 400 error with the message "Email address already registered."
- Given the new account is created, when I view the audit log, then a "user.create" entry is present with my actor ID, the target user's email, and the UTC timestamp.
- Given a user account is created with Operator role scoped to namespace "dev", when the user logs in and navigates to the "prod" namespace, then all write actions are disabled and a permission-denied message is shown.

**Priority:** Must
**Story Points:** 3

---

**US-002** — Platform Admin — Host Registration
As a Platform Admin, I want to register a new Docker host so that the DCMS can manage containers on that host.

**Acceptance Criteria:**
- Given I provide a valid hostname/IP, SSH credentials, and a target namespace, when I submit the form, then the DCMS deploys the DCMS agent to the host and marks the host as "connected" within 60 seconds.
- Given the agent is deployed, when I view the cluster dashboard, then the new host appears with CPU, memory, disk, and network metrics.
- Given an invalid hostname is provided, when I submit the form, then the system displays an error "Unable to connect to host — check hostname and credentials."
- Given the host is successfully registered, when I view the audit log, then a "host.register" entry is present with my actor ID and the host details.
- Given the host is registered, when a DCMS agent loses connectivity for more than 60 seconds, then the host status changes to "unreachable" and an alert is fired.

**Priority:** Must
**Story Points:** 5

---

**US-003** — Platform Admin — Namespace Management
As a Platform Admin, I want to create and manage namespaces (dev, staging, prod) so that resources and access are isolated between environments.

**Acceptance Criteria:**
- Given I create a namespace named "staging", when I assign an Operator role to a user scoped to "staging", then that user can only view and manage resources tagged to the "staging" namespace.
- Given a namespace is created, when I list namespaces, then it appears with its display name, creation date, and resource counts.
- Given I attempt to delete a namespace that contains running containers, then the system rejects the deletion with the message "Namespace contains N active containers — drain before deleting."
- Given I delete an empty namespace, when I view the audit log, then a "namespace.delete" entry is present.

**Priority:** Must
**Story Points:** 3

---

**US-004** — DevOps Engineer — Deploy Container
As a DevOps Engineer, I want to deploy a new container from a specified image with resource limits and port bindings so that the application is running on the target host within minutes.

**Acceptance Criteria:**
- Given I provide a valid image name, target host, CPU limit, memory limit, and port mapping, when I click "Deploy", then the container is in RUNNING state within 3 minutes.
- Given the target image has a CRITICAL CVE, when I attempt to deploy to the production namespace, then the deployment is blocked and the CVE summary is displayed.
- Given the container starts successfully, when I view the container detail page, then CPU %, memory %, and network I/O are visible within 15 seconds.
- Given I specify an environment variable during deployment, when the container starts, then the variable is accessible within the container.
- Given the deployment succeeds, when I check the audit log, then a "container.create" and "container.start" entry are present with all parameter details.

**Priority:** Must
**Story Points:** 5

---

**US-005** — DevOps Engineer — Stop and Remove Container
As a DevOps Engineer, I want to stop and remove a container that is no longer needed so that host resources are freed.

**Acceptance Criteria:**
- Given a running container, when I click "Stop", then a SIGTERM is sent and the container transitions to STOPPED within the configured timeout (default 30 seconds).
- Given the stop timeout expires before SIGTERM exits, then SIGKILL is sent automatically and the container transitions to STOPPED.
- Given a stopped container, when I click "Remove", then the container is deleted from the host and from the DCMS metadata within 10 seconds.
- Given a running container, when I attempt to remove it without stopping first, then the system requires confirmation and stops then removes in sequence.
- Given removal completes, when I view the audit log, then "container.stop" and "container.remove" entries are present.

**Priority:** Must
**Story Points:** 3

---

**US-006** — DevOps Engineer — Scale a Service
As a DevOps Engineer, I want to scale a Docker Swarm service to a higher replica count so that the application can handle increased traffic.

**Acceptance Criteria:**
- Given a running Swarm service with 2 replicas, when I set replicas to 5, then the dashboard shows a rollout progress indicator and reaches 5 running replicas within 5 minutes.
- Given insufficient cluster resources, when I scale to a replica count that exceeds available capacity, then the system warns me with estimated resource requirements and current cluster headroom before proceeding.
- Given the scale operation completes, when I view the service detail, then the current replica count reflects the new target.
- Given the scale operation succeeds, when I check the audit log, then a "service.scale" entry is present with old and new replica counts.
- Given I set replicas to 0, then all service tasks are stopped and the service is preserved in the cluster in a stopped state.

**Priority:** Must
**Story Points:** 5

---

**US-007** — DevOps Engineer — Configure Alert Rules
As a DevOps Engineer, I want to configure threshold-based alert rules for container restart loops so that I am notified before production impact escalates.

**Acceptance Criteria:**
- Given I create an alert rule "container.restarts > 3 within 10 minutes" for namespace "prod", when a container restarts 4 times in 10 minutes, then an alert fires within 60 seconds.
- Given an alert rule is configured with Slack as notification channel, when the alert fires, then a Slack message is posted to the configured channel with container name, host, restart count, and dashboard link.
- Given I silence an alert for 2 hours, when the same condition fires during the silence window, then no notification is dispatched.
- Given the silence expires, when the condition fires again, then the notification is dispatched normally.
- Given I view the alert history, when an alert has fired, then the full trigger history including timestamps and notification outcomes is visible.

**Priority:** Must
**Story Points:** 5

---

**US-008** — DevOps Engineer — View Container Logs
As a DevOps Engineer, I want to search container logs from the past 7 days so that I can diagnose a production issue without SSH access to the host.

**Acceptance Criteria:**
- Given a container has been running and emitting logs, when I search by container name and keyword within the last 7 days, then matching log lines are returned within 5 seconds.
- Given I filter by time range "last 1 hour", when I view results, then only log lines within that window are displayed.
- Given a container emits JSON-structured logs, when I search, then individual JSON fields are available as filter options.
- Given search returns over 500 results, then pagination with next/previous controls is available.
- Given I click "Export", then a JSON or plain-text file containing the search results is downloaded within 10 seconds.

**Priority:** Must
**Story Points:** 5

---

**US-009** — DevOps Engineer — Manage Docker Networks
As a DevOps Engineer, I want to create an overlay network spanning multiple hosts so that containers on different hosts can communicate securely.

**Acceptance Criteria:**
- Given I provide a network name, "overlay" driver, and a valid CIDR range, when I create the network, then it is created on the Swarm cluster and visible in the network list.
- Given two containers on different hosts are connected to the same overlay network, when container A pings container B by container name, then the ping succeeds (DNS resolution works).
- Given I attempt to delete a network with active container attachments, then the system rejects the deletion with the message "Network has N attached containers."
- Given the network is created, when I view the network detail, then all attached containers, their IPs on the network, and the network driver are displayed.

**Priority:** Must
**Story Points:** 5

---

**US-010** — DevOps Engineer — Manage Volumes
As a DevOps Engineer, I want to create a persistent volume and attach it to a container so that data survives container restarts.

**Acceptance Criteria:**
- Given I create a named volume "db-data" on host "host-a", when I deploy a container with this volume mounted at "/var/lib/postgresql/data", then the volume is mounted correctly and data written to that path persists after the container is restarted.
- Given the volume exists, when I view volume details, then the mount path, size estimate, and attached container count are displayed.
- Given a volume is referenced by a stopped container, when I attempt to delete the volume, then deletion is blocked with the message "Volume referenced by container <name> — remove the container first."
- Given volume usage exceeds 80% of allocated size, then an alert is generated per the configured alert rules.

**Priority:** Must
**Story Points:** 3

---

**US-011** — DevOps Engineer — Pull Image with Vulnerability Scan
As a DevOps Engineer, I want to pull a container image and automatically scan it for vulnerabilities so that I know the risk profile before deploying.

**Acceptance Criteria:**
- Given I provide a valid image name and tag, when I initiate a pull, then the image is downloaded and scanned within 5 minutes for images under 1 GB.
- Given the scan is complete, when I view the image detail, then a CVE summary (critical, high, medium, low counts) is visible with links to CVE details.
- Given the image has CRITICAL CVEs, when I attempt to deploy it to the "prod" namespace, then the deployment is blocked and a warning banner displays the critical findings.
- Given the image passes scanning (no critical CVEs), when I view it in the image list, then it is marked with a green "Scan Passed" badge.
- Given the image already exists locally and I trigger a re-scan, then the scan runs again and updates the stored results.

**Priority:** Must
**Story Points:** 5

---

**US-012** — DevOps Engineer — Register Registry Credentials
As a DevOps Engineer, I want to add credentials for a private container registry so that the DCMS can pull and push images without authentication errors.

**Acceptance Criteria:**
- Given I provide a registry URL, username, and password/token, when I save the credentials, then they are stored encrypted at rest and a "Credentials saved" confirmation is shown.
- Given the credentials are saved, when I pull an image from that registry, then the pull succeeds without a separate authentication prompt.
- Given I revoke credentials, when I subsequently attempt a pull from that registry, then the pull fails with "Registry credentials not found — please re-register."
- Given credentials are added or revoked, when I view the audit log, then the event is recorded (password value is never logged — only registry URL and actor).

**Priority:** Must
**Story Points:** 3

---

**US-013** — Developer — Self-Service Container Deployment (Dev Namespace)
As a Developer, I want to deploy a container to the dev namespace without filing a DevOps ticket so that I can test my application changes immediately.

**Acceptance Criteria:**
- Given I have Operator role scoped to the "dev" namespace, when I deploy a container, then the container is created in the "dev" namespace within 3 minutes.
- Given I attempt to deploy to the "prod" namespace, then the action is blocked with a "Insufficient permissions for namespace 'prod'" error.
- Given the deployment succeeds, when I view the container detail, then environment variables, port bindings, and resource usage are visible.
- Given the container fails to start (e.g., OOM), when I view the container detail, then the last error message from the Docker daemon is displayed.

**Priority:** Must
**Story Points:** 3

---

**US-014** — Developer — Restart a Container
As a Developer, I want to restart a container running in my dev namespace so that a code change (via mounted volume) takes effect.

**Acceptance Criteria:**
- Given a running container in my authorized namespace, when I click "Restart", then the container is stopped and restarted within 30 seconds.
- Given the container fails to restart (exits immediately), then the container status is shown as "Restarting (exit code N)" with the last 20 log lines displayed.
- Given the restart completes successfully, when I view container logs, then the new session's stdout entries are visible from the restart timestamp.

**Priority:** Must
**Story Points:** 2

---

**US-015** — Developer — Live Log Tail
As a Developer, I want to live-tail a container's stdout logs from the dashboard so that I can watch my application's output in real time during testing.

**Acceptance Criteria:**
- Given a running container in my namespace, when I open the "Live Logs" tab, then log lines are streamed in real time with under 2-second latency.
- Given the container emits more than 1000 lines, then the live view automatically scrolls to the bottom and buffers the last 1000 lines.
- Given I close the browser tab or navigate away, then the WebSocket connection is closed and no server resources are leaked.
- Given I click "Pause", then the live stream stops updating; clicking "Resume" resumes the stream from the current point.

**Priority:** Must
**Story Points:** 3

---

**US-016** — Developer — View Container Resource Usage
As a Developer, I want to view the CPU and memory usage of my container over the last hour so that I can detect resource bottlenecks in my application.

**Acceptance Criteria:**
- Given a running container, when I open the metrics tab, then CPU % and memory % charts for the last hour are displayed within 3 seconds.
- Given the container's CPU usage exceeds 80% for 5 continuous minutes, then the chart highlights this period in amber.
- Given the metrics dashboard is open, then data refreshes every 10 seconds without requiring a page reload.
- Given I select a custom time range of "last 6 hours", then the chart updates to display the requested period.

**Priority:** Must
**Story Points:** 3

---

**US-017** — Developer — Exec Into Container
As a Developer, I want to open a shell session into a running container from the DCMS dashboard so that I can diagnose issues without needing SSH access to the host.

**Acceptance Criteria:**
- Given a running container, when I click "Open Terminal", then an interactive shell session opens in the browser within 5 seconds.
- Given I execute a command in the terminal (e.g., `ls /app`), then the output is displayed within 1 second.
- Given I close the terminal panel, then the exec session on the server side is terminated immediately.
- Given the exec session is opened, when I view the audit log, then a "container.exec" entry is present with actor ID, container ID, and timestamp.
- Given the container is not running, when I click "Open Terminal", then the button is disabled with a tooltip "Container must be running to exec."

**Priority:** Should
**Story Points:** 5

---

**US-018** — Security Auditor — Search Audit Logs
As a Security Auditor, I want to search the audit log by user, action type, and date range so that I can produce evidence for a SOC 2 audit.

**Acceptance Criteria:**
- Given audit log entries exist, when I search by actor email and action "container.start" for a 30-day window, then all matching entries are returned within 5 seconds.
- Given I search by action "user.role_assign" for the past 90 days, then all role assignment events are returned with actor, target user, role granted, and timestamp.
- Given I click "Export to CSV", then a CSV file is generated and downloaded containing all entries matching the current search filters.
- Given an audit log entry is requested, it is impossible for any user (including Admin) to delete or modify audit log records through the UI or API.
- Given log entries are over 90 days old (configurable retention), then they are archived to cold storage and retrievable via export — not deleted.

**Priority:** Must
**Story Points:** 5

---

**US-019** — Security Auditor — Review Image Scan Results
As a Security Auditor, I want to review the CVE scan history for all images deployed to production so that I can verify the organization's container security posture.

**Acceptance Criteria:**
- Given production containers are running, when I navigate to "Images — Scan History", then all images currently deployed to the "prod" namespace are listed with their most recent scan results.
- Given I select an image, when I view its scan detail, then all CVEs are listed with CVE ID, severity, affected package, version, fix version (if available), and CVSS score.
- Given an image has CRITICAL CVEs and was deployed to production, then it is flagged with a red "Policy Violation" badge in the scan history view.
- Given I filter by "CRITICAL severity only", then only images with at least one critical CVE are shown.

**Priority:** Must
**Story Points:** 3

---

**US-020** — Security Auditor — Verify RBAC Compliance
As a Security Auditor, I want to view all user accounts and their assigned roles so that I can verify the principle of least privilege is enforced.

**Acceptance Criteria:**
- Given I navigate to the "Users & Roles" report, then all active accounts are listed with email, role, namespace scope, last login date, and MFA status.
- Given a user has not logged in for 90 days, then their account is flagged in the report with an "Inactive" badge.
- Given I export the user-role report to CSV, then all user-role-namespace triples are included.
- Given a user has Admin role, then their account is highlighted distinctly in the report.

**Priority:** Must
**Story Points:** 3

---

**US-021** — Security Auditor — API Key Usage Report
As a Security Auditor, I want to see all active API keys, their last-used timestamps, and associated roles so that I can identify and revoke unused or over-privileged keys.

**Acceptance Criteria:**
- Given I navigate to "API Keys — Audit View", then all active keys are listed with name, owner, role, namespace, creation date, and last-used timestamp (never the key value).
- Given an API key has not been used in 30 days, then it is flagged as "Dormant" in the report.
- Given I revoke an API key, when the key is immediately used in a subsequent API call, then the API returns 401 Unauthorized.
- Given a key is revoked, when I view the audit log, then a "apikey.revoke" entry is present with actor and target key name.

**Priority:** Should
**Story Points:** 3

---

**US-022** — Read-only Viewer — Cluster Overview
As a Read-only Viewer, I want to see the cluster overview dashboard so that I can monitor the health of deployed services without modifying anything.

**Acceptance Criteria:**
- Given I log in with Viewer role, when I navigate to the dashboard, then total host count, running/stopped container counts, cluster CPU/memory utilization, and active alert count are displayed.
- Given the dashboard is open, then all action buttons (Deploy, Stop, Restart, Remove) are absent or disabled for Viewer users.
- Given a container becomes unhealthy, when the dashboard refreshes (every 10 seconds), then the health status indicator updates automatically.
- Given I navigate to a container detail page, then I can view all metadata and metrics but the "Stop", "Restart", "Remove", and "Exec" buttons are not rendered.

**Priority:** Must
**Story Points:** 2

---

**US-023** — Read-only Viewer — View Logs (Read-only)
As a Read-only Viewer, I want to view container logs in the centralized log viewer so that I can help diagnose issues without needing direct host access.

**Acceptance Criteria:**
- Given I navigate to the Log Viewer, when I search for a container name and keyword, then matching log lines are displayed with timestamps.
- Given I have Viewer role scoped to the "dev" namespace, when I search for logs from the "prod" namespace, then no results are returned and a "No access to this namespace" message is shown.
- Given I view logs, then no UI controls for modifying log retention or configuration are visible.
- Given I click "Export", then a log export file is generated (Viewers can export — they cannot delete).

**Priority:** Must
**Story Points:** 2

---

**US-024** — Platform Admin — Configure SSO / OIDC
As a Platform Admin, I want to configure OIDC-based SSO so that all users authenticate via the company's identity provider instead of local passwords.

**Acceptance Criteria:**
- Given I provide a valid OIDC issuer URL, client ID, and client secret, when I save the SSO configuration, then the login page displays a "Login with Company SSO" button.
- Given a user clicks "Login with Company SSO", when the IdP authentication succeeds, then the user is granted a DCMS session with the role mapped from their IdP group.
- Given an IdP group "dcms-admin" is mapped to the Admin role, when a member of that group logs in, then they receive Admin role in DCMS.
- Given SSO is enabled and local passwords are disabled, when a user attempts to log in with username/password, then the attempt is rejected with a message "Local authentication is disabled — use SSO."
- Given the OIDC configuration is saved, when I view the audit log, then an "sso.config.update" entry is present.

**Priority:** Must
**Story Points:** 8

---

**US-025** — Platform Admin — Manage Alert Notification Channels
As a Platform Admin, I want to configure Slack and email notification channels for alerts so that the on-call team receives critical notifications on their preferred channels.

**Acceptance Criteria:**
- Given I provide a Slack webhook URL and channel name, when I save the configuration, then a test notification is sent automatically and a "Test message sent" confirmation is shown.
- Given an alert fires and Slack is configured, when the notification is dispatched, then it arrives in the configured Slack channel within 60 seconds.
- Given an alert fires and email is configured, when the notification is dispatched, then the email is delivered to the configured distribution list within 60 seconds.
- Given a notification channel fails delivery, when DCMS retries with exponential backoff and the maximum retries are exhausted, then the failed delivery is recorded in the notification history.
- Given I remove a notification channel, when alerts subsequently fire, then no notifications are sent to the removed channel.

**Priority:** Must
**Story Points:** 3

---

**US-026** — Platform Admin — MFA Enforcement
As a Platform Admin, I want to enforce multi-factor authentication for all Admin role accounts so that privileged access is protected against credential compromise.

**Acceptance Criteria:**
- Given MFA enforcement is enabled for the Admin role, when an Admin user logs in with correct username and password, then they are redirected to an MFA challenge (TOTP or hardware key).
- Given the MFA challenge is not completed, when the user's session token is used to call a state-changing API endpoint, then the API returns 403 "MFA required."
- Given an Admin user completes MFA enrollment, when they log in for the first time after enrollment, then the MFA challenge is presented.
- Given a user account is downgraded from Admin to Operator role, then MFA enforcement no longer applies to that account (unless global MFA is enabled).

**Priority:** Should
**Story Points:** 5

---

**US-027** — DevOps Engineer — Kubernetes Deployment Management
As a DevOps Engineer, I want to view and manage Kubernetes Deployments from the DCMS so that I can use a single tool for both Docker Swarm and Kubernetes workloads.

**Acceptance Criteria:**
- Given a kubeconfig is uploaded and validated, when I navigate to the "Kubernetes" section, then all Namespaces, Deployments, Pods, and Services are listed.
- Given I select a Deployment and set replicas to 3, when I apply the change, then the Kubernetes Deployment's replica count is updated and the rollout status is tracked.
- Given a Pod crashes repeatedly (CrashLoopBackOff), then it is highlighted in red in the Pod list with its restart count and latest exit code.
- Given I view a Pod's logs, then stdout/stderr is displayed using the same log viewer as for Docker containers.

**Priority:** Should
**Story Points:** 8

---

**US-028** — DevOps Engineer — Drain a Cluster Node for Maintenance
As a DevOps Engineer, I want to drain a cluster node and mark it for maintenance so that I can perform OS patching without causing service downtime.

**Acceptance Criteria:**
- Given a cluster node has running workloads, when I click "Drain Node", then DCMS sets the node as unschedulable and reschedules all tasks to other available nodes within 5 minutes.
- Given the drain completes successfully, when I view the node, then it is marked "Maintenance Mode" and no new containers are scheduled to it.
- Given I click "Resume Node", then the node returns to schedulable state and is available for new workloads.
- Given only one node exists in the cluster, when I attempt to drain it, then the system warns "Draining the last node will stop all workloads" and requires explicit confirmation.

**Priority:** Should
**Story Points:** 5

---

**US-029** — Developer — View Container Health Check Status
As a Developer, I want to see the Docker HEALTHCHECK status of my containers so that I know when my application's health probe is failing without digging into logs.

**Acceptance Criteria:**
- Given a container is configured with a HEALTHCHECK instruction, when I view the container list, then a health status badge (Healthy / Unhealthy / Starting) is displayed next to each container.
- Given a container transitions to "Unhealthy", when the status changes, then the health badge updates within 15 seconds and an alert is generated if an alert rule is configured for that event.
- Given I view the container detail page, then the last 5 health check results are shown with timestamp and output of each check.
- Given a container has no HEALTHCHECK instruction, then "No health check" is displayed rather than a false Healthy status.

**Priority:** Must
**Story Points:** 2

---

**US-030** — Platform Admin — OpenAPI Documentation Access
As a Platform Admin, I want to access the live OpenAPI documentation for the DCMS API so that I can integrate the DCMS into CI/CD pipelines and internal tooling.

**Acceptance Criteria:**
- Given the DCMS API server is running, when I navigate to `/api/docs`, then a fully rendered Swagger UI is displayed listing all endpoints.
- Given I click "Authorize" in Swagger UI and provide a valid API key, when I execute a request, then the response is returned inline in the UI.
- Given a new API endpoint is deployed, when I reload `/api/docs`, then the new endpoint is present in the specification without manual updates.
- Given the OpenAPI spec is downloaded as JSON, then it is a valid OpenAPI 3.1 document that passes schema validation.

**Priority:** Must
**Story Points:** 2

---

**US-031** — DevOps Engineer — Export Logs for Incident Report
As a DevOps Engineer, I want to export container logs for a specific 2-hour window during a production incident so that I can attach them to the post-mortem report.

**Acceptance Criteria:**
- Given I navigate to the Log Viewer and set a custom time range, when I click "Export", then a download is initiated within 10 seconds.
- Given the export contains more than 100,000 lines, then the export is processed asynchronously and I receive an email with a download link when ready.
- Given the export file is downloaded, then it is in valid JSON Lines or plain text format with each entry containing container name, timestamp, and log line.
- Given I export logs for a container that no longer exists, then historical logs within the configured retention period are still available for export.

**Priority:** Should
**Story Points:** 3

---

**US-032** — Platform Admin — Resource Usage Dashboard
As a Platform Admin, I want to view resource utilization per host and per namespace so that I can make informed decisions about capacity planning.

**Acceptance Criteria:**
- Given I open the "Resource Usage" view, then CPU %, memory %, disk %, and network I/O are displayed for each registered host.
- Given I filter by namespace "prod", then aggregate resource consumption for all containers in that namespace is shown.
- Given a host's memory usage exceeds 85%, then the host is highlighted in amber on the resource dashboard.
- Given I set a 7-day time range, then average and peak utilization per host for that period are displayed.

**Priority:** Should
**Story Points:** 3

---

**US-033** — Security Auditor — Failed Login Report
As a Security Auditor, I want to view a report of failed login attempts so that I can detect potential brute-force or credential-stuffing attacks.

**Acceptance Criteria:**
- Given a user fails to log in 5 times within 10 minutes, then the account is temporarily locked and an alert is sent to the configured security notification channel.
- Given I navigate to "Security Events — Failed Logins", then all failed login events for the past 30 days are listed with timestamp, username attempted, source IP, and failure reason.
- Given I filter by source IP, then all failed attempts from that IP are displayed regardless of the username attempted.
- Given I export the failed login report, then a CSV file with the full event list is downloaded.

**Priority:** Should
**Story Points:** 3
