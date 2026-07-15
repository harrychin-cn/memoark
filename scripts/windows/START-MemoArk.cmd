@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "PACKAGE_ROOT=%~dp0"
set "BINARY=%PACKAGE_ROOT%memos.exe"
set "URL=http://127.0.0.1:5230/"

if not defined MEMOARK_DATA_DIR (
  if "%LOCALAPPDATA%"=="" (
    echo ERROR: LOCALAPPDATA is unavailable. Set MEMOARK_DATA_DIR to a writable folder and try again.
    pause
    exit /b 1
  )
  set "MEMOARK_DATA_DIR=%LOCALAPPDATA%\MemoArk"
)

if not defined MEMOARK_PORT set "MEMOARK_PORT=5230"
set "URL=http://127.0.0.1:%MEMOARK_PORT%/"

if not exist "%BINARY%" (
  echo ERROR: memos.exe was not found beside this launcher.
  echo Re-extract the complete MemoArk ZIP before starting it.
  pause
  exit /b 1
)

if not exist "%MEMOARK_DATA_DIR%" mkdir "%MEMOARK_DATA_DIR%"
if not exist "%MEMOARK_DATA_DIR%" (
  echo ERROR: Cannot create the MemoArk data folder:
  echo %MEMOARK_DATA_DIR%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%URL%api/v1/instance/profile' -TimeoutSec 2; if ($response.StatusCode -eq 200) { Start-Process '%URL%'; exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo MemoArk is already running on %URL%
  echo The existing local instance was opened in your browser.
  exit /b 0
)

if /I not "%MEMOARK_NO_BROWSER%"=="1" (
  start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(45); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%URL%api/v1/instance/profile' -TimeoutSec 2; if ($response.StatusCode -eq 200) { Start-Process '%URL%'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }"
)

echo Starting MemoArk at %URL%
echo Data folder: %MEMOARK_DATA_DIR%
echo Keep this window open while using MemoArk. Press Ctrl+C to stop it safely.
echo.
"%BINARY%" --addr 127.0.0.1 --port %MEMOARK_PORT% --data "%MEMOARK_DATA_DIR%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo MemoArk stopped with exit code %EXIT_CODE%.
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
