from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, JSON, ForeignKey, func
from database import Base


class BacktestRun(Base):
    """回测运行记录"""
    __tablename__ = "backtest_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, nullable=False, index=True, comment="策略ID")
    strategy_name = Column(String(100), default="", comment="策略名称")
    start_date = Column(Date, nullable=False, comment="回测开始日期")
    end_date = Column(Date, nullable=False, comment="回测结束日期")
    stock_limit = Column(Integer, default=200, comment="扫描股票数")
    min_score = Column(Float, default=60, comment="最低评分")
    exit_config = Column(JSON, default=dict, comment="退出规则配置")

    total_signals = Column(Integer, default=0, comment="总信号次数")
    win_count = Column(Integer, default=0, comment="盈利次数")
    loss_count = Column(Integer, default=0, comment="亏损次数")
    win_rate = Column(Float, default=0, comment="胜率")
    avg_return = Column(Float, default=0, comment="平均收益率")
    median_return = Column(Float, default=0, comment="收益中位数")
    max_return = Column(Float, default=0, comment="最大单笔收益")
    min_return = Column(Float, default=0, comment="最小单笔收益")
    total_return_pct = Column(Float, default=0, comment="累计收益率")
    max_drawdown = Column(Float, default=0, comment="最大回撤")
    avg_hold_days = Column(Float, default=0, comment="平均持有天数")
    profit_loss_ratio = Column(Float, default=0, comment="盈亏比")

    exit_reason_dist = Column(JSON, default=dict, comment="退出原因分布")
    regime_breakdown = Column(JSON, default=dict, comment="市场环境分组统计")
    hold_days_dist = Column(JSON, default=dict, comment="持有天数分布")
    daily_equity = Column(JSON, default=list, comment="每日累计收益曲线")

    status = Column(String(20), default="running", comment="running/done/error")
    error_msg = Column(Text, default="", comment="错误信息")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")


class BacktestTrade(Base):
    """回测交易明细"""
    __tablename__ = "backtest_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("backtest_runs.id"), index=True, nullable=False, comment="回测运行ID")
    strategy_id = Column(Integer, nullable=False, comment="策略ID")
    stock_code = Column(String(10), nullable=False, comment="股票代码")
    stock_name = Column(String(50), default="", comment="股票名称")
    signal_date = Column(Date, nullable=False, comment="信号日期")
    entry_price = Column(Float, default=0, comment="入场价格")
    score = Column(Float, default=0, comment="信号评分")
    regime = Column(String(20), default="", comment="信号时刻市场环境")

    exit_date = Column(Date, nullable=True, comment="退出日期")
    exit_price = Column(Float, default=0, comment="退出价格")
    holding_return = Column(Float, default=0, comment="持仓收益率")
    max_drawdown = Column(Float, default=0, comment="持仓期最大回撤")
    peak_return = Column(Float, default=0, comment="持仓期最高浮盈")
    hold_days = Column(Integer, default=0, comment="持有天数")
    exit_reason = Column(String(50), default="", comment="退出原因")

    daily_log = Column(JSON, default=list, comment="逐日持仓日志")
    signals = Column(JSON, default=dict, comment="策略信号值")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
