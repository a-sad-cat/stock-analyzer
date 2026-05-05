"""
后台管理 API 路由
/api/admin/*
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.strategy import StrategyResult
from strategies.engine import run_all_strategies

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/clear-and-rescan")
def api_clear_and_rescan(db: Session = Depends(get_db)):
    """清空今日扫描结果，保留股票日K数据，然后重新扫描已启用的策略"""
    today = date.today().isoformat()

    deleted = db.query(StrategyResult).filter(
        StrategyResult.created_at >= f"{today} 00:00:00",
        StrategyResult.created_at <= f"{today} 23:59:59",
    ).delete(synchronize_session="fetch")
    db.commit()

    logger.info(f"已清空今日 {deleted} 条扫描结果，开始重新扫描...")

    results = run_all_strategies(db, stock_limit=0)
    total = sum(v.get("count", 0) for v in results.values())

    logger.info(f"重新扫描完成，共匹配 {total} 条")

    return {
        "deleted": deleted,
        "total_matched": total,
        "strategies": results,
    }
