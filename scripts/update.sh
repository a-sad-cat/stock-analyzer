#!/bin/bash
# ==========================================
# stock-analyzer 快捷更新脚本
# 拉取最新代码 + 重启服务（依赖只首次装）
# 用法: bash scripts/update.sh
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ">>> 拉取最新代码..."
cd "$PROJECT_DIR"
git remote set-url origin https://ghfast.top/https://github.com/a-sad-cat/stock-analyzer.git
git pull origin deploy/aliyun
git remote set-url origin https://github.com/a-sad-cat/stock-analyzer.git

echo ">>> 构建前端..."
cd frontend
npm install --silent
npm run build
cd ..

echo ">>> 重启服务..."
source venv/bin/activate
fuser -k 8000/tcp 2>/dev/null || true
sleep 2

cd backend
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2 > ../app.log 2>&1 &

echo ">>> 等待启动..."
sleep 3
tail -n 20 -f ../app.log
