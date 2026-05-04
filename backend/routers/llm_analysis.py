"""
# ========================================
# LLM AI 分析 API 路由
# /api/llm/*
# ========================================
"""

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.llm_service import get_analysis_engine, AnalysisResult
from services.data_service import get_daily_data
from models.stock import Stock

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------- Pydantic 模型 ----------
class AnalyzeRequest(BaseModel):
    code: str
    name: Optional[str] = None
    days: int = 90


class AnalyzeBatchRequest(BaseModel):
    codes: list[str]  # 股票代码列表
    days: int = 90
    delay_seconds: float = 1.0


class StrategyHitInfo(BaseModel):
    strategy_name: str
    score: float
    reason: str


class AnalyzeResponse(BaseModel):
    code: str
    name: str
    success: bool
    error_message: str = ""
    sentiment_score: int = 50
    trend_prediction: str = "震荡"
    operation_advice: str = "观望"
    confidence_level: str = "中"
    analysis_summary: str = ""
    risk_factors: list[str] = []
    key_signals: list[str] = []
    target_price_high: Optional[float] = None
    target_price_low: Optional[float] = None
    stop_loss_price: Optional[float] = None
    model_used: str = ""
    tokens_used: int = 0
    elapsed_seconds: float = 0.0


def _result_to_response(r: AnalysisResult) -> dict:
    """将 AnalysisResult 转为 API 响应字典"""
    return {
        "code": r.code,
        "name": r.name,
        "success": r.success,
        "error_message": r.error_message,
        "sentiment_score": r.sentiment_score,
        "trend_prediction": r.trend_prediction,
        "operation_advice": r.operation_advice,
        "confidence_level": r.confidence_level,
        "analysis_summary": r.analysis_summary,
        "risk_factors": r.risk_factors,
        "key_signals": r.key_signals,
        "target_price_high": r.target_price_high,
        "target_price_low": r.target_price_low,
        "stop_loss_price": r.stop_loss_price,
        "model_used": r.model_used,
        "tokens_used": r.tokens_used,
        "elapsed_seconds": r.elapsed_seconds,
    }


# ---------- API 端点 ----------
@router.get("/status")
def api_llm_status():
    """检查 LLM 分析引擎状态"""
    engine = get_analysis_engine()
    return {
        "available": engine.is_available,
        "provider": engine.client._provider if engine.is_available else "未配置",
        "model": engine.client._model if engine.is_available else "未配置",
    }


@router.post("/analyze")
def api_analyze_stock(req: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    对单只股票进行 AI 分析

    根据最近 N 日 K 线数据 + 技术指标 + 当日策略命中结果，调用 LLM 进行综合研判。
    """
    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="股票代码不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 获取股票名称
    name = req.name or _get_stock_name(code, db)

    # 获取 K 线数据
    kline_df = _get_kline(code, days=max(30, req.days))
    if kline_df is None:
        raise HTTPException(status_code=404, detail=f"未找到 {code} 的K线数据")

    # 获取今日策略命中结果
    strategy_hits = _get_today_strategy_hits(code, db)

    # 调用 LLM 分析
    result = engine.analyze(
        code=code,
        name=name,
        kline_df=kline_df,
        strategy_hits=strategy_hits,
    )

    return _result_to_response(result)


@router.post("/analyze-batch")
def api_analyze_batch(req: AnalyzeBatchRequest, db: Session = Depends(get_db)):
    """
    批量 AI 分析多只股票

    对列表中每只股票依次调用 LLM 分析，带延迟避免限流。
    """
    if not req.codes:
        raise HTTPException(status_code=400, detail="股票代码列表不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 限制批量数量
    if len(req.codes) > 20:
        raise HTTPException(status_code=400, detail="单次批量分析最多 20 只股票")

    results = []
    for code in req.codes:
        code = code.strip()
        if not code:
            continue

        try:
            name = _get_stock_name(code, db)
            kline_df = _get_kline(code, days=max(30, req.days))
            if kline_df is None or kline_df.empty:
                results.append({
                    "code": code,
                    "name": name,
                    "success": False,
                    "error_message": "K线数据为空",
                    "sentiment_score": 50,
                    "trend_prediction": "震荡",
                    "operation_advice": "观望",
                    "confidence_level": "中",
                    "analysis_summary": "",
                    "risk_factors": [],
                    "key_signals": [],
                    "target_price_high": None,
                    "target_price_low": None,
                    "stop_loss_price": None,
                    "model_used": "",
                    "tokens_used": 0,
                    "elapsed_seconds": 0,
                })
                continue

            strategy_hits = _get_today_strategy_hits(code, db)
            result = engine.analyze(
                code=code,
                name=name,
                kline_df=kline_df,
                strategy_hits=strategy_hits,
            )
            results.append(_result_to_response(result))

            if len(results) < len(req.codes):
                import time
                time.sleep(req.delay_seconds)

        except Exception as e:
            logger.error(f"批量分析 {code} 失败: {e}")
            results.append({
                "code": code,
                "name": code,
                "success": False,
                "error_message": str(e),
                "sentiment_score": 50,
                "trend_prediction": "震荡",
                "operation_advice": "观望",
                "confidence_level": "中",
                "analysis_summary": "",
                "risk_factors": [],
                "key_signals": [],
                "target_price_high": None,
                "target_price_low": None,
                "stop_loss_price": None,
                "model_used": "",
                "tokens_used": 0,
                "elapsed_seconds": 0,
            })

    return {
        "total": len(results),
        "results": results,
    }


@router.post("/analyze-with-scan")
def api_analyze_with_scan(
    code: str = Query(..., description="股票代码"),
    strategy_id: Optional[int] = Query(None, description="策略ID（None=使用全部命中结果）"),
    db: Session = Depends(get_db),
):
    """
    对单只股票运行策略扫描 + LLM 综合分析

    先对股票运行已有策略筛选，再将命中结果交给 LLM 做综合研判。
    """
    code = code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="股票代码不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 获取股票名称
    name = _get_stock_name(code, db)

    # 获取 K 线数据
    kline_df = _get_kline(code, days=90)
    if kline_df is None:
        raise HTTPException(status_code=404, detail=f"未找到 {code} 的K线数据")

    # 运行策略扫描（对这只股票）
    scan_results = _run_scan_for_stock(code, db, strategy_id)
    strategy_hits = [
        {
            "strategy_name": r["strategy_name"],
            "score": r["score"],
            "reason": r["reason"],
        }
        for r in scan_results
    ]

    # 调用 LLM 分析
    result = engine.analyze(
        code=code,
        name=name,
        kline_df=kline_df,
        strategy_hits=strategy_hits,
    )

    response = _result_to_response(result)
    response["scan_results"] = scan_results
    return response


# ---------- 内部辅助函数 ----------
def _get_kline(code: str, days: int = 90):
    """获取 K 线数据，自动计算起始日期"""
    start = (date.today() - timedelta(days=days + 10)).strftime("%Y%m%d")
    end = date.today().strftime("%Y%m%d")
    df = get_daily_data(code, start_date=start, end_date=end)
    if df is not None and hasattr(df, 'empty') and df.empty:
        return None
    return df


def _get_stock_name(code: str, db: Session) -> str:
    """从数据库获取股票名称"""
    stock = db.query(Stock).filter(Stock.code == code).first()
    return stock.name if stock else code


def _get_today_strategy_hits(code: str, db: Session) -> list[dict]:
    """获取股票今日策略命中结果"""
    from datetime import date
    from sqlalchemy import and_
    from models.strategy import StrategyResult

    today = date.today()
    rows = (
        db.query(StrategyResult)
        .filter(
            and_(
                StrategyResult.stock_code == code,
                StrategyResult.created_at >= today,
            )
        )
        .order_by(StrategyResult.score.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "strategy_name": row.strategy_name,
            "score": row.score,
            "reason": row.reason,
        }
        for row in rows
    ]


def _run_scan_for_stock(
    code: str, db: Session, strategy_id: Optional[int] = None
) -> list[dict]:
    """对单只股票运行策略扫描"""
    from models.strategy import Strategy, StrategyResult
    from datetime import datetime

    # 获取要使用的策略列表
    if strategy_id:
        strategies = [db.query(Strategy).filter(Strategy.id == strategy_id).first()]
    else:
        strategies = db.query(Strategy).filter(Strategy.enabled == 1).all()

    strategies = [s for s in strategies if s is not None]
    if not strategies:
        return []

    # 获取 K 线数据
    start = (date.today() - timedelta(days=130)).strftime("%Y%m%d")
    end = date.today().strftime("%Y%m%d")
    df = get_daily_data(code, start_date=start, end_date=end)
    if df is None or (hasattr(df, 'empty') and df.empty):
        return []

    # 运行策略
    from strategies.builtin import strategy_map

    results = []
    now = datetime.now()
    today = date.today()
    name = df.get("name", code) if hasattr(df, "get") else code

    for strategy in strategies:
        try:
            fn = strategy_map.get(strategy.name) if strategy.type == "builtin" else None
            if fn is None and strategy.config:
                # 自定义策略走引擎
                from strategies.engine import _evaluate_custom_strategy
                fn = lambda c, n, d: _evaluate_custom_strategy(strategy.config, d)
            if fn is None:
                continue

            eval_result = fn(code, name, df)
            if eval_result:
                db_result = StrategyResult(
                    strategy_id=strategy.id,
                    strategy_name=strategy.name,
                    stock_code=code,
                    stock_name=name,
                    score=eval_result.get("score", 0),
                    signals=eval_result.get("signals", {}),
                    reason=eval_result.get("reason", ""),
                    created_at=now,
                )
                db.add(db_result)
                results.append({
                    "strategy_name": strategy.name,
                    "score": eval_result.get("score", 0),
                    "reason": eval_result.get("reason", ""),
                    "signals": eval_result.get("signals", {}),
                })
        except Exception as e:
            logger.debug(f"{code} 策略 {strategy.name} 评估失败: {e}")

    if results:
        db.commit()

    return results
