@echo off
chcp 65001 > nul
echo ========================================
echo  安装 stock-analyzer 所有依赖
echo ========================================
echo.

echo [1/3] 安装后端 Python 依赖...
cd /d "%~dp0..\backend"
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ pip 安装失败，尝试使用 python -m pip...
    python -m pip install -r requirements.txt
)
echo ✅ 后端依赖安装完成
echo.

echo [2/3] 安装前端依赖...
cd /d "%~dp0..\frontend"
call npm install
echo ✅ 前端依赖安装完成
echo.

echo [3/3] 创建启动脚本链接...
echo.
echo ========================================
echo ✅ 全部安装完成！
echo.
echo 启动方式：
echo   后端: scripts\start_backend.bat
echo   前端: scripts\start_frontend.bat
echo.
echo 然后访问: http://localhost:5173
echo ========================================
pause
