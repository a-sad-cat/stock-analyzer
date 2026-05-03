@echo off
chcp 65001 > nul 2>&1
pushd "%~dp0..\backend" || (
  echo [ERROR] Failed to change to backend directory
  pause
  exit /b 1
)
echo ========================================
echo 启动 stock-analyzer 后端服务
echo 端口: 8000
echo ========================================
echo.
echo 启动中... (首次启动可能较慢，因为要加载AKShare)
echo.
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
