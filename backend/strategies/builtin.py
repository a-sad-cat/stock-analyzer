"""
# ========================================
# 短线策略实现 — 新手友好版
# 每个策略都有清晰的中文说明，让不懂技术指标的散户也能看懂
# ========================================
"""

import pandas as pd
from .base import BaseStrategy


# ---------- 辅助函数 ----------
def safe_float(val, default=0.0):
    """安全取浮点数"""
    if val is None:
        return default
    try:
        v = float(val)
        return v if pd.notna(v) else default
    except (ValueError, TypeError):
        return default


def vol_ratio_str(ratio):
    """成交量比值转为大白话描述"""
    if ratio > 3:
        return "巨量放大"
    elif ratio > 2:
        return "明显放量"
    elif ratio > 1.5:
        return "温和放量"
    elif ratio > 1.2:
        return "略有放量"
    else:
        return "量能一般"


# ---------- K线形态辅助函数 ----------
def _is_yang(close, open_p):
    return close >= open_p

def _is_yin(close, open_p):
    return close < open_p

def _body_size(close, open_p):
    return abs(close - open_p)

def _upper_shadow_len(high, close, open_p):
    return high - max(close, open_p)

def _lower_shadow_len(close, open_p, low):
    return min(close, open_p) - low

def _range_high_low(high, low):
    return high - low

def _ema(series, period):
    """计算指数移动平均（纯pandas实现）"""
    return series.ewm(span=period, adjust=False).mean()


# ===================================================================
# 主升浪策略1: 三阴不破阳
# ===================================================================
class ThreeYinNotBreakYangStrategy(BaseStrategy):
    """三阴不破阳 — 涨停后连调三天不破涨停实体，第四天放量收阳即介入"""

    def __init__(self):
        super().__init__(
            name="三阴不破阳",
            description="涨停或大阳线后连调三天不破阳线实体低点，第四天放量收阳，说明主力洗盘结束"
        )
        self.tags = ["适合短线", "强势股", "主升浪"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 20:
            return None
        try:
            total = len(df)
            for offset in range(total - 6, 10, -1):
                if offset < 5:
                    break
                ref = df.iloc[offset]
                ref_pct = safe_float(ref['pct_chg'])
                ref_close = safe_float(ref['close'])
                ref_open = safe_float(ref['open'])

                if ref_pct < 7:
                    continue
                yang_body_low = ref_open
                yang_close = ref_close

                if offset + 5 > total - 1:
                    continue

                adj_lows = []
                for j in range(1, 4):
                    check_idx = offset + j
                    check = df.iloc[check_idx]
                    ck_close = safe_float(check['close'])
                    if ck_close <= yang_body_low:
                        return None
                    adj_lows.append(ck_close)

                curr = df.iloc[-1]
                curr_close = safe_float(curr['close'])
                curr_open = safe_float(curr['open'])
                curr_vol = safe_float(curr['volume'])
                curr_pct = safe_float(curr['pct_chg'])
                vol_ma5 = safe_float(curr.get('VOL_MA5'))
                vol_ratio = curr_vol / vol_ma5 if vol_ma5 > 0 else 1

                if not _is_yang(curr_close, curr_open):
                    continue
                if vol_ratio < 1.1 or curr_pct < 0.3:
                    continue

                score = 75
                bonus = []
                if vol_ratio > 2:
                    score += 10; bonus.append("放量突破确认")
                if curr_pct > 4:
                    score += 8; bonus.append("涨幅大，主力强势")
                if curr_close > yang_close:
                    score += 5; bonus.append("收盘已超过涨停日高点")

                min_adj = min(adj_lows)
                drop_pct = (yang_close - min_adj) / yang_close * 100
                if drop_pct < 3:
                    score += 5; bonus.append(f"调整幅度仅{drop_pct:.1f}%，强势横盘")

                reason = (f"⚡ 三阴不破阳！{name}涨停后调整3天，最低{min_adj:.2f}"
                          f"未破涨停实体低点{yang_body_low:.2f}，"
                          f"第4天放量{vol_ratio:.1f}倍收阳（{curr_pct:.1f}%），洗盘结束！")
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 涨停日涨幅{ref_pct:.1f}%。🔥 介入时机"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 95),
                    "tags": self.tags,
                    "signals": {
                        "涨停日涨幅%": round(ref_pct, 2),
                        "涨停实体低点": round(yang_body_low, 2),
                        "调整最低": round(min_adj, 2),
                        "调整幅度%": round(drop_pct, 2),
                        "当前涨幅%": round(curr_pct, 2),
                        "量比": round(vol_ratio, 2),
                    },
                    "reason": reason
                }
            return None
        except Exception:
            return None


# ===================================================================
# 主升浪策略2: 缩倍量洗盘
# ===================================================================
class ShrinkingVolWashoutStrategy(BaseStrategy):
    """
    缩倍量洗盘 — 底部涨停后5日内出现量比腰斩的缩量阴线，
    说明主力锁仓洗盘，后续阳线站上该阴线收盘价即进场
    """

    def __init__(self):
        super().__init__(
            name="缩倍量洗盘",
            description="底部涨停后出现量比腰斩的缩量阴线，主力锁仓洗盘，再次收阳站上即进场"
        )
        self.tags = ["适合短线", "高胜率", "主升浪"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 20:
            return None
        try:
            total = len(df)
            limit_up_idx = None
            for i in range(total - 6, max(total - 20, 0), -1):
                if safe_float(df.iloc[i]['pct_chg']) >= 7:
                    limit_up_idx = i
                    break
            if limit_up_idx is None:
                return None

            wash_yin_idx = None; wash_yin_close = None; wash_vol_ratio = None
            for j in range(1, min(6, total - limit_up_idx - 1)):
                ci = limit_up_idx + j
                if ci >= total - 1:
                    break
                ck = df.iloc[ci]
                ck_cl = safe_float(ck['close']); ck_op = safe_float(ck['open'])
                if not _is_yin(ck_cl, ck_op):
                    continue
                pv = safe_float(df.iloc[ci - 1]['volume'])
                cv = safe_float(ck['volume'])
                if pv > 0 and cv / pv <= 0.5:
                    wash_yin_idx = ci; wash_yin_close = ck_cl; wash_vol_ratio = cv / pv
                    break
            if wash_yin_idx is None:
                return None

            curr = df.iloc[-1]
            curr_cl = safe_float(curr['close']); curr_op = safe_float(curr['open'])
            curr_pct = safe_float(curr['pct_chg'])
            if not _is_yang(curr_cl, curr_op) or curr_cl <= wash_yin_close:
                return None

            vma5 = safe_float(curr.get('VOL_MA5'))
            cv = safe_float(curr['volume'])
            vr = cv / vma5 if vma5 > 0 else 1

            score = 78
            bonus = [f"缩量洗盘（量缩至前日的{wash_vol_ratio:.0%}）"]
            if wash_vol_ratio < 0.35:
                score += 10; bonus.append("极度缩量，筹码高度集中")
            if vr > 1.5:
                score += 8; bonus.append("放量上攻，启动确认")
            if curr_pct > 4:
                score += 5; bonus.append("强势阳线突破")

            gap_pct = (curr_cl - wash_yin_close) / wash_yin_close * 100
            reason = (f"💰 缩倍量洗盘！{name}涨停后缩量阴线洗盘"
                      f"（量缩减至前日的{wash_vol_ratio:.0%}），"
                      f"今日放量{vr:.1f}倍收阳站上洗盘线{wash_yin_close:.2f}。")
            if bonus: reason += " " + "，".join(bonus)
            reason += f" 洗盘点至今涨幅{gap_pct:.1f}%。🚀 主升信号"

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 95),
                "tags": self.tags,
                "signals": {
                    "涨停偏移": limit_up_idx - wash_yin_idx,
                    "缩量比例%": round(wash_vol_ratio * 100, 1),
                    "洗盘收盘价": round(wash_yin_close, 2),
                    "当前涨幅%": round(curr_pct, 2),
                    "量比": round(vr, 2),
                },
                "reason": reason
            }
        except Exception:
            return None


# ===================================================================
# 主升浪策略3: 上影试盘 + 下影洗盘
# ===================================================================
class ShadowProbeWashoutStrategy(BaseStrategy):
    """上影试盘+下影洗盘 — 涨停后先长上影试盘再长下影洗盘，主力控盘明显"""

    def __init__(self):
        super().__init__(
            name="上影试盘+下影洗盘",
            description="涨停后先长上影试盘（冲高回落），再长下影洗盘（探底回升），主力控盘明显"
        )
        self.tags = ["适合短线", "强势股", "主升浪"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 25:
            return None
        try:
            total = len(df)
            for offset in range(total - 5, max(total - 20, 0), -1):
                if offset + 3 > total - 1:
                    continue
                ref = df.iloc[offset]
                if safe_float(ref['pct_chg']) < 5:
                    continue
                ref_low = safe_float(ref['low'])

                d2 = df.iloc[offset + 1]
                d2c = safe_float(d2['close']); d2o = safe_float(d2['open'])
                d2h = safe_float(d2['high']); d2l = safe_float(d2['low'])
                d2b = _body_size(d2c, d2o); d2u = _upper_shadow_len(d2h, d2c, d2o)
                d2r = _range_high_low(d2h, d2l)
                if d2r <= 0 or d2u < d2b * 1.2 and d2u < d2r * 0.4:
                    continue

                d3 = df.iloc[offset + 2]
                d3c = safe_float(d3['close']); d3o = safe_float(d3['open'])
                d3h = safe_float(d3['high']); d3l = safe_float(d3['low'])
                d3b = _body_size(d3c, d3o); d3ls = _lower_shadow_len(d3c, d3o, d3l)
                d3r = _range_high_low(d3h, d3l)
                if d3r <= 0 or d3ls < d3b * 1.2 and d3ls < d3r * 0.4:
                    continue

                ma20 = safe_float(df.iloc[offset].get('MA20'))
                ks = min(ma20, ref_low) if ma20 > 0 else ref_low
                if d2l < ks * 0.98 or d3l < ks * 0.98:
                    continue

                curr_pct = safe_float(df.iloc[-1]['pct_chg'])

                score = 78
                bonus = ["长上影试盘+长下影洗盘，洗盘充分"]
                if d2u > d2r * 0.6: score += 5; bonus.append("上影线长，试盘充分")
                if d3ls > d3r * 0.6: score += 5; bonus.append("下影线长，洗盘彻底")
                if curr_pct > 0: score += 5; bonus.append("已企稳回升")

                reason = (f"🎣 上影试盘+下影洗盘！{name}涨停后第2天冲高回落"
                          f"（上影{d2u:.2f}），第3天探底回升（下影{d3ls:.2f}），"
                          f"未跌破关键位{ks:.2f}。")
                if bonus: reason += " " + "，".join(bonus)
                reason += " 📌 关键位附近可小仓位试错"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 92),
                    "tags": self.tags,
                    "signals": {
                        "涨停涨幅%": round(safe_float(ref['pct_chg']), 2),
                        "上影比例%": round(d2u / d2r * 100, 1),
                        "下影比例%": round(d3ls / d3r * 100, 1),
                        "关键支撑": round(ks, 2),
                        "当前涨幅%": round(curr_pct, 2),
                    },
                    "reason": reason
                }
            return None
        except Exception:
            return None


# ===================================================================
# 主升浪策略4: 连阳缩量横盘
# ===================================================================
class ConsecutiveYangShrinkStrategy(BaseStrategy):
    """连阳缩量横盘 — 小步阳线量能萎缩，主力锁仓，放量即起爆"""

    def __init__(self):
        super().__init__(
            name="连阳缩量横盘",
            description="连续小阳线上涨且量能持续萎缩，主力锁仓、分歧极小，放量即起爆"
        )
        self.tags = ["适合短线", "主升浪", "稳健信号"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 25:
            return None
        try:
            total = len(df)
            lookback = min(7, total - 2)
            yang_count = 0; shrink_count = 0; prev_vol = None

            for i in range(total - lookback, total):
                row = df.iloc[i]
                close = safe_float(row['close']); open_p = safe_float(row['open'])
                rv = safe_float(row['volume']); pct = safe_float(row['pct_chg'])
                if close >= open_p and 0 <= pct <= 6:
                    yang_count += 1
                    if prev_vol is not None and rv < prev_vol:
                        shrink_count += 1
                    prev_vol = rv

            if yang_count < 3 or shrink_count < 1:
                return None

            first_vol = safe_float(df.iloc[total - lookback]['volume'])
            last_vol = safe_float(df.iloc[-1]['volume'])
            if first_vol <= 0:
                return None
            vsr = last_vol / first_vol

            curr = df.iloc[-1]
            cc = safe_float(curr['close']); cp = safe_float(curr['pct_chg'])
            ma5 = safe_float(curr.get('MA5')); ma10 = safe_float(curr.get('MA10'))

            score = 72
            bonus = [f"连续{yang_count}根小阳线缩量整理"]
            if yang_count >= 5: score += 8; bonus.append("连阳天数多，蓄力充分")
            if vsr < 0.6: score += 10; bonus.append(f"量能萎缩至{vsr:.0%}，筹码集中")
            if cc > ma5 and ma5 > ma10: score += 8; bonus.append("均线多头排列")

            reason = (f"📈 连阳缩量横盘！{name}连续{yang_count}根小阳线"
                      f"（量能萎缩至{vsr:.0%}），")
            reason += "筹码集中，只差一个起爆点！"
            if bonus: reason += " " + "，".join(bonus)

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 92),
                "tags": self.tags,
                "signals": {
                    "连阳天数": yang_count,
                    "缩量比例%": round(vsr * 100, 1),
                    "MA5": round(ma5, 2), "MA10": round(ma10, 2),
                    "当前价": round(cc, 2),
                },
                "reason": reason
            }
        except Exception:
            return None


# ===================================================================
# 主升浪策略5: 三重过滤验证
# ===================================================================
class TripleFilterStrategy(BaseStrategy):
    """三重过滤验证 — EMA趋势基底 + DIF上穿DEA + 价涨量增，三重共振进场"""

    def __init__(self):
        super().__init__(
            name="三重过滤验证",
            description="EMA9-EMA150趋势基底 + DIF上穿DEA资金活跃 + 价涨量增爆发，三重共振右侧进场"
        )
        self.tags = ["适合短线", "高胜率", "强烈推荐", "主升浪"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 160:
            return None
        try:
            cs = df['close']
            ema9_v = _ema(cs, 9); ema150_v = _ema(cs, 150)
            if safe_float(ema9_v.iloc[-1]) <= safe_float(ema150_v.iloc[-1]):
                return None

            curr = df.iloc[-1]; prev = df.iloc[-2]
            dn = safe_float(curr.get('DIF')); dan = safe_float(curr.get('DEA'))
            if dn <= dan:
                return None

            mn = safe_float(curr.get('MACD'))
            m1 = safe_float(df.iloc[-2].get('MACD')) if len(df) >= 2 else 0
            m2 = safe_float(df.iloc[-3].get('MACD')) if len(df) >= 3 else 0
            m3 = safe_float(df.iloc[-4].get('MACD')) if len(df) >= 4 else 0
            if not (mn > 0 and m1 > 0 and m1 > m2 and m2 > m3):
                return None

            vol = safe_float(curr['volume'])
            vma5 = safe_float(curr.get('VOL_MA5'))
            vr = vol / vma5 if vma5 > 0 else 1
            pct = safe_float(curr['pct_chg'])
            ma5 = safe_float(curr.get('MA5'))
            if vr < 1.2 or pct < 1.5 or safe_float(curr['close']) <= ma5:
                return None

            score = 80; bonus = []
            dp = safe_float(prev.get('DIF')); dap = safe_float(prev.get('DEA'))
            if dp < dap: score += 8; bonus.append("DIF刚上穿DEA，信号新鲜")

            tg = (ema9_v.iloc[-1] - ema150_v.iloc[-1]) / ema150_v.iloc[-1] * 100
            if tg > 3: score += 5; bonus.append(f"趋势基底强势（偏差{tg:.1f}%）")
            elif tg > 1: score += 3; bonus.append("趋势基底稳定")
            if vr > 2.5: score += 8; bonus.append(f"巨量爆发（{vr:.1f}倍）")
            elif vr > 2: score += 5
            if pct > 6: score += 5; bonus.append("涨幅超6%，强势确认")

            reason = (f"🎯 三重过滤验证通过！{name}\n"
                      f"① EMA9({ema9_v.iloc[-1]:.2f})>EMA150({ema150_v.iloc[-1]:.2f}) ✅\n"
                      f"② DIF({dn:.4f})>DEA({dan:.4f})，MACD由负转正递增 ✅\n"
                      f"③ 量比{vr:.1f}倍，涨幅{pct:.1f}%，站上MA5({ma5:.2f}) ✅\n")
            if bonus: reason += " " + "，".join(bonus)
            reason += " 🔥 三重共振右侧进场信号！"

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 98),
                "tags": self.tags,
                "signals": {
                    "EMA9": round(float(ema9_v.iloc[-1]), 2),
                    "EMA150": round(float(ema150_v.iloc[-1]), 2),
                    "趋势偏差%": round(float(tg), 2),
                    "DIF": round(dn, 4), "DEA": round(dan, 4),
                    "MACD": round(mn, 4),
                    "量比": round(vr, 2), "涨幅%": round(pct, 2),
                },
                "reason": reason
            }
        except Exception:
            return None


# ===================================================================
# 策略1: MACD金叉 — 最常用的短线看涨信号
# ===================================================================
class MacdGoldenCrossStrategy(BaseStrategy):
    """MACD金叉 — DIF上穿DEA，配合成交量确认"""

    def __init__(self):
        super().__init__(
            name="MACD金叉",
            description="DIF线向上穿过DEA线，形成金叉，是短线看涨信号"
        )
        self.tags = ["适合短线", "高胜率"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 30:
            return None
        try:
            prev = df.iloc[-2]
            curr = df.iloc[-1]
            dif_now = safe_float(curr.get('DIF'))
            dea_now = safe_float(curr.get('DEA'))
            dif_prev = safe_float(prev.get('DIF'))
            dea_prev = safe_float(prev.get('DEA'))

            if dif_now == 0 and dea_now == 0:
                return None

            # DIF上穿DEA
            if dif_prev < dea_prev and dif_now >= dea_now:
                close = safe_float(curr['close'])
                vol = safe_float(curr['volume'])
                vol_ma5 = safe_float(curr.get('VOL_MA5'))
                vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1

                # 评分：靠近零轴加分，有量加分
                score = 65
                bonus = []
                if abs(dif_now) < 0.5:
                    score += 10
                    bonus.append("金叉靠近零轴，位置很好")
                if dif_now > 0 and dea_now > 0:
                    score += 5
                    bonus.append("DIF和DEA都在零轴上方，多头强势")
                if vol_ratio > 1.5:
                    score += 10
                    bonus.append(f"成交量{vol_ratio_str(vol_ratio)}，资金确认")
                if vol_ratio > 3:
                    score += 5

                reason = f"MACD金叉了！DIF线({dif_now:.4f})刚穿过DEA线({dea_now:.4f})，短期看涨信号。"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 收盘价{close:.2f}元。{'⭐ 强烈推荐' if score >= 80 else '✅ 可以关注'}"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 95),
                    "tags": self.tags,
                    "signals": {
                        "DIF": round(dif_now, 4), "DEA": round(dea_now, 4),
                        "收盘价": round(close, 2), "成交量": int(vol),
                        "量比": round(vol_ratio, 2)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略2: MACD底背离 — 抄底信号
# ===================================================================
class MacdDivergenceStrategy(BaseStrategy):
    """MACD底背离 — 股价创新低但MACD柱/面积缩小，抄底信号"""

    def __init__(self):
        super().__init__(
            name="MACD底背离",
            description="股价创新低但MACD指标没有再创新低，说明下跌力度减弱，可能要反弹了"
        )
        self.tags = ["适合抄底", "左侧交易"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 40:
            return None
        try:
            recent_30 = df.tail(30)
            recent_5 = df.tail(5)

            # 近20日最低价
            low_20 = float(recent_30['low'].min())
            # 当前价格在低位
            curr_low = float(recent_5['high'].min())
            curr_close = safe_float(recent_5.iloc[-1]['close'])

            if curr_close > low_20 * 1.05:  # 离最低不太远
                return None

            # 找近20日价格最低点时的MACD
            min_low_idx = recent_30['low'].idxmin()
            # 找最低点位置
            positions = list(recent_30.index)
            if min_low_idx in positions:
                pos = positions.index(min_low_idx)
            else:
                return None

            if pos < 2 or pos >= len(recent_30) - 2:
                return None

            macd_at_low = safe_float(recent_30.iloc[pos].get('MACD'))
            prev_macd = safe_float(recent_30.iloc[pos - 1].get('MACD'))
            curr_macd = safe_float(recent_5.iloc[-1].get('MACD'))

            # 检查: 价格创新低时MACD柱没有更低（底背离）
            close_at_low = safe_float(recent_30.iloc[pos]['close'])

            if curr_macd > macd_at_low and macd_at_low < 0:
                score = 70
                bonus = []
                if curr_macd > -0.1:
                    score += 10
                    bonus.append("MACD接近零轴，反弹动能强")
                if curr_macd > 0:
                    score += 10
                    bonus.append("MACD已转正，确立反弹趋势")

                price_change = (curr_close - close_at_low) / close_at_low * 100

                reason = f"出现MACD底背离！股价跌到{curr_close:.2f}元（近期低位），"
                reason += f"但MACD指标从{macd_at_low:.4f}回升到{curr_macd:.4f}，"
                reason += "说明虽然还在跌但下跌力量已经减弱了，"
                reason += "就像打拳打到没力气了，接下来可能要反弹了！"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 从最低点反弹了{price_change:.1f}%。{'💪 抄底机会' if score >= 80 else '👀 可以观察'}"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 90),
                    "tags": self.tags,
                    "signals": {
                        "当前价": round(curr_close, 2),
                        "近期最低": round(low_20, 2),
                        "低点差%": round(price_change, 2),
                        "当前MACD": round(curr_macd, 4),
                        "前低MACD": round(macd_at_low, 4)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略3: KDJ超卖反弹 — 短线灵敏抄底
# ===================================================================
class KdjOversoldStrategy(BaseStrategy):
    """KDJ超卖反弹 — J值<0后拐头向上，短线超卖反弹信号"""

    def __init__(self):
        super().__init__(
            name="KDJ超卖反弹",
            description="KDJ指标的J值跌到0以下（超卖区）后开始向上拐头，是灵敏的短线反弹信号"
        )
        self.tags = ["适合短线", "灵敏抄底"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 20:
            return None
        try:
            prev = df.iloc[-3] if len(df) >= 3 else df.iloc[-2]
            curr = df.iloc[-1]

            k_now = safe_float(curr.get('K'))
            d_now = safe_float(curr.get('D'))
            j_now = safe_float(curr.get('J'))
            j_prev = safe_float(prev.get('J'))

            if j_now == 0 and k_now == 0:
                return None

            # J值 < 0 后向上拐头
            if j_now < 20 and j_now > j_prev:
                score = 65
                bonus = []
                close = safe_float(curr['close'])

                if j_now < 0:
                    score += 15  # 极度超卖
                    bonus.append("J值跌到0以下，极度超卖，反弹概率很大")
                elif j_now < 10:
                    score += 10
                    bonus.append("J值很低，超卖严重")
                if k_now < d_now and k_now > j_prev * 0.5:
                    score += 5
                    bonus.append("K线也开始拐头，确认反弹信号")

                # KDJ金叉加分
                k_prev = safe_float(prev.get('K'))
                d_prev = safe_float(prev.get('D'))
                if k_prev < d_prev and k_now >= d_now:
                    score += 10
                    bonus.append("KDJ形成金叉，信号更可靠")

                reason = f"KDJ超卖反弹！J值从{j_prev:.2f}反弹到{j_now:.2f}，"
                reason += "说明股票短期跌太狠了，"
                reason += "就像被压到底的弹簧，随时可能弹起来！"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 当前K值{k_now:.2f}，D值{d_now:.2f}。{'🎯 强力反弹信号' if score >= 80 else '✅ 短线反弹机会'}"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 90),
                    "tags": self.tags,
                    "signals": {
                        "K值": round(k_now, 2), "D值": round(d_now, 2),
                        "J值": round(j_now, 2), "收盘价": round(close, 2)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略4: RSI超跌反弹 — 传统超卖反弹
# ===================================================================
class RsiOversoldStrategy(BaseStrategy):
    """RSI超跌反弹 — RSI<30且向上拐头"""

    def __init__(self):
        super().__init__(
            name="RSI超跌反弹",
            description="RSI低于30说明股票超卖了，如果出现向上拐头，是反弹信号"
        )
        self.tags = ["适合抄底", "稳健信号"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 20:
            return None
        try:
            curr = df.iloc[-1]
            prev = df.iloc[-2]
            rsi_now = safe_float(curr.get('RSI'))
            rsi_before = safe_float(prev.get('RSI'))

            if rsi_now == 0:
                return None

            if rsi_now < 30 and rsi_now > rsi_before:
                close = safe_float(curr['close'])
                score = 70
                bonus = []
                if rsi_now < 20:
                    score += 15
                    bonus.append("RSI低于20，极度超卖！")
                if rsi_now - rsi_before > 3:
                    score += 10
                    bonus.append("RSI反弹力度大，信号强烈")

                reason = f"RSI到了{rsi_now:.1f}（低于30属于超卖区），"
                reason += f"而且比昨天（{rsi_before:.1f}）往上走了，"
                reason += "说明卖股票的力气快用完了，买的人开始进场了，"
                reason += "大概率要反弹一波！"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 收盘价{close:.2f}元。"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 90),
                    "tags": self.tags,
                    "signals": {
                        "RSI": round(rsi_now, 2), "前日RSI": round(rsi_before, 2),
                        "收盘价": round(close, 2)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略5: 均线金叉（短线）— MA5上穿MA10 + 放量50%
# ===================================================================
class MaGoldenCrossStrategy(BaseStrategy):
    """均线金叉（短线）— MA5上穿MA10 + 成交量放大50%"""

    def __init__(self):
        super().__init__(
            name="均线金叉（短线）",
            description="5日均线向上穿过10日均线形成金叉，同时成交量放大50%以上，确认短线走强"
        )
        self.tags = ["适合短线", "趋势确认"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 25:
            return None
        try:
            prev = df.iloc[-2]
            curr = df.iloc[-1]

            ma5_now = safe_float(curr.get('MA5'))
            ma10_now = safe_float(curr.get('MA10'))
            ma5_before = safe_float(prev.get('MA5'))
            ma10_before = safe_float(prev.get('MA10'))

            if ma5_now == 0 or ma10_now == 0:
                return None

            # MA5上穿MA10
            if ma5_before < ma10_before and ma5_now >= ma10_now:
                close = safe_float(curr['close'])
                vol = safe_float(curr['volume'])
                vol_ma5 = safe_float(curr.get('VOL_MA5'))
                vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1

                score = 65
                bonus = []

                # 成交量确认
                if vol_ratio > 1.5:
                    score += 15
                    bonus.append(f"成交量{vol_ratio_str(vol_ratio)}（{vol_ratio:.1f}倍），"
                                "说明有真金白银在买，不是虚涨")
                else:
                    bonus.append("成交量配合一般，最好等放量再确认")

                # MA10也在MA20之上加分
                ma20_now = safe_float(curr.get('MA20'))
                if ma20_now > 0 and ma10_now > ma20_now:
                    score += 10
                    bonus.append("10日线也在20日线之上，中期趋势也向好")

                # 收盘站稳MA5
                if close >= ma5_now:
                    score += 5
                    bonus.append("收盘站稳5日线")

                reason = f"5日均线（{ma5_now:.2f}）向上穿过10日均线（{ma10_now:.2f}），"
                reason += "形成短线金叉！好比5日线翻了10日线的牌，"
                reason += "短期趋势走好了。"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 收盘{close:.2f}元。"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 95),
                    "tags": self.tags,
                    "signals": {
                        "MA5": round(ma5_now, 2), "MA10": round(ma10_now, 2),
                        "MA20": round(ma20_now, 2) if ma20_now > 0 else "--",
                        "收盘价": round(close, 2),
                        "量比": round(vol_ratio, 2)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略6: 放量突破MA20 — 短线趋势确认
# ===================================================================
class BreakMa20Strategy(BaseStrategy):
    """放量突破MA20 — 股价放量站稳MA20，短线趋势确认"""

    def __init__(self):
        super().__init__(
            name="放量突破MA20",
            description="股价放量突破20日均线并站稳，说明短线趋势已经走出来了"
        )
        self.tags = ["适合短线", "趋势跟踪"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 30:
            return None
        try:
            prev = df.iloc[-2] if len(df) >= 2 else None
            curr = df.iloc[-1]

            close = safe_float(curr['close'])
            ma20 = safe_float(curr.get('MA20'))
            if ma20 == 0:
                return None

            # 当前站上MA20
            if close <= ma20:
                return None

            # 前一天在MA20之下（刚突破）
            prev_close = safe_float(prev['close']) if prev is not None else 0
            prev_ma20 = safe_float(prev.get('MA20')) if prev is not None else 0
            is_just_break = prev_close < prev_ma20 if prev is not None else False

            vol = safe_float(curr['volume'])
            vol_ma5 = safe_float(curr.get('VOL_MA5'))
            vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1
            pct = safe_float(curr['pct_chg'])

            score = 60
            if is_just_break:
                score += 10  # 刚突破加分

            bonus = []
            if vol_ratio > 2:
                score += 15
                bonus.append(f"巨量突破（{vol_ratio:.1f}倍），主力真金白银进场")
            elif vol_ratio > 1.5:
                score += 10
                bonus.append(f"明显放量（{vol_ratio:.1f}倍），突破有效")
            if pct > 5:
                score += 10
                bonus.append("涨幅超过5%，强势突破")
            elif pct > 3:
                score += 5
                bonus.append("中阳线突破，走势稳健")

            # MA5也在MA20之上加分
            ma5 = safe_float(curr.get('MA5'))
            if ma5 > ma20:
                score += 5
                bonus.append("5日线也在20日线上方，短线趋势确认")

            reason = f"股价{close:.2f}元突破了20日均线（{ma20:.2f}），"
            if is_just_break:
                reason += "是刚突破的！"
            else:
                reason += "已经站稳在MA20上方。"
            reason += "20日均线就像股票的'生命线'，突破它说明短线趋势走好了。"
            if bonus:
                reason += " " + "，".join(bonus)
            reason += f" {'🔥 强势突破' if score >= 80 else '✅ 可以关注'}"

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 90),
                "tags": self.tags,
                "signals": {
                    "收盘价": round(close, 2), "MA20": round(ma20, 2),
                    "涨幅%": round(pct, 2), "量比": round(vol_ratio, 2),
                    "MA5": round(ma5, 2) if ma5 > 0 else "--"
                },
                "reason": reason
            }
        except Exception:
            pass
        return None


# ===================================================================
# 策略7: 涨停首板 — 首次涨停（如果数据不支持可以跳过）
# ===================================================================
class FirstLimitUpStrategy(BaseStrategy):
    """涨停首板 — 首次涨停"""

    def __init__(self):
        super().__init__(
            name="涨停首板",
            description="股票今天涨停了，而且是近期第一次涨停，说明有资金开始炒作"
        )
        self.tags = ["适合短线", "强势股", "高风险"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 10:
            return None
        try:
            curr = df.iloc[-1]
            close = safe_float(curr['close'])
            pct = safe_float(curr['pct_chg'])

            # 判断涨停（A股涨停约10%，ST约5%）
            if pct < 9.5:
                return None

            # 检查近期没有涨停过
            prev_df = df.iloc[-10:-1]
            for _, row in prev_df.iterrows():
                prev_pct = safe_float(row.get('pct_chg'))
                if prev_pct >= 9.5:
                    return None  # 近期涨停过

            vol = safe_float(curr['volume'])
            vol_ma5 = safe_float(curr.get('VOL_MA5'))
            vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1

            score = 80  # 涨停本身就很强
            bonus = ["首次涨停，资金刚开始炒作，后面可能还有空间"]

            if vol_ratio > 2:
                score += 5
                bonus.append(f"放量涨停（{vol_ratio:.1f}倍），主力干活了")
            else:
                bonus.append("缩量涨停，说明筹码锁定好，惜售")

            open_p = safe_float(curr['open'])
            low = safe_float(curr['low'])

            # 一字板
            if abs(open_p - low) / close < 0.01 and open_p == close:
                bonus.append("一字涨停板，买都买不到，极强")
                score += 10
            elif low < open_p:
                bonus.append("盘中打开过涨停又封住（T字板），换手充分")

            reason = f"涨停了！今天涨幅{pct:.1f}%，"
            if bonus:
                reason += " " + "，".join(bonus)
            reason += f" 收盘{close:.2f}元。"
            reason += " ⚠️ 涨停追高风险大，建议看第二天开盘情况再决定！"

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 95),
                "tags": self.tags,
                "signals": {
                    "涨幅%": round(pct, 2), "收盘价": round(close, 2),
                    "成交量": int(vol), "量比": round(vol_ratio, 2)
                },
                "reason": reason
            }
        except Exception:
            pass
        return None


# ===================================================================
# 策略8: 布林线突破 — 股价放量突破布林线上轨
# ===================================================================
class BollingerBreakStrategy(BaseStrategy):
    """布林线突破 — 股价放量突破布林线上轨"""

    def __init__(self):
        super().__init__(
            name="布林线突破",
            description="股价放量冲出布林线上轨，说明股票进入强势上涨通道"
        )
        self.tags = ["适合短线", "强势突破"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 25:
            return None
        try:
            curr = df.iloc[-1]
            close = safe_float(curr['close'])
            upper = safe_float(curr.get('BB_UPPER'))
            mid = safe_float(curr.get('BB_MID'))

            if upper == 0 or mid == 0:
                return None

            # 突破布林线上轨
            if close >= upper:
                vol = safe_float(curr['volume'])
                vol_ma5 = safe_float(curr.get('VOL_MA5'))
                vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1
                pct = safe_float(curr['pct_chg'])

                score = 70
                bonus = ["股价冲出了布林线上轨，进入强势区"]

                if vol_ratio > 2:
                    score += 15
                    bonus.append(f"放量突破（{vol_ratio:.1f}倍），信号可靠")
                if pct > 5:
                    score += 10
                    bonus.append("大涨突破，强势确认")

                # 布林线上轨在扩张（开口放大）加分
                prev_upper = safe_float(df.iloc[-2].get('BB_UPPER')) if len(df) >= 2 else 0
                if prev_upper > 0 and upper > prev_upper:
                    score += 5
                    bonus.append("布林线开口在扩大，上涨空间打开了")

                width = (upper - mid) / mid * 100 if mid > 0 else 0

                reason = f"股价{close:.2f}元突破了布林线上轨（{upper:.2f}）！"
                reason += "布林线就像股票的'通道'，冲破上轨说明股票要加速了。"
                if bonus:
                    reason += " " + "，".join(bonus)
                reason += f" 布林线宽度{width:.1f}%。"
                reason += f" {'🚀 加速上涨' if score >= 85 else '📈 强势信号'}"

                return {
                    "stock_code": code, "stock_name": name,
                    "score": min(score, 95),
                    "tags": self.tags,
                    "signals": {
                        "收盘价": round(close, 2), "布林上轨": round(upper, 2),
                        "布林中轨": round(mid, 2), "布林带宽%": round(width, 2),
                        "涨幅%": round(pct, 2), "量比": round(vol_ratio, 2)
                    },
                    "reason": reason
                }
        except Exception:
            pass
        return None


# ===================================================================
# 策略9: 组合信号 — MACD金叉 + KDJ超卖 + 放量（高胜率组合）
# ===================================================================
class ComboSignalStrategy(BaseStrategy):
    """组合信号 — MACD金叉 + KDJ超卖 + 放量，三个信号共振"""

    def __init__(self):
        super().__init__(
            name="组合信号（高胜率）",
            description="MACD金叉 + KDJ超卖反弹 + 成交量放大，三个信号同时出现，短线胜率极高"
        )
        self.tags = ["适合短线", "高胜率", "强烈推荐"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        if df is None or len(df) < 30:
            return None
        try:
            curr = df.iloc[-1]
            prev = df.iloc[-2]

            # ---- 信号1: MACD金叉 ----
            dif_now = safe_float(curr.get('DIF'))
            dea_now = safe_float(curr.get('DEA'))
            dif_prev = safe_float(prev.get('DIF'))
            dea_prev = safe_float(prev.get('DEA'))
            macd_golden = dif_prev < dea_prev and dif_now >= dea_now

            # ---- 信号2: KDJ超卖反弹 ----
            j_now = safe_float(curr.get('J'))
            j_prev = safe_float(prev.get('J'))
            kdj_oversold = j_now < 30 and j_now > j_prev

            # ---- 信号3: 成交量放大 ----
            vol = safe_float(curr['volume'])
            vol_ma5 = safe_float(curr.get('VOL_MA5'))
            vol_ratio = vol / vol_ma5 if vol_ma5 > 0 else 1
            volume_up = vol_ratio > 1.3

            signals_hit = sum([macd_golden, kdj_oversold, volume_up])
            if signals_hit < 2:
                return None

            close = safe_float(curr['close'])
            pct = safe_float(curr['pct_chg'])

            # 评分
            score = 50 + signals_hit * 12
            details = []
            if macd_golden:
                score += 8
                details.append("✅ MACD金叉——DIF线刚穿过DEA线，短线看涨")
            else:
                details.append("❌ MACD未金叉")
            if kdj_oversold:
                score += 8
                details.append(f"✅ KDJ超卖反弹——J值从{j_prev:.2f}反弹到{j_now:.2f}")
            else:
                details.append("❌ KDJ未触发")
            if volume_up:
                score += 8
                details.append(f"✅ 成交量放大——量比{vol_ratio:.1f}倍，有资金进场")
            else:
                details.append("❌ 量能不足")

            if signals_hit == 3:
                score += 5
                headline = "🎯 三个信号全部命中！高胜率组合信号！"
            else:
                headline = f"📊 命中{signals_hit}/3个信号，值得关注"

            reason = headline + "\n" + "\n".join(details)
            reason += f"\n收盘价{close:.2f}元，今日涨幅{pct:.1f}%。"

            return {
                "stock_code": code, "stock_name": name,
                "score": min(score, 98),
                "tags": self.tags,
                "signals": {
                    "MACD金叉": "是" if macd_golden else "否",
                    "KDJ值": round(j_now, 2),
                    "量比": round(vol_ratio, 2),
                    "命中信号": f"{signals_hit}/3",
                    "收盘价": round(close, 2)
                },
                "reason": reason
            }
        except Exception:
            pass
        return None


class PullbackRespectMaStrategy(BaseStrategy):
    """强势上涨+回调不破均线选股
    均线多头排列 + 回调不破20日线 + 缩量止跌
    """
    def __init__(self):
        super().__init__(
            name="强势上涨+回调不破均线",
            description="均线多头排列（MA5>MA10>MA20），股价回调不破20日线且缩量止跌，适合趋势跟踪低吸"
        )
        self.tags = ["趋势跟踪", "低吸"]

    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        try:
            total = len(df)
            if total < 25:
                return None

            curr = df.iloc[-1]
            prev = df.iloc[-2]
            close = safe_float(curr['close'])
            ma5 = safe_float(curr.get('MA5'))
            ma10 = safe_float(curr.get('MA10'))
            ma20 = safe_float(curr.get('MA20'))
            vol = safe_float(curr['volume'])
            prev_vol = safe_float(prev['volume'])

            if any(x is None or pd.isna(x) for x in [close, ma5, ma10, ma20, vol, prev_vol]):
                return None

            # 1. 多头排列
            if not (ma5 > ma10 > ma20):
                return None

            # 2. 趋势未坏
            if close < ma20 * 0.98:
                return None

            # 3-5. 回调条件
            condition_met = None
            detail = ""
            score = 60

            if close >= ma5:
                pct_above_ma5 = (close / ma5 - 1) * 100
                if pct_above_ma5 <= 3:
                    condition_met = "A"
                    detail = f"沿5日线上行(乖离{pct_above_ma5:.1f}%)"
                    score = 75
            elif close < ma5 and close >= ma10:
                pct_above_ma10 = (close / ma10 - 1) * 100
                if pct_above_ma10 <= 2:
                    condition_met = "B"
                    detail = f"回调至10日线止跌(乖离{pct_above_ma10:.1f}%)"
                    score = 80
            elif close < ma10 and close >= ma20 * 0.99:
                pct_above_ma20 = (close / ma20 - 1) * 100
                if pct_above_ma20 <= 1.5:
                    condition_met = "C"
                    detail = f"回调至20日线止跌(乖离{pct_above_ma20:.1f}%)"
                    score = 85

            if condition_met is None:
                return None

            # 6. 缩量
            vol_shrink = vol < prev_vol * 1.05
            if not vol_shrink:
                return None

            # 加分：多日缩量
            shrink_days = 0
            for i in range(2, 6):
                if total > i and safe_float(df.iloc[-i]['volume']) < safe_float(df.iloc[-i-1]['volume']):
                    shrink_days += 1
            score += shrink_days * 2

            return {
                "stock_code": code,
                "stock_name": name,
                "score": min(score, 98),
                "tags": self.tags,
                "signals": {
                    "MA5": round(ma5, 2),
                    "MA10": round(ma10, 2),
                    "MA20": round(ma20, 2),
                    "回踩类型": condition_met,
                    "缩量天数": shrink_days,
                    "收盘价": round(close, 2),
                },
                "reason": f"均线多头({ma5:.0f}>{ma10:.0f}>{ma20:.0f})，{detail}，缩量{shrink_days}日"
            }
        except Exception:
            pass
        return None


# ===================================================================
# 策略16: 多策略融合 — 技术共振高胜率
# ===================================================================
class FusionStrategy(BaseStrategy):
    """多策略融合 — 运行所有内置策略，仅当2个以上策略同时命中时才产生信号，技术共振大幅提高胜率"""

    def __init__(self):
        super().__init__(
            name="多策略融合（高胜率）",
            description="同时运行所有短线策略，仅当2个及以上策略同时选中同一只股票时才产生信号，技术共振大幅提高胜率"
        )
        self.tags = ["适合短线", "高胜率", "强烈推荐"]
        self.sub_strategies = [
            ThreeYinNotBreakYangStrategy(),
            ShrinkingVolWashoutStrategy(),
            ShadowProbeWashoutStrategy(),
            ConsecutiveYangShrinkStrategy(),
            TripleFilterStrategy(),
            MacdGoldenCrossStrategy(),
            MacdDivergenceStrategy(),
            KdjOversoldStrategy(),
            RsiOversoldStrategy(),
            MaGoldenCrossStrategy(),
            BreakMa20Strategy(),
            FirstLimitUpStrategy(),
            BollingerBreakStrategy(),
            ComboSignalStrategy(),
            PullbackRespectMaStrategy(),
        ]

    def evaluate(self, code: str, stock_name: str, df: pd.DataFrame) -> dict | None:
        try:
            hits = []
            hit_strategies = []
            for s in self.sub_strategies:
                try:
                    result = s.evaluate(code, stock_name, df)
                    if result:
                        hits.append(result)
                        hit_strategies.append(s.name)
                except Exception:
                    continue

            if len(hits) < 3:
                return None

            avg_score = sum(h.get("score", 0) for h in hits) / len(hits)
            fusion_bonus = 1 + 0.10 * (len(hits) - 2)
            final_score = min(int(avg_score * fusion_bonus), 98)

            merged = {"策略命中数": len(hits), "命中策略": hit_strategies}
            signals_seen = set()
            for h in hits:
                for k, v in h.get("signals", {}).items():
                    if k not in signals_seen:
                        merged[k] = v
                        signals_seen.add(k)

            lines = [f"🎯 {len(hits)}个策略同时命中 {stock_name}！"]
            for i, h in enumerate(hits):
                lines.append(f"  [{hit_strategies[i]}] 评分{h.get('score', 0)}")
            lines.append(f"综合评分：{final_score}（{len(hits)}个策略融合确认）🔥 高胜率信号！")

            return {
                "stock_code": code,
                "stock_name": stock_name,
                "score": final_score,
                "tags": self.tags,
                "signals": merged,
                "reason": "\n".join(lines),
            }
        except Exception:
            return None


# ===================================================================
# 获取所有内置策略
# ===================================================================
def get_builtin_strategies() -> list[BaseStrategy]:
    """返回所有内置策略实例列表（主升浪策略优先）"""
    return [
        # ---- 主升浪捕捉策略（实战买点） ----
        ThreeYinNotBreakYangStrategy(),     # 1. 三阴不破阳
        ShrinkingVolWashoutStrategy(),       # 2. 缩倍量洗盘
        ShadowProbeWashoutStrategy(),        # 3. 上影试盘+下影洗盘
        ConsecutiveYangShrinkStrategy(),     # 4. 连阳缩量横盘
        TripleFilterStrategy(),              # 5. 三重过滤验证
        # ---- 原有短线策略 ----
        MacdGoldenCrossStrategy(),           # 6. MACD金叉
        MacdDivergenceStrategy(),            # 7. MACD底背离
        KdjOversoldStrategy(),               # 8. KDJ超卖反弹
        RsiOversoldStrategy(),               # 9. RSI超跌反弹
        MaGoldenCrossStrategy(),             # 10. 均线金叉（短线）
        BreakMa20Strategy(),                 # 11. 放量突破MA20
        FirstLimitUpStrategy(),              # 12. 涨停首板
        BollingerBreakStrategy(),            # 13. 布林线突破
        ComboSignalStrategy(),               # 14. 组合信号（高胜率）
        PullbackRespectMaStrategy(),          # 15. 强势上涨+回调不破均线
        FusionStrategy(),                    # 16. 多策略融合（高胜率）
    ]
