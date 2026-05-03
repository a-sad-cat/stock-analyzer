"""
# ========================================
# 数据库配置（SQLite）
# 使用 SQLAlchemy ORM 操作数据库
# ========================================
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_size=10,
    max_overflow=20,
    echo=False,
)


def _init_db():
    """启动时执行：WAL 模式 + 列迁移"""
    try:
        with engine.raw_connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA cache_size=-8000")
            # 检查表是否存在
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
                # 创建复合索引（如果不存在）
                indexes = [r[1] for r in conn.execute("PRAGMA index_list(stock_daily)").fetchall()]
                if 'idx_code_date' not in indexes:
                    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_code_date ON stock_daily(code, date)")
                # strategies 表列迁移
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
