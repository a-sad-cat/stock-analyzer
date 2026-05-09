"""
# ========================================
# LLM AI 分析引擎 — 策略结果的二次智能研判
# ========================================
# 免费 LLM 方案：Google Gemini（gemini-2.5-flash，15 RPM / 1500 RPD 免费额度）
# 兼容 OpenAI / Ollama 等接口，切换 LLM_PROVIDER 环境变量即可
#
# 职责：
# 1. 封装 LLM 调用（Gemini / OpenAI Compatible / Ollama）
# 2. 构建股票分析 prompt（策略信号 + 技术面数据）
# 3. 解析 LLM 返回的结构化 JSON
# 4. 输出 AnalysisResult（评分、趋势、建议、风险等）
# ========================================
"""

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

import pandas as pd

from config import (
    LLM_API_KEY,
    LLM_PROVIDER,
    LLM_MODEL,
    LLM_BASE_URL,
    LLM_TIMEOUT,
    LLM_TEMPERATURE,
    LLM_MAX_TOKENS,
    LLM_MAX_RETRIES,
)

logger = logging.getLogger(__name__)

# ========================================
# 数据模型
# ========================================


@dataclass
class AnalysisResult:
    """LLM 分析结果"""

    code: str
    name: str
    success: bool = False
    error_message: str = ""

    # 核心评分与建议
    sentiment_score: int = 50  # 0-100
    trend_prediction: str = "震荡"  # 看涨/看跌/震荡
    operation_advice: str = "观望"  # 买入/持有/卖出/观望
    confidence_level: str = "中"  # 高/中/低

    # 详细分析
    analysis_summary: str = ""  # 分析摘要（100-200字）
    risk_factors: list[str] = field(default_factory=list)
    key_signals: list[str] = field(default_factory=list)

    # 价格参考
    target_price_high: Optional[float] = None
    target_price_low: Optional[float] = None
    stop_loss_price: Optional[float] = None

    # 元信息
    model_used: str = ""
    tokens_used: int = 0
    elapsed_seconds: float = 0.0

    # 数据来源说明（哪些维度的数据被使用）
    data_sources: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ========================================
# LLM 客户端
# ========================================


class LLMClient:
    """统一的 LLM 调用客户端（openai 库兼容 Gemini/OpenAI/Ollama）"""

    def __init__(self):
        import openai

        self._api_key = LLM_API_KEY
        self._provider = LLM_PROVIDER
        self._model = LLM_MODEL
        self._base_url = LLM_BASE_URL
        self._timeout = LLM_TIMEOUT
        self._temperature = LLM_TEMPERATURE
        self._max_tokens = LLM_MAX_TOKENS
        self._max_retries = LLM_MAX_RETRIES
        self._available = None  # 延迟检查

        self._client = openai.OpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            timeout=self._timeout,
            max_retries=self._max_retries,
        )

    @property
    def is_available(self) -> bool:
        """检查 LLM 客户端是否可用（有 API Key 即为可用）"""
        if self._available is None:
            self._available = bool(self._api_key and self._api_key.strip())
        return self._available

    def chat(self, system_prompt: str, user_prompt: str) -> tuple[str, int]:
        """
        调用 LLM 对话接口

        Returns:
            (响应文本, 消耗的 token 数)
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        logger.info(
            f"[LLM] 请求 {self._provider}/{self._model} | "
            f"prompt长度={len(user_prompt)}字符 | "
            f"temperature={self._temperature}"
        )

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=self._temperature,
            max_tokens=self._max_tokens,
            response_format={"type": "json_object"},  # JSON 模式（Gemini 支持）
        )

        content = response.choices[0].message.content
        usage = response.usage
        tokens = usage.total_tokens if usage else 0

        logger.info(
            f"[LLM] 响应完成 | tokens={tokens} | "
            f"模型={response.model} | "
            f"finish_reason={response.choices[0].finish_reason}"
        )

        return content, tokens

    def chat_conversation(self, messages: list[dict]) -> tuple[str, int]:
        """
        多轮对话接口（不强制 JSON 输出）

        Args:
            messages: [{"role": "system/user/assistant", "content": "..."}, ...]

        Returns:
            (响应文本, 消耗的 token 数)
        """
        logger.info(
            f"[LLM] 对话请求 {self._provider}/{self._model} | "
            f"消息数={len(messages)}"
        )

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=self._temperature,
            max_tokens=self._max_tokens,
        )

        content = response.choices[0].message.content
        usage = response.usage
        tokens = usage.total_tokens if usage else 0

        logger.info(
            f"[LLM] 对话响应完成 | tokens={tokens} | "
            f"模型={response.model}"
        )

        return content, tokens


# ========================================
# 股票分析 Prompt 构建器
# ========================================


def _build_analysis_prompt(
    code: str,
    name: str,
    kline_df: pd.DataFrame,
    strategy_hits: list[dict],
    extra_context: dict = None,
) -> str:
    """
    构建 LLM 分析 prompt

    Args:
        code: 股票代码
        name: 股票名称
        kline_df: 最近 N 日 K 线数据（含技术指标列）
        strategy_hits: 策略命中结果列表 [{strategy_name, score, reason}, ...]
    """
    # 1. 基本信息
    parts = [f"请分析股票 {code}（{name}），给出专业的量化研判。\n"]

    # 2. 最近 K 线数据（取最近 10 日）
    n_rows = min(10, len(kline_df))
    recent = kline_df.tail(n_rows).copy()
    # 日期列格式化为字符串
    if "date" in recent.columns:
        recent["date_str"] = recent["date"].astype(str)

    kline_cols = ["date_str", "open", "high", "low", "close", "volume", "pct_chg"]
    available_cols = [c for c in kline_cols if c in recent.columns]
    kline_table = recent[available_cols].to_string(index=False)

    parts.append("## 最近 K 线数据\n")
    parts.append(f"```\n{kline_table}\n```\n")

    # 3. 技术指标（取最新一行）
    latest = kline_df.iloc[-1]
    indicators = _format_indicators(latest)
    parts.append("## 技术指标（最新）\n")
    parts.append(indicators)
    parts.append("\n")

    # 4. 策略命中结果
    if strategy_hits:
        parts.append("## 策略信号（已触发）\n")
        for hit in strategy_hits[:5]:  # 最多显示 5 个
            parts.append(
                f"- **{hit.get('strategy_name', '未知策略')}** "
                f"评分 {hit.get('score', 0):.0f}/100: "
                f"{hit.get('reason', '')}\n"
            )
    else:
        parts.append("## 策略信号\n- 当前无策略触发信号\n")

    # 4.5 额外上下文（板块 + 新闻 + 公告）
    if extra_context:
        # 板块信息
        if extra_context.get("sectors"):
            parts.append(f"\n## 所属板块\n- {', '.join(extra_context['sectors'][:8])}\n")

        # 公司公告
        if extra_context.get("announcements"):
            parts.append(f"\n## 公司近期公告\n")
            for a in extra_context["announcements"][:5]:
                parts.append(f"- [{a.get('date', '')}] {a.get('title', '')}\n")

        # 市场新闻
        if extra_context.get("news"):
            parts.append(f"\n## 相关市场新闻\n")
            for n in extra_context["news"][:5]:
                parts.append(f"- {n.get('title', '')}\n")

        # 板块热度
        if extra_context.get("sector_heat"):
            heat = extra_context["sector_heat"]
            if isinstance(heat, dict) and heat.get("score"):
                parts.append(f"\n## 所属板块热度评分: {heat.get('score', 0):.0f}/100\n")

    # 5. 分析要求
    parts.append(f"\n请综合技术面数据" +
        ("、策略信号" if strategy_hits else "") +
        ("、板块归属/新闻/公告" if extra_context and (extra_context.get("sectors") or extra_context.get("news") or extra_context.get("announcements")) else "") +
        "，以 JSON 格式返回分析结果（只返回 JSON，不要任何其他文字）：\n\n")
    parts.append("""```json
{
  "sentiment_score": <0-100 整数，综合评分，60以上偏多，40以下偏空>,
  "trend_prediction": "<看涨/看跌/震荡>",
  "operation_advice": "<买入/持有/卖出/观望>",
  "confidence_level": "<高/中/低>",
  "analysis_summary": "<100-200字的中文分析摘要，结合策略信号和技术面给出判断依据>",
  "risk_factors": ["<风险因素1>", "<风险因素2>"],
  "key_signals": ["<关键信号1>", "<关键信号2>"],
  "target_price_high": <近期目标价上限，如无法判断填 null>,
  "target_price_low": <近期支撑位/目标价下限，如无法判断填 null>,
  "stop_loss_price": <建议止损价，如无法判断填 null>
}
```""")

    return "".join(parts)


def _format_indicators(latest: pd.Series) -> str:
    """格式化技术指标为可读文本"""
    lines = []

    # 价格与均线
    close = _safe_float(latest, "close")
    ma5 = _safe_float(latest, "ma5")
    ma10 = _safe_float(latest, "ma10")
    ma20 = _safe_float(latest, "ma20")
    ma60 = _safe_float(latest, "ma60")

    if close is not None:
        lines.append(f"- 收盘价: {close:.2f}")
        if ma5 is not None:
            bias5 = ((close - ma5) / ma5 * 100) if ma5 > 0 else 0
            lines.append(f"- MA5: {ma5:.2f} (偏离 {bias5:+.1f}%)")
        if ma10 is not None:
            lines.append(f"- MA10: {ma10:.2f}")
        if ma20 is not None:
            lines.append(f"- MA20: {ma20:.2f}")
        if ma60 is not None:
            lines.append(f"- MA60: {ma60:.2f}")

    # 均线排列判断
    if all(v is not None for v in [close, ma5, ma10, ma20]):
        if close > ma5 > ma10 > ma20 > 0:
            lines.append("- 📈 均线多头排列")
        elif close < ma5 < ma10 < ma20 and ma20 > 0:
            lines.append("- 📉 均线空头排列")
        else:
            lines.append("- ↔️ 均线交织震荡")

    # MACD
    dif = _safe_float(latest, "dif")
    dea = _safe_float(latest, "dea")
    macd = _safe_float(latest, "macd")
    if all(v is not None for v in [dif, dea, macd]):
        status = "金叉" if dif > dea else "死叉"
        lines.append(f"- MACD: DIF={dif:.3f} DEA={dea:.3f} MACD柱={macd:.3f} ({status})")

    # RSI
    rsi = _safe_float(latest, "rsi")
    if rsi is not None:
        if rsi > 70:
            desc = "超买区"
        elif rsi < 30:
            desc = "超卖区"
        else:
            desc = "中性区"
        lines.append(f"- RSI(14): {rsi:.1f} ({desc})")

    # KDJ
    k = _safe_float(latest, "k")
    d = _safe_float(latest, "d")
    j = _safe_float(latest, "j")
    if all(v is not None for v in [k, d, j]):
        lines.append(f"- KDJ: K={k:.1f} D={d:.1f} J={j:.1f}")

    # 成交量
    vol = _safe_float(latest, "volume")
    vol_ma5 = _safe_float(latest, "vol_ma5")
    if vol is not None and vol_ma5 is not None and vol_ma5 > 0:
        vol_ratio = vol / vol_ma5
        desc = "放量" if vol_ratio > 1.5 else ("缩量" if vol_ratio < 0.5 else "正常")
        lines.append(f"- 成交量: {vol:.0f} (量比{vol_ratio:.1f}, {desc})")

    # 布林带
    bb_upper = _safe_float(latest, "bb_upper")
    bb_lower = _safe_float(latest, "bb_lower")
    if close is not None and all(v is not None for v in [bb_upper, bb_lower]):
        if close > bb_upper:
            bb_desc = "突破上轨（强势）"
        elif close < bb_lower:
            bb_desc = "跌破下轨（弱势）"
        else:
            bb_desc = "通道内运行"
        lines.append(f"- 布林带: 上轨={bb_upper:.2f} 下轨={bb_lower:.2f} ({bb_desc})")

    return "\n".join(lines)


def _safe_float(series: pd.Series, col: str) -> Optional[float]:
    """安全获取 float 值"""
    try:
        if col in series.index:
            val = series[col]
            if pd.notna(val):
                return float(val)
    except (ValueError, TypeError):
        pass
    return None


# ========================================
# 股票分析引擎
# ========================================


class StockAnalysisEngine:
    """股票 AI 分析引擎"""

    def __init__(self):
        self._client: Optional[LLMClient] = None

    @property
    def client(self) -> LLMClient:
        if self._client is None:
            self._client = LLMClient()
        return self._client

    @property
    def is_available(self) -> bool:
        return self.client.is_available

    def analyze(
        self,
        code: str,
        name: str,
        kline_df: pd.DataFrame,
        strategy_hits: list[dict],
        extra_context: dict = None,
    ) -> AnalysisResult:
        """
        对单只股票进行 AI 分析

        Args:
            code: 股票代码
            name: 股票名称
            kline_df: K 线数据 DataFrame（需含技术指标列）
            strategy_hits: 策略命中结果列表
        """
        result = AnalysisResult(code=code, name=name)

        if not self.is_available:
            result.error_message = "LLM API Key 未配置，请在环境变量中设置 LLM_API_KEY"
            logger.warning(f"{code}({name}) {result.error_message}")
            return result

        if kline_df is None or kline_df.empty:
            result.error_message = "K线数据为空，无法进行分析"
            logger.warning(f"{code}({name}) {result.error_message}")
            return result

        # 构建分析 prompt
        user_prompt = _build_analysis_prompt(code, name, kline_df, strategy_hits, extra_context)
        system_prompt = _build_system_prompt()

        start_time = time.time()
        try:
            content, tokens = self.client.chat(system_prompt, user_prompt)
            elapsed = time.time() - start_time
            result.elapsed_seconds = round(elapsed, 2)
            result.tokens_used = tokens

            # 解析 JSON 响应
            parsed = _parse_llm_response(content)
            if parsed is None:
                result.error_message = "LLM 返回格式异常，无法解析 JSON"
                logger.warning(f"{code}({name}) {result.error_message}: {content[:200]}")
                return result

            # 填充结果
            result.success = True
            result.model_used = self.client._model

            # 记录数据来源
            sources = ["技术面数据（K线/MACD/RSI/KDJ/均线/布林带）"]
            if strategy_hits:
                sources.append("策略信号（已触发策略匹配结果）")
            if extra_context:
                if extra_context.get("sectors"):
                    sources.append("板块归属信息")
                if extra_context.get("news"):
                    sources.append("市场新闻")
                if extra_context.get("announcements"):
                    sources.append("公司公告")
            missing = []
            if not extra_context or not extra_context.get("news"):
                missing.append("市场新闻（超时或不可用）")
            if not extra_context or not extra_context.get("announcements"):
                missing.append("公司公告（超时或不可用）")
            if not extra_context or not extra_context.get("sectors"):
                missing.append("板块归属（未查到或数据库为空）")
            sources.extend(missing)
            result.data_sources = sources
            result.sentiment_score = _clamp(parsed.get("sentiment_score", 50), 0, 100)
            result.trend_prediction = str(parsed.get("trend_prediction", "震荡"))
            result.operation_advice = str(parsed.get("operation_advice", "观望"))
            result.confidence_level = str(parsed.get("confidence_level", "中"))
            result.analysis_summary = str(parsed.get("analysis_summary", ""))
            result.risk_factors = _ensure_list(parsed.get("risk_factors", []))
            result.key_signals = _ensure_list(parsed.get("key_signals", []))
            result.target_price_high = _parse_optional_float(parsed.get("target_price_high"))
            result.target_price_low = _parse_optional_float(parsed.get("target_price_low"))
            result.stop_loss_price = _parse_optional_float(parsed.get("stop_loss_price"))

            logger.info(
                f"{name}({code}) AI分析完成 | "
                f"评分={result.sentiment_score} | "
                f"趋势={result.trend_prediction} | "
                f"建议={result.operation_advice} | "
                f"置信度={result.confidence_level}"
            )

        except Exception as e:
            elapsed = time.time() - start_time
            result.elapsed_seconds = round(elapsed, 2)
            result.error_message = f"LLM 调用失败: {str(e)}"
            logger.error(f"{code}({name}) {result.error_message}")

        return result

    def batch_analyze(
        self,
        stocks: list[dict],
        delay_seconds: float = 1.0,
    ) -> list[AnalysisResult]:
        """
        批量分析多只股票（逐只调用，带间隔避免限流）

        Args:
            stocks: [{"code": "600519", "name": "贵州茅台", "kline_df": ..., "strategy_hits": [...]}, ...]
            delay_seconds: 每只股票间隔秒数
        """
        results = []
        for i, stock in enumerate(stocks):
            logger.info(f"[{i+1}/{len(stocks)}] 开始分析 {stock['name']}({stock['code']})")
            result = self.analyze(
                code=stock["code"],
                name=stock.get("name", stock["code"]),
                kline_df=stock.get("kline_df"),
                strategy_hits=stock.get("strategy_hits", []),
            )
            results.append(result)

            if i < len(stocks) - 1:
                time.sleep(delay_seconds)

        return results


# ========================================
# 辅助函数
# ========================================


def _build_system_prompt() -> str:
    """构建系统角色 prompt"""
    return (
        "你是一位专业的 A 股量化分析师，擅长技术分析和策略研判。\n"
        "你的任务是根据提供的 K 线数据、技术指标和策略信号，给出专业的分析判断。\n\n"
        "分析原则：\n"
        "1. 基于数据做判断，避免主观臆测\n"
        "2. 评分要客观，60 分以上偏多，40 分以下偏空\n"
        "3. 操作建议要明确：买入/持有/卖出/观望\n"
        "4. 风险因素要具体，避免空泛\n"
        "5. 策略命中只是参考信号，需要结合技术面综合判断\n\n"
        "请始终以 JSON 格式返回结果，不要返回其他文字。"
    )


def _parse_llm_response(content: str) -> Optional[dict]:
    """解析 LLM 返回的 JSON"""
    if not content:
        return None

    # 尝试直接解析
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # 尝试提取 ```json ... ``` 代码块
    import re

    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # 尝试提取第一个 { ... } 块
    match = re.search(r"\{[\s\S]*\}", content)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def _clamp(value, min_val, max_val):
    """限制数值范围"""
    try:
        v = int(value)
        return max(min_val, min(max_val, v))
    except (ValueError, TypeError):
        return 50


def _parse_optional_float(value) -> Optional[float]:
    """安全解析可选浮点数"""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _ensure_list(value) -> list[str]:
    """确保返回字符串列表"""
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        return [value]
    return []


# ========================================
# 单例
# ========================================

_engine_instance: Optional[StockAnalysisEngine] = None


def get_analysis_engine() -> StockAnalysisEngine:
    """获取分析引擎单例"""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = StockAnalysisEngine()
    return _engine_instance


# ========================================
# 多维度上下文采集（公告 + 新闻 + 板块）
# ========================================


def collect_extra_context(
    code: str, db_session=None, timeout: float = 5.0
) -> dict:
    """
    采集股票的多维度分析上下文

    Returns:
        {
            "sectors": ["板块名1", ...],
            "sector_heat": {"score": 85, ...} or None,
            "announcements": [{"date": "2026-05-01", "title": "..."}, ...],
            "news": [{"title": "...", "source": "东方财富", ...}, ...],
        }
    """
    context = {}

    # 1. 板块归属（从本地数据库查询，最快）
    try:
        if db_session:
            from models.sector import StockSector, Sector
            rows = (
                db_session.query(Sector.name)
                .join(StockSector, Sector.id == StockSector.sector_id)
                .filter(StockSector.stock_code == code)
                .limit(10)
                .all()
            )
            context["sectors"] = [r[0] for r in rows] if rows else []
    except Exception:
        pass

    # 2. 板块热度（简化：仅取板块列表）

    # 3. 公司公告（从东方财富获取，带超时控制）
    try:
        import threading

        announcements = []

        def _fetch_notices():
            try:
                import akshare as ak
                # 东方财富个股公告
                df = ak.stock_notice_report(symbol="ALL")
                if df is not None and not df.empty:
                    # 过滤该股票代码相关的公告
                    name_col = "stock_name" if "stock_name" in df.columns else df.columns[0]
                    matched = df[df[name_col].astype(str).str.contains(code[:6], na=False)]
                    if not matched.empty:
                        matched = matched.head(5)
                        for _, row in matched.iterrows():
                            announcements.append({
                                "date": str(row.get("notice_date", row.get("date", ""))),
                                "title": str(row.get("notice_title", row.get("title", ""))),
                            })
            except Exception:
                pass

        t = threading.Thread(target=_fetch_notices, daemon=True)
        t.start()
        t.join(timeout=timeout)
        if announcements:
            context["announcements"] = announcements
    except Exception:
        pass

    # 4. 市场新闻（从东方财富获取个股相关新闻）
    try:
        import threading

        news = []

        def _fetch_news():
            try:
                import akshare as ak
                df = ak.stock_news_em(stock=code)
                if df is not None and not df.empty:
                    for _, row in df.head(5).iterrows():
                        news.append({
                            "title": str(row.get("title", row.get("content", ""))),
                            "source": str(row.get("source", "")),
                        })
            except Exception:
                pass

        t = threading.Thread(target=_fetch_news, daemon=True)
        t.start()
        t.join(timeout=timeout)
        if news:
            context["news"] = news
    except Exception:
        pass

    return context
