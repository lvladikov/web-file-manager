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

## Features



-   **Dual-Panel Layout**: A dual-panel file manager designed for efficient file operations. The two independent panels allow you to browse two different locations simultaneously, making it easy to move, copy, and compare files and folders between them.



-   **File & Folder Listing**: Each panel lists files and folders. Long names are dynamically truncated. Icons next to each name (folder icon for folders, text file icon for text files, image icon for images, etc.) help identify the type.



-   **Navigation & Selection**: Navigate using mouse (double-click to enter folder/open file) or keyboard (ArrowUp/Down, Enter, Backspace, Home, End, PageUp/Down).

    -   **Selection**: Click to select. Cmd/Ctrl + click to add/remove. Shift + click to select a range.

    -   **Select All** (Cmd/Ctrl+A)

    -   **Unselect All** (Cmd/Ctrl+D)

    -   **Invert Selection** (*)

    -   **Quick Select** (+): Opens a dialog to select files and folders that match a specific pattern (wildcards or regex).

    -   **Quick Unselect** (-): Opens a dialog to unselect items based on a pattern.

    -   **Quick Filter** (.): Opens an input at the bottom of the panel to filter visible items in real-time. File operations like Copy and Delete will only apply to the filtered items.



-   **File Preview**: Preview images, videos, PDFs, and text files by focusing an item and pressing Spacebar.



-   **Context Menus**: Right-clicking on an item or empty area opens a context menu with relevant actions (Viewing, File Operations, Organization, Folder Tools).



-   **Calculate Folder Size & Progress**: Calculate the size of a folder (including all its subfolders and and files) from the context menu or by pressing Spacebar on a focused folder. A progress modal shows the current file being processed and the "Size so far".



-   **Path Bar & Breadcrumbs**: Displays the current directory path with clickable "breadcrumbs" for easy navigation. Right-clicking the path bar offers a "Choose folder..." option.



-   **Favourites**: The star icon next to the path bar allows you to manage your favourite paths. Add the current path or select a previously saved favourite path. Favourites are remembered across sessions.



-   **Top Menus**: "File" and "Select" menus provide access to comprehensive file management and selection tools.



-   **Function Key Actions**: The bar at the bottom of the screen shows primary actions mapped to F1-F8 keys for common operations.

    -   <kbd>F1</kbd>: Open Help dialog.

    -   <kbd>F2</kbd>: Rename the currently focused item.

    -   <kbd>F3</kbd>: View/Open the focused item with its default application.

    -   <kbd>F5</kbd>: Copy selected items from the active panel to the other panel.

    -   <kbd>F7</kbd>: Create a new folder in the active panel.

    -   <kbd>F8</kbd>: Delete the selected items.



-   **Copy Operation & Conflict Modes**: When copying, if an item exists in the target, a confirmation dialog appears with choices for handling conflicts (e.g., "Yes to All", "Copy if New", "No to All", "Skip if Source is Empty", "Overwrite if Size Differs", "Replace if Smaller").
