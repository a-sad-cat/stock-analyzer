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

## Deployment

Two options (mutually exclusive, pick one):

### Option A: Render + Vercel (免费用，海外访问快)

1. Render: Go to https://dashboard.render.com → **New +** → **Blueprint**, connect repo
2. Vercel: Import repo, Root Directory = `frontend`
3. On Render, set `CORS_ORIGINS` env var

### Option B: 阿里云轻量服务器（推荐，国内速度快）

```bash
# 1. 服务器上安装 Python
apt update && apt install -y python3 python3-pip python3-venv git

# 2. 克隆代码
git clone -b deploy/aliyun https://github.com/a-sad-cat/stock-analyzer.git
cd stock-analyzer

# 3. 一键部署
bash scripts/deploy.sh

# 4. （推荐）安装为系统服务，后台运行 + 开机自启
cp scripts/stock-analyzer.service /etc/systemd/system/
systemctl enable stock-analyzer
systemctl start stock-analyzer

# 5. 防火墙开放 8000 端口
#    阿里云控制台 → 安全组 → 添加规则: 允许 TCP 8000

# 6. 访问 http://<服务器IP>:8000
```

## Notable quirks

- ASGI server is **uvicorn** (not hypercorn/gunicorn). Use `python -m uvicorn main:app`, not `uvicorn main:app`.
- `config.py` uses `DATABASE_URL` env var for PostgreSQL (production) or SQLite (local dev).
- `docker` dependencies: `httpx` is listed in requirements.txt but not used in current code.
- AKShare may fail silently (network issues, API changes). All endpoints handle exceptions gracefully.
