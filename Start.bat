@echo off
pushd %~dp0
set NODE_ENV=production
call npm install --no-save --no-audit --no-fund --loglevel=error --no-progress --omit=dev --ignore-scripts
if errorlevel 1 goto end
node scripts/ensure-native-dependencies.js
if errorlevel 1 goto end
node server.js %*
:end
pause
popd
