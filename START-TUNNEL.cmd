@echo off
cd /d "%~dp0"
echo Mo tunnel HTTPS toi http://127.0.0.1:3000 (can chay START-GUARDIAN.cmd truoc).
echo Link moi nguoi than / ghep dien thoai trong app se tu dung link https cua tunnel.
node scripts\tunnel.mjs
pause
