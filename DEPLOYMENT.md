# Solera Portal — Deployment Guide

**Target audience:** DevOps engineer performing a first-time production deployment on a Linux VPS or cloud VM.  
**Stack:** Django 6 · Celery · PostgreSQL 16 · Redis 7 · Node.js (MCP connector) · React/Vite · nginx  
**Orchestration:** Docker Compose v2

---

## 1. Architecture Overview

All services run as Docker containers on the same host, coordinated by Docker Compose.

```
Internet
   │
   ▼
[nginx :443]  ──── serves React static files (vlad-portal/dist/)
   │               routes /api/* → Django
   │               routes /media/* → uploaded files
   │               routes /mcp/* → MCP connector dashboard
   ▼
[django :8000]  ── gunicorn, 3 workers, Django REST API
   │
   ├── [celery-worker]  async task queue (AI agents, wiki compilation, file indexing)
   ├── [celery-beat]    scheduled tasks (calendar sync every 15min, reminders, weekly stats)
   │
   ├── [postgres :5432]  primary database (internal only, not exposed to host)
   ├── [redis :6379]     Celery broker + result backend (internal only)
   │
   └── [mcp-connector :4000]  Node.js service — Zoom + Outlook + Teams OAuth
                               credentials stored in Docker volume mcp_creds
```

**Media files** (uploaded client PDFs, Word docs, etc.) are stored in a Docker volume `media_data` mounted at `/app/media` in the Django and nginx containers.

---

## 2. Prerequisites

### Server
- Ubuntu 22.04 LTS (or equivalent), minimum 2 vCPU / 4 GB RAM
- Docker Engine ≥ 24.0 — [install guide](https://docs.docker.com/engine/install/ubuntu/)
- Docker Compose v2 (ships with Docker Engine as `docker compose` plugin)
- Git

Verify:
```bash
docker --version          # Docker version 24.x or higher
docker compose version    # Docker Compose version v2.x
```

### Domain & SSL
- Domain name with an A record pointing to the server's public IP
- Certbot installed for Let's Encrypt SSL:
```bash
apt install certbot
certbot certonly --standalone -d portal.solerafinancial.com
# Certificates written to /etc/letsencrypt/live/portal.solerafinancial.com/
```
> Run certbot before starting nginx. Auto-renewal: `certbot renew --dry-run` to verify cron is set up.

### API Keys & Credentials (obtain before deploying)

| Credential | Where to get it | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | All AI features |
| `OPENAI_API_KEY` | platform.openai.com | Optional — only if switching AI provider |
| Zoom Server-to-Server OAuth | marketplace.zoom.us → Build App → Server-to-Server OAuth | MCP connector |
| Microsoft Entra app registration | portal.azure.com → App registrations | MCP connector (Outlook/Teams) |

**Microsoft Entra app setup (required for Outlook calendar + email):**
1. Azure Portal → App registrations → New registration
2. Name: `Solera Portal`, Supported account types: Single tenant
3. API Permissions → Add: `Calendars.ReadWrite`, `Mail.Send`, `User.Read` (all Delegated)
4. Certificates & secrets → New client secret → copy the value immediately
5. Note: Directory (tenant) ID, Application (client) ID, Client secret value

---

## 3. Environment File Setup

```bash
# On the server, after cloning the repo:
cp backend/.env.example backend/.env.production
nano backend/.env.production
```

Fill in every value in `.env.production`:

```env
# ── Django Core ────────────────────────────────────────────────────────
SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=False
ALLOWED_HOSTS=portal.solerafinancial.com
DJANGO_SETTINGS_MODULE=config.settings.local

# ── Database ───────────────────────────────────────────────────────────
# Must match POSTGRES_PASSWORD in docker-compose.prod.yml
DATABASE_URL=postgresql://postgres:<strong-password>@postgres:5432/solera_prod

# ── Redis ──────────────────────────────────────────────────────────────
CELERY_BROKER_URL=redis://redis:6379/0

# ── AI Provider ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-...    # Required
OPENAI_API_KEY=                        # Optional — leave blank if using Anthropic only

# ── MCP Connector ──────────────────────────────────────────────────────
MCP_BASE_URL=http://mcp-connector:4000

# ── CORS — must exactly match your production URL ──────────────────────
CORS_ALLOWED_ORIGINS=https://portal.solerafinancial.com

# ── File Storage ───────────────────────────────────────────────────────
MEDIA_ROOT=/app/media

# ── Initial User Passwords (used only during first seed_users run) ─────
SEED_VLAD_PASSWORD=<strong-password>
SEED_SLAVA_PASSWORD=<strong-password>
SEED_SEVARA_PASSWORD=<strong-password>
SEED_ADMIN_PASSWORD=<strong-password>
```

Also set `POSTGRES_PASSWORD` in a separate file or as an environment variable — it must match the `DATABASE_URL` password above:

```bash
export POSTGRES_PASSWORD=<same-strong-password>
```

Or add it directly to `docker-compose.prod.yml` under the `postgres` service environment block.

---

## 4. Repository Setup

```bash
# Clone to /opt/solera (or your preferred path)
git clone <repo-url> /opt/solera
cd /opt/solera
```

---

## 5. Frontend Build

The React app must be built before nginx can serve it. Run this on the server (or in CI and copy the `dist/` folder):

```bash
cd /opt/solera/vlad-portal
npm ci                  # Install exact versions from package-lock.json
npm run build           # Output: vlad-portal/dist/
```

> **No frontend environment variables needed.** The API base path is hardcoded to `/api/v1` and nginx proxies all `/api/*` requests to Django on the same domain — no VITE_ env vars required.

---

## 6. Nginx Configuration

Update the domain name in `nginx/solera.conf` — replace all instances of `portal.solerafinancial.com` with your actual domain:

```bash
sed -i 's/portal.solerafinancial.com/yourdomain.com/g' /opt/solera/nginx/solera.conf
```

---

## 7. First-Time Deployment — Step by Step

Run these commands from `/opt/solera` in order. **Do not skip steps.**

### Step 1 — Build all Docker images
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```
Expected: each service builds without errors. The Django image installs Python deps including gunicorn and tesseract-ocr.

### Step 2 — Start infrastructure
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
```

Wait for health checks to pass (≈10 seconds):
```bash
docker compose ps
# postgres and redis should show "(healthy)"
```

### Step 3 — Run database migrations
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py migrate
```
Expected output: `Applying ... OK` for all migrations across all apps. If any fail, check `DATABASE_URL` in `.env.production`.

### Step 4 — Collect static files
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py collectstatic --noinput
```
Expected: `X static files copied to '/app/staticfiles'`

### Step 5 — Seed initial users
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py seed_users
```
This creates the advisor accounts for Vlad, Slava, Sevara, and an admin user using the passwords in `.env.production`. **Only run this once** — running again will not duplicate users but will reset passwords.

### Step 6 — Start all services
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Step 7 — Verify all containers are running
```bash
docker compose ps
```
All 6 services should show `Up` or `Up (healthy)`:
- `solera-postgres-1`
- `solera-redis-1`
- `solera-django-1`
- `solera-celery-worker-1`
- `solera-celery-beat-1`
- `solera-mcp-connector-1`
- `solera-nginx-1`

---

## 8. MCP Connector OAuth Setup (One-Time Manual Step)

The MCP connector is a Node.js service that manages OAuth credentials for Zoom and Outlook. It has a browser-based setup dashboard.

> This step requires Vlad (or a technical advisor contact) — they enter their own Zoom and Microsoft account credentials.

### Access the dashboard
Temporarily expose port 4000 (or add an IP-restricted nginx location — see `nginx/solera.conf` for the `/mcp/` block):

```bash
# Temporarily open port 4000 for setup (close after credentials are saved)
# In docker-compose.prod.yml, temporarily add under mcp-connector:
#   ports:
#     - "4000:4000"
# Then:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mcp-connector
```

Navigate to `http://<server-ip>:4000`.

### Connect Zoom
1. Click **Zoom** → **Configure**
2. Enter:
   - Account ID (from Zoom Marketplace app)
   - Client ID
   - Client Secret
3. Click **Save & Connect**
4. Status should show **Connected**

### Connect Outlook / Microsoft
1. Click **Outlook** → **Configure**
2. Enter:
   - Directory (Tenant) ID
   - Application (Client) ID
   - Client Secret
3. Click **Save & Connect**
4. Status should show **Connected**

Credentials are stored in the `mcp_creds` Docker volume at `/root/.mcp-connector/credentials.json` and persist across container restarts.

**After setup:** Remove the temporary port 4000 exposure and restart:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 9. Celery Beat Scheduled Tasks

Scheduled tasks are managed via Django's database-backed Celery Beat scheduler. They are created automatically on first deploy. Verify they are registered:

```bash
docker compose exec django python manage.py shell -c "
from django_celery_beat.models import PeriodicTask
for t in PeriodicTask.objects.all():
    print(t.name, '—', t.enabled)
"
```

Expected tasks:
- `sync-outlook-calendar` — every 15 minutes
- `check-reminders-hourly` — every hour
- `generate-weekly-summary` — Monday 8:00 AM PT

To manually trigger a task to verify it works:
```bash
docker compose exec django python manage.py shell -c "
from apps.agents.tasks import sync_outlook_calendar
result = sync_outlook_calendar.delay()
print('Task ID:', result.id)
"
```

---

## 10. Verification Checklist

Run through this after deployment to confirm everything is working end-to-end.

- [ ] `docker compose ps` — all 7 containers show `Up`
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://portal.solerafinancial.com/api/v1/auth/login/ -X POST` → returns `400` (not `502`)
- [ ] HTTPS redirect works: `curl -I http://portal.solerafinancial.com` → `301 Moved Permanently`
- [ ] Browser: navigate to `https://portal.solerafinancial.com` → login page loads
- [ ] Login with vlad credentials → dashboard loads
- [ ] Open a client profile → Files tab → upload a PDF → file appears in list with "Indexing…" badge
- [ ] After ~30 seconds → "Prep for Meeting" button on client profile returns an AI-generated brief
- [ ] MCP connector: Settings → check Zoom/Outlook connection status shows Connected
- [ ] Check Celery worker is processing: `docker compose logs celery-worker --tail 20`
- [ ] Check no Django errors: `docker compose logs django --tail 30`

---

## 11. Ongoing Operations

### Redeploy after a code push
```bash
cd /opt/solera
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build django celery-worker celery-beat
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Run new migrations (after code changes that add models)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm django python manage.py migrate
```

### Rebuild the frontend after UI changes
```bash
cd /opt/solera/vlad-portal
npm ci && npm run build
# nginx picks up new files immediately — no restart needed
```

### View logs
```bash
docker compose logs -f django           # Django API logs
docker compose logs -f celery-worker    # AI agent task logs
docker compose logs -f celery-beat      # Scheduled task logs
docker compose logs -f mcp-connector    # Zoom/Outlook connector logs
docker compose logs -f nginx            # Access + error logs
```

### Backup the database
```bash
docker compose exec postgres pg_dump -U postgres solera_prod \
  > /opt/backups/solera_$(date +%Y%m%d_%H%M%S).sql
```

### Restore the database
```bash
docker compose exec -T postgres psql -U postgres solera_prod \
  < /opt/backups/solera_20260423_120000.sql
```

### SSL certificate renewal
Certbot auto-renews via cron. To manually renew:
```bash
# Stop nginx temporarily (certbot --standalone needs port 80)
docker compose stop nginx
certbot renew
docker compose start nginx
```

### Reset a user's password
```bash
docker compose exec django python manage.py changepassword vlad
```

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502 Bad Gateway` from nginx | Django container not running | `docker compose logs django` — check for startup errors |
| `django` container exits immediately | Bad env var or DB not ready | Check `DATABASE_URL`, ensure postgres is healthy first |
| `celery-worker` shows `[ERROR]` on AI tasks | Missing `ANTHROPIC_API_KEY` | Verify `.env.production` and rebuild |
| MCP connector returns 500 on calendar sync | OAuth credentials not set up | Complete Step 8 (MCP OAuth setup) |
| File uploads fail silently | `media_data` volume not mounted | Verify `docker compose ps` shows nginx mounting `/app/media` |
| Celery tasks not running | `celery-beat` not started | `docker compose up -d celery-beat` |
| Static files 404 | `collectstatic` not run | Run Step 4 again |

---

## 13. File Reference

```
solera/
├── backend/
│   ├── .env.example          # Template — copy to .env.production
│   ├── .env.production        # Created by DevOps — never commit this
│   ├── Dockerfile             # Python 3.12, gunicorn CMD
│   └── requirements.txt       # All Python deps including gunicorn
├── vlad-portal/
│   ├── package.json           # npm ci && npm run build
│   └── dist/                  # Build output — served by nginx
├── mcp-connector/
│   ├── Dockerfile             # Node.js 18, no npm deps
│   └── server.js              # OAuth dashboard + REST API
├── nginx/
│   └── solera.conf            # nginx server blocks (update domain name)
├── docker-compose.yml         # Base config (dev + prod shared)
├── docker-compose.prod.yml    # Production overrides (gunicorn, no bind mounts, nginx)
└── DEPLOYMENT.md              # This file
```
