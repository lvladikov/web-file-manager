@echo off

:: This script is responsible for starting the development server
:: for the Dual-Panel File Manager application.
:: It dynamically checks for Node.js, npm, the presence of node_modules directories, and ffmpeg before running the server.
echo Starting Dual-Panel File Manager development server...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js to run the development server.
    echo You can download it from https://nodejs.org/
    goto :eof
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed.
    echo npm is usually installed with Node.js. Please ensure Node.js is correctly installed.
    goto :eof
)

if not exist "node_modules" (
    set "error=1"
) else if not exist "packages\server\node_modules" (
    set "error=1"
)

if defined error (
    echo Error: One or more node_modules directories not found.
    echo Please run 'npm install' to install dependencies.
    goto :eof
)

where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo Warning: ffmpeg is not installed. Video preview transcoding will not work.
    echo Please install ffmpeg and make it accessible in your system's PATH.
    echo Download from the official FFmpeg website (https://ffmpeg.org/download.html) and add the 'bin' directory to your system's PATH.
)

npm run dev

echo Dual-Panel File Manager development server stopped.
