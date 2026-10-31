@echo off
cd /d "%~dp0"
node scripts/open-demo.mjs --phone
if errorlevel 1 pause
