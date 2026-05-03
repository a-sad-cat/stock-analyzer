"""
板块数据模型
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, PrimaryKeyConstraint

from database import Base


class Sector(Base):
    """板块表"""
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True, comment="板块名称")
    sector_type = Column(String(20), nullable=False, comment="concept 概念 / industry 行业")
    source_id = Column(String(50), default="", comment="AKShare 原始标识")
    stock_count = Column(Integer, default=0, comment="成分股数量")
    created_at = Column(DateTime, comment="创建时间")
    updated_at = Column(DateTime, comment="更新时间")

    def __repr__(self):
        return f"<Sector(name={self.name}, type={self.sector_type})>"


class StockSector(Base):
    """股票-板块映射表"""
    __tablename__ = "stock_sectors"

    stock_code = Column(String(10), nullable=False, comment="股票代码")
    sector_id = Column(Integer, nullable=False, comment="板块ID")
    __table_args__ = (
        PrimaryKeyConstraint("stock_code", "sector_id"),
    )

    def __repr__(self):
        return f"<StockSector(code={self.stock_code}, sector_id={self.sector_id})>"
