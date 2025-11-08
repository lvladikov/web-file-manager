#!/bin/bash

# Dual-Panel File Manager - Start Script
# ensure `chmod +x ./start.sh` has been done before first use

# This script is responsible for starting the development server
# for the Dual-Panel File Manager application.
# It dynamically checks for Node.js, npm, the presence of node_modules directories, and ffmpeg before running the server.

echo "Starting Dual-Panel File Manager development server..."

# Check for Node.js
if ! command -v node &> /dev/null
then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js to run the development server."
    echo "You can download it from https://nodejs.org/ or use a version manager like nvm."
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null
then
    echo "Error: npm is not installed."
    echo "npm is usually installed with Node.js. Please ensure Node.js is correctly installed."
    echo "If you have Node.js, try reinstalling it or checking your PATH environment variable."
    exit 1
fi

# Check for node_modules directories
if [ ! -d "./node_modules" ] || \
   [ ! -d "./packages/server/node_modules" ]; then
    echo "Error: node_modules directories not found."
    echo "Please run 'npm install' to install dependencies."
    exit 1
fi

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null
then
    echo "Warning: ffmpeg is not installed. Video preview transcoding will not work."
    echo "Please install ffmpeg and make it accessible in your system's PATH."
    echo "  - macOS (with Homebrew): brew install ffmpeg"
    echo "  - Ubuntu/Debian: sudo apt install ffmpeg"
fi

# If Node.js and npm are available, proceed to run the dev server

npm run dev

echo "Dual-Panel File Manager development server stopped."
