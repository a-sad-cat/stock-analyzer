"""
# ========================================
# 配置文件
# 支持 SQLite（本地开发）和 PostgreSQL（生产环境）
# ========================================
"""

import os

# 项目根路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 数据库：优先使用环境变量 DATABASE_URL（Render PostgreSQL）
# 如果没有设置，则使用本地 SQLite 文件
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_PATH = os.path.join(BASE_DIR, "stock_analyzer.db")
    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Render 的 PostgreSQL 连接串是 postgres:// 开头，SQLAlchemy 需要 postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
# 确保 SSL 模式
if "sslmode" not in DATABASE_URL and not DATABASE_URL.startswith("sqlite"):
    DATABASE_URL += "?sslmode=require" if "?" not in DATABASE_URL else "&sslmode=require"

# AKShare 请求超时（秒）
AKSHARE_TIMEOUT = 30

# 缓存配置
# 数据缓存过期时间（小时）
# 周末和节假日休市时，数据几天不变，设长避免反复拉取
CACHE_EXPIRE_HOURS = 48

# 默认扫描全部（0=全部），由定时任务在后台逐步缓存
# 首次全量扫描较慢，后续增量更新
MAX_SCAN_STOCKS = 0
SCAN_WORKERS = 8

# 定时任务配置（每天自动刷新数据的时间）
# 开盘前、盘中休息、收盘后各刷新一次
SCHEDULE_TIMES = ["10:00", "11:40", "15:10"]

# 每个策略返回最符合的前 K 条结果
TOP_K_RESULTS = 50
