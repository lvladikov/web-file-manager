# Dual-Panel File Manager Monorepo [ACTIVE WORK IN PROGRESS - DO NOT USE YET]

This project is a dual-panel file manager inspired by applications like Midnight Commander and Double Commander, built with a React frontend and a Node.js (Express) backend. The project is structured as a monorepo using npm workspaces.

## Project Structure

```
/
├── packages/
│ ├── client/ # React Frontend
│ └── server/ # Node.js Backend
├── package.json # Root package.json for monorepo management
└── README.md
```

## Prerequisites

- **Node.js** (v18 or later recommended)

- **npm** (v8 or later recommended)

- **FFmpeg**: This is required for the video preview transcoding feature. It must be installed and accessible in your system's PATH.
  - **macOS (with Homebrew):** `brew install ffmpeg`
  - **Ubuntu/Debian:** `sudo apt install ffmpeg`
  - **Windows:** Download from the [official FFmpeg website](https://ffmpeg.org/download.html) and add the `bin` directory to your system's PATH.

## Getting Started

- Install Dependencies:
  Open your terminal at the root of the project and run the following command. This will install dependencies for the root, the client, and the server all at once.

`npm install`

- Run the Application:
  To start both the backend server and the frontend client in development mode, run this command from the root directory:

`npm run dev`

This command uses concurrently to:

- Start the Node.js server on http://localhost:3001 (with nodemon for auto-restarting).

- Start the React development server on http://localhost:5173.

Your browser should automatically open to the React application.

## How It Works

The React client makes API calls to the Node.js server to get directory listings.

The Node.js server interacts with the local file system to provide the data requested by the client.

A proxy is configured in the Vite settings (packages/client/vite.config.js) to forward requests from /api on the client to the backend server on port 3001. This avoids CORS issues during development.
