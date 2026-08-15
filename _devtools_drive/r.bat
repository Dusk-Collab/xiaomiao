@echo off
chcp 65001 >nul
set NODE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe
set CLI="C:\Users\Administrator\WorkBuddy\2026-08-07-10-09-09\_devtools_drive\node_modules\@cloudbase\cli\bin\cloudbase"
set ROOT=C:\Users\Administrator\WorkBuddy\2026-08-07-10-09-09
set ENVID_FILE=%ROOT%\_devtools_drive\envid.txt

echo ============================================
echo   Xiaomiao Restaurant - Cloud Mode Deploy
echo ============================================
echo.
echo  Two login modes:
echo    [A] API key - the FASTEST (skip QR scan):
echo        1. Open https://console.cloud.tencent.com/cam/capi
echo        2. Click "Create Key", copy SecretId and SecretKey
echo        3. Paste them below when prompted
echo.
echo    [B] WeChat QR scan (slower, may need browser popup).
echo.
echo  This script will:
echo    1. Log in (A or B)
echo    2. List your environments / paste a new env ID
echo    3. Deploy the auth cloud function
echo    4. Save the env ID to envid.txt
echo.
pause

echo.
echo [1/5] Verifying CLI ...
%NODE% %CLI% --version
if errorlevel 1 (
  echo !! CLI not found. Install once:
  echo    "%NODE%" "%ROOT%\.workbuddy\binaries\node\versions\22.22.2\node_modules\npm\bin\npm-cli.js" install --registry=https://registry.npmmirror.com --no-audit --no-fund -prefix "%ROOT%\_devtools_drive" @cloudbase/cli@latest
  pause
  exit /b 1
)

echo.
echo [2/5] Login mode?  Enter A (API key) or B (WeChat QR):
set /p MODE=
if /i "%MODE%"=="A" goto LOGIN_KEY
if /i "%MODE%"=="B" goto LOGIN_QR

:LOGIN_KEY
echo.
echo Paste your SecretId:
set /p SECRET_ID=
echo Paste your SecretKey:
set /p SECRET_KEY=
echo Logging in ...
%NODE% %CLI% login --apiKeyId "%SECRET_ID%" --apiKey "%SECRET_KEY%"
if errorlevel 1 (
  echo !! API-key login failed. Check the keys and retry.
  pause
  exit /b 1
)
goto LIST_ENV

:LOGIN_QR
echo.
echo A browser window should pop up. If not, copy/paste the URL printed below.
echo.
%NODE% %CLI% login --flow web
if errorlevel 1 (
  echo !! QR login failed or cancelled. Try API-key mode (run again, choose A).
  pause
  exit /b 1
)

:LIST_ENV
echo.
echo [3/5] Listing existing environments ...
%NODE% %CLI% env:list
echo.
echo Paste the env ID you want to use (from the list above,
echo or from https://console.cloud.tencent.com/tcb - looks like xiaomiao-7gabc123).
echo If none exists yet, open that console link, create one (Pay-as-you-go),
echo then paste its env ID here.
set /p ENV_ID=
if "%ENV_ID%"=="" (
  echo !! No env ID provided.
  pause
  exit /b 1
)

echo.
echo [4/5] Deploying auth cloud function to %ENV_ID% ...
%NODE% %CLI% fn deploy auth -e "%ENV_ID%" --force "%ROOT%\weapp\cloudfunctions\auth"
if errorlevel 1 (
  echo !! Function deploy failed. Confirm env ID is correct and active.
  pause
  exit /b 1
)

echo %ENV_ID% > "%ENVID_FILE%"

echo.
echo [5/5] Opening console so you can enable 2 things ...
start "" "https://console.cloud.tencent.com/tcb/env/setting?envId=%ENV_ID%"
echo   a. Login methods -^> enable "Anonymous login" -^> Save
echo   b. Security domains -^> add  https://dusk-collab.github.io  -^> Save

echo.
echo ============================================
echo   DONE - Send this env ID to your assistant:
echo      %ENV_ID%
echo   (also saved to %ENVID_FILE%)
echo ============================================
pause
