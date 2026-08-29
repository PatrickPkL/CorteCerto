@echo off
rem Liga o servidor Corte Certo (log em .pg\server.log).
rem O processo roda enquanto a sessão estiver ativa.
rem Uso: scripts\start-server.cmd   (ou a tarefa agendada "cortecerto_app")
cd /d "%~dp0.."
node server.js >> ".pg\server.log" 2>&1