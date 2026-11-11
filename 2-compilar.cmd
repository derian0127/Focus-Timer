@echo off
rem Ejecuta las pruebas, compila la aplicacion y genera el instalador en release\.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1"
echo.
pause
