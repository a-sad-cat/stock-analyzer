import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.backtest import BacktestRun, BacktestTrade
from models.strategy import Strategy
from strategies.engine import _init_builtin_strategies, _builtin_strategies, CustomStrategyExecutor

logger = logging.getLogger(__name__)

router = APIRouter()


class ExitRule(BaseModel):
    type: str  # stop_loss / ma_break / trailing_stop / max_hold
    pct: Optional[float] = None
    ma: Optional[int] = None
    activate: Optional[float] = None
    pullback: Optional[float] = None
    days: Optional[int] = None


class RunBacktestRequest(BaseModel):
    strategy_id: int
    start_date: str
    end_date: str
    stock_limit: int = 200
    min_score: float = 80
    exit_rules: list[ExitRule] = []


@router.post("/run")
def api_run_backtest(req: RunBacktestRequest, db: Session = Depends(get_db)):
    """启动回测"""
    strategy = db.query(Strategy).filter(Strategy.id == req.strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="策略不存在")

    try:
        s_date = datetime.strptime(req.start_date, "%Y-%m-%d").date()
        e_date = datetime.strptime(req.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，应为 YYYY-MM-DD")

    if s_date >= e_date:
        raise HTTPException(status_code=400, detail="开始日期必须早于结束日期")

    if e_date > date.today():
        raise HTTPException(status_code=400, detail="结束日期不能晚于今天")

    # 获取策略对象
    from services.backtest_service import run_backtest

    _init_builtin_strategies(db)

    if strategy.type == "builtin":
        if strategy.id in _builtin_strategies:
            strategy_obj = _builtin_strategies[strategy.id]
        else:
            # 用名称重新匹配（防止 cache 不同步）
            from strategies.engine import get_builtin_strategies
            for bs in get_builtin_strategies():
                if bs.name == strategy.name:
                    strategy_obj = bs
                    break
            else:
                raise HTTPException(status_code=400, detail=f"内置策略 {strategy.name} 未找到")
    elif strategy.type == "custom":
        strategy_obj = CustomStrategyExecutor(strategy.name, strategy.description, strategy.config or {})
    else:
        raise HTTPException(status_code=400, detail="不支持的策略类型")

    exit_config = [r.model_dump(exclude_none=True) for r in req.exit_rules]
    if not exit_config:
        exit_config = [
            {"type": "stop_loss", "pct": -7},
            {"type": "trailing_stop", "activate": 8, "pullback": 3},
            {"type": "ma_break", "ma": 10},
            {"type": "breakeven_exit", "min_hold": 5},
            {"type": "max_hold", "days": 20},
        ]

    # 异步执行（当前版本同步执行，前端轮询）
    run = run_backtest(
        db, req.strategy_id, strategy.name, strategy_obj,
        s_date, e_date, req.stock_limit, req.min_score, exit_config,
    )

    return {
        "run_id": run.id,
        "status": run.status,
        "message": "回测完成" if run.status == "done" else "回测失败",
        "error": run.error_msg if run.status == "error" else None,
    }


@router.get("/runs")
def api_backtest_runs(strategy_id: Optional[int] = None, db: Session = Depends(get_db)):
    """回测历史列表"""
    query = db.query(BacktestRun).order_by(BacktestRun.created_at.desc())
    if strategy_id:
        query = query.filter(BacktestRun.strategy_id == strategy_id)
    runs = query.limit(20).all()

    return {
        "runs": [
            {
                "id": r.id,
                "strategy_id": r.strategy_id,
                "strategy_name": r.strategy_name,
                "start_date": r.start_date.isoformat() if r.start_date else None,
                "end_date": r.end_date.isoformat() if r.end_date else None,
                "stock_limit": r.stock_limit,
                "min_score": r.min_score,
                "total_signals": r.total_signals,
                "win_rate": r.win_rate,
                "avg_return": r.avg_return,
                "max_drawdown": r.max_drawdown,
                "avg_hold_days": r.avg_hold_days,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ]
    }


@router.get("/runs/{run_id}")
def api_backtest_run_detail(run_id: int, db: Session = Depends(get_db)):
    """回测结果摘要"""
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="回测记录不存在")

    return {
        "id": run.id,
        "strategy_id": run.strategy_id,
        "strategy_name": run.strategy_name,
        "start_date": run.start_date.isoformat() if run.start_date else None,
        "end_date": run.end_date.isoformat() if run.end_date else None,
        "stock_limit": run.stock_limit,
        "min_score": run.min_score,
        "exit_config": run.exit_config,
        "total_signals": run.total_signals,
        "win_count": run.win_count,
        "loss_count": run.loss_count,
        "win_rate": run.win_rate,
        "avg_return": run.avg_return,
        "median_return": run.median_return,
        "max_return": run.max_return,
        "min_return": run.min_return,
        "total_return_pct": run.total_return_pct,
        "max_drawdown": run.max_drawdown,
        "avg_hold_days": run.avg_hold_days,
        "profit_loss_ratio": run.profit_loss_ratio,
        "exit_reason_dist": run.exit_reason_dist,
        "regime_breakdown": run.regime_breakdown,
        "hold_days_dist": run.hold_days_dist,
        "daily_equity": run.daily_equity,
        "status": run.status,
        "error_msg": run.error_msg,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


@router.get("/runs/{run_id}/trades")
def api_backtest_trades(
    run_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """回测交易明细"""
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="回测记录不存在")

    query = db.query(BacktestTrade).filter(BacktestTrade.run_id == run_id).order_by(BacktestTrade.holding_return.desc())
    total = query.count()
    trades = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "trades": [
            {
                "id": t.id,
                "stock_code": t.stock_code,
                "stock_name": t.stock_name,
                "signal_date": t.signal_date.isoformat() if t.signal_date else None,
                "entry_price": t.entry_price,
                "score": t.score,
                "regime": t.regime,
                "exit_date": t.exit_date.isoformat() if t.exit_date else None,
                "exit_price": t.exit_price,
                "holding_return": t.holding_return,
                "max_drawdown": t.max_drawdown,
                "peak_return": t.peak_return,
                "hold_days": t.hold_days,
                "exit_reason": t.exit_reason,
                "daily_log": t.daily_log,
            }
            for t in trades
        ],
    }


@router.get("/strategy/{strategy_id}/summary")
def api_backtest_strategy_summary(strategy_id: int, db: Session = Depends(get_db)):
    """获取策略最新回测摘要"""
    run = db.query(BacktestRun).filter(
        BacktestRun.strategy_id == strategy_id,
        BacktestRun.status == "done",
    ).order_by(BacktestRun.created_at.desc()).first()

    if not run:
        return {"has_backtest": False}

    return {
        "has_backtest": True,
        "run_id": run.id,
        "total_signals": run.total_signals,
        "win_rate": run.win_rate,
        "avg_return": run.avg_return,
        "max_drawdown": run.max_drawdown,
        "avg_hold_days": run.avg_hold_days,
        "profit_loss_ratio": run.profit_loss_ratio,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
