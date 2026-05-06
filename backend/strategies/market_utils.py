import logging
import pandas as pd
from datetime import datetime, timedelta, date

logger = logging.getLogger(__name__)


def get_index_data(days: int = 400) -> pd.DataFrame:
    """获取上证指数历史数据用于市场环境判定（多源降级：Sina → 东方财富）"""
    import akshare as ak
    end = date.today()
    start = end - timedelta(days=days)

    df = None
    for src_name, fetcher in [
        ('Sina', lambda: ak.stock_zh_index_daily(symbol="sh000001")),
        ('东方财富', lambda: ak.stock_zh_index_daily_em(symbol="sh000001")),
    ]:
        try:
            df = fetcher()
            if df is not None and not df.empty:
                break
        except Exception as e:
            logger.warning(f"获取指数数据失败 [{src_name}]: {str(e)[:80]}")

    if df is None or df.empty:
        logger.warning("所有数据源均无法获取指数数据")
        return pd.DataFrame()

    # 统一列名（东方财富和 Sina 列名可能不同）
    rename_map = {}
    for col in ['date', '日期']:
        if col in df.columns:
            rename_map[col] = 'date'
    for col in ['open', '开盘']:
        if col in df.columns:
            rename_map[col] = 'open'
    for col in ['high', '最高']:
        if col in df.columns:
            rename_map[col] = 'high'
    for col in ['low', '最低']:
        if col in df.columns:
            rename_map[col] = 'low'
    for col in ['close', '收盘']:
        if col in df.columns:
            rename_map[col] = 'close'
    for col in ['volume', '成交量']:
        if col in df.columns:
            rename_map[col] = 'volume'
    df = df.rename(columns=rename_map)

    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date")
    elif df.index.dtype != "datetime64[ns]":
        df.index = pd.to_datetime(df.index)

    # 过滤日期范围（AKShare 可能返回全量数据）
    try:
        df = df[df.index >= pd.Timestamp(start)]
    except Exception:
        df = df.tail(days)
    return df


def classify_market_regime(index_df: pd.DataFrame) -> dict:
    """对指数每日市场环境分类"""
    if index_df.empty or len(index_df) < 60:
        return {}

    ma20 = index_df["close"].rolling(20).mean()
    ma60 = index_df["close"].rolling(60).mean()
    ma20_slope = ma20.diff(5)

    regimes = {}
    for i in range(60, len(index_df)):
        d = index_df.iloc[i]
        close = d["close"]
        m20 = ma20.iloc[i]
        m60 = ma60.iloc[i]
        slope = ma20_slope.iloc[i] if not pd.isna(ma20_slope.iloc[i]) else 0

        if close > m20 > m60 and slope > 0:
            regime = "strong_bull"
        elif close > m20 > m60:
            regime = "weak_bull"
        elif close < m20 < m60 and slope < 0:
            regime = "strong_bear"
        elif close < m20 < m60:
            regime = "weak_bear"
        else:
            regime = "sideways"

        regimes[index_df.index[i].strftime("%Y-%m-%d")] = regime

    return regimes


def get_regime_at_date(target_date, regimes: dict) -> str:
    """获取指定日期的市场环境"""
    if isinstance(target_date, pd.Timestamp):
        target_date = target_date.strftime("%Y-%m-%d")
    elif isinstance(target_date, date):
        target_date = target_date.strftime("%Y-%m-%d")

    if target_date in regimes:
        return regimes[target_date]

    dates = sorted(regimes.keys())
    for d in reversed(dates):
        if d <= target_date:
            return regimes[d]
    return "unknown"
