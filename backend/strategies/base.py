"""
# ========================================
# 策略基类
# 所有策略（内置和自定义）都继承自 BaseStrategy
# ========================================
"""

from abc import ABC, abstractmethod
from typing import Any
import pandas as pd


class BaseStrategy(ABC):
    """策略基类"""

    def __init__(self, name: str, description: str = "", strategy_type: str = "builtin"):
        self.name = name
        self.description = description
        self.type = strategy_type  # builtin / custom
        self.config: dict = {}

    @abstractmethod
    def evaluate(self, code: str, name: str, df: pd.DataFrame) -> dict | None:
        """
        对某只股票执行策略评估

        参数:
            code: 股票代码
            name: 股票名称
            df: 日K线DataFrame（含技术指标）

        返回:
            如果匹配，返回 dict:
                {
                    "stock_code": code,
                    "stock_name": name,
                    "score": float (0-100),
                    "signals": dict (关键信号值),
                    "reason": str (匹配原因)
                }
            如果不匹配，返回 None
        """
        pass

    def get_config(self) -> dict:
        """获取策略配置"""
        return self.config

    def set_config(self, config: dict):
        """设置策略配置"""
        self.config = config


class StrategyResult:
    """策略评估结果"""
    def __init__(self, stock_code: str, stock_name: str, score: float,
                 signals: dict, reason: str):
        self.stock_code = stock_code
        self.stock_name = stock_name
        self.score = score
        self.signals = signals
        self.reason = reason
