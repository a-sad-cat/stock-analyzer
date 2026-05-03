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

# AKShare 请求超时（秒）
AKSHARE_TIMEOUT = 30

# 缓存配置
# 数据缓存过期时间（小时）
# 周末和节假日休市时，数据几天不变，设长避免反复拉取
CACHE_EXPIRE_HOURS = 48

# 默认要扫描的股票数量限制（防止全市场扫描太慢）
# 0 表示扫描全部股票
MAX_SCAN_STOCKS = 200
SCAN_WORKERS = 8
