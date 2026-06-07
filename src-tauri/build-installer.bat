@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================================
echo            DisplaySong Installer Builder
echo ============================================================
echo.

REM Get script directory
set "SCRIPT_DIR=%~dp0"
set "NSIS_DIR=%SCRIPT_DIR%nsis"

REM Check NSIS
where makensis >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] NSIS nicht gefunden!
    echo Download: https://nsis.sourceforge.io/Download
    pause
    exit /b 1
)

REM Check build
if not exist "%SCRIPT_DIR%target\release\displaysong.exe" (
    echo [ERROR] Build nicht gefunden! Erst 'cargo tauri build' ausfuehren.
    pause
    exit /b 1
)

echo [1/5] Kopiere Dateien...
copy "%SCRIPT_DIR%target\release\displaysong.exe" "%NSIS_DIR%\" >nul 2>&1
copy "%SCRIPT_DIR%icons\icon.ico" "%NSIS_DIR%\" >nul 2>&1

echo [2/5] Pruefe Python Embedded...
if not exist "%NSIS_DIR%\python\python.exe" (
    echo        Python nicht gefunden, lade herunter...
    
    REM Remove old python folder if exists
    if exist "%NSIS_DIR%\python" rmdir /s /q "%NSIS_DIR%\python"
    
    REM Download using curl (comes with Windows 10+)
    curl -L -o "%TEMP%\python-embed.zip" "https://www.python.org/ftp/python/3.11.7/python-3.11.7-embed-amd64.zip" 2>nul
    
    if exist "%TEMP%\python-embed.zip" (
        echo        Extrahiere Python...
        mkdir "%NSIS_DIR%\python" 2>nul
        tar -xf "%TEMP%\python-embed.zip" -C "%NSIS_DIR%\python"
        del "%TEMP%\python-embed.zip"
        
        REM Enable pip
        echo import site>> "%NSIS_DIR%\python\python311._pth"
        
        REM Download get-pip
        echo        Lade pip herunter...
        curl -L -o "%NSIS_DIR%\python\get-pip.py" "https://bootstrap.pypa.io/get-pip.py" 2>nul
        
        if exist "%NSIS_DIR%\python\get-pip.py" (
            echo        Installiere pip...
            "%NSIS_DIR%\python\python.exe" "%NSIS_DIR%\python\get-pip.py" --no-warn-script-location >nul 2>&1
            del "%NSIS_DIR%\python\get-pip.py"
            
            echo        Installiere Abhaengigkeiten...
            "%NSIS_DIR%\python\python.exe" -m pip install discord.py pynput requests --quiet --no-warn-script-location 2>nul
            
            echo        Python bereit!
        ) else (
            echo [WARN] pip Download fehlgeschlagen
        )
    ) else (
        echo [WARN] Python Download fehlgeschlagen
    )
) else (
    echo        Python bereits vorhanden
)

echo [3/5] Pruefe Plugins...
if exist "%NSIS_DIR%\plugins\lyrics-plugin\manifest.json" (
    echo        Plugins OK
) else (
    echo [WARN] Plugins nicht gefunden
)

echo [4/5] Erstelle Installer...
pushd "%NSIS_DIR%"
makensis /V2 installer.nsi
set BUILD_RESULT=%ERRORLEVEL%
popd

if %BUILD_RESULT% NEQ 0 (
    echo [ERROR] Build fehlgeschlagen!
    pause
    exit /b 1
)

echo [5/5] Verschiebe Installer...
move "%NSIS_DIR%\DisplaySong-Setup.exe" "%SCRIPT_DIR%target\release\" >nul 2>&1

echo.
echo ============================================================
echo                     BUILD ERFOLGREICH
echo ============================================================
echo.
echo   Datei: target\release\DisplaySong-Setup.exe
echo.

pause
