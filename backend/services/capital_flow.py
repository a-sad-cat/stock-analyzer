import logging
import pandas as pd

logger = logging.getLogger(__name__)


def estimate_capital_flow(df: pd.DataFrame, lookback: int = 3) -> dict:
    """
    用量价关系估算主力资金流向
    返回: {"flow": "inflow"/"outflow"/"neutral", "strength": float, "consecutive": int}
    """
    if df is None or len(df) < lookback + 5:
        return {"flow": "neutral", "strength": 0, "consecutive": 0}

    recent = df.tail(lookback + 1).copy()
    # 计算每日资金流向估计
    # 放量上涨 → 主力流入，放量下跌 → 主力流出
    # 缩量上涨 → 流入减弱，缩量下跌 → 流出减弱

    flows = []
    for i in range(1, len(recent)):
        prev = recent.iloc[i - 1]
        curr = recent.iloc[i]
        pct = curr.get("pct_chg", 0) or 0
        vol = curr.get("volume", 0) or 0
        prev_vol = prev.get("volume", 1) or 1
        vol_ratio = vol / prev_vol if prev_vol > 0 else 1

        if pct > 2 and vol_ratio > 1.5:
            flows.append(("inflow", 2))
        elif pct > 0.5 and vol_ratio > 1.2:
            flows.append(("inflow", 1))
        elif pct < -2 and vol_ratio > 1.5:
            flows.append(("outflow", -2))
        elif pct < -0.5 and vol_ratio > 1.2:
            flows.append(("outflow", -1))
        elif pct > 0 and vol_ratio < 0.8:
            flows.append(("weak_inflow", 0.5))
        elif pct < 0 and vol_ratio < 0.8:
            flows.append(("weak_outflow", -0.5))
        else:
            flows.append(("neutral", 0))

    # 计算连续流出天数
    consecutive = 0
    for f, _ in reversed(flows):
        if "outflow" in f:
            consecutive += 1
        else:
            break

    total_strength = sum(s for _, s in flows)
    dominant = "inflow" if total_strength > 1 else "outflow" if total_strength < -1 else "neutral"

    return {
        "flow": dominant,
        "strength": round(total_strength, 1),
        "consecutive": consecutive,
    }


def has_consecutive_outflow(df: pd.DataFrame, threshold: int = 3, min_strength: int = -3) -> bool:
    """连续 N 日主力资金持续流出"""
    flow = estimate_capital_flow(df, lookback=threshold + 2)
    return flow["consecutive"] >= threshold and flow["strength"] <= min_strength


def precompute_outflow_flags(df: pd.DataFrame, threshold: int = 3) -> list[bool]:
    """预计算整条K线每个位置的流出标记，供 _simulate_exit O(1) 查询
    对每个 i (i >= 5), 判断 df.iloc[i-5:i+1] 内是否存在持续流出
    """
    n = len(df)
    flags = [False] * n
    for i in range(5, n):
        window = df.iloc[i - 5:i + 1]
        flags[i] = has_consecutive_outflow(window, threshold=threshold)
    return flags
