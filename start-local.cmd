@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installeer eerst Node.js 24 LTS en open dit bestand daarna opnieuw.
  pause
  exit /b 1
)
if not exist node_modules\vite\package.json (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
