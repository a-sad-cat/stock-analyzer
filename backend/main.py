"""
# ========================================
# stock-analyzer 后端入口
# 启动命令: uvicorn main:app --reload
# ========================================
"""

import logging
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import stocks, strategies, sectors, backtest
from database import engine, Base
from services.data_service import _get_spot_map
from services.sector_service import refresh_sectors, rebuild_sector_map, build_stock_sectors_map
from models.backtest import BacktestRun, BacktestTrade  # noqa: F401 确保回测表被创建

logger = logging.getLogger(__name__)

# --- 创建数据库表 ---
Base.metadata.create_all(bind=engine)

# --- 创建 FastAPI 应用 ---
app = FastAPI(
    title="stock-analyzer 股票分析工具",
    description="基于策略的A股选股工具，支持自定义策略和AI辅助生成策略",
    version="1.0.0",
)

# --- 跨域配置 ---
# 允许本地开发 + Vercel 生产域名
# 生产环境下通过 CORS_ORIGINS 环境变量配置
import os
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 注册路由 ---
app.include_router(stocks.router, prefix="/api/stocks", tags=["股票数据"])
app.include_router(strategies.router, prefix="/api/strategies", tags=["策略管理"])
app.include_router(sectors.router, prefix="/api/sectors", tags=["板块热度"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["策略回测"])


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


@app.get("/")
def root():
    """根路径，检查服务是否正常"""
    return {"message": "stock-analyzer 服务运行中", "status": "ok"}


@app.get("/api/health")
def health_check():
    """健康检查接口"""
    return {"status": "healthy"}
