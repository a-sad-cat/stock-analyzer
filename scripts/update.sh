#!/bin/bash
# ==========================================
# stock-analyzer 快捷更新脚本
# 拉取最新代码 + 安装依赖 + 构建前端 + 重启服务
# 用法: bash scripts/update.sh
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ">>> 拉取最新代码..."
cd "$PROJECT_DIR"
# 丢弃服务器自动生成的缓存文件（否则 pull 会冲突）
git stash push -m "update-backup" -- backend/data/ frontend/package-lock.json frontend/dist/ 2>/dev/null || true
# 国内用 ghfast.top 代理加速 GitHub
git remote set-url origin https://ghfast.top/https://github.com/a-sad-cat/stock-analyzer.git
git pull origin deploy/aliyun
git remote set-url origin https://github.com/a-sad-cat/stock-analyzer.git
git stash drop 2>/dev/null || true

echo ">>> 安装/更新后端依赖..."
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "[WARN] 未找到 venv，尝试使用系统 python..."
fi
pip install -r backend/requirements.txt -q -i https://pypi.tuna.tsinghua.edu.cn/simple

echo ">>> 构建前端..."
cd frontend
npm install --silent
npm run build
cd ..

echo ">>> 重启服务..."
fuser -k 8000/tcp 2>/dev/null || true
sleep 2

cd backend
# SQLite 用单 worker 避免数据库锁冲突
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 > ../app.log 2>&1 &

echo ">>> 等待启动..."
sleep 3
tail -n 20 -f ../app.log
