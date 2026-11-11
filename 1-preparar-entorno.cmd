@echo off
rem Comprueba e instala las herramientas de compilacion (Node, Rust, MSVC Build Tools).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" -Install
echo.
pause
