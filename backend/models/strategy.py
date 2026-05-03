"""
# ========================================
# 策略相关数据库模型
# Strategy: 策略定义
# StrategyResult: 策略扫描结果
# ========================================
"""

from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, func

from database import Base


class Strategy(Base):
    """策略定义表"""
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, comment="策略名称")
    description = Column(Text, default="", comment="策略描述")
    type = Column(String(20), nullable=False, default="custom", comment="策略类型: builtin/custom")
    config = Column(JSON, default=dict, comment="策略配置（JSON格式）")
    enabled = Column(Integer, default=1, comment="是否启用: 0/1")
    sort_order = Column(Integer, default=0, comment="排序序号")
    last_run = Column(DateTime, nullable=True, comment="上次运行时间")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")

    def __repr__(self):
        return f"<Strategy(id={self.id}, name={self.name}, type={self.type})>"


class StrategyResult(Base):
    """策略扫描结果表"""
    __tablename__ = "strategy_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, nullable=False, index=True, comment="策略ID")
    strategy_name = Column(String(100), default="", comment="策略名称")
    stock_code = Column(String(10), nullable=False, comment="股票代码")
    stock_name = Column(String(50), default="", comment="股票名称")
    score = Column(Float, default=0, comment="匹配评分(0-100)")
    signals = Column(JSON, default=dict, comment="关键信号值（JSON）")
    reason = Column(Text, default="", comment="匹配原因描述")
    created_at = Column(DateTime, server_default=func.now(), index=True, comment="创建时间")
