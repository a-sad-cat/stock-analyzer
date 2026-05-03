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

echo ">>> 重启服务..."
source venv/bin/activate
kill $(lsof -t -i:8000) 2>/dev/null || true
cd backend
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2 > ../app.log 2>&1 &

echo ">>> 等待启动..."
sleep 3
tail -5 ../app.log
echo ""
echo ">>> 完成！访问 http://$(curl -s ifconfig.me 2>/dev/null || echo '<服务器IP>'):8000"
