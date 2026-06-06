# UI Wireframes — Docker Container Management System (DCMS)

**Phase:** 3 — Domain Design
**Agent:** ui_ux_agent
**Date:** 2026-06-05
**Format:** ASCII wireframes, 70-char reference width

Legend:
  [ ]  checkbox / toggle (off)   [x]  checkbox / toggle (on)
  [ Button ]  clickable button   <input>  text input field
  @@@@  chart / visual area      ####  selected / highlighted row

---

## Screen 1: Login Page

```
+----------------------------------------------------------------------+
|                                                                      |
|                    DCMS                                              |
|           Docker Container Management System                         |
|                                                                      |
|          +------------------------------------------------+          |
|          |                                                |          |
|          |   Username                                     |          |
|          |   <..........................................>   |          |
|          |                                                |          |
|          |   Password                                     |          |
|          |   <..........................................>   |          |
|          |                                                |          |
|          |   [ ] Remember me on this device              |          |
|          |                                                |          |
|          |   [         Sign In          ]                 |          |
|          |                                                |          |
|          |   ---- or continue with ----                  |          |
|          |                                                |          |
|          |   [    Sign in with SSO (SAML / OIDC)    ]    |          |
|          |                                                |          |
|          |   Forgot password?              Need access?  |          |
|          +------------------------------------------------+          |
|                                                                      |
|  v1.2.0 - Build abc1234          (c) 2026 DCMS                      |
+----------------------------------------------------------------------+

--- MFA Prompt (shown after successful primary auth) ---

+----------------------------------------------------------------------+
|                                                                      |
|          +------------------------------------------------+          |
|          |  Two-Factor Authentication Required            |          |
|          |                                                |          |
|          |  Enter the 6-digit code from your             |          |
|          |  authenticator app.                           |          |
|          |                                                |          |
|          |   Code                                         |          |
|          |   <  _ _ _ - _ _ _  >                         |          |
|          |                                                |          |
|          |   Code expires in: 00:28                       |          |
|          |                                                |          |
|          |   [       Verify Code        ]                 |          |
|          |   [   Back to Login          ]                 |          |
|          +------------------------------------------------+          |
|                                                                      |
+----------------------------------------------------------------------+
```

---

## Screen 2: Dashboard Overview

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Dashboard                             Jun 05    |
|                   |                                                  |
| [#] Dashboard  <  |  +----------+ +----------+ +----------+         |
| [>] Containers    |  | Running  | | Stopped  | | Error    |         |
| [img] Images      |  |          | |          | |          |         |
| [~] Networks      |  |   142    | |    18    | |    3     |         |
| [disk] Volumes    |  | +8 (1h)  | | -2 (1h)  | |  ALERT   |         |
| [chart] Monitoring|  +----------+ +----------+ +----------+         |
| [log] Logs        |                                                  |
| [grid] Clusters   |  +--------------------+ +---------------------+ |
| [gear] Settings   |  | CPU Usage (Cluster)|  | Memory Usage       | |
| [users] Users     |  |                    |  |                    | |
|                   |  | @@@@@@@@@@@@@@@@@@ |  | @@@@@@@@@@@@@@@@@@ | |
|                   |  | @@@@@ avg 34% @@@@ |  | @@@@@ avg 61% @@@@ | |
|                   |  | @@@@@@@@@@@@@@@@@@ |  | @@@@@@@@@@@@@@@@@@ | |
|                   |  | [---12h timeline--]|  |[---12h timeline---]| |
|                   |  +--------------------+  +--------------------+ |
|                   |                                                  |
|                   |  Recent Events                  [ View All ]    |
|                   |  +------------------------------------------------+
|                   |  | [green] web-app-1    Started       00:03 ago  |
|                   |  | [red]   db-primary   OOMKilled     00:11 ago  |
|                   |  | [blue]  worker-3     Pulled image  00:18 ago  |
|                   |  | [yellow]cache-1      Paused        00:34 ago  |
|                   |  | [green] api-gw       Started       00:51 ago  |
|                   |  +------------------------------------------------+
|                   |                                                  |
|                   |  Quick Actions                                   |
|                   |  [ + Run Container ] [ Pull Image ] [ + Network ]|
+-------------------+--------------------------------------------------+
```

---

## Screen 3: Container List Page

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Containers                                      |
|                   |                                                  |
| [#] Dashboard     |  [ + Run Container ]          [ Bulk Actions v ]|
| [>] Containers <  |                                                  |
| [img] Images      |  Filters:                                        |
| [~] Networks      |  Status[All v] Image[<search>] Name[<search>]   |
| [disk] Volumes    |  Namespace[production v]      [ Clear Filters ]  |
| [chart] Monitoring|                                                  |
| [log] Logs        |  +-+----+----------+--------+------+-----+-----++
| [grid] Clusters   |  | |Name|Image     |Status  |CPU % |Mem  |Ports||
| [gear] Settings   |  +-+----+----------+--------+------+-----+-----++
| [users] Users     |  |[x]    Select All                             ||
|                   |  +-+----------+----------+--------+------+------++
|                   |##|[x]|web-app |nginx:1.25|running | 2.1% |128M |:80||
|                   |##|   |        |          |        |      |     |[...]|
|                   |  +-+----------+----------+--------+------+------++
|                   |  |[ ]|db-prim.|postgres:16|running|12.4% |512M |:5432||
|                   |  |   |        |          |        |      |     |[...]|
|                   |  +-+----------+----------+--------+------+------++
|                   |  |[ ]|worker-3|python:3.12|error  | 0.0% | 64M |  - ||
|                   |  |   |        |          |        |      |     |[...]|
|                   |  +-+----------+----------+--------+------+------++
|                   |  |[ ]|cache-1 |redis:7.2 |paused  | 0.0% |256M |:6379||
|                   |  |   |        |          |        |      |     |[...]|
|                   |  +-+----------+----------+--------+------+------++
|                   |                                                  |
|                   |  1-4 of 163 containers   [< Prev]  [Next >]     |
|                   |  Bulk: [ Start ] [ Stop ] [ Restart ] [ Remove ]|
+-------------------+--------------------------------------------------+

  [...] row action menu expands to:
  +------------------------------+
  | > View Details               |
  | > Start                      |
  | > Stop                       |
  | > Restart                    |
  | > Pause / Unpause            |
  | > Open Terminal (Exec)       |
  | > View Logs                  |
  | > Remove           [danger]  |
  +------------------------------+
```

---

## Screen 4: Container Detail Page

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  < Back to Containers                           |
|                   |                                                  |
| [#] Dashboard     |  web-app-1                 [green] running      |
| [>] Containers <  |  nginx:1.25.3 - ID: a3f7b9e1                   |
| [img] Images      |  [ Start ] [ Stop ] [ Restart ] [ Exec ] [...]  |
| [~] Networks      |                                                  |
| [disk] Volumes    |  [Overview][Logs][Stats][Exec][Networks][Volumes]|
| [chart] Monitoring|  -------Overview-------                         |
| [log] Logs        |                                                  |
| [grid] Clusters   |  Image:      nginx:1.25.3                        |
| [gear] Settings   |  Created:    2026-06-01 09:12:44 UTC             |
| [users] Users     |  Started:    2026-06-01 09:12:46 UTC             |
|                   |  Restart:    unless-stopped  (restarts: 0)       |
|                   |  Hostname:   web-app-1                           |
|                   |                                                  |
|                   |  Ports          Networks       Labels            |
|                   |  0.0.0.0:80     bridge-prod    app=web           |
|                   |  -> 80/tcp      overlay-svc    env=production    |
|                   |                                                  |
|                   |  Environment Variables         [ Show All 14 ]  |
|                   |  NGINX_PORT=80                                   |
|                   |  APP_ENV=production                              |
|                   |  ...                                             |
|                   |                                                  |
|                   |  Mounts                                          |
|                   |  /data/config -> /etc/nginx/conf.d (ro)         |
+-------------------+--------------------------------------------------+

--- Logs Tab ---
|                   |  [Overview][Logs][Stats][Exec][Networks][Volumes]|
|                   |  -------Logs-------    [Live v] [Download] [Clear]
|                   |  <filter log output...>               [Wrap [ ]]|
|                   |  +------------------------------------------------+
|                   |  | 09:14:01 172.18.0.1 GET / 200 0.002s         |
|                   |  | 09:14:02 172.18.0.1 GET /health 200 0.001s   |
|                   |  | 09:14:05 172.18.0.3 POST /api/data 201 0.012s|
|                   |  | 09:14:08 [error] upstream timeout /api/slow  |
|                   |  | 09:14:09 172.18.0.1 GET / 200 0.002s         |
|                   |  | ...  (live streaming, auto-scroll on)         |
|                   |  +------------------------------------------------+

--- Stats Tab ---
|                   |  [Overview][Logs][Stats][Exec][Networks][Volumes]|
|                   |  -------Stats (last 1h)-------  Interval[30s v] |
|                   |  +-------------------+ +---------------------+  |
|                   |  | CPU %             | | Memory              |  |
|                   |  | @@@@@@@@@@@@@@@   | | @@@@@@@@@@@@@@@@@   |  |
|                   |  | @@ 2.1% avg  @@@@ | | @@ 128M / 512M @@@  |  |
|                   |  +-------------------+ +---------------------+  |
|                   |  +-------------------+ +---------------------+  |
|                   |  | Network I/O       | | Block I/O           |  |
|                   |  | @@ 12KB/s in @@@@ | | @@ 0 B/s read  @@@  |  |
|                   |  | @@ 3KB/s out @@@@ | | @@ 4KB/s write @@@  |  |
|                   |  +-------------------+ +---------------------+  |

--- Exec Tab ---
|                   |  [Overview][Logs][Stats][Exec][Networks][Volumes]|
|                   |  Shell[/bin/sh v]  User[root v]   [ Connect ]   |
|                   |  +------------------------------------------------+
|                   |  | root@web-app-1:/# ls /etc/nginx               |
|                   |  | conf.d  fastcgi_params  mime.types  nginx.conf|
|                   |  | root@web-app-1:/# _                           |
|                   |  |                                                |
|                   |  |                                                |
|                   |  +------------------------------------------------+
|                   |  [xterm.js terminal — full keyboard support]     |
```

---

## Screen 5: Image Registry Page

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Images                                         |
|                   |                                                  |
| [#] Dashboard     |  [ Pull Image ]  [ Prune Unused ]               |
| [>] Containers    |                                                  |
| [img] Images   <  |  <Search by name or tag...>     [Filter v]      |
| [~] Networks      |                                                  |
| [disk] Volumes    |  +------+----------+-------+------+--------+----+
| [chart] Monitoring|  | Name | Tag      | Size  | Used | Vulns  | .. |
| [log] Logs        |  +------+----------+-------+------+--------+----+
| [grid] Clusters   |  |nginx |1.25.3    |142 MB | 2    |[0 green]|..]|
| [gear] Settings   |  |nginx |latest    |142 MB | 0    |[0 green]|..]|
| [users] Users     |  |postgres|16.2    |412 MB | 1    |[3 warn] |..]|
|                   |  |python|3.12-slim |128 MB | 1    |[12 crit]|..]|
|                   |  |redis |7.2-alpine| 38 MB | 1    |[0 green]|..]|
|                   |  |ubuntu|22.04     |  77 MB| 0    |[1 low]  |..]|
|                   |  +------+----------+-------+------+--------+----+
|                   |  1-6 of 31 images    [ < Prev ] [ Next > ]      |
|                   |                                                  |
|                   |  Vulnerability Summary                           |
|                   |  [red] Critical: 12  [orange] High: 8           |
|                   |  [yellow] Medium: 24  [blue] Low: 37            |
+-------------------+--------------------------------------------------+

--- Pull Image Modal ---
+----------------------------------------------------------------------+
|  +----------------------------------------------------------+        |
|  | Pull Image                                          [x]  |        |
|  |                                                          |        |
|  |  Registry                                                |        |
|  |  [ Docker Hub (docker.io)                          v ]  |        |
|  |                                                          |        |
|  |  Image Name                                              |        |
|  |  <e.g. nginx, myrepo/myapp>                             |        |
|  |                                                          |        |
|  |  Tag                                                     |        |
|  |  <latest>                                               |        |
|  |                                                          |        |
|  |  Platform     Auth (if private)                         |        |
|  |  [linux/amd64]  Username <.....>  Password <.....>      |        |
|  |                                                          |        |
|  |  [   Pull Image   ]    [ Cancel ]                       |        |
|  |                                                          |        |
|  |  Pull progress:                                          |        |
|  |  Layer sha256:abc1  [=========>         ] 58%           |        |
|  |  Layer sha256:def2  [==================>] 100% done     |        |
|  +----------------------------------------------------------+        |
+----------------------------------------------------------------------+

--- Scan Results Badge Detail (click on vulnerability badge) ---
+----------------------------------------------------------------------+
|  +----------------------------------------------------------+        |
|  | Vulnerability Scan — python:3.12-slim            [x]    |        |
|  |  Scanned: 2026-06-05 08:30 UTC   Scanner: Trivy 0.52    |        |
|  |                                                          |        |
|  | Severity   Count   CVE Sample                           |        |
|  | [red]  Critical  12    CVE-2024-3094 (libxz)            |        |
|  | [orange] High    8     CVE-2024-1234 (openssl)          |        |
|  | [yellow] Medium  24    CVE-2023-5678 (zlib)             |        |
|  | [blue]  Low      37    CVE-2023-9012 (curl)             |        |
|  |                                                          |        |
|  |  [ View Full Report ]   [ Re-scan ]   [ Close ]         |        |
|  +----------------------------------------------------------+        |
+----------------------------------------------------------------------+
```

---

## Screen 6: Networking Page

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Networks                                       |
|                   |                                                  |
| [#] Dashboard     |  [ + Create Network ]        [ View: List/Map ] |
| [>] Containers    |                                                  |
| [img] Images      |  --- ASCII Network Topology (Map view) ---      |
| [~] Networks   <  |                                                  |
| [disk] Volumes    |   [bridge-prod]          [overlay-svc]          |
| [chart] Monitoring|     |                         |                 |
| [log] Logs        |  web-app-1               web-app-1              |
| [grid] Clusters   |  cache-1                 api-gw                 |
| [gear] Settings   |  nginx-lb                worker-3               |
| [users] Users     |                          db-primary             |
|                   |                                                  |
|                   |   [host]     [none]      [macvlan-iot]          |
|                   |    db-replica  isolated   sensor-1               |
|                   |              worker-2    sensor-2               |
|                   |                                                  |
|                   |  --- Network List (Table view) ---               |
|                   |  +----------+--------+------+-------+------+----+
|                   |  | Name     | Driver | Scope| Subnet| Ctrs |    |
|                   |  +----------+--------+------+-------+------+----+
|                   |  |bridge-prod|bridge |local |172.18 |  3   |[..]|
|                   |  |overlay-svc|overlay|swarm |10.0.0 |  5   |[..]|
|                   |  |host       |host   |local | n/a   |  1   |[..]|
|                   |  |none       |null   |local | n/a   |  1   |[..]|
|                   |  |macvlan-iot|macvlan|local |192.168|  2   |[..]|
|                   |  +----------+--------+------+-------+------+----+
+-------------------+--------------------------------------------------+

--- Create Network Modal ---
+----------------------------------------------------------------------+
|  +----------------------------------------------------------+        |
|  | Create Network                                    [x]   |        |
|  |                                                          |        |
|  |  Name           Driver                                   |        |
|  |  <network-name> [ bridge          v ]                   |        |
|  |                                                          |        |
|  |  Subnet (CIDR)              Gateway                     |        |
|  |  <e.g. 172.20.0.0/16>      <e.g. 172.20.0.1>           |        |
|  |                                                          |        |
|  |  [x] Enable IPv6    [ ] Internal (no external access)   |        |
|  |  [ ] Attachable     [ ] Ingress                         |        |
|  |                                                          |        |
|  |  Labels                                                  |        |
|  |  <key>=<value>  [ + Add Label ]                         |        |
|  |                                                          |        |
|  |  [   Create Network   ]    [ Cancel ]                   |        |
|  +----------------------------------------------------------+        |
+----------------------------------------------------------------------+
```

---

## Screen 7: Monitoring Dashboard

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Monitoring                  [Auto-refresh: 15s]|
|                   |  Time Range: [ Last 1h v ]  Host: [ All Hosts v ]|
| [#] Dashboard     |                                                  |
| [>] Containers    |  Per-Host Metrics                                |
| [img] Images      |  +--------------------+ +---------------------+ |
| [~] Networks      |  | node-01            | | node-02             | |
| [disk] Volumes    |  | CPU:  @@@@@  34%   | | CPU:  @@@  21%      | |
| [chart] Monitoring|  | Mem:  @@@@@@ 61%   | | Mem:  @@@@@  58%    | |
| [log] Logs      < |  | Disk: @@     12%   | | Disk: @@@    28%    | |
| [grid] Clusters   |  | Net:  12MB/s in    | | Net:  4MB/s in      | |
| [gear] Settings   |  |       3MB/s out    | |       1MB/s out     | |
| [users] Users     |  +--------------------+ +---------------------+ |
|                   |  +--------------------+ +---------------------+ |
|                   |  | node-03            | | node-04             | |
|                   |  | CPU:  @@@@@@@ 71%  | | CPU:  @ 8%          | |
|                   |  | Mem:  @@@@@@@@ 82% | | Mem:  @@    19%     | |
|                   |  | Disk: @@@@   41%   | | Disk: @      6%     | |
|                   |  | Net:  28MB/s in    | | Net:  2MB/s in      | |
|                   |  |       15MB/s out   | |       0.5MB/s out   | |
|                   |  +--------------------+ +---------------------+ |
|                   |                                                  |
|                   |  Container CPU/Memory Heatmap (top 20 by CPU)   |
|                   |  +---+-------+-------+-------+-------+--------+ |
|                   |  |   |web-app|db-prim|worker |cache-1|api-gw  | |
|                   |  |CPU|[grn2%]|[yel12%]|[red71%]|[grn0%]|[grn5%]|
|                   |  |Mem|[yel25%]|[red82%]|[grn15%]|[yel50%]|[grn10%]|
|                   |  +---+-------+-------+-------+-------+--------+ |
|                   |                                                  |
|                   |  Active Alerts                    [ Manage ]    |
|                   |  +------------------------------------------------+
|                   |  |[red] CRIT  node-03 Memory >80%  3 min ago    |
|                   |  |[red] CRIT  worker-3 CPU >70%    5 min ago    |
|                   |  |[orange]WARN db-prim Disk >40%   12 min ago   |
|                   |  |[yellow]INFO node-02 Restarted   1 hour ago   |
|                   |  +------------------------------------------------+
+-------------------+--------------------------------------------------+
```

---

## Screen 8: User Management Page

```
+----------------------------------------------------------------------+
| [=] DCMS        production-cluster-1 [v]    [?] [bell(3)] [DS v]   |
+-------------------+--------------------------------------------------+
| NAVIGATION        |  Users & Roles                                  |
|                   |                                                  |
| [#] Dashboard     |  [ + Invite User ]       <Search users...>      |
| [>] Containers    |                                                  |
| [img] Images      |  Users                                           |
| [~] Networks      |  +--+-----------+-------------------+-------+---+
| [disk] Volumes    |  |  | Name      | Email             | Role  |   |
| [chart] Monitoring|  +--+-----------+-------------------+-------+---+
| [log] Logs        |  |  |D. Sehgal  |d.sehgal@corp.com  |[Admin ]|..|
| [grid] Clusters   |  |  |Alice Chen |alice@corp.com     |[Oper v]|..|
| [gear] Settings   |  |  |Bob Kumar  |bob@corp.com       |[Oper v]|..|
| [users] Users  <  |  |  |Carol Diaz |carol@corp.com     |[View v]|..|
|                   |  |  |Eve Walker |eve@corp.com       |[View v]|..|
|                   |  +--+-----------+-------------------+-------+---+
|                   |  1-5 of 12 users    [ < Prev ] [ Next > ]       |
|                   |                                                  |
|                   |  RBAC Permissions Matrix                        |
|                   |  +---------------------------+------+------+-----+
|                   |  | Permission                |Admin |Oper  |View |
|                   |  +---------------------------+------+------+-----+
|                   |  | View containers           |  X   |  X   |  X  |
|                   |  | Start / Stop containers   |  X   |  X   |     |
|                   |  | Remove containers         |  X   |  X   |     |
|                   |  | Pull / Remove images      |  X   |  X   |     |
|                   |  | Manage networks           |  X   |  X   |     |
|                   |  | Exec into containers      |  X   |  X   |     |
|                   |  | View logs                 |  X   |  X   |  X  |
|                   |  | View metrics              |  X   |  X   |  X  |
|                   |  | Manage clusters           |  X   |      |     |
|                   |  | Manage users & roles      |  X   |      |     |
|                   |  | Manage settings           |  X   |      |     |
|                   |  +---------------------------+------+------+-----+
+-------------------+--------------------------------------------------+

--- Invite User Modal ---
+----------------------------------------------------------------------+
|  +----------------------------------------------------------+        |
|  | Invite User                                       [x]   |        |
|  |                                                          |        |
|  |  Email Address                                           |        |
|  |  <user@company.com>                                      |        |
|  |                                                          |        |
|  |  Display Name (optional)                                 |        |
|  |  <Full Name>                                             |        |
|  |                                                          |        |
|  |  Role                                                    |        |
|  |  [ Viewer                                          v ]  |        |
|  |     Viewer  — read-only access to all resources         |        |
|  |     Operator — manage containers, images, networks      |        |
|  |     Admin   — full system access including users        |        |
|  |                                                          |        |
|  |  Namespaces Access                                       |        |
|  |  [x] production    [x] staging    [ ] development       |        |
|  |                                                          |        |
|  |  [    Send Invitation    ]    [ Cancel ]                 |        |
|  +----------------------------------------------------------+        |
+----------------------------------------------------------------------+
```

---

_End of wireframes.md_
