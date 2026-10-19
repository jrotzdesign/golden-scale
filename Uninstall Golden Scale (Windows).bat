@echo off
REM Removes the Golden Scale panel. Leaves PlayerDebugMode alone.
if exist "%APPDATA%\Adobe\CEP\extensions\GoldenScale" rmdir /s /q "%APPDATA%\Adobe\CEP\extensions\GoldenScale"
echo Golden Scale removed. Restart Illustrator.
pause
