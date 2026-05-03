"""
板块数据服务：数据采集 + 热度评分 + 缓存管理
"""
import time
import logging
import json
import os
import threading
import pandas as pd

logger = logging.getLogger(__name__)

# ---------- 缓存 ----------
_cache_sectors = {"data": None, "time": 0}
_cache_detail = {}
_capital_flow_cache = {"data": {}, "time": 0}
_sector_map = {"stock_to_sectors": {}, "sector_to_stocks": {}, "last_build": 0}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTOR_MAP_PATH = os.path.join(BASE_DIR, "data", "sector_map.json")

SECTOR_TTL = 300       # 板块列表缓存 5 分钟（新加坡到同花顺慢，减少重复请求）
DETAIL_TTL = 300       # 板块详情缓存 5 分钟
STOCK_MAP_TTL = 86400  # 成分股映射缓存 24 小时
CAPITAL_FLOW_TTL = 60  # 资金流向缓存 60 秒

# ---------- 综合板块成分股映射（stock → sectors） ----------
_STOCK_SECTORS_CACHE: dict = {"data": None, "time": 0, "building": False}
STOCK_SECTORS_PATH = os.path.join(BASE_DIR, "data", "stock_sectors.json")
STOCK_SECTORS_TTL = 86400  # 24 小时


INDUSTRY_KEYWORDS = {
    "半导体": ["半导体", "芯片", "集成电路", "晶圆", "封测"],
    "白酒": ["白酒", "酒", "五粮液", "贵州茅台"],
    "医药": ["医药", "制药", "药业", "生物", "医疗", "药"],
    "证券": ["证券", "券商"],
    "银行": ["银行"],
    "房地产": ["房地产", "地产", "置业"],
    "汽车": ["汽车", "整车", "汽配", "新能源车"],
    "光伏": ["光伏", "太阳能", "逆变器"],
    "锂电池": ["锂", "电池", "宁德时代"],
    "人工智能": ["人工智能", "AI", "智能", "机器人"],
    "通信": ["通信", "5G", "中兴通讯"],
    "煤炭": ["煤炭", "煤业"],
    "钢铁": ["钢铁"],
    "电力": ["电力", "发电", "电网"],
    "化工": ["化工", "化学", "石化"],
    "有色金属": ["有色", "金属", "铜", "铝", "黄金", "稀土"],
    "计算机": ["计算机", "软件", "IT", "信息", "数字"],
    "食品饮料": ["食品", "饮料", "乳业", "调味"],
    "家电": ["家电", "电器", "美的", "格力", "海尔"],
    "军工": ["军工", "国防", "航天", "航空", "船舶"],
    "农林牧渔": ["农业", "林业", "牧业", "渔业", "种业", "养殖"],
    "环保": ["环保", "环境", "节能", "碳中和"],
    "纺织服装": ["纺织", "服装", "服饰", "鞋"],
    "建筑": ["建筑", "建设", "工程", "中铁", "中建"],
    "交通运输": ["运输", "物流", "航空", "航运", "铁路", "公路"],
    "传媒": ["传媒", "影视", "广告", "游戏", "互联网"],
    "电子": ["电子", "元器件", "面板", "传感器"],
}


def _guess_sector_name(stock_names: list[str]) -> str | None:
    """猜个股所属行业名"""
    from collections import Counter
    matched = []
    for name in stock_names:
        for ind_name, kws in INDUSTRY_KEYWORDS.items():
            if any(kw in name for kw in kws):
                matched.append(ind_name)
                break
    if matched:
        return Counter(matched).most_common(1)[0][0]
    return None


def rebuild_sector_map():
    """从 CLF 分类 + 关键词匹配构建 stock↔sector 映射"""
    global _sector_map
    try:
        import akshare as ak
        clf = ak.stock_industry_clf_hist_sw()
        clf = clf.sort_values("update_time")
        latest = clf.groupby("symbol").last().reset_index()

        by_code = {}
        for _, row in latest.iterrows():
            c = str(row["industry_code"])
            by_code.setdefault(c, []).append(str(row["symbol"]).zfill(6))

        names = ak.stock_info_a_code_name()
        name_map = dict(zip(names["code"], names["name"]))

        stock_to_sectors = {}
        sector_to_stocks = {}
        for code, stocks in by_code.items():
            stock_names = [name_map.get(s, "") for s in stocks]
            guess = _guess_sector_name(stock_names)
            if guess:
                for s in stocks:
                    stock_to_sectors[s] = guess
                sector_to_stocks.setdefault(guess, []).extend(stocks)

        for k in sector_to_stocks:
            sector_to_stocks[k] = list(set(sector_to_stocks[k]))

        _sector_map.clear()
        _sector_map["stock_to_sectors"] = stock_to_sectors
        _sector_map["sector_to_stocks"] = sector_to_stocks
        _sector_map["last_build"] = time.time()

        os.makedirs(os.path.dirname(SECTOR_MAP_PATH), exist_ok=True)
        with open(SECTOR_MAP_PATH, "w", encoding="utf-8") as f:
            json.dump({"stock_to_sectors": stock_to_sectors, "sector_to_stocks": {k: v for k, v in sector_to_stocks.items()}}, f, ensure_ascii=False)
        logger.info(f"板块映射重建完成，{len(stock_to_sectors)} 只股票映射到 {len(sector_to_stocks)} 个行业")
        return True
    except Exception as e:
        logger.warning(f"板块映射重建失败: {e}")
        return False


def load_sector_map():
    global _sector_map
    if _sector_map["last_build"] > 0:
        return
    try:
        if os.path.exists(SECTOR_MAP_PATH):
            with open(SECTOR_MAP_PATH, "r", encoding="utf-8") as f:
                raw = f.read()
            data = json.loads(raw)
            _sector_map.clear()
            _sector_map["stock_to_sectors"] = data.get("stock_to_sectors", {})
            _sector_map["sector_to_stocks"] = data.get("sector_to_stocks", {})
            _sector_map["last_build"] = time.time()
            logger.info(f"加载本地板块映射，{len(_sector_map['stock_to_sectors'])} 只，{len(_sector_map['sector_to_stocks'])} 个行业")
        else:
            logger.warning(f"板块映射文件不存在: {SECTOR_MAP_PATH}")
    except Exception as e:
        logger.warning(f"加载本地板块映射失败 ({SECTOR_MAP_PATH}): {e}")


def get_sector_of_stock(code: str) -> str | None:
    """获取股票所属行业名称（综合 SW + EM 板块映射）"""
    load_sector_map()
    sw = _sector_map["stock_to_sectors"].get(code)
    if sw:
        return sw
    ensure_stock_sectors_loaded()
    sectors = _STOCK_SECTORS_CACHE.get("data") or {}
    codes_list = sectors.get(code, [])
    return codes_list[0] if codes_list else None


def build_stock_sectors_map():
    """从东方财富获取所有概念/行业板块成分股，构建 stock→sectors 映射（后台线程调用）"""
    global _STOCK_SECTORS_CACHE
    if _STOCK_SECTORS_CACHE.get("building"):
        return
    _STOCK_SECTORS_CACHE["building"] = True
    stock_to_sectors: dict[str, set] = {}

    try:
        import akshare as ak

        # 1. 概念板块
        try:
            concept_df = ak.stock_board_concept_name_em()
            names = concept_df["板块名称"].tolist()
            logger.info(f"开始获取 {len(names)} 个概念板块成分股...")
            _fetch_board_constituents_batch(names, stock_to_sectors, is_concept=True)
        except Exception as e:
            logger.warning(f"获取概念板块列表失败: {e}")

        # 2. 行业板块
        try:
            industry_df = ak.stock_board_industry_name_em()
            names = industry_df["板块名称"].tolist()
            logger.info(f"开始获取 {len(names)} 个行业板块成分股...")
            _fetch_board_constituents_batch(names, stock_to_sectors, is_concept=False)
        except Exception as e:
            logger.warning(f"获取行业板块列表失败: {e}")

        result = {k: sorted(v) for k, v in stock_to_sectors.items()}

        os.makedirs(os.path.dirname(STOCK_SECTORS_PATH), exist_ok=True)
        with open(STOCK_SECTORS_PATH, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)

        _STOCK_SECTORS_CACHE["data"] = result
        _STOCK_SECTORS_CACHE["time"] = time.time()
        _STOCK_SECTORS_CACHE["building"] = False
        logger.info(f"板块成分股映射重建完成: {len(result)} 只股票, 共 {sum(len(v) for v in result.values())} 条映射")
    except Exception as e:
        _STOCK_SECTORS_CACHE["building"] = False
        logger.error(f"板块成分股映射重建失败: {e}")


def _fetch_board_constituents_batch(board_names: list[str], stock_to_sectors: dict[str, set], is_concept: bool = True):
    """并发获取板块成分股"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import akshare as ak

    def fetch_one(name: str) -> list[tuple[str, str]]:
        try:
            if is_concept:
                cons = ak.stock_board_concept_cons_em(symbol=name)
            else:
                cons = ak.stock_board_industry_cons_em(symbol=name)
            return [(str(c).zfill(6), name) for c in cons["代码"]]
        except Exception:
            return []

    total = len(board_names)
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_one, name): name for name in board_names}
        done = 0
        for f in as_completed(futures):
            done += 1
            if done % 50 == 0:
                logger.info(f"板块成分股进度: {done}/{total}")
            for code, bname in f.result():
                stock_to_sectors.setdefault(code, set()).add(bname)


def ensure_stock_sectors_loaded():
    """确保板块成分股映射已加载（尝试从文件缓存加载，否则后台重建）"""
    global _STOCK_SECTORS_CACHE
    now = time.time()
    if _STOCK_SECTORS_CACHE["data"] and now - _STOCK_SECTORS_CACHE["time"] < STOCK_SECTORS_TTL:
        return

    if os.path.exists(STOCK_SECTORS_PATH):
        try:
            with open(STOCK_SECTORS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            file_mtime = os.path.getmtime(STOCK_SECTORS_PATH)
            if now - file_mtime < STOCK_SECTORS_TTL:
                _STOCK_SECTORS_CACHE["data"] = data
                _STOCK_SECTORS_CACHE["time"] = file_mtime
                logger.info(f"加载本地板块成分股映射: {len(data)} 只股票")
                return
        except Exception as e:
            logger.warning(f"加载本地板块成分股映射失败: {e}")

    if not _STOCK_SECTORS_CACHE.get("building"):
        threading.Thread(target=build_stock_sectors_map, daemon=True).start()


def batch_get_stock_sectors(codes: list[str]) -> dict[str, list[str]]:
    """批量查询股票所属板块（合并 EM 板块 + SW 行业）"""
    load_sector_map()
    ensure_stock_sectors_loaded()

    em_data = _STOCK_SECTORS_CACHE.get("data") or {}
    sw_data = _sector_map.get("stock_to_sectors") or {}

    result = {}
    for code in codes:
        c = str(code).zfill(6)
        sectors = []
        seen = set()
        em_sectors = em_data.get(c, [])
        for s in em_sectors:
            if s not in seen:
                sectors.append(s)
                seen.add(s)
        sw_sector = sw_data.get(c)
        if sw_sector and sw_sector not in seen:
            sectors.append(sw_sector)
        result[code] = sectors
    return result





def match_ths_to_sw(ths_name: str) -> str | None:
    """将 THS 行业名匹配到申万行业名（精确匹配优先，失败则模糊）"""
    load_sector_map()
    if ths_name in _sector_map["sector_to_stocks"]:
        return ths_name
    for sw_name in _sector_map["sector_to_stocks"]:
        if ths_name in sw_name or sw_name in ths_name:
            return sw_name
    return None


def sustained_sectors(min_score: float = 60) -> list[dict]:
    """返回持续性评分达标的板块列表（今日×40% + 历史×60% → 暂用今日评分替代）"""
    sectors = refresh_sectors()
    result = []
    for s in sectors:
        heat = calc_heat_score(s)
        if heat["score"] >= min_score:
            sw_name = match_ths_to_sw(s["name"])
            result.append({
                "name": s["name"],
                "sector_type": s.get("sector_type", "industry"),
                "heat_score": heat["score"],
                "pct_chg": s["pct_chg"],
                "stock_count": len(get_sector_stocks(sw_name)) if sw_name else 0,
                "capital_flow": s.get("capital_flow", 0),
            })
    result.sort(key=lambda x: x["heat_score"], reverse=True)
    return result


def _get_spot_map():
    """使用 data_service 已有的缓存行情映射"""
    from services.data_service import _get_spot_map
    return _get_spot_map(allow_fetch=False)


_ths_aliases = {
    "名称": ["板块"],
    "涨跌幅": ["涨跌幅"],
    "总成交量": ["总成交量"],
    "总成交额": ["总成交额"],
    "净流入": ["净流入"],
    "上涨家数": ["上涨家数"],
    "下跌家数": ["下跌家数"],
    "领涨股": ["领涨股"],
}


def _ths_col(row, name):
    for alias in _ths_aliases.get(name, [name]):
        if alias in row.index:
            v = row[alias]
            return v if pd.notna(v) else 0
    return 0


def _build_from_ths() -> list[dict]:
    try:
        import akshare as ak
        df = ak.stock_board_industry_summary_ths()
        result = []
        for _, row in df.iterrows():
            pct = round(float(_ths_col(row, "涨跌幅") or 0), 2)
            up = int(_ths_col(row, "上涨家数") or 0)
            down = int(_ths_col(row, "下跌家数") or 0)
            total = up + down if up + down > 0 else 1
            result.append({
                "name": str(_ths_col(row, "名称")),
                "sector_type": "industry",
                "pct_chg": pct,
                "volume": float(_ths_col(row, "总成交量") or 0),
                "amount": float(_ths_col(row, "总成交额") or 0),
                "stock_count": total,
                "up_count": up,
                "down_count": down,
                "capital_flow": float(_ths_col(row, "净流入") or 0),
                "vol_ratio": 1,
                "limit_up_count": 0,
                "top_stock": str(_ths_col(row, "领涨股") or ""),
            })
        logger.info(f"从同花顺构建板块数据，共 {len(result)} 个行业")
        return result
    except Exception as e:
        logger.warning(f"THS 行业板块构建失败: {e}")
        return []


def refresh_sectors():
    now = time.time()
    if _cache_sectors["data"] and now - _cache_sectors["time"] < SECTOR_TTL:
        return _cache_sectors["data"]

    result = []
    import akshare as ak

    # 尝试同花顺源（稳定可用）
    result = _build_from_ths()

    if not result:
        try:
            df = ak.stock_board_concept_name_em()
            for _, row in df.iterrows():
                result.append({
                    "name": str(row["板块名称"]), "sector_type": "concept",
                    "pct_chg": round(float(row.get("涨跌幅", 0)), 2),
                    "volume": float(row.get("成交量", 0)),
                    "amount": float(row.get("成交额", 0)),
                    "stock_count": int(row.get("成分股数量", 0)) if "成分股数量" in df.columns else 0,
                })
        except Exception:
            pass

    if not result:
        cached = _cache_sectors.get("data")
        if cached:
            return cached

    _cache_sectors["data"] = result
    _cache_sectors["time"] = now
    logger.info(f"板块数据刷新完成，共 {len(result)} 个板块")
    return result


def _enrich_limit_up(sectors):
    """为每个板块统计涨停股数量（使用缓存的行情数据）"""
    spot_map = _get_spot_map()
    if not spot_map:
        for s in sectors:
            s["limit_up_count"] = 0
        return
    limit_codes = set()
    for code, info in spot_map.items():
        if info.get("pct_chg", 0) >= 9.5:
            limit_codes.add(code)
    for s in sectors:
        codes = get_sector_stocks(s["name"], s.get("sector_type", "industry"))
        s["limit_up_count"] = sum(1 for c in codes if c in limit_codes) if codes else 0


def _get_capital_flow_map() -> dict:
    """获取板块主力资金流向映射 {板块名 -> 主力净流入}，缓存 60 秒"""
    global _capital_flow_cache
    now = time.time()
    if _capital_flow_cache["data"] and now - _capital_flow_cache["time"] < CAPITAL_FLOW_TTL:
        return _capital_flow_cache["data"]
    result = {}
    try:
        import akshare as ak
        df = ak.stock_sector_fund_flow_rank(indicator="今日")
        for _, row in df.iterrows():
            name = str(row["名称"])
            net = float(row.get("主力净流入-净额", 0))
            pct_net = float(row.get("主力净流入-净占比", 0))
            result[name] = {"net_inflow": net, "net_pct": pct_net}
        _capital_flow_cache = {"data": result, "time": now}
    except Exception as e:
        logger.warning(f"获取资金流向数据失败: {e}")
    return result


def _enrich_capital_flow(sectors: list[dict]):
    """为每个板块填充资金流向数据"""
    flow_map = _get_capital_flow_map()
    for s in sectors:
        f = flow_map.get(s["name"])
        s["capital_flow"] = f["net_inflow"] if f else 0


def get_sector_stocks(sector_name: str, sector_type: str = "industry") -> list[str]:
    """获取板块成分股（合并 SW 映射 + EM 板块映射）"""
    load_sector_map()
    seen = set()
    result = []

    sw_name = match_ths_to_sw(sector_name)
    if sw_name:
        for c in _sector_map["sector_to_stocks"].get(sw_name, []):
            if c not in seen:
                result.append(c)
                seen.add(c)

    ensure_stock_sectors_loaded()
    em_data = _STOCK_SECTORS_CACHE.get("data") or {}
    for code, sectors in em_data.items():
        if sector_name in sectors and code not in seen:
            result.append(code)
            seen.add(code)

    return result


def calc_heat_score(sector: dict, market_pct: float = 0) -> dict:
    """计算单个板块热度评分 0-100
    权重分配：涨幅22 + 量比18 + 涨停密度18 + 超额收益12 + 资金流向15 + 策略匹配10 + 情感预留5 = 100
    """
    score = 0
    details = {}

    pct = abs(sector.get("pct_chg", 0))
    vol_ratio = sector.get("vol_ratio", 1)
    limit_up = sector.get("limit_up_count", 0)
    stock_cnt = max(sector.get("stock_count", 1), 1)

    # ① 当日涨幅 (22分)
    s1 = min(pct / 5 * 22, 22)
    score += s1
    details["涨幅"] = round(s1, 1)

    # ② 量比 (18分)
    s2 = min(vol_ratio / 3 * 18, 18)
    score += s2
    details["量比"] = round(s2, 1)

    # ③ 涨停密度 (18分)
    density = limit_up / stock_cnt
    s3 = min(density / 0.1 * 18, 18)
    score += s3
    details["涨停密度"] = round(s3, 1)

    # ④ 相对大盘超额 (12分)
    excess = pct - abs(market_pct)
    s4 = min(max(excess / 3 * 12, 0), 12)
    score += s4
    details["超额收益"] = round(s4, 1)

    # ⑤ 资金流向 (15分) — 主力净流入 -5亿~5亿 映射到 0~15
    net_flow = sector.get("capital_flow", 0) or 0
    # THS 的数据单位是亿，EM 的单位是元
    if abs(net_flow) > 1e6:
        net_flow_in_yi = net_flow / 1e8
    else:
        net_flow_in_yi = net_flow
    s5 = (net_flow_in_yi / 5 + 1) * 7.5
    s5 = max(0, min(15, s5))
    score += s5
    details["资金流向"] = round(s5, 1)

    # ⑥ 策略匹配 (10分) — 在调用处补充
    details["策略匹配"] = 0

    # ⑦ 新闻情绪 (5分) — 预留 V2
    details["新闻情绪"] = 0

    return {"score": round(score, 1), "breakdown": details, "base_score": round(score, 1)}


def get_sector_detail(sector_name: str, sector_type: str) -> dict | None:
    sectors = refresh_sectors()
    sector = next((s for s in sectors if s["name"] == sector_name and s["sector_type"] == sector_type), None)
    if not sector:
        return None

    codes = get_sector_stocks(sector_name, sector_type)
    sector["stocks"] = codes

    # 检查 K 线缓存
    kline_key = f"kline:{sector_name}:{sector_type}"
    now = time.time()
    cached = _cache_detail.get(kline_key)
    if cached and now - cached.get("time", 0) < DETAIL_TTL:
        sector["kline"] = cached.get("data", [])
        return sector

    try:
        import akshare as ak
        if sector_type == "concept":
            df = ak.stock_board_concept_hist_em(symbol=sector_name)
        else:
            df = ak.stock_board_industry_hist_em(name=sector_name)
        kline = []
        for _, row in df.iterrows():
            kline.append({
                "date": str(row["日期"]),
                "open": round(float(row["开盘"]), 2),
                "close": round(float(row["收盘"]), 2),
                "high": round(float(row["最高"]), 2),
                "low": round(float(row["最低"]), 2),
                "volume": float(row["成交量"]),
                "pct_chg": round(float(row.get("涨跌幅", 0)), 2),
            })
        sector["kline"] = kline
        _cache_detail[kline_key] = {"data": kline, "time": now}
    except Exception:
        # EM K线不可用，尝试用成分股平均K线替代（仅行业板块）
        if sector_type == "industry" and codes:
            try:
                from services.data_service import get_daily_data
                import pandas as pd
                all_closes = []
                for c in codes[:10]:
                    df = get_daily_data(c)
                    if not df.empty:
                        all_closes.append(df['close'].rename(c))
                if all_closes:
                    merged = pd.concat(all_closes, axis=1)
                    avg = merged.mean(axis=1)
                    sector["kline"] = [
                        {"date": str(idx), "close": round(float(v), 2), "pct_chg": 0}
                        for idx, v in avg.tail(120).items()
                    ]
            except Exception:
                pass
        if not sector.get("kline"):
            sector["kline"] = []

    return sector
