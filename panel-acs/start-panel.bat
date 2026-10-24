@echo off
title GENIEACS TR-069 + NOC WEB PANEL (BY KURTECH)
cd /d "%~dp0"
echo ===================================================
echo   MEMULAI GENIEACS TR-069 + NOC WEB PANEL (BY KURTECH)...
echo ===================================================
set "PATH=%PATH%;C:\Program Files\nodejs"
node server.js
if %errorlevel% neq 0 (
  "C:\Program Files\nodejs\node.exe" server.js
)
pause
