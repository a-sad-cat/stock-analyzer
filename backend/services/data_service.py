"""
# ========================================
# 数据源服务
# 使用 AKShare（新浪数据源）获取A股数据，带本地缓存
# ========================================
"""

import time
import logging
from datetime import datetime, timedelta, date
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models.stock import Stock, StockDaily
from database import SessionLocal

logger = logging.getLogger(__name__)


# ---------- 缓存检查 ----------
def _need_refresh(db: Session, code: str, days: int = 60) -> bool:
    """检查本地是否有足够的K线数据"""
    from config import CACHE_EXPIRE_HOURS
    cutoff = date.today() - timedelta(days=days)
    count = db.query(StockDaily).filter(
        StockDaily.code == code,
        StockDaily.date >= cutoff
    ).count()
    # 如果数据不足或过期则刷新
    if count < days * 0.6:  # 允许丢失一些交易日
        return True
    # 检查最新数据是否在缓存时间内
    latest = db.query(StockDaily).filter(
        StockDaily.code == code
    ).order_by(StockDaily.date.desc()).first()
    if latest:
        days_since = (date.today() - latest.date).days
        if days_since > CACHE_EXPIRE_HOURS / 24 + 1:  # 超过缓存时间
            return True
    return False


INDICATOR_MAP = {
    'MA5': 'ma5', 'MA10': 'ma10', 'MA20': 'ma20', 'MA60': 'ma60',
    'DIF': 'dif', 'DEA': 'dea', 'MACD': 'macd',
    'RSI': 'rsi', 'K': 'k', 'D': 'd', 'J': 'j',
    'VOL_MA5': 'vol_ma5', 'BB_UPPER': 'bb_upper', 'BB_LOWER': 'bb_lower',
}


def _save_daily_data(db: Session, code: str, df: pd.DataFrame):
    if df is None or df.empty:
        return
    has_indicators = any(c in df.columns for c in INDICATOR_MAP)
    for _, row in df.iterrows():
        try:
            existing = db.query(StockDaily).filter(
                StockDaily.code == code,
                StockDaily.date == row['date']
            ).first()
            if existing:
                if has_indicators and existing.ma5 is None:
                    for df_col, db_col in INDICATOR_MAP.items():
                        if df_col in df.columns and pd.notna(row.get(df_col)):
                            setattr(existing, db_col, round(float(row[df_col]), 4))
                    db.add(existing)
                continue
            daily = StockDaily(
                code=code,
                date=row['date'],
                open=float(row['open']) if pd.notna(row['open']) else None,
                high=float(row['high']) if pd.notna(row['high']) else None,
                low=float(row['low']) if pd.notna(row['low']) else None,
                close=float(row['close']) if pd.notna(row['close']) else None,
                volume=float(row['volume']) if pd.notna(row['volume']) else None,
                amount=float(row['amount']) if pd.notna(row['amount']) else None,
                pct_chg=float(row['pct_chg']) if pd.notna(row['pct_chg']) else None,
            )
            if has_indicators:
                for df_col, db_col in INDICATOR_MAP.items():
                    if df_col in df.columns and pd.notna(row.get(df_col)):
                        setattr(daily, db_col, round(float(row[df_col]), 4))
            db.add(daily)
        except Exception as e:
            logger.warning(f"保存日K数据出错 ({code}, {row.get('date')}): {e}")
    db.commit()


# ---------- 公开接口 ----------
def get_all_stocks(db: Session = None) -> list[dict]:
    """
    获取所有A股列表
    先从 AKShare 拉取，再存入本地数据库
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        # 先从本地数据库获取
        stocks = db.query(Stock).all()
        if stocks and len(stocks) > 1000:
            return [{"code": s.code, "name": s.name, "market": s.market, "industry": s.industry} for s in stocks]

        # 本地没有，从 AKShare（新浪数据源）获取
        import akshare as ak
        logger.info("从 AKShare（新浪源）获取A股列表...")
        try:
            df = ak.stock_zh_a_spot()
            df = df[['代码', '名称']].rename(columns={'代码': 'code', '名称': 'name'})
            df['market'] = df['code'].apply(lambda x: 'SH' if x.startswith(('6', '9')) else 'SZ' if x.startswith(('0', '3', '2')) else 'BJ')
            df['industry'] = ''
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

        # 标准化列名
        if 'code' not in df.columns:
            for col, alt in [('code', '代码'), ('name', '名称'), ('market', '交易所'), ('industry', '行业')]:
                if col not in df.columns and alt in df.columns:
                    df = df.rename(columns={alt: col})

        # 处理市场分类
        if 'market' not in df.columns:
            df['market'] = df['code'].apply(
                lambda x: 'SH' if str(x).startswith(('6', '9')) else 'SZ' if str(x).startswith(('0', '3', '2')) else 'BJ'
            )
        if 'industry' not in df.columns:
            df['industry'] = ''

        # 保存到数据库
        for _, row in df.iterrows():
            code = str(row['code']).zfill(6)
            existing = db.query(Stock).filter(Stock.code == code).first()
            if not existing:
                stock = Stock(
                    code=code,
                    name=str(row['name']),
                    market=str(row.get('market', 'SH')),
                    industry=str(row.get('industry', '')),
                )
                db.add(stock)
        db.commit()

        stocks = db.query(Stock).all()
        return [{"code": s.code, "name": s.name, "market": s.market, "industry": s.industry} for s in stocks]
    finally:
        if close_db:
            db.close()


def get_daily_data(code: str, start_date: str = None, end_date: str = None) -> pd.DataFrame:
    """
    获取个股日K线数据（从AKShare获取，缓存到本地数据库）
    返回包含技术指标的 DataFrame
    """
    db = SessionLocal()
    try:
        if end_date is None:
            end_date = date.today().strftime("%Y%m%d")
        if start_date is None:
            start_date = (date.today() - timedelta(days=365)).strftime("%Y%m%d")

        start_dt = datetime.strptime(start_date, "%Y%m%d").date()
        end_dt = datetime.strptime(end_date, "%Y%m%d").date()
        days_needed = (end_dt - start_dt).days

        if not _need_refresh(db, code, max(days_needed, 60)):
            records = db.query(StockDaily).filter(
                StockDaily.code == code,
                StockDaily.date >= start_dt,
                StockDaily.date <= end_dt
            ).order_by(StockDaily.date.asc()).all()
            if records:
                data = {
                    'date': [r.date for r in records],
                    'open': [r.open for r in records],
                    'high': [r.high for r in records],
                    'low': [r.low for r in records],
                    'close': [r.close for r in records],
                    'volume': [r.volume for r in records],
                    'amount': [r.amount for r in records],
                    'pct_chg': [r.pct_chg for r in records],
                }
                for df_col, db_col in INDICATOR_MAP.items():
                    vals = [getattr(r, db_col) for r in records]
                    if any(v is not None for v in vals):
                        data[df_col] = vals
                df_result = pd.DataFrame(data).set_index('date')
                if df_result.index.duplicated().any():
                    df_result = df_result[~df_result.index.duplicated(keep='first')]
                # 如果 DB 里有缓存指标，跳过重新计算
                if 'MA5' in data:
                    return df_result
                return _add_technical_indicators(df_result)

        import akshare as ak
        logger.info(f"从 AKShare 获取 {code} 的日K数据...")
        time.sleep(0.3)

        if code.startswith(('6', '9')):
            market_prefix = 'sh'
        elif code.startswith(('0', '3', '2')):
            market_prefix = 'sz'
        else:
            market_prefix = 'bj'

        try:
            df = ak.stock_zh_a_daily(symbol=f"{market_prefix}{code}",
                                     start_date=start_date, end_date=end_date)
        except Exception as e:
            logger.warning(f"获取 {code} 数据失败: {e}")
            return pd.DataFrame()

        if df is None or df.empty:
            return pd.DataFrame()

        df = df.rename(columns={
            'Date': 'date', 'Open': 'open', 'Close': 'close',
            'High': 'high', 'Low': 'low', 'Volume': 'volume', 'Amount': 'amount',
        })
        df['date'] = pd.to_datetime(df['date']).dt.date
        if 'pct_chg' not in df.columns:
            df['pct_chg'] = df['close'].pct_change() * 100
        df = df.drop_duplicates(subset=['date'])

        # 保存到数据库
        _save_daily_data(db, code, df)

        # 从数据库重新读取
        records = db.query(StockDaily).filter(
            StockDaily.code == code,
            StockDaily.date >= start_dt,
            StockDaily.date <= end_dt
        ).order_by(StockDaily.date.asc()).all()

        if not records:
            return pd.DataFrame()

        data = {
            'date': [r.date for r in records],
            'open': [float(r.open) if r.open else 0 for r in records],
            'high': [float(r.high) if r.high else 0 for r in records],
            'low': [float(r.low) if r.low else 0 for r in records],
            'close': [float(r.close) if r.close else 0 for r in records],
            'volume': [float(r.volume) if r.volume else 0 for r in records],
            'amount': [float(r.amount) if r.amount else 0 for r in records],
            'pct_chg': [float(r.pct_chg) if r.pct_chg else 0 for r in records],
        }
        df_result = pd.DataFrame(data).set_index('date')
        if df_result.index.duplicated().any():
            df_result = df_result[~df_result.index.duplicated(keep='first')]
        df_result = _add_technical_indicators(df_result)
        _save_daily_data(db, code, df_result.reset_index())
        return df_result

    finally:
        db.close()


def _add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """手动计算技术指标（无需 pandas-ta，纯 numpy/pandas 实现）"""
    try:
        close = df['close']
        high = df['high']
        low = df['low']
        volume = df['volume']

        # 均线
        df['MA5'] = close.rolling(window=5).mean()
        df['MA10'] = close.rolling(window=10).mean()
        df['MA20'] = close.rolling(window=20).mean()
        df['MA60'] = close.rolling(window=60).mean()
        df['MA120'] = close.rolling(window=120).mean()

        # MACD（EMA 算法）
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        df['DIF'] = ema12 - ema26
        df['DEA'] = df['DIF'].ewm(span=9, adjust=False).mean()
        df['MACD'] = 2 * (df['DIF'] - df['DEA'])

        # RSI
        delta = close.diff()
        gain = delta.where(delta > 0, 0)
        loss = (-delta).where(delta < 0, 0)
        avg_gain = gain.rolling(window=14).mean()
        avg_loss = loss.rolling(window=14).mean()
        rs = avg_gain / avg_loss.replace(0, float('nan'))
        df['RSI'] = 100 - (100 / (1 + rs))

        # KDJ
        low_9 = low.rolling(window=9).min()
        high_9 = high.rolling(window=9).max()
        rsv = 100 * ((close - low_9) / (high_9 - low_9).replace(0, float('nan')))
        df['K'] = rsv.ewm(com=2, adjust=False).mean()
        df['D'] = df['K'].ewm(com=2, adjust=False).mean()
        df['J'] = 3 * df['K'] - 2 * df['D']

        # 成交量均线
        df['VOL_MA5'] = volume.rolling(window=5).mean()
        df['VOL_MA10'] = volume.rolling(window=10).mean()

        # 布林带
        df['BB_MID'] = close.rolling(window=20).mean()
        bb_std = close.rolling(window=20).std()
        df['BB_UPPER'] = df['BB_MID'] + 2 * bb_std
        df['BB_LOWER'] = df['BB_MID'] - 2 * bb_std

    except Exception as e:
        logger.warning(f"计算技术指标失败: {e}")

    return df


def get_realtime_quotes() -> pd.DataFrame:
    """
    获取实时行情（今日）
    返回包含涨跌幅、成交量等实时数据的 DataFrame
    """
    import akshare as ak
    logger.info("从 AKShare（新浪源）获取实时行情...")
    try:
        df = ak.stock_zh_a_spot()
        # 标准化列名（新浪源字段偏少，只有基础行情）
        col_map = {
            '代码': 'code', '名称': 'name', '最新价': 'close', '涨跌幅': 'pct_chg',
            '涨跌额': 'change', '成交量': 'volume', '成交额': 'amount',
            '今开': 'open', '最高': 'high', '最低': 'low',
            '昨收': 'pre_close',
        }
        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})
        return df
    except Exception as e:
        logger.error(f"获取实时行情失败: {e}")
        return pd.DataFrame()


_spot_cache: dict = {}
_spot_cache_time = 0

def _get_spot_map(allow_fetch=True) -> dict:
    """获取实时行情映射 {code -> {close, pct_chg}}
    allow_fetch=True: 缓存过期时重新拉取（可能会等 20-30s）
    allow_fetch=False: 缓存过期时返回空 dict，不阻塞
    """
    global _spot_cache, _spot_cache_time
    now = time.time()
    if now - _spot_cache_time < 60 and _spot_cache:
        return _spot_cache
    if not allow_fetch:
        return _spot_cache or {}
    _spot_cache = {}
    try:
        import akshare as ak
        df = ak.stock_zh_a_spot()
        for _, row in df.iterrows():
            raw_code = str(row['代码'])
            bare_code = raw_code[2:] if raw_code.startswith(('sh', 'sz', 'bj')) else raw_code
            _spot_cache[bare_code] = {
                'close': round(float(row.get('最新价', 0)), 2),
                'pct_chg': round(float(row.get('涨跌幅', 0)), 2),
            }
        _spot_cache_time = now
    except Exception:
        pass
    return _spot_cache


def search_stocks(keyword: str, db: Session = None) -> list[dict]:
    """搜索股票（按代码或名称模糊匹配），含实时行情"""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        get_all_stocks(db)
        query = db.query(Stock).filter(
            (Stock.code.like(f"%{keyword}%")) | (Stock.name.like(f"%{keyword}%"))
        ).limit(20).all()

        spot_map = _get_spot_map(allow_fetch=False)
        return [
            {
                "code": s.code, "name": s.name, "market": s.market, "industry": s.industry,
                "close": spot_map.get(s.code, {}).get('close'),
                "pct_chg": spot_map.get(s.code, {}).get('pct_chg'),
            }
            for s in query
        ]
    finally:
        if close_db:
            db.close()


def get_stock_detail(code: str) -> dict:
    """获取个股详细信息（基本信息+最近K线+技术指标）"""
    # 基本信息
    db = SessionLocal()
    try:
        stock = db.query(Stock).filter(Stock.code == code).first()
    finally:
        db.close()

    # K线数据
    df = get_daily_data(code)
    if df.empty:
        return {"code": code, "name": stock.name if stock else code, "error": "没有数据"}

    recent = df.tail(365).copy()

    latest = recent.iloc[-1]
    signals = {}
    for col in ['MA5', 'MA10', 'MA20', 'MA60', 'DIF', 'DEA', 'MACD', 'RSI', 'K', 'D', 'J',
                'VOL_MA5', 'VOL_MA10', 'BB_UPPER', 'BB_MID', 'BB_LOWER']:
        if col in recent.columns and pd.notna(latest.get(col)):
            signals[col] = round(float(latest[col]), 2)

    if len(recent) >= 2:
        prev = recent.iloc[-2]
        signals['pre_close'] = round(float(prev['close']), 2) if pd.notna(prev.get('close')) else None

    kline_data = []
    for idx, row in recent.iterrows():
        item = {
            'date': str(idx),
            'open': round(float(row['open']), 2),
            'high': round(float(row['high']), 2),
            'low': round(float(row['low']), 2),
            'close': round(float(row['close']), 2),
            'volume': float(row['volume']),
            'pct_chg': round(float(row['pct_chg']), 2) if pd.notna(row.get('pct_chg')) else 0,
        }
        for col in ['MA5', 'MA10', 'MA20', 'MA60', 'DIF', 'DEA', 'MACD', 'RSI', 'K', 'D', 'J',
                    'VOL_MA5', 'BB_UPPER', 'BB_LOWER']:
            if col in recent.columns and pd.notna(row.get(col)):
                item[col] = round(float(row[col]), 2)
        kline_data.append(item)

    return {
        "code": code,
        "name": stock.name if stock else code,
        "market": stock.market if stock else "",
        "industry": stock.industry if stock else "",
        "latest": {
            "close": round(float(latest['close']), 2) if pd.notna(latest.get('close')) else 0,
            "pct_chg": round(float(latest['pct_chg']), 2) if pd.notna(latest.get('pct_chg')) else 0,
            "volume": float(latest['volume']),
            "amount": float(latest['amount']),
            **signals,
        },
        "kline": kline_data,
    }
