"""
# ========================================
# 策略引擎
# 负责运行策略、管理策略实例、执行全市场扫描
# ========================================
"""

import logging
import json
from datetime import datetime, date
from typing import Optional

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from .base import BaseStrategy
from .builtin import get_builtin_strategies
from models.strategy import Strategy, StrategyResult
from services.data_service import get_all_stocks, get_daily_data
from database import SessionLocal

logger = logging.getLogger(__name__)

# 全局内置策略缓存
_builtin_strategies: dict[int, BaseStrategy] = {}
_builtin_id_map: dict[str, int] = {}  # name -> db id


def _init_builtin_strategies(db: Session):
    """注册内置策略到缓存
    - 如果数据库中没有任内置策略，首次运行时自动全部添加
    - 已有部分内置策略时，只注册已有的，不自动恢复已删除的
    """
    global _builtin_strategies, _builtin_id_map

    builtin_list = get_builtin_strategies()
    _builtin_strategies = {}

    # 查当前数据库中已存在的内置策略
    existing_builtins = db.query(Strategy).filter(
        Strategy.type == "builtin"
    ).all()
    existing_by_name = {s.name: s for s in existing_builtins}

    # 首次运行：数据库没有内置策略 → 全部自动添加
    is_first_run = len(existing_builtins) == 0

    for idx, strategy in enumerate(builtin_list):
        if strategy.name in existing_by_name:
            # 已存在 → 注册到缓存
            record = existing_by_name[strategy.name]
            _builtin_strategies[record.id] = strategy
            _builtin_id_map[strategy.name] = record.id
        elif is_first_run:
            # 首次运行 → 自动添加
            max_order = db.query(func.max(Strategy.sort_order)).scalar() or 0
            record = Strategy(
                name=strategy.name,
                description=strategy.description,
                type="builtin",
                config={},
                enabled=1,
                sort_order=max_order + idx + 1,
            )
            db.add(record)
            db.flush()
            _builtin_strategies[record.id] = strategy
            _builtin_id_map[strategy.name] = record.id
        # else: 非首次运行且已删除 → 跳过，不自动恢复

    if is_first_run:
        db.commit()


def get_all_strategies(db: Session) -> list[dict]:
    """获取所有策略，按 sort_order 排序"""
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    # 回填旧数据的 sort_order（原来是 0）
    _backfill_sort_order(db)

    all_strategies = db.query(Strategy).order_by(Strategy.sort_order, Strategy.id).all()
    builtin_list = get_builtin_strategies()
    builtin_by_name = {bs.name: bs for bs in builtin_list}

    result = []
    for s in all_strategies:
        item = {
            "id": s.id,
            "name": s.name,
            "description": s.description or "",
            "type": s.type,
            "config": s.config or {},
            "enabled": bool(s.enabled),
            "last_run": s.last_run.isoformat() if s.last_run else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "sort_order": s.sort_order or 0,
        }
        if s.name in builtin_by_name:
            bs = builtin_by_name[s.name]
            item["tags"] = getattr(bs, 'tags', [])
        result.append(item)

    return result


def _backfill_sort_order(db: Session):
    """一次性回填旧数据的 sort_order（sort_order=0 时设为 id）"""
    try:
        zero_count = db.query(Strategy).filter(Strategy.sort_order == 0).count()
        if zero_count > 0:
            for s in db.query(Strategy).filter(Strategy.sort_order == 0).all():
                s.sort_order = s.id
            db.commit()
            logger.info(f"回填 {zero_count} 条策略的 sort_order")
    except Exception as e:
        logger.warning(f"回填 sort_order 失败: {e}")


def get_strategy(db: Session, strategy_id: int) -> Optional[dict]:
    """获取单个策略详情"""
    strategies = get_all_strategies(db)
    for s in strategies:
        if s["id"] == strategy_id:
            return s
    return None


def create_custom_strategy(db: Session, name: str, description: str, config: dict) -> int:
    """创建自定义策略"""
    max_order = db.query(func.max(Strategy.sort_order)).scalar() or 0
    strategy = Strategy(
        name=name,
        description=description,
        type="custom",
        config=config,
        enabled=1,
        sort_order=max_order + 1,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy.id


def move_strategy(db: Session, strategy_id: int, direction: str) -> bool:
    """调整策略排序：up / down"""
    all_strategies = get_all_strategies(db)
    idx = next((i for i, s in enumerate(all_strategies) if s["id"] == strategy_id), None)
    if idx is None:
        return False
    if direction == "up" and idx == 0:
        return False
    if direction == "down" and idx == len(all_strategies) - 1:
        return False

    target = idx - 1 if direction == "up" else idx + 1
    current_s = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    target_s = db.query(Strategy).filter(Strategy.id == all_strategies[target]["id"]).first()
    if not current_s or not target_s:
        return False

    current_s.sort_order, target_s.sort_order = target_s.sort_order, current_s.sort_order
    db.commit()
    return True


def reorder_strategies(db: Session, source_id: int, target_id: int) -> bool:
    """交换两个策略的排序位置（拖拽排序用）"""
    s1 = db.query(Strategy).filter(Strategy.id == source_id).first()
    s2 = db.query(Strategy).filter(Strategy.id == target_id).first()
    if not s1 or not s2:
        return False
    s1.sort_order, s2.sort_order = s2.sort_order, s1.sort_order
    db.commit()
    return True


def delete_strategy(db: Session, strategy_id: int) -> bool:
    """删除策略（内置和自定义均可删除）"""
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        return False

    # 清除该策略的扫描结果
    db.query(StrategyResult).filter(
        StrategyResult.strategy_id == strategy_id
    ).delete()

    strategy.enabled = 0
    db.delete(strategy)
    db.commit()

    # 从缓存中移除
    _builtin_strategies.pop(strategy_id, None)
    for name, sid in list(_builtin_id_map.items()):
        if sid == strategy_id:
            del _builtin_id_map[name]
            break

    return True


def add_builtin_strategy(db: Session, strategy_name: str) -> dict | None:
    """重新添加一个已被删除的内置策略"""
    builtin_list = get_builtin_strategies()
    for bs in builtin_list:
        if bs.name == strategy_name:
            # 如果已经存在同名策略，直接启用
            existing = db.query(Strategy).filter(
                Strategy.name == strategy_name,
            ).first()
            if existing:
                existing.enabled = 1
                db.commit()
                return {
                    "id": existing.id,
                    "name": existing.name,
                    "message": f"策略「{strategy_name}」已重新启用",
                }

            # 创建新记录
            max_order = db.query(func.max(Strategy.sort_order)).scalar() or 0
            new_strategy = Strategy(
                name=bs.name,
                description=bs.description,
                type="builtin",
                config={},
                enabled=1,
                sort_order=max_order + 1,
            )
            db.add(new_strategy)
            db.commit()
            db.refresh(new_strategy)

            # 更新缓存
            _builtin_strategies[new_strategy.id] = bs
            _builtin_id_map[bs.name] = new_strategy.id

            return {
                "id": new_strategy.id,
                "name": new_strategy.name,
                "message": f"策略「{strategy_name}」已重新添加",
            }
    return None


def get_available_builtin_strategies(db: Session) -> list[dict]:
    """获取当前未激活的内置策略列表（可用于添加）"""
    builtin_list = get_builtin_strategies()
    existing_names = set()
    for s in db.query(Strategy).all():
        existing_names.add(s.name)

    available = []
    for bs in builtin_list:
        if bs.name not in existing_names:
            available.append({
                "name": bs.name,
                "description": bs.description,
                "tags": getattr(bs, 'tags', []),
            })
    return available


def get_all_builtin_strategies_with_status(db: Session) -> list[dict]:
    """返回所有内置策略及其当前状态（用于批量管理弹窗）"""
    builtin_list = get_builtin_strategies()
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    existing = {s.name: s for s in db.query(Strategy).filter(Strategy.type == "builtin").all()}

    result = []
    for bs in builtin_list:
        db_strategy = existing.get(bs.name)
        if db_strategy:
            result.append({
                "name": bs.name,
                "description": bs.description,
                "tags": getattr(bs, 'tags', []),
                "status": "enabled" if db_strategy.enabled else "disabled",
                "id": db_strategy.id,
            })
        else:
            result.append({
                "name": bs.name,
                "description": bs.description,
                "tags": getattr(bs, 'tags', []),
                "status": "not_added",
                "id": None,
            })
    return result


def batch_manage_builtin_strategies(db: Session, names: list[str], action: str) -> dict:
    """批量管理内置策略
    action: 'add' / 'delete' / 'enable' / 'disable'
    """
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    results = []
    for name in names:
        try:
            if action == "add":
                r = add_builtin_strategy(db, name)
                results.append({"name": name, "success": True, "message": r.get("message", "已添加") if r else "添加失败"})
            elif action == "delete":
                bs_list = get_builtin_strategies()
                bs = next((b for b in bs_list if b.name == name), None)
                if bs and bs.name in _builtin_id_map:
                    sid = _builtin_id_map[bs.name]
                    r = delete_strategy(db, sid)
                    results.append({"name": name, "success": r, "message": "已移除" if r else "移除失败"})
                else:
                    results.append({"name": name, "success": False, "message": "未找到该策略"})
            elif action == "enable":
                bs_list = get_builtin_strategies()
                bs = next((b for b in bs_list if b.name == name), None)
                if bs and bs.name in _builtin_id_map:
                    sid = _builtin_id_map[bs.name]
                    r = toggle_strategy_enabled(db, sid)
                    results.append({"name": name, "success": True, "message": "已启用"})
                else:
                    results.append({"name": name, "success": False, "message": "未找到该策略"})
            elif action == "disable":
                bs_list = get_builtin_strategies()
                bs = next((b for b in bs_list if b.name == name), None)
                if bs and bs.name in _builtin_id_map:
                    sid = _builtin_id_map[bs.name]
                    existing = db.query(Strategy).filter(Strategy.id == sid).first()
                    if existing and existing.enabled:
                        r = toggle_strategy_enabled(db, sid)
                    results.append({"name": name, "success": True, "message": "已禁用"})
                else:
                    results.append({"name": name, "success": False, "message": "未找到该策略"})
        except Exception as e:
            results.append({"name": name, "success": False, "message": str(e)})

    return {"results": results, "total": len(results), "success": all(r["success"] for r in results)}


def toggle_strategy_enabled(db: Session, strategy_id: int) -> dict | None:
    """启用/禁用策略（内置和自定义均可切换）"""
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        return None

    strategy.enabled = 0 if strategy.enabled else 1
    db.commit()

    return {
        "id": strategy.id,
        "name": strategy.name,
        "type": strategy.type,
        "enabled": bool(strategy.enabled),
    }


def run_strategy(db: Session, strategy_id: int, stock_limit: int = 0, top_k: int = 50) -> list[dict]:
    """运行单个策略进行全市场扫描，返回评分最高的 top_k 条"""
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        return []

    all_stocks = get_all_stocks(db)
    if not all_stocks:
        return []

    before_filter = len(all_stocks)
    all_stocks = [
        s for s in all_stocks
        if not s.get('name', '').startswith(('ST', '*ST'))
    ]
    if before_filter != len(all_stocks):
        logger.info(f"过滤掉 {before_filter - len(all_stocks)} 只 ST/*ST 股票")

    before_filter = len(all_stocks)
    all_stocks = [
        s for s in all_stocks
        if not s.get('code', '').startswith(('4', '8', '92'))
    ]
    filtered = before_filter - len(all_stocks)
    if filtered:
        logger.info(f"过滤掉 {filtered} 只北交所股票（仅扫描沪市+深市）")

    if strategy.type == "builtin" and strategy.id in _builtin_strategies:
        strategy_obj = _builtin_strategies[strategy.id]
    elif strategy.type == "custom":
        strategy_obj = CustomStrategyExecutor(strategy.name, strategy.description, strategy.config or {})
    else:
        return []

    if stock_limit and len(all_stocks) > stock_limit:
        all_stocks = all_stocks[:stock_limit]
    elif stock_limit == 0:
        pass

    db.query(StrategyResult).filter(
        StrategyResult.strategy_id == strategy_id,
        StrategyResult.created_at >= datetime.now().strftime("%Y-%m-%d")
    ).delete()
    db.commit()

    from concurrent.futures import ThreadPoolExecutor, as_completed
    from config import SCAN_WORKERS

    def scan_one(stock):
        code = stock['code']
        name = stock['name']
        try:
            df = get_daily_data(code)
            if df.empty or len(df) < 30:
                return None
            return strategy_obj.evaluate(code, name, df)
        except Exception as e:
            logger.warning(f"策略评估出错 [{code}]: {e}")
            return None

    total = len(all_stocks)
    logger.info(f"策略 [{strategy.name}] 并行扫描 {total} 只股票 (workers={SCAN_WORKERS})...")

    results = []
    with ThreadPoolExecutor(max_workers=SCAN_WORKERS) as pool:
        futures = {pool.submit(scan_one, s): s for s in all_stocks}
        done = 0
        for f in as_completed(futures):
            done += 1
            if done % 100 == 0:
                logger.info(f"策略 [{strategy.name}] 扫描进度: {done}/{total}")
            r = f.result()
            if r:
                db.add(StrategyResult(
                    strategy_id=strategy_id,
                    strategy_name=strategy.name,
                    stock_code=r['stock_code'],
                    stock_name=r['stock_name'],
                    score=r.get('score', 0),
                    signals=r.get('signals', {}),
                    reason=r.get('reason', ''),
                ))
                results.append(r)
                if len(results) % 50 == 0:
                    db.commit()

    db.commit()

    strategy.last_run = datetime.now()
    db.commit()

    results.sort(key=lambda x: x.get('score', 0), reverse=True)
    top = results[:top_k]
    logger.info(f"策略 [{strategy.name}] 扫描完成，{len(results)} 只匹配，返回 Top {len(top)}")
    return top


def run_all_strategies(db: Session, stock_limit: int = 0, top_k: int = 50) -> dict:
    """运行所有启用的策略"""
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    strategies = db.query(Strategy).filter(Strategy.enabled == 1).all()
    all_results = {}

    for strategy in strategies:
        try:
            results = run_strategy(db, strategy.id, stock_limit, top_k)
            all_results[strategy.id] = {
                "strategy_name": strategy.name,
                "count": len(results),
                "results": results,
            }
        except Exception as e:
            logger.error(f"运行策略 [{strategy.name}] 失败: {e}")
            all_results[strategy.id] = {
                "strategy_name": strategy.name,
                "count": 0,
                "results": [],
                "error": str(e),
            }

    return all_results


def run_strategy_for_hot_sectors(db: Session, strategy_id: int | None = None, heat_threshold: float = 60, per_sector_limit: int = 20) -> list[dict]:
    """对热度达标板块的成分股运行策略扫描
    strategy_id=None 时运行所有已启用策略
    """
    from services.sector_service import sustained_sectors, get_sector_stocks

    hot = sustained_sectors(min_score=heat_threshold)
    logger.info(f"板块热度扫描：{len(hot)} 个板块热度达标 (>{heat_threshold})")

    if not _builtin_strategies:
        _init_builtin_strategies(db)

    strategies_to_run = []
    if strategy_id:
        s = db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if s:
            strategies_to_run.append(s)
    else:
        strategies_to_run = db.query(Strategy).filter(Strategy.enabled == 1).all()

    if not strategies_to_run:
        return []

    all_results = []
    scanned_codes = set()

    for h in hot:
        codes = get_sector_stocks(h["name"], h.get("sector_type", "industry"))
        if not codes:
            continue
        codes = codes[:per_sector_limit]
        for code in codes:
            if code in scanned_codes:
                continue
            scanned_codes.add(code)
            df = get_daily_data(code)
            if df.empty or len(df) < 30:
                continue
            for strat in strategies_to_run:
                try:
                    if strat.type == "builtin" and strat.id in _builtin_strategies:
                        obj = _builtin_strategies[strat.id]
                    elif strat.type == "custom":
                        obj = CustomStrategyExecutor(strat.name, strat.description, strat.config or {})
                    else:
                        continue
                    result = obj.evaluate(code, obj.name if hasattr(obj, 'name') else strat.name, df)
                    if result:
                        result["sector_name"] = h["name"]
                        result["strategy_id"] = strat.id
                        db.add(StrategyResult(
                            strategy_id=strat.id,
                            strategy_name=strat.name,
                            stock_code=result["stock_code"],
                            stock_name=result["stock_name"],
                            score=result.get("score", 0),
                            signals=result.get("signals", {}),
                            reason=result.get("reason", ""),
                        ))
                        all_results.append(result)
                except Exception as e:
                    logger.warning(f"板块扫描出错 [{code}]: {e}")
                    continue
        db.commit()

    db.commit()
    logger.info(f"板块热度扫描完成：扫描 {len(scanned_codes)} 只股票，匹配 {len(all_results)} 条")
    return all_results


def get_results_by_date(db: Session, target_date: str = None, strategy_id: int = None) -> list[dict]:
    """获取某日的扫描结果"""
    if target_date is None:
        target_date = date.today().isoformat()

    query = db.query(StrategyResult).filter(
        StrategyResult.created_at >= f"{target_date} 00:00:00",
        StrategyResult.created_at <= f"{target_date} 23:59:59",
    )

    if strategy_id:
        query = query.filter(StrategyResult.strategy_id == strategy_id)

    results = query.order_by(StrategyResult.score.desc()).all()

    return [
        {
            "id": r.id,
            "strategy_id": r.strategy_id,
            "strategy_name": r.strategy_name,
            "stock_code": r.stock_code,
            "stock_name": r.stock_name,
            "score": r.score,
            "signals": r.signals,
            "reason": r.reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in results
    ]


class CustomStrategyExecutor(BaseStrategy):
    """自定义策略执行器（将用户配置的条件组合转为可执行的逻辑）"""

    def __init__(self, name: str, description: str, config: dict):
        super().__init__(name, description, strategy_type="custom")
        self.config = config
        self.conditions = config.get("conditions", [])
        self.logic = config.get("logic", "AND")  # AND / OR

    def evaluate(self, code: str, stock_name: str, df: pd.DataFrame) -> dict | None:
        if df is None or df.empty or not self.conditions:
            return None

        match_count = 0
        total = len(self.conditions)
        details = []
        signals = {}
        close = float(df.iloc[-1]['close']) if 'close' in df.columns else 0

        for cond in self.conditions:
            cond_type = cond.get("type", "")
            operator = cond.get("operator", ">")
            params = cond.get("params", {})
            value = cond.get("value", 0)

            matched, desc, sig_val = self._check_condition(df, cond_type, operator, params, value)
            if matched:
                match_count += 1
            details.append(desc)

            if sig_val is not None:
                signals[f"{cond_type}_{operator}"] = sig_val

        if self.logic == "AND" and match_count == total:
            score = 60 + (match_count / total) * 30
            reason = "自定义策略匹配成功:\n" + "\n".join(details)
            return {
                "stock_code": code, "stock_name": stock_name,
                "score": min(int(score), 95),
                "signals": signals,
                "reason": reason,
            }
        elif self.logic == "OR" and match_count > 0:
            score = 50 + (match_count / total) * 30
            reason = "自定义策略部分匹配:\n" + "\n".join(details)
            return {
                "stock_code": code, "stock_name": stock_name,
                "score": min(int(score), 90),
                "signals": signals,
                "reason": reason,
            }

        return None

    def _check_condition(self, df: pd.DataFrame, cond_type: str, operator: str,
                         params: dict, value: float) -> tuple:
        """检查单个条件是否匹配"""
        curr = df.iloc[-1]
        prev = df.iloc[-2] if len(df) >= 2 else None

        try:
            if cond_type == "price":
                return self._check_simple(df, 'close', operator, value, "收盘价")

            elif cond_type == "ma":
                period = params.get("period", 5)
                col = f"MA{period}"
                return self._check_simple(df, col, operator, value, f"MA{period}")

            elif cond_type == "volume":
                vol = float(curr['volume'])
                vol_ma5 = float(curr.get('VOL_MA5', 0))
                if operator == ">":
                    return (vol > vol_ma5 * value, f"成交量({int(vol)}) > 均量×{value}({int(vol_ma5 * value)})",
                            round(vol / vol_ma5, 2) if vol_ma5 > 0 else 0)
                elif operator == "<":
                    return (vol < vol_ma5 * value, f"成交量({int(vol)}) < 均量×{value}({int(vol_ma5 * value)})",
                            round(vol / vol_ma5, 2) if vol_ma5 > 0 else 0)

            elif cond_type == "macd":
                dif = float(curr.get('DIF', 0))
                dea = float(curr.get('DEA', 0))
                if operator == "golden_cross":
                    if prev:
                        dif_p = float(prev.get('DIF', 0))
                        dea_p = float(prev.get('DEA', 0))
                        return (dif_p < dea_p and dif >= dea, "MACD金叉(DIF上穿DEA)", round(dif, 4))
                return self._check_simple(df, 'DIF', operator, value, "DIF")

            elif cond_type == "rsi":
                rsi = float(curr.get('RSI', 0))
                if operator == "cross_above":
                    rsi_p = float(prev.get('RSI', 0)) if prev else 0
                    return (rsi_p < value < rsi, f"RSI上穿{value}({rsi_p:.1f}→{rsi:.1f})", round(rsi, 2))
                return self._check_simple(df, 'RSI', operator, value, "RSI")

            elif cond_type == "kdj":
                j = float(curr.get('J', 0))
                if operator == "cross_above":
                    j_p = float(prev.get('J', 0)) if prev else 0
                    return (j_p < value < j, f"J值上穿{value}({j_p:.1f}→{j:.1f})", round(j, 2))
                return self._check_simple(df, 'J', operator, value, "J值")

            elif cond_type == "pct_chg":
                return self._check_simple(df, 'pct_chg', operator, value, "涨幅%")

        except Exception:
            pass

        return (False, f"条件[{cond_type}]检查失败", None)

    def _check_simple(self, df: pd.DataFrame, col: str, operator: str,
                      value: float, label: str) -> tuple:
        """简单比较检查"""
        curr_val = float(df.iloc[-1].get(col, 0))
        if operator == ">":
            return (curr_val > value, f"{label}({curr_val:.2f}) > {value:.2f}", round(curr_val, 2))
        elif operator == "<":
            return (curr_val < value, f"{label}({curr_val:.2f}) < {value:.2f}", round(curr_val, 2))
        elif operator == ">=":
            return (curr_val >= value, f"{label}({curr_val:.2f}) >= {value:.2f}", round(curr_val, 2))
        elif operator == "<=":
            return (curr_val <= value, f"{label}({curr_val:.2f}) <= {value:.2f}", round(curr_val, 2))
        elif operator == "==":
            return (abs(curr_val - value) < 0.01, f"{label}({curr_val:.2f}) = {value:.2f}", round(curr_val, 2))
        elif operator == "cross_above" and len(df) >= 2:
            prev_val = float(df.iloc[-2].get(col, 0))
            return (prev_val < value < curr_val, f"{label}上穿{value}({prev_val:.2f}→{curr_val:.2f})", round(curr_val, 2))
        return (False, f"{label}未匹配", None)
