# stock-analyzer

FastAPI + React/TypeScript A-share stock screening tool with technical indicators.

## Quick start

```bash
scripts\install.bat          # pip install + npm install
scripts\start_backend.bat    # uvicorn main:app --reload on :8000
scripts\start_frontend.bat   # vite dev on :5173 (proxies /api -> :8000)
```

## Architecture

| Layer | Dir | Entry | Port |
|-------|-----|-------|------|
| Backend | `backend/` | `main.py` (uvicorn) | 8000 |
| Frontend | `frontend/` | `src/main.tsx` (Vite) | 5173 |

Three API routers: `/api/stocks/*`, `/api/strategies/*`, `/api/sectors/*`.

See `PROJECT.md` for full API reference, strategy list, and data flow.

## Key facts

- **Data source**: AKShare (Sina), requires internet. First call slow (~25s); background threads on startup pre-warm cache (`_get_spot_map`, sector data).
- **Technical indicators**: `pandas-ta` (pure Python, NOT ta-lib). Computed in `services/data_service.py:_add_technical_indicators()`.
- **Database**: SQLite (`backend/stock_analyzer.db`). Schema auto-created on startup.
- **Config**: `backend/config.py` — `MAX_SCAN_STOCKS=200`, `CACHE_EXPIRE_HOURS=48`, `AKSHARE_TIMEOUT=30`.
- **Scan API**: `limit=0` scans ALL stocks (overrides `MAX_SCAN_STOCKS`).

## Commands

- `npm run dev` — vite dev server
- `npm run build` — `tsc -b && vite build` (NOT just `vite build`)
- `python backend/_check_strategies.py` — debug: list all builtin strategies vs DB state
- `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000` — run from `backend/`

## Environment

- Windows only (scripts are `.bat`). No Makefile, no shell scripts.
- No `.gitignore` exists. Avoid committing `stock_analyzer.db`, `node_modules/`, `__pycache__/`.
- No lint, formatter, or typecheck config for backend. Frontend typecheck is part of `npm run build`.
- No tests anywhere in the repo.

## Notable quirks

- ASGI server is **uvicorn** (not hypercorn/gunicorn). Use `python -m uvicorn main:app`, not `uvicorn main:app`.
- `config.py` sets `DATABASE_URL = f"sqlite:///{DATABASE_PATH}"` — synchronous SQLAlchemy with `check_same_thread=False`.
- `docker` dependencies: `httpx` is listed in requirements.txt but not used in current code.
- AKShare may fail silently (network issues, API changes). All endpoints handle exceptions gracefully.
