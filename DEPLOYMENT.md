# Solera Portal — Deployment Guide

**Target audience:** DevOps engineer performing a first-time production deployment on Ubuntu 22.04 LTS.  
**Stack:** Django 6 · Celery · PostgreSQL 16 · Redis 7 · Node.js 18 (MCP connector) · React/Vite · nginx  
**Orchestration:** Docker Compose v2  
**All commands are bash and must be run on the Linux server unless stated otherwise.**

---

## 1. Architecture Overview

All services run as Docker containers on the same host, coordinated by Docker Compose.

```
Internet
   │
   ▼
[nginx :80/:443]  ── serves React static files (vlad-portal/dist/)
   │                  proxies /api/*    → Django gunicorn
   │                  proxies /media/*  → uploaded client files
   │                  proxies /mcp/*    → MCP connector dashboard
   ▼
[django :8000]  ── gunicorn, 3 workers, Django REST API
   │
   ├── [celery-worker]  async tasks (AI agents, wiki compilation, file indexing)
   ├── [celery-beat]    scheduled tasks (calendar sync, reminders, weekly stats)
   │
   ├── [postgres :5432]  primary database  (internal network only)
   ├── [redis :6379]     Celery broker + result backend  (internal only)
   │
   └── [mcp-connector :4000]  Node.js — Zoom + Outlook + Teams OAuth
                               credentials stored in Docker volume: mcp_creds
```

**Media files** (client PDFs, Word docs, etc.) live in Docker volume `media_data`,
mounted at `/app/media` inside Django and nginx.

---

## 2. Server Provisioning

### 2.1 Minimum specs
- Ubuntu 22.04 LTS
- 2 vCPU / 4 GB RAM / 40 GB disk
- Public IP with ports 22, 80, 443 open

### 2.2 Initial server setup
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl gnupg ca-certificates lsb-release ufw
```

### 2.3 Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 2.4 Install Docker Engine + Compose plugin
```bash
# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version          # Docker version 24.x or higher
docker compose version    # Docker Compose version v2.x
```

### 2.5 Install Node.js 18 (required to build the React frontend)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # v18.x.x
npm --version     # 9.x or higher
```

### 2.6 Install Certbot for SSL
```bash
sudo apt-get install -y certbot

# Point your domain's DNS A record to this server's IP before running this.
# Stop anything on port 80 first (nginx isn't running yet at this point).
sudo certbot certonly --standalone -d portal.solerafinancial.com

# Certificates will be at:
#   /etc/letsencrypt/live/portal.solerafinancial.com/fullchain.pem
#   /etc/letsencrypt/live/portal.solerafinancial.com/privkey.pem

# Verify auto-renewal is working
sudo certbot renew --dry-run
```

---

## 3. Prerequisites — Credentials to Collect Before Deploying

| Credential | Where to get it | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Yes — all AI features depend on it |
| `OPENAI_API_KEY` | platform.openai.com | No — only if switching AI provider |
| Zoom Server-to-Server OAuth (Account ID, Client ID, Client Secret) | marketplace.zoom.us | Yes — calendar + transcripts |
| Microsoft Entra app (Tenant ID, App ID, Client Secret) | portal.azure.com | Yes — Outlook calendar + email |

See the IT credentials email template at the end of this document if you need to request these.

---

## 4. Clone the Repository

```bash
sudo mkdir -p /opt/solera
sudo chown $USER:$USER /opt/solera
git clone <repo-url> /opt/solera
cd /opt/solera
```

---

## 5. Environment File

```bash
cp backend/.env.example backend/.env.production
nano backend/.env.production
```

Fill in every value — do not leave angle-bracket placeholders:

```bash
# ── Django Core ────────────────────────────────────────────────────────
# Generate SECRET_KEY by running:
#   python3 -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY=replace-with-generated-key
DEBUG=False
ALLOWED_HOSTS=portal.solerafinancial.com
DJANGO_SETTINGS_MODULE=config.settings.local

# ── Database ───────────────────────────────────────────────────────────
# Use the same password you set for POSTGRES_PASSWORD below
DATABASE_URL=postgresql://postgres:your-db-password@postgres:5432/solera_prod

# ── Redis ──────────────────────────────────────────────────────────────
CELERY_BROKER_URL=redis://redis:6379/0

# ── AI Provider ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=

# ── MCP Connector (internal Docker network — do not change) ────────────
MCP_BASE_URL=http://mcp-connector:4000

# ── CORS ───────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS=https://portal.solerafinancial.com

# ── File Storage ───────────────────────────────────────────────────────
MEDIA_ROOT=/app/media

# ── Initial User Passwords ─────────────────────────────────────────────
# Used only during the first seed_users run (Step 7 below)
SEED_VLAD_PASSWORD=choose-a-strong-password
SEED_SLAVA_PASSWORD=choose-a-strong-password
SEED_SEVARA_PASSWORD=choose-a-strong-password
SEED_ADMIN_PASSWORD=choose-a-strong-password
```

Set the Postgres password as a shell variable (used by docker-compose.prod.yml):

```bash
# Must match DATABASE_URL password above
export POSTGRES_PASSWORD=your-db-password

# To persist across sessions, add to /etc/environment:
echo "POSTGRES_PASSWORD=your-db-password" | sudo tee -a /etc/environment
```

---

## 6. Update Nginx Domain Name

Replace the placeholder domain in the nginx config with your actual domain:

```bash
sed -i 's/portal.solerafinancial.com/yourdomain.com/g' /opt/solera/nginx/solera.conf
```

---

## 7. Build the React Frontend

```bash
cd /opt/solera/vlad-portal
npm ci
npm run build
# Build output: vlad-portal/dist/
# nginx serves this directory directly — no env vars needed
```

---

## 8. First-Time Deployment — Run in Order

All commands below run from `/opt/solera`. **Do not skip or reorder steps.**

### Step 1 — Build all Docker images
```bash
cd /opt/solera
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```
Expected: each service builds without errors. Django image installs Python deps + tesseract-ocr. Takes 3–5 minutes on first run.

### Step 2 — Start database and cache
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
```

Wait for health checks (≈15 seconds):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
# Both postgres and redis should show "(healthy)" before continuing
```

### Step 3 — Run database migrations
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py migrate
```
Expected: `Applying <app>.<migration>... OK` for every migration. If any fail, verify `DATABASE_URL` in `.env.production` matches the running postgres container.

### Step 4 — Collect static files
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py collectstatic --noinput
```
Expected: `X static files copied to '/app/staticfiles'`

### Step 5 — Create backup directory
```bash
sudo mkdir -p /opt/backups
sudo chown $USER:$USER /opt/backups
```

### Step 6 — Seed initial user accounts
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py seed_users
```
Creates advisor accounts for Vlad, Slava, Sevara, and admin using passwords from `.env.production`.  
**Run once only.** Re-running resets passwords but does not duplicate users.

### Step 7 — Start all services
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Step 8 — Confirm all containers are running
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

All 7 services should show `Up` or `Up (healthy)`:

| Container | Status |
|---|---|
| `solera-postgres-1` | Up (healthy) |
| `solera-redis-1` | Up (healthy) |
| `solera-django-1` | Up |
| `solera-celery-worker-1` | Up |
| `solera-celery-beat-1` | Up |
| `solera-mcp-connector-1` | Up |
| `solera-nginx-1` | Up |

---

## 9. MCP Connector OAuth Setup (One-Time Manual Step)

The MCP connector manages OAuth tokens for Zoom and Outlook. It has a browser-based setup dashboard that Vlad uses to connect his accounts.

### Temporarily expose port 4000

Edit `docker-compose.prod.yml` and add a ports entry under `mcp-connector`:

```yaml
  mcp-connector:
    ports:
      - "4000:4000"    # add this temporarily
```

Open the firewall for this setup session only:

```bash
sudo ufw allow 4000/tcp
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mcp-connector
```

Navigate to `http://<your-server-ip>:4000` in a browser.

### Connect Zoom
1. Click **Zoom → Configure**
2. Enter: Account ID · Client ID · Client Secret
3. Click **Save & Connect** — status should show **Connected**

### Connect Outlook / Microsoft
1. Click **Outlook → Configure**
2. Enter: Directory (Tenant) ID · Application (Client) ID · Client Secret
3. Click **Save & Connect** — status should show **Connected**

Credentials are persisted in the `mcp_creds` Docker volume at `/root/.mcp-connector/credentials.json` and survive container restarts.

### Lock down port 4000 after setup
```bash
# Remove the temporary ports entry from docker-compose.prod.yml, then:
sudo ufw delete allow 4000/tcp
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 10. Verify Celery Scheduled Tasks

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec django python manage.py shell -c "
from django_celery_beat.models import PeriodicTask
for t in PeriodicTask.objects.all():
    print(t.name, '-', t.enabled)
"
```

Expected tasks:
- `sync-outlook-calendar` — every 15 minutes
- `check-reminders-hourly` — every hour
- `generate-weekly-summary` — Monday 8:00 AM PT

Manually trigger a task to verify the worker processes it:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec django python manage.py shell -c "
from apps.agents.tasks import sync_outlook_calendar
result = sync_outlook_calendar.delay()
print('Task ID:', result.id)
"

# Watch the worker pick it up:
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  logs celery-worker --tail 20
```

---

## 11. Verification Checklist

Run through every item after deployment.

- [ ] `docker compose ps` — all 7 containers show `Up`
- [ ] SSL works: `curl -I https://portal.solerafinancial.com` → `200 OK`
- [ ] HTTP redirects to HTTPS: `curl -I http://portal.solerafinancial.com` → `301 Moved Permanently`
- [ ] API responds: `curl -s -o /dev/null -w "%{http_code}" -X POST https://portal.solerafinancial.com/api/v1/auth/login/` → `400` (not `502`)
- [ ] Browser: login page loads at `https://portal.solerafinancial.com`
- [ ] Login with vlad credentials → dashboard loads
- [ ] Open a client profile → Files tab → upload a PDF → file appears with "Indexing…" badge
- [ ] After ~30 seconds → click "Prep for Meeting" → AI brief is generated
- [ ] MCP connector: Settings page shows Zoom + Outlook as **Connected**
- [ ] Celery worker logs show no errors: `docker compose logs celery-worker --tail 30`
- [ ] Django logs show no errors: `docker compose logs django --tail 30`

---

## 12. Ongoing Operations

### Redeploy after a code push
```bash
cd /opt/solera
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  build django celery-worker celery-beat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Run new migrations after a deploy
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py migrate
```

### Rebuild the frontend after UI changes
```bash
cd /opt/solera/vlad-portal
npm ci && npm run build
# nginx serves vlad-portal/dist/ directly — no container restart needed
```

### View live logs
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f django
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f celery-worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f celery-beat
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f mcp-connector
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f nginx
```

### Backup the database
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec postgres pg_dump -U postgres solera_prod \
  > /opt/backups/solera_$(date +%Y%m%d_%H%M%S).sql

ls -lh /opt/backups/
```

### Restore the database
```bash
# Stop all app services first to prevent writes during restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  stop django celery-worker celery-beat

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres psql -U postgres solera_prod \
  < /opt/backups/solera_20260423_120000.sql

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Renew SSL certificate manually
```bash
# Certbot auto-renews via cron — only run manually if it failed
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx
sudo certbot renew
docker compose -f docker-compose.yml -f docker-compose.prod.yml start nginx
```

### Reset a user's password
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec django python manage.py changepassword vlad
```

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502 Bad Gateway` | Django container not running or crashed on startup | `docker compose logs django` — look for Python import errors or missing env vars |
| `django` container exits immediately | Bad `DATABASE_URL` or postgres not healthy yet | Verify `.env.production`, ensure postgres passes health check before starting django |
| `celery-worker` shows `[ERROR]` on AI tasks | Missing `ANTHROPIC_API_KEY` | Check `.env.production`, rebuild: `docker compose build celery-worker && docker compose up -d celery-worker` |
| MCP returns 500 on calendar sync | OAuth credentials not configured | Complete Section 9 (MCP OAuth setup) |
| File uploads return 500 | `media_data` volume not mounted | `docker compose config` — confirm media_data mount is present on django and nginx |
| Celery tasks not being processed | `celery-worker` not running | `docker compose up -d celery-worker` |
| Static files return 404 | `collectstatic` not run | Re-run Step 4 |
| nginx returns 403 on `/media/` | File permissions on volume | `docker compose exec nginx chown -R nginx:nginx /app/media` |
| SSL cert errors | Cert path mismatch | Confirm domain in `nginx/solera.conf` matches the certbot cert path in `/etc/letsencrypt/live/` |

---

## 14. File Reference

```
solera/
├── backend/
│   ├── .env.example            # Template — copy to .env.production and fill in values
│   ├── .env.production         # Your production secrets — never commit this file
│   ├── Dockerfile              # Python 3.12-slim, gunicorn CMD, tesseract-ocr
│   └── requirements.txt        # All Python deps including gunicorn==21.2.0
├── vlad-portal/
│   ├── package.json            # npm ci && npm run build
│   └── dist/                   # Build output — mounted into nginx container
├── mcp-connector/
│   ├── Dockerfile              # Node.js 18, zero external npm dependencies
│   └── server.js               # OAuth dashboard + REST API for Zoom/Outlook/Teams
├── nginx/
│   └── solera.conf             # nginx server blocks — update domain name before deploy
├── docker-compose.yml          # Base config shared by dev and prod
├── docker-compose.prod.yml     # Production overrides: gunicorn, no bind mounts, nginx service
└── DEPLOYMENT.md               # This file
```
