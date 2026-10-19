@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更高版本，然后重新打开本文件。
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络和上方报错。
    pause
    exit /b 1
  )
)
echo 启动后请打开 http://localhost:5173
call npm.cmd run dev
pause
