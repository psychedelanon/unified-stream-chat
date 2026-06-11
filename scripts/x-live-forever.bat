@echo off
rem Keeps the X live chat bridge running permanently. Put a shortcut to this
rem file in shell:startup to have it start with Windows. The bridge itself
rem waits for broadcasts, so leaving this running costs nothing between shows.
cd /d "%~dp0.."
:loop
call npm run x-live
echo Bridge exited; restarting in 15 seconds. Press Ctrl+C to stop for real.
timeout /t 15 >nul
goto loop
