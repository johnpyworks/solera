# Solera Portal — Developer Setup

## Project Structure

```
solera/
├── vlad-portal/        # React frontend (Vite, port 5174)
├── backend/            # Django API (port 8000)
├── mcp-connector/      # Node.js MCP bridge (port 4000) — copy from G:\My Drive\Dev_Work\mcp\
└── docker-compose.yml  # PostgreSQL + Redis
```

---

## First-Time Setup

### 1. Prerequisites

- Docker Desktop installed and **Linux engine running** (open Docker Desktop from Start menu before running any docker commands)
- Python 3.12
- Node.js 20+

### 2. Start infrastructure (PostgreSQL + Redis)

```bash
cd C:\Users\ywjayvee\PycharmProjects\solera
docker compose up -d postgres redis
```

Wait ~10 seconds for postgres to be healthy.

### 3. Backend — install dependencies and seed database

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_users
python manage.py seed_data
```

### 4. MCP Connector — copy and start

Copy `G:\My Drive\Dev_Work\mcp\` → `solera\mcp-connector\`

```bash
cd mcp-connector
npm install
npm start
```

MCP connector runs on port 4000. OAuth credentials persist in `~/.mcp-connector/credentials.json`.

### 5. Frontend — install dependencies

```bash
cd vlad-portal
npm install
```

---

## Running the Project (Every Time After Setup)

You need **4 things running**. Open 4 terminals:

### Terminal 1 — Infrastructure (Docker)
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera
docker compose up -d postgres redis
```
(Only needed once per machine restart. Skip if containers are already running.)

### Terminal 2 — Django API
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
python manage.py runserver 8000
```

### Terminal 3 — MCP Connector
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera\mcp-connector
npm start
```

### Terminal 4 — React Frontend
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera\vlad-portal
npm run dev
```

Open: **http://localhost:5174**

---

## Login Credentials

| User | Role | Username | Default Password |
|------|------|----------|-----------------|
| Vlad Donets | Advisor | `vlad` | `changeme_vlad` |
| Slava | Advisor | `slava` | `changeme_slava` |
| Sevara | Assistant | `sevara` | `changeme_sevara` |
| Admin | Super Admin | `admin` | `changeme_admin` |

Passwords are set in `backend/.env` and can be changed there before seeding.

---

## Celery Workers (needed for AI agents and background tasks)

For meeting processing, 48hr reminders, and Outlook sync to work, run these two additional terminals:

### Terminal 5 — Celery Worker
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
celery -A config worker -l info
```

### Terminal 6 — Celery Beat (scheduled tasks)
```bash
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

---

## Checking Docker Container Status

```bash
docker compose ps           # see what's running
docker compose logs postgres # check postgres logs
docker compose down         # stop everything
```

---

## Re-seeding (reset to demo data)

```bash
cd backend
python manage.py flush --no-input
python manage.py seed_users
python manage.py seed_data
```

---

## Environment Variables

All config lives in `backend/.env`. Key values:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API key (for AI agents) |
| `OPENAI_API_KEY` | OpenAI API key (optional fallback) |
| `MCP_BASE_URL` | MCP connector URL (default: http://localhost:4000) |
| `CELERY_BROKER_URL` | Redis URL (default: redis://localhost:6379/0) |

---

## Questionnaire Form (Public)

The client questionnaire is accessible without login:

```
http://localhost:5174/form/tok_demo
```

(Uses the `tok_demo` seed token for Sarah Chen.)
