#!/bin/bash
# ==========================================
# stock-analyzer 阿里云一键部署脚本
# 用法: bash scripts/deploy.sh
# 要求: Ubuntu 22.04+ / Python 3.10+
# ==========================================

set -e

echo "=========================================="
echo " stock-analyzer 部署到阿里云"
echo "=========================================="

# 1. 检查 Python
PYTHON=$(command -v python3 || command -v python)
if [ -z "$PYTHON" ]; then
    echo "[ERROR] 未找到 Python，请先安装: apt install python3 python3-pip python3-venv"
    exit 1
fi
echo "[OK] Python: $($PYTHON --version)"

# 2. 创建虚拟环境（可选）
if [ ! -d "venv" ]; then
    echo ">>> 创建虚拟环境..."
    $PYTHON -m venv venv
fi
source venv/bin/activate

# 3. 安装依赖（使用清华源加速）
echo ">>> 安装 Python 依赖..."
pip install -r backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 4. 确认前端构建文件存在
if [ ! -d "frontend/dist" ]; then
    echo "[WARN] frontend/dist 不存在，请在本地先执行 npm run build 并提交到 git"
fi

# 5. 启动服务
echo ">>> 启动服务..."
echo "    访问地址: http://<服务器IP>:8000"
echo "    停止服务: Ctrl+C"
echo ""
cd backend
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
