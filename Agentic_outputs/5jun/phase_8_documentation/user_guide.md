# DCMS User Guide

**Product:** Docker Container Management System (DCMS)
**Version:** 1.0.0
**Audience:** Platform Admins, DevOps Engineers, Developers, Security Auditors, Viewers
**Last Updated:** 2026-09-30

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Managing Containers](#3-managing-containers)
4. [Managing Images](#4-managing-images)
5. [Networking](#5-networking)
6. [Volumes and Storage](#6-volumes-and-storage)
7. [Monitoring and Alerts](#7-monitoring-and-alerts)
8. [User Access Management](#8-user-access-management)
9. [Cluster Management](#9-cluster-management)
10. [Keyboard Shortcuts](#10-keyboard-shortcuts)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Introduction

### What is DCMS?

The Docker Container Management System (DCMS) is a centralized web platform that gives your team a single place to deploy, monitor, and operate containerized workloads across one or more Docker hosts — without requiring SSH access to individual machines or deep Docker CLI expertise.

DCMS replaces ad-hoc shell scripts and per-host Docker CLI workflows with a governed, role-based interface that enforces organizational policies automatically. Every action taken through DCMS is recorded in an append-only audit log suitable for SOC 2 compliance evidence.

### Who is DCMS For?

| Role | Primary Use Cases |
|---|---|
| Platform Admin | Cluster registration, RBAC configuration, OIDC SSO setup, audit log review |
| DevOps Engineer | Container lifecycle management, image operations, networking, alerting |
| Developer | Deploying and inspecting containers in development and staging namespaces |
| Security Auditor | Reviewing CVE scan results, audit logs, RBAC posture |
| Viewer | Read-only observation of dashboards, logs, and container status |

### Key Capabilities

- **Container Lifecycle:** Create, start, stop, restart, kill, and remove containers from a browser dashboard. Real-time status updates appear within 2 seconds via Server-Sent Events.
- **Image Management:** Pull images from public or private registries, view CVE vulnerability scan results, and manage the image inventory on each host.
- **Networking:** Create Docker overlay networks, attach containers to networks, and manage port mappings with conflict detection.
- **Volumes:** Create named volumes, attach them to containers, and monitor disk usage.
- **Monitoring and Alerting:** View CPU, memory, and network I/O charts per container and per host. Define threshold-based alert rules that notify via Slack or email.
- **Centralized Logging:** Stream live container logs in the browser or search historical logs across a 30-day window.
- **RBAC:** Admin, Operator, and Viewer roles scoped to namespaces (dev, staging, prod).
- **Multi-host Cluster Management:** Register multiple Docker hosts, view node health, and distribute workloads across a Docker Swarm cluster.
- **Audit Trail:** Every state-changing action is logged with actor identity, timestamp, and before/after values.
- **SSO:** Authenticate with your company's OIDC identity provider (Keycloak, Azure Entra ID, Okta, etc.).

---

## 2. Getting Started

### 2.1 First Login

1. Navigate to your DCMS instance URL in a browser (example: `https://dcms.example.com`).
2. If your organization uses OIDC SSO, click **Login with Company SSO**. You will be redirected to your identity provider. After authenticating, you are returned to DCMS automatically.
3. If you are logging in with a local account (created by an Admin), enter your email and password, then click **Sign In**.
4. On first login, you may be prompted to accept the platform usage policy. Click **Accept and Continue**.
5. After login, you land on the **Cluster Overview** dashboard.

> **Tip:** Bookmark the DCMS URL now. If your session expires (access tokens last 15 minutes; the session auto-refreshes silently while your browser tab is open), you will be redirected back to the login page automatically.

> **Warning:** Do not share your API keys or session credentials with colleagues. Each user should have their own account. Shared credentials break the audit trail and make it impossible to attribute actions to individuals.

### 2.2 Dashboard Overview Tour

The DCMS dashboard is organized into five main areas:

**Top Navigation Bar**
- DCMS logo (links to Cluster Overview)
- Namespace selector (top-center): a dropdown showing all namespaces you have access to (e.g., `dev`, `staging`, `prod`). Most views are scoped to the selected namespace.
- Notification bell: alert count for currently firing alerts.
- User avatar menu: profile, API keys, and logout.

**Left Sidebar Navigation**
| Icon | Section | Description |
|---|---|---|
| Grid | Overview | Cluster and host health summary |
| Box | Containers | Container list, details, logs, stats |
| Layers | Images | Image registry, CVE scan results |
| Network | Networks | Network list and configuration |
| Database | Volumes | Volume list and usage |
| Chart | Monitoring | Metrics dashboards and alert rules |
| Scroll | Logs | Centralized log viewer |
| Server | Cluster | Node list and Swarm services |
| Users | Users (Admin only) | User management and RBAC |

**Main Content Area:** Changes based on the selected sidebar item.

**Status Bar (bottom of screen):** Shows the currently selected namespace, your role in that namespace, and real-time connection status (green dot = SSE connected).

### 2.3 The Namespace Concept

A **namespace** in DCMS is an isolated organizational boundary that groups containers, volumes, networks, and access policies together. Think of it as a "project" or "environment."

Common namespace examples:
- `dev` — development workloads, relaxed policies, Viewer role can see everything
- `staging` — pre-production, Operator role required to deploy
- `prod` — production, Operator role required, CRITICAL CVE images blocked

**Rules about namespaces:**
- You can only see and act on resources within namespaces you have been granted access to.
- Deploying a container always targets a specific namespace.
- Alert rules, volumes, and networks are namespace-scoped.
- Admins can create and delete namespaces from the Users section.

To switch the active namespace, click the namespace selector in the top navigation bar and choose the desired namespace from the dropdown.

---

## 3. Managing Containers

### 3.1 Deploying a New Container

1. In the left sidebar, click **Containers**.
2. Click the **Deploy Container** button (top-right of the container list).
3. The **Deploy Container** form opens. Fill in the fields:

| Field | Description | Example |
|---|---|---|
| Container Name | A unique name for the container within the namespace. Letters, numbers, hyphens allowed. | `api-server-v2` |
| Image | The full image reference including tag. Click the image browser icon to select from already-pulled images. | `nginx:1.25-alpine` |
| Namespace | Pre-selected from the active namespace. Change here if needed. | `staging` |
| Target Host | The Docker host to deploy to. DCMS automatically selects the least-loaded host if left on "Auto". | `worker-node-02` |
| Command | Override the container's default CMD. Leave blank to use the image default. | `/bin/sh -c "npm start"` |
| Environment Variables | Key=value pairs injected as container environment variables. Click **+ Add Variable** for each. | `NODE_ENV=production` |
| Port Bindings | Map a host port to a container port. Format: `host_port:container_port/protocol`. DCMS checks for host port conflicts automatically. | `8080:80/tcp` |
| Volume Mounts | Attach an existing named volume or bind mount. Select from dropdown. | `data-vol:/app/data` |
| Network | Attach the container to one or more existing networks. | `app-overlay` |
| CPU Limit | Maximum CPU shares. `0` means no limit. | `1.0` (= 1 full CPU core) |
| Memory Limit | Maximum memory. Accepts `256m`, `1g`, etc. | `512m` |
| Restart Policy | What to do when the container exits: `no`, `on-failure`, `always`, `unless-stopped`. | `unless-stopped` |
| Labels | Docker labels attached to the container. Key=value format. | `team=backend` |

4. Click **Review** to preview the configuration summary.
5. Click **Deploy**. The container appears immediately in the list with status **Starting**.
6. Within a few seconds, the status updates to **Running** (or **Error** if the container failed to start).

> **Tip:** Use the **Save as Template** button on the review screen to save the current configuration as a reusable template for future deployments. Templates are namespace-scoped.

> **Warning:** Deploying to the `prod` namespace with a container image that has CRITICAL CVEs is blocked at the API layer. You will see an error message listing the blocking CVEs and their CVSSv3 scores. Either update the image to a version without the vulnerability or contact your security team.

### 3.2 Container Status Indicators

Each container in the list displays a colored status pill:

| Status | Color | Meaning |
|---|---|---|
| Running | Green | Container is running and its health check (if configured) is passing. |
| Starting | Blue (pulsing) | Container has been created and is in the process of starting. |
| Stopped | Gray | Container exited cleanly (exit code 0) or was stopped manually. |
| Error | Red | Container exited with a non-zero exit code or failed to start. Click the container to see the error details. |
| Paused | Yellow | Container processes are frozen (SIGSTOP sent). Not schedulable during this state. |
| Removing | Orange | Container is being deleted. |
| Unknown | Dark gray | DCMS agent on the container's host is temporarily unreachable. The last known state is shown. |

Click any container row to open the **Container Detail** view.

### 3.3 Starting, Stopping, and Restarting Containers

**From the container list:**
- Hover over a container row to reveal the action buttons on the right: **Start**, **Stop**, **Restart**, **Remove**.
- Click the desired action. A confirmation dialog appears for **Stop** and **Remove** actions.
- For bulk actions, check the checkbox next to multiple containers, then use the **Bulk Actions** dropdown at the top of the list.

**From the container detail view:**
- The action buttons are displayed in the header bar of the detail page.
- **Start** is only available when the container is Stopped.
- **Stop** sends SIGTERM to the container, waits 10 seconds, then sends SIGKILL if still running.
- **Restart** is equivalent to a stop followed by a start without removing the container.
- **Kill** sends SIGKILL immediately without a grace period. Use this for unresponsive containers.

> **Tip:** Keyboard shortcut `S` in the container detail view triggers a Stop, and `R` triggers a Restart (see Section 10 for the full shortcut list).

### 3.4 Viewing Live Logs

1. Open the **Container Detail** view by clicking on a container.
2. Click the **Logs** tab.
3. Logs stream automatically from the moment the tab opens. New lines appear at the bottom.

**Log stream controls:**
| Control | Description |
|---|---|
| Pause / Resume button | Freezes the log stream so you can read without new lines scrolling past. |
| Show timestamps toggle | Prepends each log line with the container-reported timestamp. |
| Lines to show | Dropdown to select initial history: 100, 500, 1000, or "Since container start". |
| Search box | Filters the visible log lines in real time. Matches are highlighted in yellow. The search applies to both already-loaded lines and new incoming lines. |
| Follow toggle | When on (default), the view auto-scrolls to the newest line. When off, you can scroll freely. |
| Download button | Downloads the currently loaded log lines as a `.log` text file. |

> **Tip:** Press `Ctrl+F` anywhere in the Logs tab to focus the search box instantly.

**Log stream uses Server-Sent Events (SSE).** Logs are forwarded from the Docker Engine on the host through the DCMS agent and log-service in real time. Expected latency from container stdout to browser display is under 2 seconds under normal load.

### 3.5 Accessing Container Terminal (exec)

> **Note:** Container exec (interactive terminal) is available from DCMS v1.5 onward. In v1.0, use `docker exec` directly on the host if terminal access is needed.

### 3.6 Container Stats

1. Open the **Container Detail** view.
2. Click the **Stats** tab.

The Stats tab displays four real-time charts updated every 5 seconds:

| Chart | What It Shows | How to Interpret |
|---|---|---|
| CPU Usage | Percentage of the allocated CPU limit consumed. X-axis: last 10 minutes. | Sustained >80% indicates the container may be CPU-starved. Consider increasing the CPU limit or reducing workload. |
| Memory Usage | Memory used in MB vs. the configured memory limit. Includes a "limit" dashed line. | When usage approaches the limit line, the container is at risk of OOM kill. Increase the memory limit or investigate memory leaks. |
| Network I/O | Inbound and outbound network bytes per second. Separate lines for RX and TX. | Large spikes may indicate a traffic surge, a DDoS, or a misconfigured retry loop. |
| Block I/O | Disk read and write bytes per second from the container's writable layer. | High write rates combined with memory pressure can indicate excessive disk buffering. |

All charts support hover-over tooltips showing the exact value at any point in time. Use the time range selector (top-right of the Stats tab) to view 1 hour, 6 hours, or 24 hours of history.

---

## 4. Managing Images

### 4.1 Pulling Images

1. In the left sidebar, click **Images**.
2. Click **Pull Image**.
3. Fill in the pull form:

| Field | Description | Example |
|---|---|---|
| Registry | Select from configured registries or enter a custom registry URL. | `registry.example.com` |
| Image Name | Repository and image name. | `myorg/api-server` |
| Tag | Specific tag or digest to pull. Use `latest` with care in production. | `v2.3.1` |
| Target Host | Which host to pull the image onto. Pulling to all hosts is possible via "All Hosts" option. | `manager-node-01` |

4. Click **Pull**. A progress modal shows the layer-by-layer download progress.
5. When the pull completes, a Trivy vulnerability scan starts automatically. The image is listed with status **Scanning**.
6. When the scan finishes (typically under 3 minutes for images under 1 GB), the status changes to **Scan Passed** or **Scan: N Critical / M High** depending on results.

> **Warning:** Pulling with tag `latest` means the image is not pinned to a specific version. In production namespaces, DCMS will warn you that unpinned images are a deployment risk. Use a specific version tag or digest reference (`nginx@sha256:abc123...`) for production workloads.

**Private Registry Authentication:**
Registry credentials are configured in **Settings > Registry Credentials** (Admin only). Credentials are stored encrypted in Vault; they are never shown in plaintext after saving.

### 4.2 Image List

The Images page shows all images available on each host within the current namespace. Columns include:

| Column | Description |
|---|---|
| Image | Repository name and tag. |
| Registry | Source registry. |
| Host | Which Docker host holds this image. |
| Size | Uncompressed image size on disk. |
| Pulled | When the image was last pulled. |
| Scan Status | Result of the most recent Trivy scan. Click to open the full scan report. |
| Containers | Number of running containers using this image. |
| Actions | Pull (re-pull to update), Scan (re-scan), Delete. |

Click any image row to open the **Image Detail** view, which shows the full list of image layers, environment variables, exposed ports, and the complete CVE scan report.

### 4.3 Running Vulnerability Scans

Scans run automatically after every image pull. You can also trigger a manual re-scan at any time by clicking the **Scan** button on an image.

**Interpreting Scan Results:**

Trivy categorizes each discovered CVE by severity according to the CVSSv3 base score:

| Severity | CVSSv3 Score Range | DCMS Behavior |
|---|---|---|
| Critical | 9.0 – 10.0 | Deployment to `prod` namespace is blocked. Alert is fired. Image tagged `policy:blocked-production`. |
| High | 7.0 – 8.9 | Deployment proceeds with a warning banner. Alert is logged. |
| Medium | 4.0 – 6.9 | Shown in scan report. No deployment restriction. |
| Low | 0.1 – 3.9 | Shown in scan report. No deployment restriction. |
| Informational | N/A | Shown in scan report. No CVSSv3 score. |

The scan report table shows for each CVE:
- CVE ID (e.g., `CVE-2024-12345`) — links to the NVD entry
- Package name and installed version
- Fixed version (if a patch is available)
- Severity and CVSSv3 score
- Description

> **Tip:** If Trivy reports a CVE that you have confirmed is not exploitable in your configuration (for example, the vulnerable code path is not reachable), contact your Admin to add a suppression entry in the `.trivyignore` file for that image repository. All suppressions are logged in the audit trail.

### 4.4 Deleting Unused Images

1. In the Images list, identify images with **0 containers** in the Containers column. These are not in active use.
2. Click the **Delete** button for the image you want to remove.
3. A confirmation dialog warns you that the image will be removed from the specified host and asks you to confirm.
4. Click **Delete Image** to confirm. The image is removed immediately.

> **Warning:** Deleting an image that is referenced by a stopped container means that container cannot be restarted unless the image is pulled again. DCMS warns you if any stopped containers reference the image before deletion.

---

## 5. Networking

### 5.1 Creating a Network

1. In the left sidebar, click **Networks**.
2. Click **Create Network**.
3. Fill in the form:

| Field | Description | Example |
|---|---|---|
| Network Name | Unique name within the namespace. | `app-backend-overlay` |
| Driver | Network driver. `overlay` for multi-host (Swarm), `bridge` for single-host. | `overlay` |
| Subnet | CIDR block for the network. Leave blank to auto-assign. | `10.10.1.0/24` |
| Gateway | Gateway IP for the subnet. Leave blank to auto-assign. | `10.10.1.1` |
| Attachable | Allow standalone containers (not Swarm services) to attach. | Enabled |
| Encrypted | Enable IPsec encryption on the overlay network data plane. | Disabled (enable for sensitive east-west traffic) |

4. Click **Create**. The network is provisioned across the Swarm cluster within seconds.

### 5.2 Attaching Containers to Networks

**During deployment:** In the Deploy Container form, select one or more networks from the **Network** field.

**After deployment (live attach):**
1. Open the **Container Detail** view.
2. Click the **Networks** tab.
3. Click **Connect to Network**, select the network from the dropdown, and optionally specify a network alias.
4. Click **Connect**. The container joins the network without being restarted.

To disconnect a container from a network, click **Disconnect** next to the network in the Networks tab.

### 5.3 Port Mapping

Port mappings are configured at container creation time in the **Port Bindings** field. DCMS performs conflict detection: if the requested host port is already in use on the target host by another container, the deployment is blocked with a clear error message showing which container is using the port.

**Format:** `host_port:container_port/protocol`
- `8080:80/tcp` — maps host port 8080 to container port 80 over TCP
- `5000:5000/udp` — maps host port 5000 to container port 5000 over UDP

To view all port mappings for a running container, open the Container Detail view and look at the **Ports** section in the Overview tab. Each port mapping shows the host IP:port and the container port.

> **Tip:** If you need to expose a service externally, map it to a host port and configure your load balancer or DNS to route traffic to that host. DCMS does not manage external load balancers directly in v1.0.

---

## 6. Volumes and Storage

### 6.1 Creating a Volume

1. In the left sidebar, click **Volumes**.
2. Click **Create Volume**.
3. Fill in the form:

| Field | Description | Example |
|---|---|---|
| Volume Name | Unique name within the namespace. | `postgres-data` |
| Driver | Storage driver. `local` for host-local storage. Other drivers (NFS, EFS) if installed on the host. | `local` |
| Target Host | Which host to create the volume on. Volumes are host-local unless using a network storage driver. | `worker-node-01` |
| Driver Options | Driver-specific options as key=value pairs. | `type=nfs,device=:/exports/data` |
| Labels | Docker labels for the volume. | `env=prod,service=database` |

4. Click **Create**. The volume appears in the volume list.

### 6.2 Mounting Volumes to Containers

**During deployment:** In the **Volume Mounts** field of the Deploy Container form, click **+ Add Mount** and select:
- **Volume Name:** the named volume to mount
- **Mount Path:** the path inside the container where the volume will appear (e.g., `/var/lib/postgresql/data`)
- **Read-only:** check to make the mount read-only

**After deployment:** Volume mounts cannot be changed on a running container. You must stop the container, note the volume mounts, remove the container, and re-deploy with the updated mount configuration.

### 6.3 Checking Volume Usage

In the Volume list, each volume shows:
- **Used By:** number of containers currently mounting this volume
- **Created:** when the volume was created
- **Host:** which host the volume resides on

Click a volume to see the full detail including all containers using it and the mount paths.

> **Warning:** Deleting a volume is irreversible and destroys all data stored in it. DCMS blocks deletion of volumes that are currently mounted to running containers. You must stop and remove all containers using the volume before deletion is permitted.

---

## 7. Monitoring and Alerts

### 7.1 Reading the Monitoring Dashboard

1. In the left sidebar, click **Monitoring**.
2. The **Host Overview** page shows a grid of host cards, one per registered Docker host, displaying:
   - CPU usage percentage (color-coded: green <60%, yellow 60-80%, red >80%)
   - Memory usage percentage
   - Number of running containers
   - Host health status (Healthy / Warning / Critical / Unreachable)

3. Click on any host card to drill into the **Host Detail** view with full time-series charts.
4. Click on a container name within the host detail to jump to that container's Stats tab.

**CPU and Memory Heatmaps:**
The monitoring overview page includes a heatmap view (toggle via the **Heatmap** button, top-right). Each cell in the heatmap represents one container. Color intensity represents resource utilization. Dark red cells indicate containers approaching their resource limits. Hover over any cell to see the container name and exact metrics.

**Time Range Selector:** All monitoring charts support 30-minute, 1-hour, 6-hour, 24-hour, and 7-day time windows. Select from the dropdown at the top-right of any chart view.

### 7.2 Creating Alert Rules

1. Click **Monitoring** in the sidebar, then click the **Alert Rules** tab.
2. Click **New Alert Rule**.
3. Fill in the alert rule form:

| Field | Description | Example |
|---|---|---|
| Rule Name | Short, descriptive name. | `High CPU — API Containers` |
| Namespace | The namespace this rule applies to. | `prod` |
| Metric | The metric to evaluate. | `container.cpu_percent` |
| Scope | Apply to all containers, a specific container, or containers matching a label selector. | `label:service=api` |
| Condition | Evaluation operator. | `greater_than` |
| Threshold | The numeric value that triggers the alert. | `85` (= 85% CPU) |
| Duration | How long the condition must be continuously true before the alert fires. Prevents flapping. | `5m` |
| Severity | Alert severity label: `Critical`, `Warning`, `Info`. | `Warning` |
| Notification Channels | Which channels to notify: Slack channel name, email address, or webhook URL. | `#ops-alerts` |
| Message Template | Optional custom message. Supports template variables like `{{.ContainerName}}` and `{{.Value}}`. | `Container {{.ContainerName}} CPU at {{.Value}}%` |

4. Click **Create Rule**. The rule becomes active immediately.

**Available Metrics for Alert Rules:**

| Metric Key | Description |
|---|---|
| `container.cpu_percent` | CPU usage as a percentage of the container's CPU limit |
| `container.memory_percent` | Memory usage as a percentage of the container's memory limit |
| `container.memory_bytes` | Absolute memory usage in bytes |
| `container.network_rx_bytes_per_sec` | Inbound network bytes per second |
| `container.network_tx_bytes_per_sec` | Outbound network bytes per second |
| `host.cpu_percent` | Host-level CPU usage |
| `host.memory_percent` | Host-level memory usage |
| `host.disk_percent` | Host-level disk usage percentage |
| `container.restarts` | Number of container restarts (useful for crash-loop detection) |

### 7.3 Alert States

Each alert rule can be in one of three states:

| State | Color | Meaning |
|---|---|---|
| OK | Green | Condition is not met; no alert is active. |
| Firing | Red | Condition has been met for the configured duration. Notifications have been sent. |
| Resolved | Blue | Alert was Firing but the condition is no longer met. A "resolved" notification is sent if the notification channel supports it. |

**Acknowledging Alerts:**
When an alert is Firing, click **Acknowledge** to mark it as seen. Acknowledged alerts stop sending repeat notifications but remain in the Firing state until the condition resolves. Acknowledgement is recorded in the audit log with your username and a timestamp.

**Silencing Alerts:**
To suppress notifications for a planned maintenance window, click **Silence** on a Firing alert. Set a silence duration (e.g., 2 hours). During the silence period, the alert can still fire (the rule continues evaluating) but no notifications are sent. The silence expires automatically.

---

## 8. User Access Management (Admins Only)

This section is only visible to users with the Admin role.

### 8.1 Inviting Users

1. In the left sidebar, click **Users**.
2. Click **Invite User**.
3. Enter the user's email address and select their initial role and namespace.
4. Click **Send Invitation**. The user receives an email with a link to set their password (for local accounts) or is automatically enrolled on next OIDC login (for SSO accounts).

> **Tip:** For OIDC users, you do not need to pre-create accounts. Users are provisioned automatically on first login and assigned the Viewer role by default. An Admin must then assign the appropriate role.

### 8.2 Assigning Roles

1. In the Users list, click the user's name to open their profile.
2. In the **Role Assignments** section, click **+ Add Role Assignment**.
3. Select the namespace and the role for that namespace.
4. Click **Save**. The role assignment takes effect immediately; the user's next API request will use the new permissions.

A user can have different roles in different namespaces. For example: Admin in `dev`, Operator in `staging`, Viewer in `prod`.

### 8.3 Role Permissions Matrix

| Permission | Admin | Operator | Viewer |
|---|---|---|---|
| View container list | Yes | Yes | Yes |
| View container details, stats, logs | Yes | Yes | Yes |
| Deploy new container | Yes | Yes | No |
| Start / Stop / Restart container | Yes | Yes | No |
| Kill / Remove container | Yes | Yes | No |
| View image list | Yes | Yes | Yes |
| Pull image | Yes | Yes | No |
| Delete image | Yes | Yes | No |
| View CVE scan results | Yes | Yes | Yes |
| Trigger manual CVE scan | Yes | Yes | No |
| Create / Delete network | Yes | Yes | No |
| Create / Delete volume | Yes | Yes | No |
| View monitoring dashboard | Yes | Yes | Yes |
| Create / Edit / Delete alert rules | Yes | Yes | No |
| Acknowledge / Silence alerts | Yes | Yes | No |
| View audit log | Yes | No | No |
| Export audit log | Yes | No | No |
| Invite / Manage users | Yes | No | No |
| Assign roles | Yes | No | No |
| Manage API keys (own) | Yes | Yes | Yes |
| Manage API keys (others) | Yes | No | No |
| Create / Delete namespace | Yes | No | No |
| Register / Remove cluster node | Yes | No | No |
| Drain cluster node | Yes | No | No |
| Configure registry credentials | Yes | No | No |
| Configure OIDC SSO | Yes | No | No |
| Scale Swarm service | Yes | Yes | No |

### 8.4 API Key Management

API keys are long-lived credentials used by CI/CD pipelines, scripts, and integrations that need to call the DCMS REST API without a user session.

**Creating an API key (any role):**
1. Click your user avatar (top-right) and select **API Keys**.
2. Click **New API Key**.
3. Enter a descriptive name (e.g., `github-actions-staging-deploy`) and an expiry date (max 1 year; no expiry is not permitted).
4. Click **Create**. The key is shown **once** — copy it immediately and store it in your secrets manager. It cannot be retrieved again.

**Admin management of API keys:**
Admins can view all API keys issued within their namespaces (key names and expiry dates only — not the key values), and can revoke any key immediately.

> **Warning:** Treat API keys like passwords. Store them in GitHub Actions secrets, HashiCorp Vault, or equivalent. Never commit them to source code or log them to stdout.

---

## 9. Cluster Management

### 9.1 Viewing Cluster Nodes

1. In the left sidebar, click **Cluster**.
2. The **Nodes** tab shows all registered Docker hosts.

| Column | Description |
|---|---|
| Node Name | Hostname or custom display name. |
| Role | Swarm role: Manager or Worker. |
| Status | Ready (healthy), Down (unreachable), Drain (maintenance mode). |
| Availability | Active (accepts new containers), Pause (no new containers), Drain (evacuating). |
| Running Containers | Count of containers currently running on this node. |
| CPU Usage | Current host CPU usage percentage. |
| Memory Usage | Current host memory usage. |
| Docker Version | Docker Engine version on the host. |
| Agent Version | DCMS agent binary version. |

### 9.2 Draining a Node for Maintenance

Draining a node reschedules all Swarm services from that node to other healthy nodes and prevents new workloads from being placed on it. Use this before performing host-level maintenance (OS patching, hardware replacement).

1. In the Nodes list, click the node you want to drain.
2. In the Node Detail view, click **Drain Node**.
3. A confirmation dialog explains the impact: Swarm services will be rescheduled. Standalone containers (non-Swarm) are stopped and not automatically restarted elsewhere.
4. Type the node name in the confirmation box and click **Drain**.
5. Monitor the node's Running Containers count — it should decrease to 0 as services are rescheduled to other nodes.
6. When the node shows 0 running containers, it is safe to perform maintenance.

After maintenance, re-enable the node by clicking **Set Active** to allow new workloads to be scheduled on it again.

> **Warning:** Draining a node with standalone containers (not Swarm services) will stop those containers. They are not automatically moved to another node. Plan this in advance or convert standalone containers to Swarm services if they must remain available during node maintenance.

---

## 10. Keyboard Shortcuts

All keyboard shortcuts are active when no text input field is focused. Press `?` anywhere in the dashboard to display the shortcut reference overlay.

| Shortcut | Context | Action |
|---|---|---|
| `?` | Global | Show / hide keyboard shortcut reference |
| `G` then `O` | Global | Navigate to Cluster Overview |
| `G` then `C` | Global | Navigate to Containers list |
| `G` then `I` | Global | Navigate to Images list |
| `G` then `N` | Global | Navigate to Networks list |
| `G` then `V` | Global | Navigate to Volumes list |
| `G` then `M` | Global | Navigate to Monitoring |
| `G` then `L` | Global | Navigate to Logs |
| `G` then `U` | Global | Navigate to Users (Admin only) |
| `/` | Container list | Focus search / filter box |
| `N` | Container list | Open Deploy Container form |
| `R` | Container detail | Restart container |
| `S` | Container detail | Stop container |
| `Escape` | Any modal / panel | Close the current modal or slide-over panel |
| `Ctrl+F` | Logs tab | Focus log search box |
| `Space` | Logs tab | Toggle Pause / Resume log stream |
| `D` | Logs tab | Download current log buffer |
| `T` | Monitoring | Toggle heatmap / chart view |
| `←` `→` | Monitoring charts | Step time range backward / forward |
| `Enter` | Any table row | Open detail view for selected row |
| `Shift+?` | Global | Open documentation in new tab |

---

## 11. Troubleshooting

### Issue 1: Container fails to start — status shows Error immediately

**Symptom:** You deploy a container and it transitions to Error within 1–2 seconds of deployment.

**Likely Causes and Solutions:**
- **Image not found on the host:** The image was not pulled before deploying, or the tag does not exist. Go to Images, pull the image first, then re-deploy.
- **Port conflict:** The host port is already in use. DCMS checks before deployment, but race conditions are possible. Check the error message for "port is already allocated." Try a different host port.
- **Invalid environment variables or command:** A required environment variable is missing or the override command is incorrect. Check the container's documentation.
- **Insufficient memory on host:** The container's memory limit exceeds available host memory. Go to Monitoring, check host memory usage, and choose a less-loaded host or reduce the memory limit.

### Issue 2: Logs tab shows "Stream not available"

**Symptom:** The Logs tab displays an error message instead of log content.

**Likely Causes and Solutions:**
- **Container is stopped:** Logs for stopped containers are shown from the historical log buffer. Switch the toggle from "Live" to "Historical" and set a time range.
- **Agent unreachable:** The DCMS agent on the container's host is offline. Go to Cluster > Nodes and check the host status. Contact your platform team if the agent is Down.
- **Container produces no stdout output:** Some containers write logs only to files, not stdout. Check the container's logging configuration.

### Issue 3: High CPU alert fires repeatedly for a container

**Symptom:** The same high CPU alert fires and resolves in a cycle.

**Likely Causes and Solutions:**
- **Bursty workload:** The container has periodic CPU spikes (e.g., a cron job, garbage collection). Increase the alert Duration threshold (e.g., from 2 minutes to 10 minutes) to avoid alerts on transient spikes.
- **Memory pressure causing CPU thrashing:** Check the Memory chart. If memory usage is near the limit, the container may be swapping or triggering GC frequently. Increase the memory limit.
- **Application bug causing CPU spike:** Check the logs around the time of the CPU spike for errors or stack traces.

### Issue 4: Cannot pull image from private registry

**Symptom:** Image pull fails with "authentication required" or "unauthorized" error.

**Solution:**
1. Ask your Admin to verify the registry credentials in Settings > Registry Credentials.
2. Confirm the registry URL in the credentials matches the registry URL you are pulling from exactly (including port if non-standard).
3. Check that your user account's API token (used by DCMS to pull on your behalf) has not expired.

### Issue 5: CVE scan is stuck in "Scanning" status

**Symptom:** An image has been in "Scanning" status for more than 10 minutes.

**Solution:**
1. Check if the Trivy vulnerability database was recently updated. Trivy downloads DB updates automatically; if the DB download fails, scans queue but do not progress. An alert fires if the Trivy DB is older than 6 hours.
2. Contact your Admin to check the image-service logs for Trivy errors.
3. As a workaround, click **Delete** on the image and re-pull it to trigger a fresh scan attempt.

### Issue 6: Dashboard shows stale container status (status doesn't update)

**Symptom:** A container's status in the list has not changed for several minutes even though you expect it to have updated.

**Solution:**
1. Check the status bar at the bottom of the screen. If the SSE connection indicator is red (disconnected), press `F5` to reload and re-establish the connection.
2. If the status bar shows green (connected), click the **Refresh** icon on the container list to force a manual refresh.
3. If one specific container is stuck at "Unknown," the DCMS agent on its host may be unreachable. Go to Cluster > Nodes to verify agent connectivity.

### Issue 7: Notification alerts not being received on Slack

**Symptom:** An alert is Firing in DCMS but no Slack message was received.

**Solution:**
1. Verify the Slack channel name in the alert rule is correct and includes the `#` prefix.
2. Confirm the Slack webhook URL configured in Settings > Notification Channels is valid by clicking **Test** next to the channel.
3. Check whether a silence is active on the alert rule — silences suppress notifications even for active alerts.
4. DCMS deduplicates notifications: if the same alert fires repeatedly within 60 seconds for the same channel, only one message is sent. Check whether the alert is cycling on/off rapidly.

### Issue 8: "Permission denied" error when trying to deploy a container

**Symptom:** Clicking Deploy submits the form but returns a "Permission denied" or "403 Forbidden" error.

**Solution:**
1. Verify your role in the current namespace. Click your avatar > Profile and check your role assignments. Viewers cannot deploy containers.
2. Confirm you have selected the correct namespace. You may have Operator access in `staging` but not `prod`.
3. If you believe your role is correct, ask an Admin to check your role assignment in the Users section.

### Issue 9: Image deployment blocked by CVE policy

**Symptom:** Deploying a container to `prod` returns an error mentioning CRITICAL CVEs.

**Solution:**
1. Open the Images list, find the image, and click to view the full CVE scan report.
2. Identify the CRITICAL CVEs listed. For each, note the package name and the fixed version.
3. Update your Dockerfile (or the upstream image) to use a version of the package where the CVE is fixed, rebuild, and re-pull.
4. If the CVE is a confirmed false positive for your configuration, request your Admin to add a suppression entry via `.trivyignore`. All suppressions require documented justification and an expiry date.

### Issue 10: Container keeps restarting (restart loop / crash loop)

**Symptom:** A container's restart count is incrementing rapidly (visible in the Container Detail > Overview tab).

**Solution:**
1. Open the **Logs** tab immediately after a restart to capture the startup error before the next restart clears it. Use the "Historical" mode with a narrow time window.
2. Common causes:
   - Missing required environment variable: The application exits immediately because a required config value is absent. Check the application documentation for required env vars.
   - Health check failing: If a Docker HEALTHCHECK is configured, an unhealthy result causes Docker to restart the container. Check health check command syntax and whether the service inside the container is actually ready.
   - Port binding conflict on restart: A previous instance did not release the port. Change the restart policy to `on-failure` with a max retry limit, or increase the stop grace period.
3. Once you identify the cause, stop the container, fix the configuration, and re-deploy.
