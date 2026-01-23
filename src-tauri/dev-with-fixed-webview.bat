@echo off
REM DisplaySong Development Launcher mit Fixed WebView2 Runtime

set WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=%~dp0webview2-runtime\Microsoft.WebView2.FixedVersionRuntime.143.0.3650.139.x64

echo ========================================
echo DisplaySong Development Mode
echo ========================================
echo.
echo WebView2 Runtime: %WEBVIEW2_BROWSER_EXECUTABLE_FOLDER%
echo.

if not exist "%WEBVIEW2_BROWSER_EXECUTABLE_FOLDER%\msedgewebview2.exe" (
    echo FEHLER: WebView2 Runtime nicht gefunden!
    echo.
    echo Bitte führe zuerst aus: setup-webview2.bat
    echo.
    pause
    exit /b 1
)

echo Starte Tauri Dev Server...
echo.

cd /d "%~dp0.."
npm run dev
