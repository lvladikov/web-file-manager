# Dual-Panel File Manager - Start Script for PowerShell

# This script is responsible for starting the development server
# for the Dual-Panel File Manager application.
# It dynamically checks for Node.js, npm, the presence of node_modules directories, and ffmpeg before running the server.

# If you're running this script for the first time, you might need to set the execution policy.
# You can do this by running the following command in PowerShell as an administrator:
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser


Write-Host "Starting Dual-Panel File Manager development server..."

# Check for Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed."
    Write-Host "Please install Node.js to run the development server."
    Write-Host "You can download it from https://nodejs.org/ or use a version manager like nvm."
    exit 1
}

# Check for npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm is not installed."
    Write-Host "npm is usually installed with Node.js. Please ensure Node.js is correctly installed."
    Write-Host "If you have Node.js, try reinstalling it or checking your PATH environment variable."
    exit 1
}

# Check for node_modules directories
$modulePaths = @(
    "./node_modules",
    "./packages/server/node_modules"
)

$missingModule = $false
foreach ($path in $modulePaths) {
    if (-not (Test-Path $path)) {
        $missingModule = $true
        break
    }
}

if ($missingModule) {
    Write-Host "Error: One or more node_modules directories not found."
    Write-Host "Please run 'npm install' to install dependencies."
    exit 1
}

# Check for ffmpeg
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "Warning: ffmpeg is not installed. Video preview transcoding will not work."
    Write-Host "Please install ffmpeg and make it accessible in your system's PATH."
    Write-Host "Download from the official FFmpeg website (https://ffmpeg.org/download.html) and add the 'bin' directory to your system's PATH."
}

# If Node.js and npm are available, proceed to run the dev server
npm run dev

Write-Host "Dual-Panel File Manager development server stopped."
