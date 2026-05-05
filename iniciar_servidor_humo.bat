@echo off
title Servidor Simulacion de Humo — RDCFT
cd /d "%~dp0"
echo.
echo  ============================================
echo   Servidor Simulacion de Humo  (RDCFT)
echo   http://localhost:5001
echo  ============================================
echo.
echo  Iniciando... No cierres esta ventana.
echo.
python scripts\server.py
echo.
echo  El servidor se detuvo. Presiona una tecla para cerrar.
pause > nul
