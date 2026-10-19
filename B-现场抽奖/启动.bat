@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 没装 Node.js：先装 Node.js 18 以上（https://nodejs.org），再双击这个文件。 & pause & exit /b 1)
rem 等服务起来再开浏览器
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:1025/"
node server.js
pause
