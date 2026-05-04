"""
板块热度 API 路由 /api/sectors/*
"""
import logging
from fastapi import APIRouter, Query, HTTPException

from services.sector_service import (
    refresh_sectors,
    get_sector_detail,
    get_sector_stocks,
    calc_heat_score,
    sustained_sectors,
    rebuild_sector_map,
    enrich_stocks_info,
)
from strategies.engine import run_strategy_for_hot_sectors
from database import SessionLocal

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/heatmap")
def api_sector_heatmap(sector_type: str = Query("", description="过滤: concept/industry/空=全部")):
    """获取板块热度排名"""
    sectors = refresh_sectors()
    if not sectors:
        return {"sectors": [], "total": 0, "message": "板块数据暂时不可用"}

    if sector_type:
        sectors = [s for s in sectors if s["sector_type"] == sector_type]

    # 计算热度分
    market_pct = 0
    try:
        for s in sectors:
            if s["name"] == "上证指数":
                market_pct = s["pct_chg"]
                break
    except Exception:
        pass

    result = []
    for s in sectors:
        heat = calc_heat_score(s, market_pct)
        result.append({
            "name": s["name"],
            "type": s["sector_type"],
            "pct_chg": s["pct_chg"],
            "heat_score": heat["score"],
            "breakdown": heat["breakdown"],
            "limit_up_count": s.get("limit_up_count", 0),
            "stock_count": s.get("stock_count", 0),
        })

    result.sort(key=lambda x: x["pct_chg"], reverse=True)
    return {"sectors": result, "total": len(result)}


@router.get("/{sector_name}/detail")
def api_sector_detail(sector_name: str, sector_type: str = Query("concept")):
    """获取板块详情（基本信息 + K 线 + 成分股）"""
    detail = get_sector_detail(sector_name, sector_type)
    if not detail:
        raise HTTPException(status_code=404, detail="板块不存在")
    return detail


@router.get("/sustained")
def api_sustained_sectors(min_score: float = Query(60, ge=0, le=100)):
    """获取持续性评分达标的板块"""
    result = sustained_sectors(min_score=min_score)
    return {"sectors": result, "total": len(result)}


@router.post("/scan-hot")
def api_scan_hot_sectors(
    strategy_id: int = Query(0, description="指定策略ID，0=所有已启用"),
    heat_threshold: float = Query(60, ge=0, le=100),
    per_sector_limit: int = Query(20, ge=5, le=100),
):
    """对持续性热门板块运行策略扫描"""
    db = SessionLocal()
    try:
        sid = strategy_id if strategy_id > 0 else None
        results = run_strategy_for_hot_sectors(db, sid, heat_threshold, per_sector_limit)
        return {"count": len(results), "results": results}
    finally:
        db.close()


@router.post("/rebuild-map")
def api_rebuild_sector_map():
    """手动触发板块映射重建"""
    ok = rebuild_sector_map()
    return {"success": ok}


@router.get("/{sector_name}/stocks")
def api_sector_stocks(sector_name: str, sector_type: str = Query("concept")):
    """获取板块成分股列表（含名称和涨跌幅，按涨幅降序）"""
    codes = get_sector_stocks(sector_name, sector_type)
    enriched = enrich_stocks_info(codes)
    return {"sector_name": sector_name, "stocks": enriched, "total": len(enriched)}
