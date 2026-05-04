"""
# ========================================
# stock-analyzer 后端入口
# 启动命令: uvicorn main:app --reload
# ========================================
"""

import logging
import threading
import os
from pathlib import Path
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# --- 日志配置 ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

# 禁用 AKShare 的 tqdm 进度条
os.environ["TQDM_DISABLE"] = "1"
# 禁用 AKShare 控制台日志
try:
    import akshare as ak
    ak.console_logger.setLevel(logging.WARNING)
except Exception:
    pass

from routers import stocks, strategies, sectors, backtest, llm_analysis
from database import engine, Base
from services.data_service import _get_spot_map
from services.sector_service import refresh_sectors, rebuild_sector_map, build_stock_sectors_map
from models.backtest import BacktestRun, BacktestTrade  # noqa: F401 确保回测表被创建

logger = logging.getLogger(__name__)
logger.info("=" * 50)
logger.info("stock-analyzer 后端启动中...")
logger.info("AKShare 后台预热可能需要 30-60 秒")
logger.info("=" * 50)

# --- 创建数据库表 ---
Base.metadata.create_all(bind=engine)

# --- 创建 FastAPI 应用 ---
app = FastAPI(
    title="stock-analyzer 股票分析工具",
    description="基于策略的A股选股工具，支持自定义策略和AI辅助生成策略",
    version="1.0.0",
)

# --- 跨域配置 ---
# 本地开发时需要跨域，生产环境同源不需要
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 请求日志中间件 ---
class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        cost = round((time.time() - start) * 1000)
        if request.url.path.startswith("/api/"):
            logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({cost}ms)")
        return response

app.add_middleware(RequestLogMiddleware)

# --- 注册路由 ---
app.include_router(stocks.router, prefix="/api/stocks", tags=["股票数据"])
app.include_router(strategies.router, prefix="/api/strategies", tags=["策略管理"])
app.include_router(sectors.router, prefix="/api/sectors", tags=["板块热度"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["策略回测"])
app.include_router(llm_analysis.router, prefix="/api/llm", tags=["LLM AI分析"])


def _warm_cache():
    """后台预热行情缓存，避免用户第一次请求等待"""
    try:
        logger.info("后台预热行情缓存...")
        _get_spot_map()
        logger.info("行情缓存预热完成")
    except Exception as e:
        logger.warning(f"行情缓存预热失败: {e}")


def _warm_sectors():
    try:
        logger.info("后台预热板块数据...")
        refresh_sectors()
        logger.info("板块数据预热完成")
    except Exception as e:
        logger.warning(f"板块数据预热失败: {e}")


def _warm_sector_map():
    try:
        logger.info("后台构建板块-股票映射...")
        rebuild_sector_map()
        logger.info("板块映射构建完成")
    except Exception as e:
        logger.warning(f"板块映射构建失败: {e}")


threading.Thread(target=_warm_cache, daemon=True).start()
threading.Thread(target=_warm_sectors, daemon=True).start()
threading.Thread(target=_warm_sector_map, daemon=True).start()
threading.Thread(target=build_stock_sectors_map, daemon=True).start()


@app.get("/api/health")
def health_check():
    """健康检查接口"""
    return {"status": "healthy"}


# --- 托管前端静态文件 ---
# API 路由会优先匹配，其余路径由前端 SPA 处理
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
