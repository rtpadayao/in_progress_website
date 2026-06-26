---
title: "Bringing Up the Stack — A Day-One War Story"
date: 2026-06-26T15:27:17+08:00
description: "A personal walkthrough of getting the AI-Powered Airflow demo stack running for the first time on WSL2 — not just the happy path, but the things that actually broke and the exact fixes."
tags: ["airflow", "docker", "wsl2", "dbt", "fastapi", "postgres"]
categories: ["data-engineering", "tutorials"]
---

A personal walkthrough of getting the AI-Powered Airflow demo stack running for the first time on WSL2 (Ubuntu 24.04). This is the post I wish I'd had: not just the happy path, but the things that actually broke and the exact fixes.

**Stack:** FastAPI → Postgres → dbt → Airflow, all in Docker Compose. Host is WSL2, not native Linux, which is the source of most of the friction.

---

## The Short Version

If you just want the commands:

```bash
docker compose up -d
docker compose ps
```

If `docker compose ps` shows all `healthy` (or `Exited (0)` for the one-shot jobs), you're done. Read on only if something is `unhealthy`, `restarting`, or `Exited (1)`.

---

## What Actually Happened

### 1. The Windows port conflict on :8080

**Symptom:** Airflow webserver wouldn't bind its host port. Compose reported the service as unhealthy, and the UI was unreachable.

**Root cause:** A Windows process — `AgentService.exe` (PID 6196 this session) — was already listening on `0.0.0.0:8080`. This is a well-known WSL2 gotcha: Windows services claim ports before the Linux side gets a chance, and Docker's port-forwarding fails silently.

**Diagnosis:**

```bash
cmd.exe /c "netstat -ano | findstr :8080"
# TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    6196
```

**Fix:** Remap Airflow to host port 8081 in `docker-compose.yml`:

```yaml
airflow-webserver:
  ports:
    - "8081:8080"   # container still on 8080, host on 8081
```

**Lesson:** Before assuming a compose error, always check Windows port occupancy. If :8080 is taken, the compose maps to 8081 — adjust if you change this, and remember it when you bookmark the UI.

---

### 2. The `airflow-init` one-shot job

**Symptom:** `airflow-webserver` and `airflow-scheduler` stayed in `restarting` loops even though Postgres was healthy.

**Root cause:** The webserver and scheduler both have `depends_on: airflow-init: condition: service_completed_successfully`. If `airflow-init` fails, they never start. In this session, the init job actually succeeded on first try — but it's the single most fragile point in the whole bring-up, so it's worth understanding.

**What `airflow-init` does:**
1. `airflow db migrate` — runs Alembic migrations against Postgres
2. `airflow users create ...` — creates the admin user
3. Echoes "Airflow initialized successfully"

**The success logs look like this:**

```
DB: postgresql+psycopg2://postgres:***@postgres:5432/finance_demo
Performing upgrade to the metadata database ...
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
Database migrating done!
admin already exist in the db
Airflow initialized successfully
```

Note the `admin already exist in the db` — this is **normal on second run**. The init job is idempotent, so re-running `docker compose up -d` after the DB is already migrated just no-ops the user creation.

**Failure modes to watch for:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `airflow_init` `Restarting (127)` | YAML `command:` folding broke the bash command | Rebuild with `docker compose build --no-cache airflow-init` |
| `airflow_init` `PermissionError` on `./airflow/logs` | Volume not owned by uid 50000 (Airflow's user inside the container) | `sudo chown -R 50000:0 airflow/logs airflow/dags airflow/plugins` |
| `airflow_init` hangs on "Context impl PostgresqlImpl" | Postgres not actually ready — check `depends_on` has `condition: service_healthy` |

**Lesson:** The init job is the gatekeeper. If anything downstream looks stuck, check `docker compose logs airflow-init` first.

---

### 3. Volume ownership (the uid 50000 problem)

**Symptom:** Airflow wrote logs during the init run, but on a fresh clone the `airflow/logs` and `airflow/dags` directories are created by the host user (uid 1000). Inside the container, Airflow runs as uid 50000 and can't write to them.

**Evidence this session:** The directories are already owned by `50000 root`:

```
drwxr-xr-x 3 50000 root 4096 Jun 26 12:25 airflow/dags
drwxr-xr-x 4 50000 root 4096 June 26 12:25 airflow/logs
drwxr-xr-x 2 50000 root 4096 June 17 15:12 airflow/plugins
```

This means the fix was applied at some prior session. If you're cloning fresh, you'll likely need:

```bash
sudo chown -R 50000:0 airflow/logs airflow/dags airflow/plugins
```

**Lesson:** This is a WSL2-specific gotcha. On native Linux with Docker Desktop, the user namespace remapping often hides it. On raw Docker in WSL2, uid mismatch surfaces as a hard PermissionError.

---

### 4. The `.env` placeholder keys

**Symptom:** `airflow db migrate` fails with a Fernet key error, or webserver logins are rejected.

**Root cause:** `.env` contains placeholders like `your_fernet_key_here...`. Airflow requires:
- `AIRFLOW_FERNET_KEY` — 44-char base64
- `AIRFLOW_SECRET_KEY` — 64-char hex

**This session:** The `.env` was already populated with real values (the committed demo config), so this didn't bite. But if you're cloning from a fresh checkout that only has `.env.example`, you must generate real values:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**Lesson:** Placeholders will cause `airflow db migrate` to fail or webserver logins to reject. If either breaks, check `.env` first.

---

### 5. The `curl` healthcheck gotcha

**Symptom:** `fastapi_app` shows `unhealthy` in `docker compose ps`, but `curl http://localhost:8000/health` from the host returns `{"status":"ok"}`.

**Root cause:** The healthcheck runs *inside* the container: `curl --fail http://localhost:8000/health`. If `curl` isn't installed in the image, the healthcheck fails by definition — even though the service is fine from the host.

**This session:** The FastAPI image includes `curl`, so the healthcheck passes. But if you're customizing the Dockerfile and forget `curl` (or `wget`), this is the failure mode.

**Lesson:** Healthchecks are container-internal. An "unhealthy" status with a working host probe almost always means the healthcheck command itself is missing, not that the service is down.

---

### 6. Relative imports in `main.py`

**Symptom:** `fastapi_app` `Restarting (1)` with `ImportError: attempted relative import`.

**Root cause:** Uvicorn launches `main.py` as a top-level script (`uvicorn main:app`), not as a package. Relative imports like `from .schemas import X` fail because there is no package context.

**Fix:** Use absolute imports in `main.py`:

```python
from schemas import X   # correct — uvicorn runs main.py at top level
# from .schemas import X  # wrong — only works for package imports
```

**This session:** The committed `api/main.py` already uses absolute imports, so this didn't surface. It's listed here because it's the #1 issue when someone copies a FastAPI project structure into this repo.

---

## The Health Check That Matters

After `docker compose up -d`, don't trust "containers running" — verify health:

```bash
docker compose ps
```

Expected healthy state this session:

```
airflow_scheduler   → healthy
airflow_webserver   → healthy
fastapi_app         → healthy
postgres_db         → healthy
pgadmin_gui         → Up (no healthcheck defined)
airflow_init        → Exited (0)   ← one-shot, success
dbt_core            → Exited (0) or Started  ← one-shot
```

Any `unhealthy`, `restarting`, or `Exited (1)` → investigate:

```bash
docker compose logs --tail=30 <service>
```

Then probe the UIs in a browser to confirm traffic flows:
- Airflow: http://localhost:8081
- FastAPI docs: http://localhost:8000/docs
- pgAdmin: http://localhost:5050

---

## The Bring-Up Sequence, Annotated

```bash
# 1. Start everything
docker compose up -d

# 2. Verify health (not just "running")
docker compose ps

# 3. Confirm the one-shot init actually succeeded
docker compose logs airflow-init | tail -5
# Expect: "Airflow initialized successfully"

# 4. Hit the UIs
#    Airflow  : http://localhost:8081  (remapped from 8080)
#    FastAPI  : http://localhost:8000/docs
#    pgAdmin  : http://localhost:5050

# 5. Run dbt (one-shot, after Airflow is up)
docker compose run --rm dbt run
docker compose run --rm dbt test
```

---

## What I'd Do Differently Next Time

1. **Bookmark :8081, not :8080.** The Windows port conflict is permanent on this machine. Writing this post is the reminder I won't have to re-diagnose it.
2. **Check `docker compose logs airflow-init` first** when anything downstream looks stuck. It's the gatekeeper.
3. **Run `sudo chown -R 50000:0 airflow/...` immediately after clone**, before the first `up -d`. Saves a full bring-up cycle.
4. **Treat `docker compose ps` as the source of truth**, not "can I hit the endpoint." Healthchecks catch the `curl`-missing case that host probes miss.
