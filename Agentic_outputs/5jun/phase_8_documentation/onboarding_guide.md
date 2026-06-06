# DCMS Onboarding Guide

**Version:** 1.0.0
**Audience:** DevOps engineers comfortable with Docker and Linux, new to DCMS
**Last Updated:** 2026-06-06

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start — Single Node (Development)](#2-quick-start--single-node-development)
3. [Production Deployment — Docker Swarm](#3-production-deployment--docker-swarm)
4. [Post-Deployment Checklist](#4-post-deployment-checklist)
5. [First Login & Initial Configuration](#5-first-login--initial-configuration)
6. [DCMS Agent Installation](#6-dcms-agent-installation)
7. [Upgrading DCMS](#7-upgrading-dcms)
8. [Backup & Recovery](#8-backup--recovery)
9. [Troubleshooting Quick Reference](#9-troubleshooting-quick-reference)
10. [Getting Help](#10-getting-help)

---

## 1. Prerequisites

### Operating System

DCMS is tested and supported on the following platforms:

| Platform | Minimum Version | Notes |
|---|---|---|
| Ubuntu | 22.04 LTS (Jammy) | Recommended for new deployments |
| Red Hat Enterprise Linux | 9.x | Requires `container-selinux` package |
| Rocky Linux | 9.x | Community-supported |

Windows Server and macOS are supported for local development only (Docker Desktop). They are not supported for production Swarm nodes.

### Docker Engine

Docker Engine 26.0 or later is required on every node. The DCMS agent relies on the Docker API version 1.45+, which ships with Docker 26.

```bash
# Verify Docker version on each node
docker version --format '{{.Server.Version}}'
# Expected: 26.x.x or higher

# Verify API version
docker version --format '{{.Server.APIVersion}}'
# Expected: 1.45 or higher
```

### Hardware Requirements

**Swarm Manager Nodes (minimum 3 for quorum in production)**

| Resource | Minimum | Recommended |
|---|---|---|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| Root SSD | 50 GB | 100 GB |
| Data disk | — | 200 GB (for log and image storage) |

**Swarm Worker Nodes**

| Resource | Minimum | Recommended |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Root SSD | 20 GB | 50 GB |

Manager nodes run the DCMS control-plane services (auth, container, image, network, volume, monitor, log, cluster, notification). Worker nodes run only user workloads and the DCMS agent binary. Do not run heavy workloads on manager nodes.

### Network Requirements

The following ports must be reachable between nodes. Open them in your firewall or security group rules before proceeding.

| Port / Protocol | Direction | Purpose |
|---|---|---|
| 80/TCP | Inbound to manager | HTTP (redirect to HTTPS) |
| 443/TCP | Inbound to manager | HTTPS — Kong API gateway + dashboard |
| 2377/TCP | Manager ↔ Manager, Worker → Manager | Swarm cluster management |
| 7946/TCP+UDP | All nodes ↔ All nodes | Swarm node discovery (gossip) |
| 4789/UDP | All nodes ↔ All nodes | VXLAN overlay network traffic |
| 9100/TCP | Internal only | Prometheus node-exporter scrape |
| 8080/TCP | Internal only | DCMS agent gRPC (mTLS) |

On Ubuntu 22.04 with `ufw`:

```bash
# On manager node
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp
sudo ufw reload
```

On RHEL 9 with `firewalld`:

```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=2377/tcp
sudo firewall-cmd --permanent --add-port=7946/tcp
sudo firewall-cmd --permanent --add-port=7946/udp
sudo firewall-cmd --permanent --add-port=4789/udp
sudo firewall-cmd --reload
```

### DNS

Create a DNS A record pointing your chosen hostname to the Swarm manager's public or VIP address before deployment. DCMS uses this hostname for TLS certificate issuance and OIDC redirect URIs.

```
dcms.example.com  A  203.0.113.10
```

For multi-manager HA, point the DNS record to a load balancer VIP sitting in front of all manager nodes.

---

## 2. Quick Start — Single Node (Development)

The development stack runs everything in Docker Compose on a single machine. It is not suitable for production but is ideal for evaluating DCMS or developing against its API.

### 2.1 Clone the Repository

```bash
git clone https://github.com/dcms/dcms && cd dcms
```

### 2.2 Configure Environment Variables

Copy the development environment template and edit credentials:

```bash
cp infra/docker-compose/dev.env .env
```

Open `.env` in your editor. At minimum, change these values:

```dotenv
# .env (development)

# PostgreSQL
POSTGRES_PASSWORD=dev_change_me_now
POSTGRES_DB=dcms

# Redis
REDIS_PASSWORD=redis_dev_secret

# JWT signing key — generate with: openssl rand -hex 32
JWT_SECRET_KEY=replace_with_32_byte_hex_string

# Dashboard URL (no trailing slash)
DCMS_DASHBOARD_URL=http://localhost:3000

# Default admin seed credentials — change immediately after first login
DCMS_ADMIN_EMAIL=admin@dcms.local
DCMS_ADMIN_PASSWORD=changeme
```

Do not commit `.env` to version control. The `.gitignore` already excludes it.

### 2.3 Start the Development Stack

```bash
make dev-up
```

This builds the Go services, starts PostgreSQL, Redis, all backend microservices, the React dashboard, and Kong in a single Compose project. First run takes 2-4 minutes as Go modules are downloaded and compiled.

Expected output (abbreviated):

```
[+] Building 12/12 services
[+] Running 15/15 containers
 - dcms-postgres-1       healthy
 - dcms-redis-1          healthy
 - dcms-auth-service-1   running
 - dcms-container-service-1 running
 - dcms-image-service-1  running
 - dcms-kong-1           running
 - dcms-dashboard-1      running
 ...
```

Verify all services are healthy:

```bash
docker compose ps
# All entries should show "healthy" or "running"

curl http://localhost:3000/health
# {"status":"ok","version":"1.0.0"}
```

### 2.4 Access the Dashboard

Open `http://localhost:3000` in your browser.

Log in with the default credentials:
- **Email:** `admin@dcms.local`
- **Password:** `changeme`

### 2.5 Create a Real Admin Account and Disable the Default

Immediately after first login:

1. Navigate to **Settings → Users → Invite User**.
2. Create your personal admin account with your real email address and a strong password.
3. Log out and log back in with the new account.
4. Navigate to **Settings → Users**, find `admin@dcms.local`, click **Disable**.

Never use the default account in a shared environment.

---

## 3. Production Deployment — Docker Swarm

Production deployment uses Docker Swarm with a dedicated secrets backend (HashiCorp Vault). This section assumes a 5-node cluster: 3 managers + 2 workers. The minimum viable production cluster is 3 managers (for Raft quorum) + 1 worker.

### Step 1: Prepare Each Node

Run the following on every node (managers and workers). If you have Ansible, the playbook at `infra/ansible/prepare-node.yml` automates this.

```bash
# Install Docker 26 on Ubuntu 22.04
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce=5:26.* docker-ce-cli=5:26.* containerd.io

# Disable swap (required for stable container scheduling)
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab

# Enable Docker service
sudo systemctl enable --now docker

# Add your deploy user to the docker group
sudo usermod -aG docker $USER
```

Verify Docker is running and at the correct version:

```bash
docker info --format '{{.ServerVersion}}'
# 26.x.x
```

### Step 2: Initialise the Swarm

On the **primary manager node** only:

```bash
# Replace 10.0.1.10 with your manager's private IP
docker swarm init --advertise-addr 10.0.1.10

# Expected output:
# Swarm initialized: current node (abc123) is now a manager.
# To add a worker to this swarm, run the following command:
#
#   docker swarm join --token SWMTKN-1-xxx 10.0.1.10:2377
```

Copy the join token from the output. On each **additional manager** node:

```bash
# Retrieve the manager join token on the primary manager
docker swarm join-token manager
# Follow the printed command on each additional manager
```

On each **worker** node:

```bash
docker swarm join --token SWMTKN-1-<worker-token> 10.0.1.10:2377
```

Verify the cluster from the primary manager:

```bash
docker node ls
# ID                HOSTNAME    STATUS    AVAILABILITY   MANAGER STATUS
# abc123 *          mgr-01      Ready     Active         Leader
# def456            mgr-02      Ready     Active         Reachable
# ghi789            mgr-03      Ready     Active         Reachable
# jkl012            wrk-01      Ready     Active
# mno345            wrk-02      Ready     Active
```

Label the manager nodes so that DCMS control-plane services are pinned to them:

```bash
docker node update --label-add role=manager mgr-01
docker node update --label-add role=manager mgr-02
docker node update --label-add role=manager mgr-03
docker node update --label-add role=worker  wrk-01
docker node update --label-add role=worker  wrk-02
```

### Step 3: Configure Secrets (Vault)

DCMS reads all secrets (database passwords, JWT private key, TLS certificates) from HashiCorp Vault at startup. This eliminates secrets in environment files.

Provision Vault (if not already running in your infrastructure), then:

```bash
# Set Vault address and root token (or AppRole credentials)
export VAULT_ADDR=https://vault.example.com:8200
export VAULT_TOKEN=<root-or-deploy-token>

# Run the setup script — creates all required secret paths
bash scripts/setup-vault.sh prod

# Verify all expected paths exist and are readable
bash scripts/verify-vault-paths.sh prod
```

Expected output of the verify script:

```
[OK] secret/dcms/prod/postgres/password
[OK] secret/dcms/prod/redis/password
[OK] secret/dcms/prod/jwt/private-key
[OK] secret/dcms/prod/tls/cert
[OK] secret/dcms/prod/tls/key
[OK] secret/dcms/prod/agent/mtls-ca-cert
All 6 required secret paths verified.
```

If any path shows `[MISSING]`, populate it manually:

```bash
vault kv put secret/dcms/prod/postgres/password value="<strong-password>"
```

### Step 4: Configure Non-Secret Environment Values

```bash
cp environment_configs/prod.env.template .env.prod
```

Edit `.env.prod` and fill in non-sensitive configuration:

```dotenv
# .env.prod

DCMS_ENV=production
DCMS_DOMAIN=dcms.example.com
DCMS_LOG_LEVEL=info

# PostgreSQL connection (password is read from Vault)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=dcms
POSTGRES_USER=dcms

# Redis (password from Vault)
REDIS_HOST=redis
REDIS_PORT=6379

# pgBouncer pool settings
PGBOUNCER_POOL_MODE=transaction
PGBOUNCER_MAX_CLIENT_CONN=200
PGBOUNCER_DEFAULT_POOL_SIZE=25

# Vault
VAULT_ADDR=https://vault.example.com:8200
VAULT_ROLE_ID=<approle-role-id>
# VAULT_SECRET_ID is injected at runtime from Docker secrets

# Replica counts
REPLICAS_AUTH=2
REPLICAS_CONTAINER=3
REPLICAS_IMAGE=2
REPLICAS_MONITOR=2
REPLICAS_LOG=2

# Prometheus remote write (optional)
PROMETHEUS_REMOTE_WRITE_URL=

# SMTP for notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=dcms@example.com
```

### Step 5: Deploy the Stack

```bash
docker stack deploy \
  --compose-file infra/swarm/stack.yml \
  --with-registry-auth \
  dcms
```

Monitor the rollout:

```bash
# Watch service convergence
docker stack services dcms

# Expected when stable:
# NAME                     MODE         REPLICAS  IMAGE
# dcms_auth-service        replicated   2/2       ghcr.io/dcms/dcms/auth-service:1.0.0
# dcms_container-service   replicated   3/3       ghcr.io/dcms/dcms/container-service:1.0.0
# dcms_dashboard           replicated   2/2       ghcr.io/dcms/dcms/dashboard:1.0.0
# dcms_kong                replicated   2/2       ghcr.io/dcms/dcms/kong:3.6-dcms
# dcms_postgres            replicated   1/1       postgres:16-alpine
# dcms_redis               replicated   1/1       redis:7-alpine
# ...

# Check for failed tasks
docker stack ps dcms --filter "desired-state=running"
```

Convergence typically takes 60-120 seconds on first deployment as images are pulled on each node.

---

## 4. Post-Deployment Checklist

Run through each item in order. All commands are issued from the primary Swarm manager unless noted.

1. **All services are running at full replica count**
   ```bash
   docker stack services dcms | awk '{print $1, $4}'
   # Verify REPLICAS column shows X/X for every service
   ```

2. **Health endpoint responds with HTTP 200**
   ```bash
   curl -sf https://dcms.example.com/health | python3 -m json.tool
   # {"status":"ok","version":"1.0.0","services":{...}}
   ```

3. **Dashboard loads over HTTPS**
   ```bash
   curl -Is https://dcms.example.com/ | head -1
   # HTTP/2 200
   ```

4. **HTTP redirects to HTTPS**
   ```bash
   curl -Is http://dcms.example.com/ | grep -i location
   # location: https://dcms.example.com/
   ```

5. **TLS certificate is valid and not self-signed**
   ```bash
   echo | openssl s_client -connect dcms.example.com:443 2>/dev/null \
     | openssl x509 -noout -issuer -dates
   ```

6. **Authentication service is reachable**
   ```bash
   curl -sf https://dcms.example.com/api/v1/auth/ping
   # {"pong":true}
   ```

7. **Database migrations completed successfully**
   ```bash
   docker service logs dcms_auth-service 2>&1 | grep -i migration
   # INFO migration: all 15 migrations applied successfully
   ```

8. **Redis connectivity**
   ```bash
   docker exec $(docker ps -q -f name=dcms_redis) \
     redis-cli -a "$REDIS_PASSWORD" ping
   # PONG
   ```

9. **pgBouncer pool is operational**
   ```bash
   docker exec $(docker ps -q -f name=dcms_pgbouncer) \
     psql -h 127.0.0.1 -p 6432 -U pgbouncer pgbouncer \
     -c "SHOW POOLS;"
   ```

10. **Prometheus is scraping targets**
    ```bash
    curl -sf http://localhost:9090/api/v1/targets \
      | python3 -c "import sys,json; d=json.load(sys.stdin); \
        active=[t for t in d['data']['activeTargets'] if t['health']=='up']; \
        print(f'{len(active)} targets up')"
    ```

11. **Grafana is accessible**
    ```bash
    curl -sf https://dcms.example.com/grafana/api/health
    # {"commit":"xxx","database":"ok","version":"10.x.x"}
    ```

12. **Loki is receiving logs**
    ```bash
    curl -sf "http://localhost:3100/loki/api/v1/labels" \
      | python3 -m json.tool
    # Should list labels including "service", "node", "container_name"
    ```

13. **Kong is routing API requests correctly**
    ```bash
    curl -sf https://dcms.example.com/api/v1/containers \
      -H "Authorization: Bearer <token>"
    # 200 with container list (even if empty: {"items":[],"total":0})
    ```

14. **Alerting rules are loaded**
    ```bash
    curl -sf http://localhost:9090/api/v1/rules \
      | python3 -c "import sys,json; d=json.load(sys.stdin); \
        rules=[r for g in d['data']['groups'] for r in g['rules']]; \
        print(f'{len(rules)} alert rules loaded')"
    # 15 alert rules loaded
    ```

15. **Audit log table is writable**
    ```bash
    docker exec $(docker ps -q -f name=dcms_postgres) \
      psql -U dcms -d dcms \
      -c "SELECT COUNT(*) FROM audit_log WHERE created_at > now() - interval '10 minutes';"
    # Should return a small positive count from deployment-time admin actions
    ```

---

## 5. First Login & Initial Configuration

### 5.1 Create Your Admin Account

1. Navigate to `https://dcms.example.com` and log in with the seeded admin credentials.
2. Click the user avatar (top right) → **Settings → Users → Invite User**.
3. Fill in your real email address, select the **Admin** role, and click **Send Invite**.
4. Check your email, accept the invite, and set a strong password.
5. Log out, log back in with your new account.
6. Return to **Settings → Users**, locate the seed admin account, and click **Disable**.

### 5.2 Configure Namespaces

Namespaces allow you to partition containers, volumes, and networks into logical groups (e.g., by team or environment).

1. Navigate to **Settings → Namespaces → Create Namespace**.
2. Create at minimum: `production`, `staging`, `development`.
3. Assign default quotas (container count, CPU, RAM) per namespace.

### 5.3 Invite Team Members

Roles in DCMS:

| Role | Permissions |
|---|---|
| Admin | Full system access, user management, global settings |
| Operator | Create/start/stop/remove containers, manage images and networks within assigned namespaces |
| Viewer | Read-only access to containers, logs, metrics |

Invite each team member at **Settings → Users → Invite User**, selecting the appropriate role. Operators and Viewers are scoped to specific namespaces.

### 5.4 Configure OIDC SSO (Optional)

DCMS supports OpenID Connect for single sign-on with identity providers such as Okta, Azure AD, or Keycloak.

1. Register a new OIDC application in your identity provider. Set the redirect URI to:
   `https://dcms.example.com/api/v1/auth/oidc/callback`

2. Navigate to **Settings → Authentication → OIDC**.

3. Fill in the following values from your identity provider:

   ```
   Issuer URL:      https://your-idp.example.com
   Client ID:       dcms-prod
   Client Secret:   <from IdP>
   Scopes:          openid email profile groups
   ```

4. Map IdP groups to DCMS roles under **Group Mappings**:
   ```
   infra-admins  → Admin
   dev-team      → Operator
   readonly      → Viewer
   ```

5. Click **Test Connection** to verify. Enable SSO only after a successful test.

### 5.5 Configure Slack Alert Channel

1. Create an Incoming Webhook in your Slack workspace and copy the URL.
2. Navigate to **Settings → Notifications → Channels → Add Channel**.
3. Select **Slack**, paste the webhook URL, and test with **Send Test Message**.
4. Navigate to **Settings → Notifications → Alert Rules** and assign critical alerts (container crash, high CPU, disk fill) to the Slack channel.

---

## 6. DCMS Agent Installation

The DCMS agent is a small Go binary that runs as a systemd service on every Docker host that DCMS manages. It exposes a gRPC API (port 8080, mTLS) that the `container-service` calls to manage containers on that host. The agent never exposes the raw Docker socket.

### 6.1 Download the Agent Binary

```bash
# On each managed host
DCMS_VERSION=1.0.0
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

curl -fsSL \
  "https://github.com/dcms/dcms/releases/download/v${DCMS_VERSION}/dcms-agent_linux_${ARCH}" \
  -o /usr/local/bin/dcms-agent

chmod +x /usr/local/bin/dcms-agent
```

### 6.2 Issue mTLS Client Certificate

On the **DCMS manager** (where the CA private key is held):

```bash
# Replace <hostname> with the target host's hostname
bash scripts/issue-agent-cert.sh --host <hostname> --out /tmp/agent-certs/

# This produces:
#   /tmp/agent-certs/<hostname>-cert.pem
#   /tmp/agent-certs/<hostname>-key.pem
#   /tmp/agent-certs/ca-cert.pem
```

Copy the certificates to the managed host:

```bash
scp /tmp/agent-certs/<hostname>-cert.pem  <user>@<hostname>:/etc/dcms-agent/cert.pem
scp /tmp/agent-certs/<hostname>-key.pem   <user>@<hostname>:/etc/dcms-agent/key.pem
scp /tmp/agent-certs/ca-cert.pem          <user>@<hostname>:/etc/dcms-agent/ca-cert.pem
```

### 6.3 Create the systemd Unit File

On the managed host, create `/etc/systemd/system/dcms-agent.service`:

```ini
[Unit]
Description=DCMS Agent
Documentation=https://docs.dcms.io/agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/dcms-agent \
  --listen=0.0.0.0:8080 \
  --cert=/etc/dcms-agent/cert.pem \
  --key=/etc/dcms-agent/key.pem \
  --ca=/etc/dcms-agent/ca-cert.pem \
  --docker-socket=/var/run/docker.sock \
  --log-level=info
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dcms-agent

[Install]
WantedBy=multi-user.target
```

### 6.4 Enable and Start the Agent

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dcms-agent
sudo systemctl status dcms-agent

# Expected:
# dcms-agent.service - DCMS Agent
#    Loaded: loaded (/etc/systemd/system/dcms-agent.service; enabled)
#    Active: active (running) since ...
```

### 6.5 Register the Host in DCMS

From the dashboard, navigate to **Cluster → Hosts → Register Host** and enter the host's address and port (`<hostname>:8080`). DCMS will perform a mTLS handshake to verify the certificate. On success the host appears with a **Connected** status.

Alternatively, via the API:

```bash
curl -sf -X POST https://dcms.example.com/api/v1/cluster/hosts \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"hostname": "wrk-03.example.com", "address": "10.0.1.13:8080"}'
```

---

## 7. Upgrading DCMS

### 7.1 Rolling Service Update

DCMS services are upgraded individually with zero downtime via Docker Swarm's rolling update mechanism.

```bash
# Upgrade a single service
docker service update \
  --image ghcr.io/dcms/dcms/container-service:1.1.0 \
  --update-parallelism 1 \
  --update-delay 10s \
  --update-failure-action rollback \
  dcms_container-service

# Upgrade all services using the helper script
bash scripts/upgrade.sh --version 1.1.0
```

The `--update-failure-action rollback` flag causes Swarm to automatically revert to the previous image if the health check fails on the new task.

### 7.2 Database Migrations

Database schema migrations run automatically when a service starts. golang-migrate applies only pending migrations in sequence.

**Always take a database backup before upgrading** (see Section 8.1).

To monitor migration progress:

```bash
docker service logs dcms_auth-service 2>&1 | grep -i "migration"
# INFO applying migration 016_add_cluster_nodes.up.sql
# INFO migration complete: 1 new migration applied
```

If a migration fails, the service will not start and the schema will be left at the last successful version. The old service version will continue running (it was not updated yet).

### 7.3 Rollback

If a deployment fails and automatic rollback does not trigger:

```bash
# Roll back a specific service to the previous image
docker service rollback dcms_container-service

# Verify the rollback
docker service ps dcms_container-service
```

For a full-stack rollback, re-run the deploy command with the previous stack version:

```bash
git checkout v1.0.0
docker stack deploy \
  --compose-file infra/swarm/stack.yml \
  --with-registry-auth \
  dcms
```

---

## 8. Backup & Recovery

### 8.1 Automated Daily Backup

DCMS ships with a cron-based backup script that performs a `pg_dump` and stores the compressed archive to a configurable destination (local path or S3).

The backup crontab is installed by the setup script at `/etc/cron.d/dcms-backup`:

```cron
# /etc/cron.d/dcms-backup
0 2 * * * root /opt/dcms/scripts/backup.sh >> /var/log/dcms-backup.log 2>&1
```

The script configuration is in `/etc/dcms/backup.conf`:

```bash
BACKUP_DEST=/mnt/backups/dcms
BACKUP_RETENTION_DAYS=30
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=dcms
POSTGRES_USER=dcms
# S3 example:
# BACKUP_DEST=s3://my-bucket/dcms-backups
# AWS_DEFAULT_REGION=us-east-1
```

### 8.2 Verify Backup Integrity

Run the verification script after each backup or ad-hoc:

```bash
bash scripts/verify-backup.sh --backup-file /mnt/backups/dcms/dcms_2026-06-06_020000.sql.gz

# Expected output:
# [OK] Archive is readable
# [OK] Archive decompresses without error
# [OK] Schema checksum matches reference
# [OK] Row counts within expected range (containers: 142, users: 8, audit_log: 4301)
# Backup verified successfully.
```

### 8.3 Restore Procedure

To restore from a backup to a running DCMS instance:

```bash
# Step 1: Stop all DCMS services except postgres
docker service scale \
  dcms_auth-service=0 \
  dcms_container-service=0 \
  dcms_image-service=0 \
  dcms_network-service=0 \
  dcms_volume-service=0 \
  dcms_monitor-service=0 \
  dcms_log-service=0 \
  dcms_notification-service=0 \
  dcms_cluster-service=0 \
  dcms_agent-service=0

# Step 2: Drop and recreate the database
docker exec -i $(docker ps -q -f name=dcms_postgres) \
  psql -U dcms -c "DROP DATABASE IF EXISTS dcms;"
docker exec -i $(docker ps -q -f name=dcms_postgres) \
  psql -U dcms -c "CREATE DATABASE dcms;"

# Step 3: Restore the dump
gunzip -c /mnt/backups/dcms/dcms_2026-06-06_020000.sql.gz \
  | docker exec -i $(docker ps -q -f name=dcms_postgres) \
    psql -U dcms -d dcms

# Step 4: Restart services
docker service scale \
  dcms_auth-service=2 \
  dcms_container-service=3 \
  dcms_image-service=2 \
  dcms_monitor-service=2 \
  dcms_log-service=2 \
  dcms_notification-service=1 \
  dcms_cluster-service=2 \
  dcms_network-service=1 \
  dcms_volume-service=1 \
  dcms_agent-service=1

# Step 5: Verify services have converged
docker stack services dcms
```

Allow 60-90 seconds for services to restart and run startup health checks before declaring the restore complete.

---

## 9. Troubleshooting Quick Reference

### Services Not Starting

**Symptom:** `docker stack services dcms` shows `0/N` replicas for one or more services.

**Diagnosis:**

```bash
# Show failed tasks with error messages
docker service ps dcms_<service-name> --no-trunc

# Example output:
# ID      NAME                        IMAGE                   NODE     DESIRED STATE  CURRENT STATE        ERROR
# xyz123  dcms_auth-service.1         auth-service:1.0.0      mgr-01   Running        Failed 2 min ago     "task: non-zero exit (1)"

# Read the full container logs for the failed task
docker service logs dcms_<service-name> --tail 50
```

**Common causes:**

- Vault is unreachable — verify `VAULT_ADDR` is accessible from the node and the AppRole credentials are valid.
- Dependent service (postgres, redis) is not healthy yet — check those services first.
- Image pull failed — verify Docker Hub / GHCR authentication with `docker service ps dcms_<service> --no-trunc`.

---

### Dashboard 502 Bad Gateway

**Symptom:** Browser shows `502 Bad Gateway` when accessing `https://dcms.example.com`.

**Diagnosis:**

```bash
# Check Kong is running and healthy
docker service ps dcms_kong

# Read Kong logs for upstream errors
docker service logs dcms_kong --tail 100 | grep -i "error\|upstream\|502"

# Verify the dashboard service is healthy
docker service ps dcms_dashboard
curl -sf http://127.0.0.1:3000/health   # run on the node hosting the dashboard task
```

**Common causes:**

- `dcms_dashboard` service is restarting — check its logs for build or startup errors.
- Kong upstream address changed — this can happen after a service restart changes the container IP. Verify Kong's upstream configuration: `docker exec -i $(docker ps -q -f name=dcms_kong) kong health`.

---

### Agent Not Connecting

**Symptom:** A host registered in DCMS shows **Disconnected** status.

**Diagnosis:**

```bash
# On the managed host
sudo systemctl status dcms-agent
sudo journalctl -u dcms-agent -n 50 --no-pager

# Verify the port is listening
ss -tlnp | grep 8080

# Verify TLS from the DCMS manager
openssl s_client \
  -connect <agent-host>:8080 \
  -cert /etc/dcms/client-cert.pem \
  -key  /etc/dcms/client-key.pem \
  -CAfile /etc/dcms/ca-cert.pem \
  -brief
# Expected: CONNECTION ESTABLISHED, Protocol: TLSv1.3
```

**Common causes:**

- mTLS certificate expired — re-issue with `scripts/issue-agent-cert.sh` and restart `dcms-agent`.
- Firewall blocking port 8080 between DCMS manager and the agent host.
- `dcms-agent` binary is an older version that speaks a different gRPC protocol version — reinstall from the current release.

---

### Database Migration Failure

**Symptom:** A service (most commonly `auth-service`) fails to start with a migration error.

**Diagnosis:**

```bash
docker service logs dcms_auth-service --tail 100 | grep -i "migration\|error"

# Common error:
# FATAL migration failed: dirty migration detected at version 12
```

**Recovery:**

A dirty migration means the migration was interrupted mid-execution. Inspect the `schema_migrations` table:

```bash
docker exec -i $(docker ps -q -f name=dcms_postgres) \
  psql -U dcms -d dcms \
  -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 3;"
```

If `dirty = true`, restore from the pre-upgrade backup (Section 8.3) and report the failing migration as a bug.

---

## 10. Getting Help

| Channel | URL | When to Use |
|---|---|---|
| GitHub Issues | https://github.com/dcms/dcms/issues | Bug reports, feature requests |
| Documentation | https://docs.dcms.io | Full reference documentation |
| Community Slack | https://dcms.io/slack | Questions, deployment help, community discussion |
| Security disclosures | security@dcms.io | Vulnerability reports (do not use public issues) |

When filing a GitHub issue, include the output of:

```bash
bash scripts/collect-diagnostics.sh > dcms-diagnostics.txt
```

This script collects DCMS version, service status, recent logs, and node information without including secrets.
