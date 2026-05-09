"""
# ========================================
# LLM AI 分析 API 路由
# /api/llm/*
# ========================================
"""

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.llm_service import get_analysis_engine, AnalysisResult, collect_extra_context
from services.data_service import get_daily_data
from models.stock import Stock

logger = logging.getLogger(__name__)

router = APIRouter()

# ============ AI 对话助手系统提示词 ============
FINANCIAL_ASSISTANT_PROMPT = """你是一位专业的 A 股量化金融分析师助手，具备以下能力：

1. **技术分析**：精通均线、MACD、RSI、KDJ、布林带、成交量等技术指标解读
2. **策略研判**：理解多种A股交易策略（MACD金叉、均线突破、量价关系、N字战法等）
3. **风险控制**：能给出止损位、仓位建议、风险评估
4. **市场解读**：结合大盘环境、板块轮动、资金流向做综合判断
5. **操作建议**：给出明确的买入/持有/卖出/观望建议，附带逻辑和风险提示

回复原则：
- 简洁有力，要点分明，多用数据支撑观点
- 不确定时明确告知，不编造信息
- 重要结论前加 ⚠️ 风险提示
- 用口语化、易懂的语言解释专业概念
- 每次回复控制在300字以内，除非用户要求详细分析
- 不提供具体买卖价格建议，只给出分析框架和参考区间"""


# ---------- Pydantic 模型 ----------
class AnalyzeRequest(BaseModel):
    code: str
    name: Optional[str] = None
    days: int = 90


class AnalyzeBatchRequest(BaseModel):
    codes: list[str]  # 股票代码列表
    days: int = 90
    delay_seconds: float = 1.0


class StrategyHitInfo(BaseModel):
    strategy_name: str
    score: float
    reason: str


class AnalyzeResponse(BaseModel):
    code: str
    name: str
    success: bool
    error_message: str = ""
    sentiment_score: int = 50
    trend_prediction: str = "震荡"
    operation_advice: str = "观望"
    confidence_level: str = "中"
    analysis_summary: str = ""
    risk_factors: list[str] = []
    key_signals: list[str] = []
    target_price_high: Optional[float] = None
    target_price_low: Optional[float] = None
    stop_loss_price: Optional[float] = None
    model_used: str = ""
    tokens_used: int = 0
    elapsed_seconds: float = 0.0


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]  # 对话历史
    stock_code: Optional[str] = None  # 可选：附带股票代码，自动注入该股票数据上下文


class ChatResponse(BaseModel):
    reply: str
    model: str = ""
    tokens: int = 0


def _result_to_response(r: AnalysisResult) -> dict:
    """将 AnalysisResult 转为 API 响应字典"""
    return {
        "code": r.code,
        "name": r.name,
        "success": r.success,
        "error_message": r.error_message,
        "sentiment_score": r.sentiment_score,
        "trend_prediction": r.trend_prediction,
        "operation_advice": r.operation_advice,
        "confidence_level": r.confidence_level,
        "analysis_summary": r.analysis_summary,
        "risk_factors": r.risk_factors,
        "key_signals": r.key_signals,
        "target_price_high": r.target_price_high,
        "target_price_low": r.target_price_low,
        "stop_loss_price": r.stop_loss_price,
        "model_used": r.model_used,
        "tokens_used": r.tokens_used,
        "elapsed_seconds": r.elapsed_seconds,
        "data_sources": r.data_sources,
    }


# ---------- API 端点 ----------
@router.get("/status")
def api_llm_status():
    """检查 LLM 分析引擎状态"""
    engine = get_analysis_engine()
    return {
        "available": engine.is_available,
        "provider": engine.client._provider if engine.is_available else "未配置",
        "model": engine.client._model if engine.is_available else "未配置",
    }


@router.post("/chat", response_model=ChatResponse)
def api_chat(req: ChatRequest):
    """
    AI 金融助手对话接口

    支持多轮对话，自动注入金融专家人设。
    可选传入 stock_code，将自动附加该股票最新 K 线数据和技术指标作为上下文。
    """
    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(status_code=503, detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY")

    # 构建消息列表
    messages = [{"role": "system", "content": FINANCIAL_ASSISTANT_PROMPT}]

    # 如果传入了股票代码，自动注入数据上下文
    if req.stock_code:
        try:
            db = next(get_db())
            stock = db.query(Stock).filter(Stock.code == req.stock_code).first()
            if stock:
                df = get_daily_data(req.stock_code)
                if not df.empty:
                    latest = df.iloc[-1]
                    context_parts = [f"[系统注入] 用户正在关注股票 {req.stock_code}（{stock.name}），以下是实时数据：\n"]
                    # 最新行情
                    context_parts.append(f"- 最新价: {latest.get('close', 'N/A')}，涨跌幅: {latest.get('pct_chg', 'N/A')}%")
                    context_parts.append(f"- 成交量: {latest.get('volume', 'N/A')}，成交额: {latest.get('amount', 'N/A')}")
                    # 技术指标
                    for label, key in [('MA5', 'MA5'), ('MA10', 'MA10'), ('MA20', 'MA20'), (None, None)]:
                        if key and key in df.columns and pd.notna(latest.get(key)):
                            context_parts.append(f"- {label}: {round(float(latest[key]), 2)}")
                    context_parts.append("- 请在回复中结合以上数据进行分析。")
                    messages.append({"role": "system", "content": "\n".join(context_parts)})
        except Exception as e:
            logger.warning(f"注入股票数据上下文失败: {e}")

    # 追加用户对话历史
    for msg in req.messages:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        content, tokens = engine.client.chat_conversation(messages)
        return ChatResponse(
            reply=content,
            model=engine.client._model,
            tokens=tokens,
        )
    except Exception as e:
        logger.error(f"对话请求失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI 服务异常: {str(e)}")


@router.post("/analyze")
def api_analyze_stock(req: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    对单只股票进行 AI 分析

    根据最近 N 日 K 线数据 + 技术指标 + 当日策略命中结果，调用 LLM 进行综合研判。
    """
    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="股票代码不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 获取股票名称
    name = req.name or _get_stock_name(code, db)

    # 获取 K 线数据
    kline_df = _get_kline(code, days=max(30, req.days))
    if kline_df is None:
        raise HTTPException(status_code=404, detail=f"未找到 {code} 的K线数据")

    # 获取今日策略命中结果
    strategy_hits = _get_today_strategy_hits(code, db)

    # 采集多维度上下文（板块 + 新闻 + 公告）
    extra_context = collect_extra_context(code, db_session=db)

    # 调用 LLM 分析
    result = engine.analyze(
        code=code,
        name=name,
        kline_df=kline_df,
        strategy_hits=strategy_hits,
        extra_context=extra_context,
    )

    return _result_to_response(result)


@router.post("/analyze-batch")
def api_analyze_batch(req: AnalyzeBatchRequest, db: Session = Depends(get_db)):
    """
    批量 AI 分析多只股票

    对列表中每只股票依次调用 LLM 分析，带延迟避免限流。
    """
    if not req.codes:
        raise HTTPException(status_code=400, detail="股票代码列表不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 限制批量数量
    if len(req.codes) > 20:
        raise HTTPException(status_code=400, detail="单次批量分析最多 20 只股票")

    results = []
    for code in req.codes:
        code = code.strip()
        if not code:
            continue

        try:
            name = _get_stock_name(code, db)
            kline_df = _get_kline(code, days=max(30, req.days))
            if kline_df is None or kline_df.empty:
                results.append({
                    "code": code,
                    "name": name,
                    "success": False,
                    "error_message": "K线数据为空",
                    "sentiment_score": 50,
                    "trend_prediction": "震荡",
                    "operation_advice": "观望",
                    "confidence_level": "中",
                    "analysis_summary": "",
                    "risk_factors": [],
                    "key_signals": [],
                    "target_price_high": None,
                    "target_price_low": None,
                    "stop_loss_price": None,
                    "model_used": "",
                    "tokens_used": 0,
                    "elapsed_seconds": 0,
                })
                continue

            strategy_hits = _get_today_strategy_hits(code, db)
            result = engine.analyze(
                code=code,
                name=name,
                kline_df=kline_df,
                strategy_hits=strategy_hits,
            )
            results.append(_result_to_response(result))

            if len(results) < len(req.codes):
                import time
                time.sleep(req.delay_seconds)

        except Exception as e:
            logger.error(f"批量分析 {code} 失败: {e}")
            results.append({
                "code": code,
                "name": code,
                "success": False,
                "error_message": str(e),
                "sentiment_score": 50,
                "trend_prediction": "震荡",
                "operation_advice": "观望",
                "confidence_level": "中",
                "analysis_summary": "",
                "risk_factors": [],
                "key_signals": [],
                "target_price_high": None,
                "target_price_low": None,
                "stop_loss_price": None,
                "model_used": "",
                "tokens_used": 0,
                "elapsed_seconds": 0,
            })

    return {
        "total": len(results),
        "results": results,
    }


@router.post("/analyze-with-scan")
def api_analyze_with_scan(
    code: str = Query(..., description="股票代码"),
    strategy_id: Optional[int] = Query(None, description="策略ID（None=使用全部命中结果）"),
    db: Session = Depends(get_db),
):
    """
    对单只股票运行策略扫描 + LLM 综合分析

    先对股票运行已有策略筛选，再将命中结果交给 LLM 做综合研判。
    """
    code = code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="股票代码不能为空")

    engine = get_analysis_engine()
    if not engine.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM 分析引擎未配置，请在环境变量中设置 LLM_API_KEY",
        )

    # 获取股票名称
    name = _get_stock_name(code, db)

    # 获取 K 线数据
    kline_df = _get_kline(code, days=90)
    if kline_df is None:
        raise HTTPException(status_code=404, detail=f"未找到 {code} 的K线数据")

    # 运行策略扫描（对这只股票）
    scan_results = _run_scan_for_stock(code, db, strategy_id)
    strategy_hits = [
        {
            "strategy_name": r["strategy_name"],
            "score": r["score"],
            "reason": r["reason"],
        }
        for r in scan_results
    ]

    # 采集多维度上下文
    extra_context = collect_extra_context(code, db_session=db)

    # 调用 LLM 分析
    result = engine.analyze(
        code=code,
        name=name,
        kline_df=kline_df,
        strategy_hits=strategy_hits,
        extra_context=extra_context,
    )

    response = _result_to_response(result)
    response["scan_results"] = scan_results
    return response


# ---------- 内部辅助函数 ----------
def _get_kline(code: str, days: int = 90):
    """获取 K 线数据，自动计算起始日期"""
    start = (date.today() - timedelta(days=days + 10)).strftime("%Y%m%d")
    end = date.today().strftime("%Y%m%d")
    df = get_daily_data(code, start_date=start, end_date=end)
    if df is not None and hasattr(df, 'empty') and df.empty:
        return None
    return df


def _get_stock_name(code: str, db: Session) -> str:
    """从数据库获取股票名称"""
    stock = db.query(Stock).filter(Stock.code == code).first()
    return stock.name if stock else code


def _get_today_strategy_hits(code: str, db: Session) -> list[dict]:
    """获取股票今日策略命中结果"""
    from datetime import date
    from sqlalchemy import and_
    from models.strategy import StrategyResult

    today = date.today()
    rows = (
        db.query(StrategyResult)
        .filter(
            and_(
                StrategyResult.stock_code == code,
                StrategyResult.created_at >= today,
            )
        )
        .order_by(StrategyResult.score.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "strategy_name": row.strategy_name,
            "score": row.score,
            "reason": row.reason,
        }
        for row in rows
    ]


def _run_scan_for_stock(
    code: str, db: Session, strategy_id: Optional[int] = None
) -> list[dict]:
    """对单只股票运行策略扫描"""
    from models.strategy import Strategy, StrategyResult
    from strategies.engine import _init_builtin_strategies, _builtin_strategies
    from strategies.engine import CustomStrategyExecutor
    from datetime import datetime

    # 确保内置策略已初始化
    if not _builtin_strategies:
        _init_builtin_strategies(db)

    # 获取要使用的策略列表
    if strategy_id:
        strategies = [db.query(Strategy).filter(Strategy.id == strategy_id).first()]
    else:
        strategies = db.query(Strategy).filter(Strategy.enabled == 1).all()

    strategies = [s for s in strategies if s is not None]
    if not strategies:
        return []

    # 获取 K 线数据
    start = (date.today() - timedelta(days=130)).strftime("%Y%m%d")
    end = date.today().strftime("%Y%m%d")
    df = get_daily_data(code, start_date=start, end_date=end)
    if df is None or (hasattr(df, 'empty') and df.empty):
        return []

    results = []
    now = datetime.now()

    for strategy in strategies:
        try:
            # 获取策略执行器
            if strategy.type == "builtin" and strategy.id in _builtin_strategies:
                executor = _builtin_strategies[strategy.id]
            elif strategy.config:
                executor = CustomStrategyExecutor(
                    strategy.name, strategy.description, strategy.config or {}
                )
            else:
                continue

            eval_result = executor.evaluate(code, strategy.name, df)
            if eval_result:
                db_result = StrategyResult(
                    strategy_id=strategy.id,
                    strategy_name=strategy.name,
                    stock_code=code,
                    stock_name=eval_result.get("name", strategy.name),
                    score=eval_result.get("score", 0),
                    signals=eval_result.get("signals", {}),
                    reason=eval_result.get("reason", ""),
                    created_at=now,
                )
                db.add(db_result)
                results.append({
                    "strategy_name": strategy.name,
                    "score": eval_result.get("score", 0),
                    "reason": eval_result.get("reason", ""),
                    "signals": eval_result.get("signals", {}),
                })
        except Exception as e:
            logger.debug(f"{code} 策略 {strategy.name} 评估失败: {e}")

    if results:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return results
