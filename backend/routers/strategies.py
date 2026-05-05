"""
# ========================================
# 策略管理 API 路由
# /api/strategies/*
# ========================================
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import MAX_SCAN_STOCKS
from database import get_db
from pydantic import BaseModel
from strategies.engine import (
    get_all_strategies,
    get_strategy,
    create_custom_strategy,
    delete_strategy,
    toggle_strategy_enabled,
    add_builtin_strategy,
    get_available_builtin_strategies,
    get_all_builtin_strategies_with_status,
    batch_manage_builtin_strategies,
    move_strategy,
    reorder_strategies,
    run_strategy,
    run_all_strategies,
    get_results_by_date,
)


class ReorderRequest(BaseModel):
    source_id: int
    target_id: int

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------- Pydantic 模型 ----------
class CreateStrategyRequest(BaseModel):
    name: str
    description: str = ""
    config: dict = {}


# ---------- API 端点 ----------
@router.get("")
def api_get_strategies(db: Session = Depends(get_db)):
    """获取所有策略列表"""
    strategies = get_all_strategies(db)
    return {"strategies": strategies, "total": len(strategies)}


@router.get("/results")
def api_get_results(
    date_str: str = Query(None, alias="date", description="日期（YYYY-MM-DD），默认今天"),
    strategy_id: int = Query(None, description="按策略ID筛选"),
    db: Session = Depends(get_db)
):
    """获取扫描结果"""
    results = get_results_by_date(db, date_str, strategy_id)
    return {
        "date": date_str or date.today().isoformat(),
        "total": len(results),
        "results": results,
    }


@router.get("/{strategy_id}")
def api_get_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """获取单个策略详情"""
    strategy = get_strategy(db, strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="策略不存在")
    return strategy


@router.post("")
def api_create_strategy(req: CreateStrategyRequest, db: Session = Depends(get_db)):
    """创建自定义策略"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="策略名称不能为空")
    if not req.config or not req.config.get("conditions"):
        raise HTTPException(status_code=400, detail="策略配置至少需要一个条件")

    strategy_id = create_custom_strategy(db, req.name, req.description, req.config)
    return {"id": strategy_id, "message": "策略创建成功"}


@router.delete("/{strategy_id}")
def api_delete_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """删除策略（内置策略也可删除，重启后会自动恢复）"""
    success = delete_strategy(db, strategy_id)
    if not success:
        raise HTTPException(status_code=404, detail="策略不存在")
    return {"message": "策略已移除"}


@router.get("/builtin/available")
def api_get_available_builtin(db: Session = Depends(get_db)):
    """获取可以添加的内置策略列表"""
    available = get_available_builtin_strategies(db)
    return {"strategies": available, "total": len(available)}


@router.post("/builtin/add")
def api_add_builtin_strategy(
    req: CreateStrategyRequest,
    db: Session = Depends(get_db)
):
    """添加一个内置策略到策略列表"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="策略名称不能为空")
    result = add_builtin_strategy(db, req.name.strip())
    if not result:
        raise HTTPException(status_code=404, detail="未找到该内置策略")
    return result


class BatchManageRequest(BaseModel):
    names: list[str]
    action: str  # add / delete / enable / disable


@router.get("/builtin/all")
def api_get_all_builtin_strategies(db: Session = Depends(get_db)):
    """获取所有内置策略及其当前状态"""
    strategies = get_all_builtin_strategies_with_status(db)
    return {"strategies": strategies, "total": len(strategies)}


@router.post("/builtin/batch")
def api_batch_manage_builtin_strategies(
    req: BatchManageRequest,
    db: Session = Depends(get_db)
):
    """批量管理内置策略（添加/删除/启用/禁用）"""
    if not req.names:
        raise HTTPException(status_code=400, detail="请选择至少一个策略")
    if req.action not in ("add", "delete", "enable", "disable"):
        raise HTTPException(status_code=400, detail="无效的操作类型")
    result = batch_manage_builtin_strategies(db, req.names, req.action)
    return result


@router.patch("/{strategy_id}/toggle")
def api_toggle_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """启用/禁用策略"""
    result = toggle_strategy_enabled(db, strategy_id)
    if not result:
        raise HTTPException(status_code=404, detail="策略不存在")
    status = "已启用" if result["enabled"] else "已禁用"
    return {
        "message": f"策略「{result['name']}」{status}",
        "strategy": result,
    }


@router.post("/{strategy_id}/move")
def api_move_strategy(strategy_id: int, direction: str = Query("up", pattern="^(up|down)$"), db: Session = Depends(get_db)):
    """调整策略排序"""
    ok = move_strategy(db, strategy_id, direction)
    if not ok:
        raise HTTPException(status_code=400, detail="无法移动（已在最前/最后）")
    return {"message": "ok"}


@router.post("/reorder")
def api_reorder_strategies(req: ReorderRequest, db: Session = Depends(get_db)):
    """拖拽排序：交换两个策略的位置"""
    ok = reorder_strategies(db, req.source_id, req.target_id)
    if not ok:
        raise HTTPException(status_code=404, detail="策略不存在")
    return {"message": "ok"}


@router.post("/{strategy_id}/run")
def api_run_strategy(
    strategy_id: int,
    limit: int = Query(0, ge=0, le=99999, description="扫描股票数量限制（0=全部）"),
    top_k: int = Query(50, ge=1, le=200, description="返回评分最高的前N条"),
    db: Session = Depends(get_db)
):
    """运行单个策略（已禁用——每日 0:00 / 17:00 定时自动扫描，无需手动触发）"""
    raise HTTPException(status_code=410, detail="手动扫描已关闭，系统每天 0:00 和 17:00 自动运行全部策略扫描，请前往「扫描结果」页面查看")


@router.post("/run-all")
def api_run_all_strategies(
    limit: int = Query(0, ge=0, le=99999, description="扫描股票数量限制（0=全部）"),
    top_k: int = Query(50, ge=1, le=200, description="每个策略返回评分最高的前N条"),
    db: Session = Depends(get_db)
):
    """运行所有启用的策略（已禁用——每日 0:00 / 17:00 定时自动扫描，无需手动触发）"""
    raise HTTPException(status_code=410, detail="手动扫描已关闭，系统每天 0:00 和 17:00 自动运行全部策略扫描，请前往「扫描结果」页面查看")
