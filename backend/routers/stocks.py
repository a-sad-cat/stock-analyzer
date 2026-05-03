"""
# ========================================
# 股票数据 API 路由
# /api/stocks/*
# ========================================
"""

import logging
import requests
import time
from datetime import datetime, timedelta

import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models.stock import SearchHistory
from services.data_service import (
    search_stocks,
    get_stock_detail,
    get_daily_data,
    get_realtime_quotes,
    get_all_stocks,
)
from services.sector_service import refresh_sectors, get_sector_stocks, batch_get_stock_sectors

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/search")
def api_search_stocks(keyword: str = Query("", description="搜索关键词（代码或名称）"), db: Session = Depends(get_db)):
    """搜索股票：按代码或名称模糊匹配"""
    if not keyword:
        return {"stocks": get_all_stocks(db)}
    stocks = search_stocks(keyword, db)
    return {"stocks": stocks, "total": len(stocks)}


@router.post("/search/history")
def api_save_search_keyword(keyword: str = Query("", description="搜索关键词")):
    """保存搜索关键词到历史记录"""
    if not keyword or not keyword.strip():
        return {"message": "ok"}
    kw = keyword.strip()
    db = SessionLocal()
    try:
        existing = db.query(SearchHistory).filter(SearchHistory.keyword == kw).first()
        if existing:
            existing.created_at = datetime.now()
        else:
            total = db.query(SearchHistory).count()
            if total >= 15:
                oldest = db.query(SearchHistory).order_by(SearchHistory.created_at.asc()).first()
                if oldest:
                    db.delete(oldest)
            db.add(SearchHistory(keyword=kw))
        db.commit()
    finally:
        db.close()
    return {"message": "ok"}


@router.get("/search/history")
def api_get_search_history():
    """获取最近的搜索关键词"""
    db = SessionLocal()
    try:
        records = db.query(SearchHistory).order_by(SearchHistory.created_at.desc()).limit(15).all()
        return {"keywords": [r.keyword for r in records]}
    finally:
        db.close()


@router.delete("/search/history")
def api_clear_search_history():
    """清空所有搜索历史"""
    db = SessionLocal()
    try:
        db.query(SearchHistory).delete()
        db.commit()
        return {"message": "ok"}
    finally:
        db.close()


@router.delete("/search/history/{keyword}")
def api_delete_search_keyword(keyword: str):
    """删除单个搜索历史关键词"""
    if not keyword.strip():
        return {"message": "ok"}
    db = SessionLocal()
    try:
        db.query(SearchHistory).filter(SearchHistory.keyword == keyword.strip()).delete()
        db.commit()
        return {"message": "ok"}
    finally:
        db.close()


@router.get("/{code}/detail")
def api_stock_detail(code: str):
    """获取个股详细信息（含K线和技术指标）"""
    try:
        detail = get_stock_detail(code)
        if "error" in detail:
            raise HTTPException(status_code=404, detail=detail["error"])
        return detail
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取个股详情失败 [{code}]: {e}")
        raise HTTPException(status_code=500, detail=f"获取数据失败: {str(e)}")


@router.get("/{code}/kline")
def api_stock_kline(code: str, days: int = Query(60, ge=10, le=365, description="获取最近N天数据")):
    """获取个股K线数据"""
    try:
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=days + 30)).strftime("%Y%m%d")
        df = get_daily_data(code, start, end)
        if df.empty:
            raise HTTPException(status_code=404, detail="没有K线数据")

        # 取最近days条
        df = df.tail(days)
        kline = []
        for idx, row in df.iterrows():
            item = {
                "date": str(idx),
                "open": round(float(row['open']), 2),
                "high": round(float(row['high']), 2),
                "low": round(float(row['low']), 2),
                "close": round(float(row['close']), 2),
                "volume": float(row['volume']),
                "pct_chg": round(float(row['pct_chg']), 2),
            }
            # 添加技术指标（如有）
            for col in ['MA5', 'MA10', 'MA20', 'MA60', 'DIF', 'DEA', 'MACD',
                        'RSI', 'K', 'D', 'J', 'VOL_MA5', 'BB_UPPER', 'BB_LOWER']:
                if col in df.columns and pd.notna(row.get(col)):
                    item[col] = round(float(row[col]), 2)
            kline.append(item)

        return {"code": code, "kline": kline}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取K线数据失败 [{code}]: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 行情数据缓存
_quotes_cache: dict = {"data": None, "time": 0}
_QUOTES_TTL = 60  # 1分钟缓存（东方财富实时数据很快）

# 东方财富实时行情 API（Sina 已封禁）
_EM_INDEX_URL = "https://push2.eastmoney.com/api/qt/ulist.np/get"
_EM_SECIDS = "1.000001,0.399001,0.399006"  # 上证指数, 深证成指, 创业板指

@router.get("/market/quotes")
def api_market_quotes():
    """获取实时行情（大盘指数，东方财富源）"""
    now = time.time()
    if _quotes_cache["data"] and now - _quotes_cache["time"] < _QUOTES_TTL:
        return _quotes_cache["data"]

    indices = []
    try:
        r = requests.get(
            _EM_INDEX_URL,
            params={"fltt": 2, "fields": "f2,f3,f12,f14", "secids": _EM_SECIDS},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        r.raise_for_status()
        data = r.json()
        for item in data.get("data", {}).get("diff", []):
            close = item.get("f2", 0)
            pct_chg = item.get("f3", 0)
            name = item.get("f14", "")
            if close:
                indices.append({
                    "name": name,
                    "close": round(float(close), 2),
                    "pct_chg": round(float(pct_chg), 2),
                })
    except Exception as e:
        logger.warning(f"获取指数行情失败 (EastMoney): {e}")

    result = {"indices": indices}
    # 仅在成功获取数据时更新缓存，失败保留旧数据
    if indices:
        _quotes_cache["data"] = result
        _quotes_cache["time"] = now
    elif _quotes_cache["data"]:
        return _quotes_cache["data"]
    return result


@router.get("/{code}/sectors")
def api_stock_sectors(code: str):
    """获取股票所属板块（使用预构建的反向映射，O(1) 查找）"""
    try:
        sectors_map = batch_get_stock_sectors([code])
        sectors = sectors_map.get(code, [])[:5]
        return {"code": code, "sectors": [{"name": s, "type": "concept"} for s in sectors]}
    except Exception as e:
        logger.error(f"获取股票板块失败 [{code}]: {e}")
        return {"code": code, "sectors": []}


class BatchSectorsRequest(BaseModel):
    codes: list[str]

@router.post("/sectors/batch")
def api_batch_stock_sectors(req: BatchSectorsRequest):
    """批量查询多只股票所属板块"""
    try:
        sectors_map = batch_get_stock_sectors(req.codes)
        return {"sectors": sectors_map}
    except Exception as e:
        logger.error(f"批量获取股票板块失败: {e}")
        return {"sectors": {}}



