@echo off
chcp 65001 > nul 2>&1
pushd "%~dp0..\frontend" || (
  echo [ERROR] Failed to change to frontend directory
  pause
  exit /b 1
)
echo ========================================
echo 启动 stock-analyzer 前端服务
echo 端口: 5173
echo ========================================
echo.
echo 启动中...
echo.
call npm run dev
pause
