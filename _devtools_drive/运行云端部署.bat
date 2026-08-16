@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   小淼饭店 - 云端模式一键部署
echo ============================================
echo.
echo  本窗口会：检测 Node → 装 CloudBase CLI → 腾讯云扫码登录
echo  → 创建环境 → 部署 auth 云函数 → 保存环境ID
echo.
echo  请按提示操作，遇到需要扫码时微信扫一下。
echo.
pause
powershell -ExecutionPolicy Bypass -File "deploy_cloudbase.ps1"
echo.
echo  部署结束。若上方显示了环境ID，请复制发给你的助手。
pause
