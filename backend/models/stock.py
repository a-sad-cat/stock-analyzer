"""
# ========================================
# 股票相关数据库模型
# Stock: 股票基本信息
# StockDaily: 日K线数据
# ========================================
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Index, func

from database import Base


class SearchHistory(Base):
    """搜索历史表"""
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    keyword = Column(String(100), nullable=False, index=True, comment="搜索关键词")
    created_at = Column(DateTime, server_default=func.now(), comment="搜索时间")

    def __repr__(self):
        return f"<SearchHistory(keyword={self.keyword})>"


class Stock(Base):
    """股票基本信息表"""
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, index=True, nullable=False, comment="股票代码")
    name = Column(String(50), nullable=False, comment="股票名称")
    market = Column(String(10), nullable=False, comment="市场: SH/SZ/BJ")
    industry = Column(String(50), default="", comment="所属行业")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<Stock(code={self.code}, name={self.name}, market={self.market})>"


class StockDaily(Base):
    """股票日K线数据表"""
    __tablename__ = "stock_daily"
    __table_args__ = (
        Index('idx_code_date', 'code', 'date', unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, comment="股票代码")
    date = Column(Date, nullable=False, comment="交易日期")
    open = Column(Float, comment="开盘价")
    high = Column(Float, comment="最高价")
    low = Column(Float, comment="最低价")
    close = Column(Float, comment="收盘价")
    volume = Column(Float, comment="成交量（股）")
    amount = Column(Float, comment="成交额（元）")
    pct_chg = Column(Float, comment="涨跌幅（%）")
    ma5 = Column(Float, default=None, comment="5日均线")
    ma10 = Column(Float, default=None, comment="10日均线")
    ma20 = Column(Float, default=None, comment="20日均线")
    ma60 = Column(Float, default=None, comment="60日均线")
    dif = Column(Float, default=None, comment="MACD DIF")
    dea = Column(Float, default=None, comment="MACD DEA")
    macd = Column(Float, default=None, comment="MACD柱")
    rsi = Column(Float, default=None, comment="RSI")
    k = Column(Float, default=None, comment="KDJ K值")
    d = Column(Float, default=None, comment="KDJ D值")
    j = Column(Float, default=None, comment="KDJ J值")
    vol_ma5 = Column(Float, default=None, comment="5日均量")
    bb_upper = Column(Float, default=None, comment="布林上轨")
    bb_lower = Column(Float, default=None, comment="布林下轨")

    def __repr__(self):
        return f"<StockDaily(code={self.code}, date={self.date}, close={self.close})>"
