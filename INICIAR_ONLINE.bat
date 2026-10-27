@echo off
title Sistema de Gestao de Ocorrencias TI - Modo Nuvem
color 0b
cls
echo ======================================================================
echo   SISTEMA DE GESTAO DE OCORRENCIAS DE T.I. - HOSPITAL REGIONAL
echo   Iniciando Servidor Local e Gerando Link Seguro em Nuvem (HTTPS)...
echo ======================================================================
echo.

:: Inicia o servidor Node.js em background caso nao esteja rodando
start /b "" node src/server.js

:: Aguarda 2 segundos para o Express inicializar
timeout /t 2 /nobreak >nul

:: Inicia o Tunel Cloudflare / LocalTunnel para gerar o Link Publico
node scripts/start-tunnel.js

pause
