"""
# ========================================
# 配置文件
# ========================================
"""

import os

# 项目根路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 数据库路径（SQLite 文件）
DATABASE_PATH = os.path.join(BASE_DIR, "stock_analyzer.db")
# 使用同步 SQLite（aiosqlite 用于异步，但这里用同步引擎 + check_same_thread）
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

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
