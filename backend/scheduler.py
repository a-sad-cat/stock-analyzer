"""
定时任务模块
每天 10:00 / 11:40 / 15:10 自动预取数据 + 全市场扫描
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import SCHEDULE_TIMES, SCAN_WORKERS

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def prefetch_all_stock_data():
    """遍历全市场股票，只拉取本地 DB 中过期/缺失的日K数据"""
    from services.data_service import get_all_stocks, get_daily_data

    try:
        stocks = get_all_stocks()
    except Exception as e:
        logger.error(f"获取股票列表失败: {e}")
        return

    codes = [s['code'] for s in stocks]
    logger.info(f"定时任务：检查 {len(codes)} 只股票的数据缓存状态...")

    def fetch_one(code):
        df = get_daily_data(code)
        return code, not df.empty

    fetched = 0
    with ThreadPoolExecutor(max_workers=SCAN_WORKERS) as pool:
        futures = {pool.submit(fetch_one, code): code for code in codes}
        done = 0
        for f in as_completed(futures):
            done += 1
            code, ok = f.result()
            if ok:
                fetched += 1
            if done % 500 == 0:
                logger.info(f"数据预取进度: {done}/{len(codes)}, 成功: {fetched}")

    logger.info(f"定时任务：数据预取完成 {fetched}/{len(codes)}")


def run_scheduled_scan():
    """定时全市场扫描：先刷新数据，再运行所有策略"""
    from database import SessionLocal
    from strategies.engine import run_all_strategies
    from config import TOP_K_RESULTS

    logger.info("=" * 50)
    logger.info("定时任务：开始全市场数据刷新 + 策略扫描")
    logger.info("=" * 50)

    # 1. 预取数据到本地缓存
    prefetch_all_stock_data()

    # 2. 全量扫描（走 DB 缓存，比直接调 AKShare 快很多）
    db = SessionLocal()
    try:
        results = run_all_strategies(db, stock_limit=0)
        total = sum(v.get("count", 0) for v in results.values())
        logger.info(f"定时任务：全市场扫描完成，共匹配 {total} 条")
    except Exception as e:
        logger.error(f"定时任务：全市场扫描失败: {e}")
    finally:
        db.close()

    logger.info("定时任务：本轮执行完毕")


def init_scheduler():
    """注册定时任务并启动调度器"""
    for time_str in SCHEDULE_TIMES:
        hour, minute = map(int, time_str.split(':'))
        scheduler.add_job(
            run_scheduled_scan,
            trigger=CronTrigger(hour=hour, minute=minute),
            id=f"scan_{hour}_{minute}",
            replace_existing=True,
        )
        logger.info(f"已注册定时任务: 每天 {hour:02d}:{minute:02d}")

    scheduler.start()
