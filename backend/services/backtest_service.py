"""
回测引擎：对指定策略进行历史回测，模拟交易并统计表现。
"""
import time
import logging
import json
from datetime import datetime, date, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.backtest import BacktestRun, BacktestTrade
from strategies.market_utils import get_index_data, classify_market_regime, get_regime_at_date
from services.capital_flow import has_consecutive_outflow

logger = logging.getLogger(__name__)

BUFFER_DAYS = 250  # 预计算指标的缓冲天数


def run_backtest(
    db: Session,
    strategy_id: int,
    strategy_name: str,
    strategy_obj,
    start_date: date,
    end_date: date,
    stock_limit: int = 200,
    min_score: float = 60,
    exit_config: list[dict] | None = None,
) -> BacktestRun:
    """运行回测，返回 BacktestRun 记录"""
    if exit_config is None:
        exit_config = [
            {"type": "stop_loss", "pct": -7},
            {"type": "trailing_stop", "activate": 8, "pullback": 3},
            {"type": "ma_break", "ma": 10},
            {"type": "breakeven_exit", "min_hold": 5},
            {"type": "max_hold", "days": 20},
        ]

    run = BacktestRun(
        strategy_id=strategy_id,
        strategy_name=strategy_name,
        start_date=start_date,
        end_date=end_date,
        stock_limit=stock_limit,
        min_score=min_score,
        exit_config=exit_config,
        status="running",
    )
    db.add(run)
    db.commit()
    run_id = run.id

    try:
        result = _execute_backtest(db, run_id, strategy_id, strategy_obj, start_date, end_date, stock_limit, min_score, exit_config)
        for key, val in result.items():
            setattr(run, key, val)
        run.status = "done"
        db.commit()
    except Exception as e:
        run.status = "error"
        run.error_msg = str(e)
        db.commit()
        logger.exception(f"回测失败 [{run_id}]: {e}")

    return run


def _execute_backtest(db, run_id, strategy_id, strategy_obj, start_date, end_date, stock_limit, min_score, exit_config):
    """执行回测核心逻辑"""
    from services.data_service import get_all_stocks, get_daily_data
    from strategies.engine import _builtin_strategies, _init_builtin_strategies

    data_start = start_date - timedelta(days=BUFFER_DAYS)
    data_end = end_date

    # 获取全市场股票列表
    all_stocks = get_all_stocks()
    all_stocks = [s for s in all_stocks if not s.get("name", "").startswith(("ST", "*ST"))]
    # 过滤北交所/科创/创业板，仅保留沪市主板+深市主板
    all_stocks = [s for s in all_stocks if not s.get("code", "").lower().startswith(('4', '8', '92', 'bj', '688', '300'))]
    if stock_limit and len(all_stocks) > stock_limit:
        all_stocks = all_stocks[:stock_limit]
    total_stocks = len(all_stocks)

    # 获取市场指数用于环境分类
    index_df = get_index_data()
    regimes = classify_market_regime(index_df)

    all_trades = []
    stock_idx = 0
    start_ts = pd.Timestamp(start_date)
    end_ts = pd.Timestamp(end_date)

    def scan_one(stock):
        nonlocal stock_idx
        stock_idx += 1
        code = stock["code"]
        name = stock["name"]
        trades = []

        try:
            df = get_daily_data(
                code,
                start_date=data_start.strftime("%Y%m%d"),
                end_date=data_end.strftime("%Y%m%d"),
            )
            if df is None or df.empty or len(df) < 60:
                return trades

            # 确保索引为 DatetimeIndex
            if not isinstance(df.index, pd.DatetimeIndex):
                try:
                    df.index = pd.to_datetime(df.index)
                except Exception:
                    return trades

            total = len(df)
            start_idx = None
            for i in range(total):
                try:
                    if df.index[i] >= start_ts:
                        start_idx = i
                        break
                except Exception:
                    continue
            if start_idx is None:
                return trades

            # 逐日滑动评估
            for i in range(start_idx, total - 1):
                window = df.iloc[:i + 1]
                if len(window) < 30:
                    continue

                try:
                    result = strategy_obj.evaluate(code, name, window)
                except Exception:
                    continue

                if not result or result.get("score", 0) < min_score:
                    continue

                entry_row = df.iloc[i]
                entry_price = float(entry_row["close"])
                signal_date = df.index[i]

                if isinstance(signal_date, pd.Timestamp):
                    signal_date = signal_date.to_pydatetime().date()

                trade = {
                    "stock_code": code,
                    "stock_name": name,
                    "signal_date": signal_date,
                    "entry_price": entry_price,
                    "score": result.get("score", 0),
                    "signals": result.get("signals", {}),
                    "regime": get_regime_at_date(signal_date, regimes),
                }

                # 逐日跟踪退出
                exit_info = _simulate_exit(df, i, entry_price, exit_config)
                trade.update(exit_info)
                trades.append(trade)

        except Exception as e:
            logger.warning(f"回测扫描出错 [{code}]: {e}")

        if stock_idx % 50 == 0:
            logger.info(f"回测进度: {stock_idx}/{total_stocks}")

        return trades

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(scan_one, s): s for s in all_stocks}
        for f in as_completed(futures):
            try:
                all_trades.extend(f.result())
            except Exception:
                continue

    # 保存交易明细
    for t in all_trades:
        db_trade = BacktestTrade(
            run_id=run_id,
            strategy_id=strategy_id,
            stock_code=t["stock_code"],
            stock_name=t["stock_name"],
            signal_date=t["signal_date"],
            entry_price=t["entry_price"],
            score=t["score"],
            regime=t.get("regime", ""),
            exit_date=t.get("exit_date"),
            exit_price=t.get("exit_price", 0),
            holding_return=t.get("holding_return", 0),
            max_drawdown=t.get("max_drawdown", 0),
            peak_return=t.get("peak_return", 0),
            hold_days=t.get("hold_days", 0),
            exit_reason=t.get("exit_reason", ""),
            daily_log=t.get("daily_log", []),
            signals=t.get("signals", {}),
        )
        db.add(db_trade)

    db.commit()

    # 计算汇总统计
    summary = _compute_summary(all_trades, exit_config, start_date, end_date, regimes)
    summary["total_signals"] = len(all_trades)
    return summary


def _simulate_exit(df: pd.DataFrame, entry_idx: int, entry_price: float, exit_config: list[dict]) -> dict:
    """模拟退出规则链"""
    max_hold = 20
    stop_loss_pct = -7
    trailing_activate = 8
    trailing_pullback = 3
    ma_break = 10
    outflow_consecutive = 3

    breakeven_min_hold = 5

    for rule in exit_config:
        t = rule.get("type", "")
        if t == "stop_loss":
            stop_loss_pct = rule.get("pct", -7)
        elif t == "ma_break":
            ma_break = rule.get("ma", 10)
        elif t == "trailing_stop":
            trailing_activate = rule.get("activate", 8)
            trailing_pullback = rule.get("pullback", 3)
        elif t == "max_hold":
            max_hold = rule.get("days", 20)
        elif t == "breakeven_exit":
            breakeven_min_hold = rule.get("min_hold", 5)

    exit_idx = None
    exit_reason = "max_hold"
    exit_price = None
    daily_log = []
    peak = entry_price
    max_dd = 0
    trailing_high = entry_price
    trailing_armed = False
    prev_return = 0

    for j in range(1, min(max_hold + 1, len(df) - entry_idx)):
        curr = df.iloc[entry_idx + j]
        curr_close = float(curr["close"])
        curr_return = (curr_close - entry_price) / entry_price * 100
        curr_dd = (curr_close - peak) / peak * 100 if peak > entry_price else 0
        daily_log.append({
            "day": j,
            "date": str(df.index[entry_idx + j]),
            "close": round(curr_close, 2),
            "return": round(curr_return, 2),
            "dd": round(curr_dd, 2),
            "ma5": round(float(curr.get("MA5", 0)), 2) if not pd.isna(curr.get("MA5", 0)) else None,
            "ma10": round(float(curr.get("MA10", 0)), 2) if not pd.isna(curr.get("MA10", 0)) else None,
        })

        if curr_close > peak:
            peak = curr_close

        if curr_close > trailing_high:
            trailing_high = curr_close
            if not trailing_armed and curr_return >= trailing_activate:
                trailing_armed = True

        # 退出规则链（按优先级）
        # 1. 硬止损
        if curr_return <= stop_loss_pct:
            exit_idx = entry_idx + j
            exit_reason = "stop_loss"
            exit_price = curr_close
            break

        # 2. 移动止盈（在均线破位之前检查，避免截胡盈利持仓）
        if trailing_armed:
            pullback_pct = (trailing_high - curr_close) / trailing_high * 100
            if pullback_pct >= trailing_pullback:
                exit_idx = entry_idx + j
                exit_reason = "trailing_stop"
                exit_price = curr_close
                break

        # 3. 破均线（在移动止盈之后检查，避免截胡已激活止盈的持仓）
        ma_val = curr.get(f"MA{ma_break}")
        if ma_val is not None and not pd.isna(ma_val) and curr_close < float(ma_val):
            exit_idx = entry_idx + j
            exit_reason = f"ma{ma_break}_break"
            exit_price = curr_close
            break

        # 4. 回本止盈：持仓超过 N 天且曾经亏损，回本即出
        if j >= breakeven_min_hold and prev_return < 0 and curr_return >= 0:
            exit_idx = entry_idx + j
            exit_reason = "breakeven_exit"
            exit_price = curr_close
            break

        # 5. 主力资金持续流出
        window_df = df.iloc[entry_idx:entry_idx + j + 1]
        if has_consecutive_outflow(window_df, threshold=outflow_consecutive):
            exit_idx = entry_idx + j
            exit_reason = "capital_outflow"
            exit_price = curr_close
            break

        prev_return = curr_return

        # 更新最大回撤
        if peak > entry_price:
            dd = (peak - curr_close) / peak * 100
            if dd > max_dd:
                max_dd = dd

    # 如果循环结束还没退出，用最后一个价格
    if exit_idx is None:
        exit_idx = min(entry_idx + max_hold, len(df) - 1)
        exit_reason = "max_hold"

    if exit_price is None:
        exit_price = float(df.iloc[exit_idx]["close"])

    holding_return = (exit_price - entry_price) / entry_price * 100
    if peak > entry_price:
        max_dd = max(max_dd, (peak - exit_price) / peak * 100)

    return {
        "exit_date": df.index[exit_idx].date() if hasattr(df.index[exit_idx], "date") else df.index[exit_idx],
        "exit_price": round(exit_price, 2),
        "holding_return": round(holding_return, 2),
        "max_drawdown": round(max_dd, 2),
        "peak_return": round((peak - entry_price) / entry_price * 100, 2),
        "hold_days": exit_idx - entry_idx,
        "exit_reason": exit_reason,
        "daily_log": daily_log,
    }


def _compute_summary(trades: list[dict], exit_config: list[dict], start_date, end_date, regimes: dict) -> dict:
    """计算汇总统计"""
    if not trades:
        return {
            "win_count": 0, "loss_count": 0, "win_rate": 0,
            "avg_return": 0, "median_return": 0, "max_return": 0, "min_return": 0,
            "total_return_pct": 0, "max_drawdown": 0, "avg_hold_days": 0,
            "profit_loss_ratio": 0, "exit_reason_dist": {}, "regime_breakdown": {},
            "hold_days_dist": {}, "daily_equity": [],
        }

    returns = [t["holding_return"] for t in trades]
    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r <= 0]
    win_count = len(wins)
    loss_count = len(losses)

    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = abs(sum(losses) / len(losses)) if losses else 0

    # 退出原因分布
    exit_dist = {}
    for t in trades:
        r = t.get("exit_reason", "unknown")
        exit_dist[r] = exit_dist.get(r, 0) + 1

    # 市场环境分组
    regime_breakdown = {}
    for t in trades:
        r = t.get("regime", "unknown")
        if r not in regime_breakdown:
            regime_breakdown[r] = {"count": 0, "wins": 0, "returns": []}
        regime_breakdown[r]["count"] += 1
        regime_breakdown[r]["returns"].append(t["holding_return"])
        if t["holding_return"] > 0:
            regime_breakdown[r]["wins"] += 1

    for r, data in regime_breakdown.items():
        data["win_rate"] = round(data["wins"] / data["count"] * 100, 1) if data["count"] else 0
        data["avg_return"] = round(sum(data["returns"]) / len(data["returns"]), 2) if data["returns"] else 0

    # 持有天数分布
    hold_dist = {}
    for t in trades:
        d = t.get("hold_days", 0)
        bucket = d if d <= 20 else ">20"
        key = str(bucket)
        hold_dist[key] = hold_dist.get(key, 0) + 1

    # 每日累计收益曲线
    daily_equity = []
    cursor = start_date
    cumulative = 0
    trade_map = {}
    for t in trades:
        d = t.get("exit_date")
        if d:
            ds = str(d)
            trade_map[ds] = trade_map.get(ds, []) + [t["holding_return"]]

    while cursor <= end_date:
        ds = cursor.strftime("%Y-%m-%d")
        if ds in trade_map:
            for r in trade_map[ds]:
                cumulative += r
        daily_equity.append({"date": ds, "equity": round(cumulative, 2)})
        cursor += timedelta(days=1)

    # 最大回撤（从 equity 曲线算）
    max_dd = 0
    peak_equity = 0
    for entry in daily_equity:
        eq = entry["equity"]
        if eq > peak_equity:
            peak_equity = eq
        dd = (peak_equity - eq) / max(peak_equity, 1) * 100
        if dd > max_dd:
            max_dd = dd

    returns_sorted = sorted(returns)
    mid = len(returns_sorted) // 2

    return {
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate": round(win_count / len(trades) * 100, 1) if trades else 0,
        "avg_return": round(sum(returns) / len(returns), 2),
        "median_return": round(returns_sorted[mid], 2) if returns_sorted else 0,
        "max_return": round(max(returns), 2),
        "min_return": round(min(returns), 2),
        "total_return_pct": round(sum(returns), 2),
        "max_drawdown": round(max_dd, 1),
        "avg_hold_days": round(sum(t["hold_days"] for t in trades) / len(trades), 1),
        "profit_loss_ratio": round(avg_win / avg_loss, 2) if avg_loss > 0 else 0,
        "exit_reason_dist": exit_dist,
        "regime_breakdown": regime_breakdown,
        "hold_days_dist": hold_dist,
        "daily_equity": daily_equity,
    }
