"""
回测引擎：对指定策略进行历史回测，模拟交易并统计表现。
"""
import time
import logging
import json
import statistics
from datetime import datetime, date, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.backtest import BacktestRun, BacktestTrade
from strategies.market_utils import get_index_data, classify_market_regime, get_regime_at_date
from services.capital_flow import has_consecutive_outflow, precompute_outflow_flags

logger = logging.getLogger(__name__)

# ============ 回测参数常量 ============
BUFFER_DAYS = 250          # 预计算指标的缓冲天数

# 交易成本 (A股标准)
STAMP_TAX = 0.0005         # 卖出印花税 0.05%
COMMISSION = 0.00025       # 佣金 双向 0.025%
TRANSFER_FEE = 0.00001     # 过户费 双向 0.001%
MIN_COMMISSION = 5.0       # 最低佣金 5 元
MIN_SHARES = 100           # 最小交易 1 手 = 100 股
SLIPPAGE = 0.001           # 滑点 0.1% (买入偏高+0.1%, 卖出偏低-0.1%)
LIMIT_UP_THRESHOLD = 9.5   # 涨停阈值(%)

# 仓位/资金模拟
INITIAL_CAPITAL = 1_000_000    # 初始资金 100 万
MAX_POSITIONS = 5              # 最大同时持仓数

# 大盘环境仓位乘数
REGIME_POSITION_MULTIPLIER = {
    "strong_bull": 1.0,
    "weak_bull": 0.8,
    "sideways": 0.5,
    "weak_bear": 0.3,
    "strong_bear": 0.0,
}

# 无风险利率 (用于 Sharpe 计算)
RISK_FREE_RATE = 0.02
# ================================


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
    # 过滤回测开始时尚未上市的股票（减轻存活偏差）
    all_stocks = [
        s for s in all_stocks
        if not s.get("listed_date") or s["listed_date"] <= data_start
    ]
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

            # 预计算资金流出标记（一次性计算整段区间）
            outflow_flags = precompute_outflow_flags(df, threshold=3)

            # 记录当前股票正在持仓的退出日 (去重用)
            held_until = {}  # {entry_idx: exit_date}

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

                # ---- P0-2: T+1 入场 (A股规则) ----
                if i + 1 >= len(df):
                    continue  # 信号在最后一天，无法入场
                entry_idx = i + 1
                entry_row = df.iloc[entry_idx]
                entry_price_raw = float(entry_row["open"])  # 次日开盘价入场

                # ---- P2-11: 涨跌停检查 ----
                pct_chg_entry = entry_row.get("pct_chg", 0) or 0
                if pct_chg_entry >= LIMIT_UP_THRESHOLD:
                    continue  # 涨停无法买入
                if pct_chg_entry <= -LIMIT_UP_THRESHOLD:
                    continue  # 跌停状态下不宜买入

                signal_date_raw = df.index[entry_idx]
                if isinstance(signal_date_raw, pd.Timestamp):
                    signal_date = signal_date_raw.to_pydatetime().date()
                else:
                    signal_date = signal_date_raw

                if signal_date < start_date or signal_date > end_date:
                    continue

                # ---- P2-10: 同股持仓中不重复开仓 ----
                if entry_idx in held_until and signal_date < held_until[entry_idx]:
                    continue  # 该股还在之前的持仓中

                # ---- P2-11: 滑点模拟 (买入价偏高) ----
                entry_price = entry_price_raw * (1 + SLIPPAGE)

                # ---- P2-9: 大盘环境过滤 ----
                regime = get_regime_at_date(signal_date, regimes)
                pos_multiplier = REGIME_POSITION_MULTIPLIER.get(regime, 0.5)
                if pos_multiplier <= 0:
                    continue  # 强势熊市不交易

                trade = {
                    "stock_code": code,
                    "stock_name": name,
                    "signal_date": signal_date,
                    "entry_price": entry_price,
                    "entry_idx": entry_idx,
                    "score": result.get("score", 0),
                    "signals": result.get("signals", {}),
                    "regime": regime,
                    "pos_multiplier": pos_multiplier,
                }

                # 逐日跟踪退出 (传入预计算的 outflow_flags)
                exit_info = _simulate_exit(df, entry_idx, entry_price, exit_config, outflow_flags)
                trade.update(exit_info)

                # 记录持仓 (用于去重)
                held_until[entry_idx] = exit_info.get("exit_date", signal_date)

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
            gross_return=t.get("gross_return", 0),
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
    summary = _compute_summary(all_trades, exit_config, start_date, end_date, regimes, index_df)
    summary["total_signals"] = len(all_trades)
    return summary


def _simulate_exit(df: pd.DataFrame, entry_idx: int, entry_price: float, exit_config: list[dict],
                   outflow_flags: list[bool] | None = None) -> dict:
    """模拟退出规则链（加入交易成本、滑点、跌停限制）"""
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
            # ---- P2-11: 跌停检查 ----
            pct_chg = curr.get("pct_chg", 0) or 0
            if pct_chg <= -LIMIT_UP_THRESHOLD:
                # 跌停无法卖出，继续持有到下一日
                max_hold = min(max_hold + 1, len(df) - entry_idx)
                prev_return = curr_return
                continue
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

        # 5. 主力资金持续流出 (P3-13: O(1) 预计算查表)
        outflow = False
        if outflow_flags is not None and entry_idx + j < len(outflow_flags):
            outflow = outflow_flags[entry_idx + j]
        else:
            window_df = df.iloc[entry_idx:entry_idx + j + 1]
            outflow = has_consecutive_outflow(window_df, threshold=outflow_consecutive)
        if outflow:
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

    # ---- P0-3: 交易成本扣除 + P2-11: 卖出滑点 ----
    exit_price_net = exit_price * (1 - SLIPPAGE)  # 卖出滑点: 实际成交价偏低
    gross_return = (exit_price - entry_price) / entry_price * 100
    holding_return = _net_return_after_cost(entry_price, exit_price_net)

    if peak > entry_price:
        max_dd = max(max_dd, (peak - exit_price) / peak * 100)

    return {
        "exit_date": df.index[exit_idx].date() if hasattr(df.index[exit_idx], "date") else df.index[exit_idx],
        "exit_price": round(exit_price_net, 2),
        "holding_return": round(holding_return, 2),
        "gross_return": round(gross_return, 2),
        "max_drawdown": round(max_dd, 2),
        "peak_return": round((peak - entry_price) / entry_price * 100, 2),
        "hold_days": exit_idx - entry_idx,
        "exit_reason": exit_reason,
        "daily_log": daily_log,
    }


def _net_return_after_cost(entry_price: float, exit_price: float) -> float:
    """扣除A股交易成本后的净收益率 %（基于 100 股最小单位）"""
    notional = entry_price * MIN_SHARES
    # 买入成本
    buy_commission = max(notional * COMMISSION, MIN_COMMISSION)
    buy_transfer = notional * TRANSFER_FEE
    # 卖出成本
    sell_notional = exit_price * MIN_SHARES
    sell_commission = max(sell_notional * COMMISSION, MIN_COMMISSION)
    sell_stamp = sell_notional * STAMP_TAX
    sell_transfer = sell_notional * TRANSFER_FEE

    total_cost = buy_commission + buy_transfer + sell_commission + sell_stamp + sell_transfer
    net_profit = (exit_price - entry_price) * MIN_SHARES - total_cost
    return net_profit / notional * 100


def _compute_summary(trades: list[dict], exit_config: list[dict], start_date, end_date,
                     regimes: dict, index_df: pd.DataFrame | None = None) -> dict:
    """计算汇总统计：资金模拟 + 风险指标 + 基准对比"""
    if not trades:
        return {
            "win_count": 0, "loss_count": 0, "win_rate": 0,
            "avg_return": 0, "median_return": 0, "max_return": 0, "min_return": 0,
            "total_return_pct": 0, "max_drawdown": 0, "avg_hold_days": 0,
            "profit_loss_ratio": 0, "exit_reason_dist": {}, "regime_breakdown": {},
            "hold_days_dist": {}, "daily_equity": [],
            "annualized_return": 0, "annualized_volatility": 0,
            "sharpe_ratio": 0, "calmar_ratio": 0,
            "benchmark_return": 0, "alpha": 0,
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

    # ======== P0-1/P1-5: 资金模拟 —— 等权复利、浮动盈亏权益曲线 ========
    trades_sorted = sorted(trades, key=lambda t: t["signal_date"])
    cash = INITIAL_CAPITAL
    positions = []  # [{code, cost, shares, entry_price, exit_date, exit_price}, ...]
    equity_history = []
    trade_idx = 0
    cursor = start_date

    # 从 daily_log 预建价格查询表 {(code, date_str): close}
    price_lookup = {}
    for t in trades:
        code = t["stock_code"]
        for dl in t.get("daily_log", []):
            dl_date = dl.get("date", "")
            if dl_date:
                # daily_log 中 date 形如 "2024-01-15" 或 "2024-01-15 00:00:00"
                dl_date_clean = dl_date[:10] if len(dl_date) >= 10 else dl_date
                price_lookup[(code, dl_date_clean)] = dl["close"]

    while cursor <= end_date:
        cursor_date = cursor
        cursor_str = cursor_date.strftime("%Y-%m-%d")

        # 1. 处理当日退出：回笼现金 (净收益)
        for pos in list(positions):
            pos_exit = pos.get("exit_date")
            if isinstance(pos_exit, date) and pos_exit == cursor_date:
                exit_val = pos["shares"] * pos["exit_price"]
                cash += exit_val
                positions.remove(pos)
                continue
            # 兼容日期可能是字符串
            if isinstance(pos_exit, str) and pos_exit <= cursor_str:
                exit_val = pos["shares"] * pos["exit_price"]
                cash += exit_val
                positions.remove(pos)

        # 2. 处理当日入场：等权开新仓
        while trade_idx < len(trades_sorted):
            t_sd = trades_sorted[trade_idx].get("signal_date")
            t_sd_str = t_sd.strftime("%Y-%m-%d") if isinstance(t_sd, date) else str(t_sd)
            if t_sd_str != cursor_str:
                break
            if len(positions) < MAX_POSITIONS and cash > 5000:
                t = trades_sorted[trade_idx]
                multiplier = t.get("pos_multiplier", 1.0)
                allocate = cash * (1.0 / MAX_POSITIONS) * multiplier
                if allocate < t["entry_price"] * MIN_SHARES:
                    trade_idx += 1
                    continue
                shares = allocate / t["entry_price"]
                shares = int(shares / MIN_SHARES) * MIN_SHARES
                if shares < MIN_SHARES:
                    trade_idx += 1
                    continue
                actual_cost = shares * t["entry_price"]
                if actual_cost > cash:
                    trade_idx += 1
                    continue
                cash -= actual_cost
                positions.append({
                    "code": t["stock_code"],
                    "cost": actual_cost,
                    "shares": shares,
                    "entry_price": t["entry_price"],
                    "exit_date": t.get("exit_date"),
                    "exit_price": t.get("exit_price", 0),
                })
            trade_idx += 1

        # 3. 估算持仓浮动市值
        invested_value = 0.0
        for pos in positions:
            lookup_key = (pos["code"], cursor_str)
            if lookup_key in price_lookup:
                invested_value += pos["shares"] * price_lookup[lookup_key]
            else:
                invested_value += pos["cost"]

        total_equity = cash + invested_value
        equity_history.append({
            "date": cursor_str,
            "equity": round((total_equity / INITIAL_CAPITAL) * 100, 2),
        })

        cursor += timedelta(days=1)

    # 最终权益
    final_equity = equity_history[-1]["equity"] if equity_history else 0
    total_return_pct = final_equity

    # 从权益曲线计算最大回撤
    max_dd = 0.0
    peak_equity = -1e9
    for entry in equity_history:
        eq = entry["equity"]
        if eq > peak_equity:
            peak_equity = eq
        if peak_equity > 0:
            dd = (peak_equity - eq) / peak_equity * 100
            if dd > max_dd:
                max_dd = dd
    # ======== 资金模拟结束 ========

    # ======== P1-6: 风险调整指标 ========
    daily_returns_pct = []
    for i in range(1, len(equity_history)):
        prev_eq = equity_history[i - 1]["equity"]
        curr_eq = equity_history[i]["equity"]
        daily_returns_pct.append(curr_eq - prev_eq)  # 日收益率百分点变化

    days_count = len(daily_returns_pct)
    years = max(days_count / 252, 0.01)

    if len(equity_history) >= 2:
        start_eq = equity_history[0]["equity"]
        end_eq = equity_history[-1]["equity"]
        start_net = 1 + start_eq / 100
        end_net = 1 + end_eq / 100
        annualized_return = ((end_net / start_net) ** (1 / years) - 1) * 100
    else:
        annualized_return = 0

    daily_std = statistics.stdev(daily_returns_pct) if len(daily_returns_pct) >= 2 else 0
    annualized_volatility = daily_std * (252 ** 0.5)  # 百分点

    sharpe = ((annualized_return / 100 - RISK_FREE_RATE) / (annualized_volatility / 100 + 1e-9))
    calmar = ((annualized_return / 100) / (max_dd / 100 + 1e-9))
    # ======== 风险指标结束 ========

    # ======== P1-7: 基准对比 —— 上证指数买入持有收益 ========
    benchmark_return = 0.0
    benchmark_annualized = 0.0
    alpha = 0.0
    if index_df is not None and not index_df.empty:
        try:
            idx_in_range = index_df.loc[
                (index_df.index >= pd.Timestamp(start_date)) &
                (index_df.index <= pd.Timestamp(end_date))
            ]
            if len(idx_in_range) >= 2:
                bench_start = float(idx_in_range.iloc[0]["close"])
                bench_end = float(idx_in_range.iloc[-1]["close"])
                benchmark_return = (bench_end - bench_start) / bench_start * 100
                bench_years = max((end_date - start_date).days / 365, 0.01)
                benchmark_annualized = ((1 + benchmark_return / 100) ** (1 / bench_years) - 1) * 100
                alpha = annualized_return - benchmark_annualized
        except Exception:
            pass
    # ======== 基准对比结束 ========

    returns_sorted = sorted(returns)
    mid = len(returns_sorted) // 2

    # 基准对比结束后，仅保留模型中有对应列的字段
    # benchmark_annualized 可从前端计算，不存DB
    return {
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate": round(win_count / len(trades) * 100, 1) if trades else 0,
        "avg_return": round(sum(returns) / len(returns), 2),
        "median_return": round(returns_sorted[mid], 2) if returns_sorted else 0,
        "max_return": round(max(returns), 2),
        "min_return": round(min(returns), 2),
        "total_return_pct": round(total_return_pct, 2),
        "max_drawdown": round(max_dd, 1),
        "avg_hold_days": round(sum(t["hold_days"] for t in trades) / len(trades), 1),
        "profit_loss_ratio": round(avg_win / avg_loss, 2) if avg_loss > 0 else 0,
        "exit_reason_dist": exit_dist,
        "regime_breakdown": regime_breakdown,
        "hold_days_dist": hold_dist,
        "daily_equity": equity_history,
        "annualized_return": round(annualized_return, 2),
        "annualized_volatility": round(annualized_volatility, 2),
        "sharpe_ratio": round(sharpe, 2),
        "calmar_ratio": round(calmar, 2),
        "benchmark_return": round(benchmark_return, 2),
        "alpha": round(alpha, 2),
    }
