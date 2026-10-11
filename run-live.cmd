@echo off
rem Used by Windows Task Scheduler. Runs the agent once and appends output to logs\agent.log
cd /d "%~dp0"
if not exist logs mkdir logs
echo ===== %date% %time% ===== >> logs\agent.log
call npm run start:live >> logs\agent.log 2>&1
