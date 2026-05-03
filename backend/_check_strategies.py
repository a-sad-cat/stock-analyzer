# -*- coding: utf-8 -*-
import sys
sys.path.insert(0, '.')
from strategies.builtin import get_builtin_strategies
from database import SessionLocal
from models.strategy import Strategy

# Check code
strategies = get_builtin_strategies()
print(f"[代码] 共 {len(strategies)} 个策略类:")
for i, s in enumerate(strategies):
    print(f"  {i+1}. [{type(s).__name__}] {s.name}")

print()

# Check DB
db = SessionLocal()
db_strategies = db.query(Strategy).order_by(Strategy.id).all()
print(f"[数据库] 共 {len(db_strategies)} 条记录:")
for s in db_strategies:
    print(f"  ID={s.id} | {s.name} | type={s.type} | enabled={s.enabled} | last_run={s.last_run}")
db.close()
