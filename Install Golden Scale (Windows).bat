@echo off
REM Installs the Golden Scale panel for Adobe Illustrator (Windows).
set DEST=%APPDATA%\Adobe\CEP\extensions\GoldenScale
echo Installing Golden Scale to %DEST%
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy /e /i /q "%~dp0GoldenScale" "%DEST%" >nul

echo Enabling unsigned extensions (PlayerDebugMode) for CEP 9-14
for %%v in (9 10 11 12 13 14) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)
echo.
echo Done. Restart Illustrator, then open Window ^> Extensions ^> Golden Scale
pause
