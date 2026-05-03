"""
# ========================================
# 数据库配置
# 支持 SQLite（本地开发）和 PostgreSQL（生产环境）
# ========================================
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # 连接复用前检查是否有效，避免 SSL 断连
    echo=False,
)


def _init_db():
    """SQLite 特有初始化：WAL 模式 + 列迁移"""
    if not _is_sqlite:
        return
    try:
        with engine.raw_connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA cache_size=-8000")
            tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            if 'stock_daily' in tables:
                cols = [r[1] for r in conn.execute("PRAGMA table_info(stock_daily)").fetchall()]
                new_cols = [
                    ('ma5', 'FLOAT'), ('ma10', 'FLOAT'), ('ma20', 'FLOAT'), ('ma60', 'FLOAT'),
                    ('dif', 'FLOAT'), ('dea', 'FLOAT'), ('macd', 'FLOAT'),
                    ('rsi', 'FLOAT'), ('k', 'FLOAT'), ('d', 'FLOAT'), ('j', 'FLOAT'),
                    ('vol_ma5', 'FLOAT'), ('bb_upper', 'FLOAT'), ('bb_lower', 'FLOAT'),
                ]
                for col_name, col_type in new_cols:
                    if col_name not in cols:
                        conn.execute(f"ALTER TABLE stock_daily ADD COLUMN {col_name} {col_type}")
                indexes = [r[1] for r in conn.execute("PRAGMA index_list(stock_daily)").fetchall()]
                if 'idx_code_date' not in indexes:
                    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_code_date ON stock_daily(code, date)")
                if 'strategies' in tables:
                    strategy_cols = [r[1] for r in conn.execute("PRAGMA table_info(strategies)").fetchall()]
                    if 'sort_order' not in strategy_cols:
                        conn.execute("ALTER TABLE strategies ADD COLUMN sort_order INTEGER DEFAULT 0")
    except Exception:
        pass


_init_db()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ORM 基类
Base = declarative_base()


def get_db():
    """获取数据库会话（用于 FastAPI 依赖注入）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
