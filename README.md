# Solera Portal Developer Setup

## Repo layout

```text
solera/
|-- backend/         Django API
|-- vlad-portal/     React frontend
|-- mcp-connector/   Node service used by the app
`-- docker-compose.yml
```

## What you need installed

- Docker Desktop
- Python 3.12
- Node.js 20+

Open Docker Desktop before running any Docker commands.

## First-time setup

Follow these steps in order.

### 1. Start PostgreSQL and Redis

Open PowerShell:

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera
docker compose up -d postgres redis
```

Wait about 10 seconds.

If you want to check that they started:

```powershell
docker compose ps
```

### 2. Set up the backend

Open a new PowerShell window:

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
pip install -r requirements.txt
```

Open [backend/.env](C:/Users/ywjayvee/PycharmProjects/solera/backend/.env:3) and make sure this line is exactly:

```powershell
DATABASE_URL=postgresql://postgres:password@localhost:5433/solera_dev
```

Then run:

```powershell
python manage.py migrate
python manage.py seed_users
python manage.py seed_data
```

If those finish without errors, the backend setup is done.

### 3. Set up the MCP connector

Copy this folder:

```text
G:\My Drive\Dev_Work\mcp\
```

Into this folder:

```text
C:\Users\ywjayvee\PycharmProjects\solera\mcp-connector\
```

After the files are copied, open another PowerShell window:

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\mcp-connector
npm install
npm start
```

Leave that terminal open while using the app.

### 4. Set up the frontend

Open another PowerShell window:

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\vlad-portal
npm install
```

## Running the app

After setup, you usually need 4 PowerShell windows open.

### Window 1: Docker

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera
docker compose up -d postgres redis
```

Only needed after a reboot or if containers were stopped.

### Window 2: Backend

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
python manage.py runserver 8000
```

### Window 3: MCP connector

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\mcp-connector
npm start
```

### Window 4: Frontend

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\vlad-portal
npm run dev
```

Then open:

```text
http://localhost:5174
```

## Login accounts

Use one of these after `python manage.py seed_users`:

| User | Username | Password |
|------|----------|----------|
| Vlad Donets | `vlad` | `changeme_vlad` |
| Slava | `slava` | `changeme_slava` |
| Sevara | `sevara` | `changeme_sevara` |
| Admin | `admin` | `changeme_admin` |

These passwords are set in [backend/.env](C:/Users/ywjayvee/PycharmProjects/solera/backend/.env:11).

## Common problems

### Error: `password authentication failed for user`

This usually means [backend/.env](C:/Users/ywjayvee/PycharmProjects/solera/backend/.env:3) has the wrong database port.

Use:

```powershell
DATABASE_URL=postgresql://postgres:password@localhost:5433/solera_dev
```

Do not use `5432`.

### Error: `relation "users_advisoruser" does not exist`

This was caused by missing app migrations in an older version of the repo. With the current repo, `python manage.py migrate` should work.

## Useful Docker commands

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera
docker compose ps
docker compose logs postgres
docker compose down
```

## Reset demo data

From the backend folder:

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
python manage.py flush --no-input
python manage.py seed_users
python manage.py seed_data
```

## Optional background workers

These are only needed for background jobs such as reminders and some AI features.

### Celery worker

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
celery -A config worker -l info
```

### Celery beat

```powershell
cd C:\Users\ywjayvee\PycharmProjects\solera\backend
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

## Public questionnaire page

```text
http://localhost:5174/form/tok_demo
```
