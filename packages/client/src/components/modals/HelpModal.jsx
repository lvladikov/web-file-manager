import React from "react";
import { XCircle } from "lucide-react";

import { metaKey } from "../../lib/utils";
import Icon from "../ui/Icon";

import dualPanelsScreenshot from "../../../screenshots/dual-panels.png";
import panelInfoScreenshot from "../../../screenshots/panel-info.png";
import contextMenuScreenshot from "../../../screenshots/context-menu.png";
import fileTruncationScreenshot from "../../../screenshots/file-truncation.png";
import folderTruncationScreenshot from "../../../screenshots/folder-truncation.png";
import quickFilterScreenshot from "../../../screenshots/quick-filter.png";
import itemsSelectionScreenshot from "../../../screenshots/items-selection.png";
import folderUpScreenshot from "../../../screenshots/folder-up.png";
import calcFolderSizeScreenshot from "../../../screenshots/calc-folder-size.png";
import copyProgressScreenshot from "../../../screenshots/copy-progress.png";
import pathBreadcrumbsScreenshot from "../../../screenshots/path-breadcrumbs.png";
import favouritesMenuScreenshot from "../../../screenshots/favourites-menu.png";
import fileMenuScreenshot from "../../../screenshots/file-menu.png";
import actionBarScreenshot from "../../../screenshots/action-bar.png";
import overwriteModalScreenshot from "../../../screenshots/overwrite-modal.png";
import builtInTerminalScreenshot from "../../../screenshots/built-in-terminal.png";
import electronScreenshot from "../../../screenshots/electron.png";
import searchScreenshot from "../../../screenshots/search.png";
import fmScreenshot from "../../../screenshots/fm.png";

const HelpSection = ({ title, id, children }) => (
  <section id={id} className="mb-8">
    <h2 className="text-2xl font-bold text-sky-400 border-b-2 border-sky-700 pb-2 mb-4">
      {title}
    </h2>
    <div className="space-y-4 text-gray-300 leading-relaxed">{children}</div>
  </section>
);

const HelpModal = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  const sections = [
    "General Purpose",
    "File & Folder Listing",
    "Panel Usage and Information",
    "Real-time Folder Monitoring",
    "Navigation & Selection",
    "Quick Select / Unselect & Quick Filter",
    "Previewing Files",
    "Context Menus",
    "Copy Paths",
    "Calculate Folder Size",
    "Progress Modals",
    "Path Bar & Breadcrumbs",
    "Favourites",
    "Top Menus",
    "Search",
    "Operations via Console",
    "Function Key Actions",
    "Copy/Move Operation & Conflict Modes",
    "Terminal",
    "Electron App",
  ];

  const handleLinkClick = (e, section) => {
    e.preventDefault();
    const id = section
      .toLowerCase()
      .replace(/\//g, "-")
      .replace(/ /g, "-")
      .replace(/&/g, "and");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b border-gray-600 flex-shrink-0">
          <h1 className="text-3xl font-bold text-sky-300">
            Application Help (F1)
          </h1>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700"
            title="Close (Esc)"
          >
            <XCircle className="w-8 h-8" />
          </button>
        </header>
        <main className="flex-grow p-6 overflow-y-auto">
          <div className="mb-8 p-4 bg-gray-900 rounded-lg">
            <h2 className="text-xl font-bold text-sky-300 mb-3">
              Table of Contents
            </h2>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${section
                      .toLowerCase()
                      .replace(/\//g, "-")
                      .replace(/ /g, "-")
                      .replace(/&/g, "and")}`}
                    onClick={(e) => handleLinkClick(e, section)}
                    className="text-gray-300 hover:text-sky-400 hover:underline"
                  >
                    {section}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <HelpSection id="general-purpose" title="General Purpose">
            <p>
              This is a dual-panel file manager designed for efficient file
              operations. The two independent panels allow you to browse two
              different locations simultaneously, making it easy to move, copy,
              and compare files and folders between them.
            </p>
            <p>
              This project is inspired by applications like Midnight Commander
              and Double Commander, built with a React frontend and a Node.js
              (Express) backend. The project is structured as a monorepo using
              npm workspaces.
            </p>
            <img
              src={dualPanelsScreenshot}
              alt="Dual Panel Screenshot"
              className="w-full rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection
            id="file-and-folder-listing"
            title="File & Folder Listing"
          >
            <p>
              Each panel lists the files and folders in the current directory.
              To handle long names in limited space, the application dynamically
              truncates them by replacing the middle part with an ellipsis
              (...), ensuring you can still see the beginning and end of the
              name.
            </p>
            <p>
              <strong>Sorting</strong>: You can sort the list by clicking on the
              column headers (<strong>Name</strong>, <strong>Size</strong>,{" "}
              <strong>Modified</strong>). Clicking the same column header
              toggles the sort direction between ascending (up arrow) and
              descending (down arrow).{" "}
              <strong>Note: The item selection remains preserved</strong> when
              changing the sort order.
            </p>
            <img
              src={folderTruncationScreenshot}
              alt="Folder Truncation Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
            <img
              src={fileTruncationScreenshot}
              alt="File Truncation Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
            <p className="inline-flex items-center align-middle">
              Icons next to each name help identify the type:
              <span className="inline-flex items-center align-middle mx-1">
                <Icon type="folder" className="mr-1" /> for folders,
              </span>
              <span className="inline-flex items-center align-middle mx-1">
                <Icon type="file" className="mr-1" /> for text files,
              </span>
              <span className="inline-flex items-center align-middle mx-1">
                <Icon type="image" className="mr-1" /> for images,
              </span>{" "}
              etc.
            </p>
          </HelpSection>

          <HelpSection
            id="panel-usage-and-information"
            title="Panel Usage and Information"
          >
            <p>
              At the bottom of each panel, you'll find useful information about
              the current directory and selected items:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Free/Used Space:</strong> On the right side, the total
                disk space and available free space for the current
                drive/partition are displayed. The percentage of free space is
                color-coded for a quick visual cue:{" "}
                <span className="text-green-400">green</span> for more than 25%
                free, <span className="text-yellow-400">yellow</span> for 10-25%
                free, and <span className="text-red-400">red</span> for less
                than 10% free. This gives you a quick overview of storage
                utilization.
              </li>
              <li>
                <strong>Selected Items Summary:</strong> On the left side, a
                summary of your current selection is shown, including the total
                number of items selected. Hovering over this text will reveal a
                tooltip with a detailed breakdown of selected files and folders,
                and their combined size. If folders are selected, the tooltip
                will also provide a hint on how to calculate their full
                contents' size.
              </li>
              <li>
                <strong>Swap panels:</strong> You can quickly swap the content
                of the two panels using <kbd>{metaKey} + U</kbd>. This is useful
                when you want to change which panel is the source and which is
                the destination for file operations, or simply to re-arrange
                your view.
              </li>
            </ul>
            <img
              src={panelInfoScreenshot}
              alt="Panel Info Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection
            id="real-time-folder-monitoring"
            title="Real-time Folder Monitoring"
          >
            <p>
              The application automatically monitors the directories shown in
              both panels for any changes made outside of the app. If you
              create, delete, or rename a file or folder in one of the visible
              directories using another program (like your operating system's
              file explorer), the panel will automatically refresh to reflect
              these changes in real-time.
            </p>
            <p>
              This ensures that the file listings are always up-to-date without
              requiring a manual refresh.
            </p>
          </HelpSection>

          <HelpSection
            id="navigation-and-selection"
            title="Navigation & Selection"
          >
            <p>
              You can navigate the file system using either the mouse or the
              keyboard.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                Navigate using mouse (double-click to enter folder/open file) or
                keyboard (<kbd>ArrowUp</kbd>/<kbd>Down</kbd>, <kbd>Enter</kbd>,{" "}
                <kbd>Backspace</kbd>, <kbd>Home</kbd>, <kbd>End</kbd>,{" "}
                <kbd>PageUp</kbd>/<kbd>PageDown</kbd>). Use the ".." entry to go
                up to the parent directory.
                <img
                  src={folderUpScreenshot}
                  alt="Folder Up Screenshot"
                  className="w-3/4 mx-auto rounded-lg shadow-lg"
                />
              </li>
              <li>
                <strong>Selection:</strong>
                <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                  <li>Click an item to select it.</li>
                  <li>
                    Hold <kbd>{metaKey}</kbd> and click to add or remove
                    individual items from the selection.
                  </li>
                  <li>
                    Hold <kbd>Shift</kbd> and click to select a range of items.
                  </li>
                  <li>
                    Press <kbd>{metaKey} + A</kbd> to select all items.
                  </li>
                  <li>
                    Press <kbd>{metaKey} + D</kbd> to unselect all items.
                  </li>
                  <li>
                    Press <kbd>*</kbd> to invert the current selection.
                  </li>
                </ul>
                <img
                  src={itemsSelectionScreenshot}
                  alt="Items Selection Screenshot"
                  className="w-3/4 mx-auto rounded-lg shadow-lg"
                />
              </li>
            </ul>
          </HelpSection>

          <HelpSection
            id="quick-select-/-unselect-and-quick-filter"
            title="Quick Select / Unselect & Quick Filter"
          >
            <p>
              The application provides powerful tools for quickly selecting,
              unselecting, or filtering items based on a pattern.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>
                  Quick Select (<kbd>+</kbd>):
                </strong>{" "}
                Opens a dialog to select files and folders that match a specific
                pattern (wildcards or regex).
              </li>
              <li>
                <strong>
                  Quick Unselect (<kbd>-</kbd>):
                </strong>{" "}
                Opens a dialog to unselect items based on a pattern.
              </li>
              <li>
                <strong>
                  Quick Filter (<kbd>.</kbd>):
                </strong>{" "}
                Opens an input at the bottom of the panel to filter the visible
                items in real-time. This is useful for quickly finding items in
                large directories. File operations like Copy, Copy Paths,
                Calculate folder size, Archive operations and Delete will only
                apply to the filtered items.
                <img
                  src={quickFilterScreenshot}
                  alt="Quick Filter Screenshot"
                  className="w-3/4 mx-auto rounded-lg shadow-lg"
                />
              </li>
            </ul>
          </HelpSection>

          <HelpSection id="previewing-files" title="Previewing Files">
            <p>
              Certain file types can be previewed directly within the
              application by focusing the item and pressing the{" "}
              <kbd>Spacebar</kbd>. This is a quick way to view content without
              opening an external program.
            </p>
            <p>Supported file types for preview include:</p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Images:</strong> JPG, PNG, GIF, BMP, TIFF, WebP
              </li>
              <li>
                <strong>Documents:</strong> PDF
              </li>
              <li>
                <strong>Video:</strong> MP4, WebM, Ogg, MOV, MKV
              </li>
              <li>
                <strong>Audio:</strong> MP3, M4A, AAC, FLAC, WAV, Ogg, WMA
              </li>
              <li>
                <strong>Text &amp; Code:</strong> Text (<code>txt</code>),
                Markdown (<code>md</code>), JavaScript (<code>js</code>,{" "}
                <code>jsx</code>
                ), TypeScript (<code>ts</code>, <code>tsx</code>), JSON (
                <code>json</code>), CSS (<code>css</code>), HTML (
                <code>html</code>), YAML (<code>yml</code>, <code>yaml</code>),
                Python (<code>py</code>), Shell Script (<code>sh</code>), Log (
                <code>log</code>), XML (<code>xml</code>), Config (
                <code>cfg</code>, <code>ini</code>), NFO (<code>nfo</code>),
                Properties (<code>properties</code>), Cue Sheet (
                <code>cue</code>), and other files like{" "}
                <code>.editorconfig</code>, <code>.gitignore</code>,{" "}
                <code>LICENSE</code>.
              </li>
              <li>
                <strong>Archives:</strong> ZIP
              </li>
            </ul>
          </HelpSection>

          <HelpSection id="context-menus" title="Context Menus">
            <p>
              Right-clicking on an item (or in an empty area) opens a context
              menu with relevant actions. The menu is divided into logical
              sections.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>New</strong> <em>Menu</em>: You can create a new folder
                or a new empty text file directly from the application.
                <ul className="list-disc list-inside space-y-2 pl-4">
                  <li>
                    <kbd>New Folder</kbd> | <kbd>F7</kbd>: A new folder will be
                    created with a default name, ready for you to rename.
                  </li>
                  <li>
                    <kbd>New File</kbd>: This will create a new, empty text file
                    (`.txt`) with a default name. The filename will be selected
                    up to the extension, so you can start typing the name right
                    away.
                  </li>
                </ul>
              </li>
              <li>
                <strong>Viewing:</strong> Preview, Open, and Open with...
              </li>
              <li>
                <strong>More Operations in submenus:</strong> Contains all major
                file transfer actions, grouped under the "
                <strong>Copy & Move</strong>" submenu, the "
                <strong>Archive</strong>" submenu, the "
                <strong>Select & Filter</strong>" submenu, and the "
                <strong>Additional Commands</strong>" submenu.
                <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                  <li>
                    <kbd>Copy to other panel</kbd> | (<kbd>F5</kbd>): Performs
                    the Copy operation on the selected item(s) to the&nbsp;
                    <strong>inactive</strong> panel.
                  </li>
                  <li>
                    <kbd>Copy to clipboard</kbd> | (<kbd>{metaKey} + C</kbd>):
                    Copies the currently selected items to clipboard, allowing a
                    follow up operation - Paste from clipboard. After Paste is
                    complete the original copied items would still be persisted.
                  </li>
                  <li>
                    <kbd>Copy to...</kbd>: Opens a folder selector to choose a
                    specific destination for the copy operation.
                  </li>
                  <li>
                    <kbd>Move to other panel</kbd> | <kbd>F6</kbd>: Performs the
                    Move operation on the selected item(s) to the
                    <strong>inactive</strong> panel.
                  </li>
                  <li>
                    <kbd>Move (Cut) to clipboard</kbd> | (
                    <kbd>{metaKey} + X</kbd>
                    ): Copies (with the intention for Cut/Move) the currently
                    selected items to clipboard, allowing a follow up operation
                    - Paste from clipboard. After Paste is complete the original
                    copied items would be deleted.
                  </li>
                  <li>
                    <kbd>Move to...</kbd>: Opens a folder selector to choose a
                    specific destination for the move operation.
                  </li>
                  <li>
                    <kbd>Paste from clipboard</kbd> | (<kbd>{metaKey} + V</kbd>
                    ): Pastes the currently copied (or cut) items from the app
                    clipboard, and into the active panel (path). Feel free to
                    change paths and active panels after you did a Copy/Cut,
                    thus allowing you to paste your items in a completly
                    different place and at your convinience (time wise). If the
                    operation previously selected was Move (Cut), then upon
                    successful copying of the items, the source items would be
                    deleted. If it was Copy, then the original items would
                    persist at their location.
                  </li>
                  <li>
                    <strong>Archive</strong> <em>Menu:</em>
                    <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                      <li>
                        <kbd>Compress</kbd>: Compresses the selected items into
                        a zip archive in the active panel or transfers it to the
                        other panel.
                      </li>
                      <li>
                        <kbd>Decompress</kbd>: Decompresses a selected ZIP
                        archive to the active or other panel, with progress
                        tracking.
                      </li>
                      <li>
                        <kbd>Test Archive</kbd>: Verifies the integrity of a
                        selected ZIP archive, including multiple selected ZIP
                        archives, reporting any corrupt files or general issues.
                      </li>
                    </ul>
                  </li>
                  <li>
                    <strong>Select & Filter</strong> <em>Menu:</em>
                    <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                      <li>
                        <kbd>Select All</kbd> | <kbd>{metaKey} + A</kbd>:
                        Selects all items in the current panel.
                      </li>
                      <li>
                        <kbd>Unselect All</kbd> | <kbd>{metaKey} + D</kbd>:
                        Clears the current selection.
                      </li>
                      <li>
                        <kbd>Invert Selection</kbd> | <kbd>*</kbd> : Inverts the
                        current selection.
                      </li>
                      <li>
                        <kbd>Select Files only</kbd> — selects files.
                      </li>
                      <li>
                        <kbd>Select Folders only</kbd> — selects folders.
                      </li>
                      <li>
                        <kbd>Select Zip Files only</kbd> — selects zip files.
                      </li>
                      <li>
                        <kbd>Unselect Files only</kbd> — removes file items from
                        selection.
                      </li>
                      <li>
                        <kbd>Unselect Folders only</kbd> — removes folder items
                        from selection.
                      </li>
                      <li>
                        <kbd>Unselect Zip Files only</kbd> — removes zip files
                        from selection.
                      </li>
                      <li>
                        <kbd>Quick Select</kbd> | <kbd>+</kbd> : Opens a dialog
                        to select files and folders that match a specific
                        pattern (wildcards or regex).
                      </li>
                      <li>
                        <kbd>Quick Unselect</kbd> | <kbd>-</kbd> : Opens a
                        dialog to unselect items based on a pattern.
                      </li>
                      <li>
                        <kbd>Quick Filter</kbd> | <kbd>.</kbd> : Opens an input
                        at the bottom of the panel to filter the visible items
                        in real-time.
                      </li>
                      <li>
                        <kbd>Quick Filter Files only</kbd> — show only files.
                      </li>
                      <li>
                        <kbd>Quick Filter Folders only</kbd> — show only
                        folders.
                      </li>
                      <li>
                        <kbd>Quick Filter Zip Files only</kbd> — show only
                        zip/archive files.
                      </li>
                      <li>
                        <kbd>Reset Quick Filter</kbd> — clear any quick filter
                        applied.
                      </li>
                    </ul>
                  </li>

                  <li>
                    <strong>Additional Commands</strong> <em>Menu:</em>
                    <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                      <li>
                        <kbd>Search in active panel</kbd> |{" "}
                        <kbd>{metaKey} + F</kbd>: Opens a search dialog to find
                        files and folders by name within the current panel's
                        directory and its subdirectories.
                      </li>
                      <li>
                        <kbd>Search in other panel</kbd>: Opens a search dialog
                        to find files and folders by name within the other
                        panel's directory and its subdirectories.
                      </li>
                      <li>
                        <strong>Copy Paths</strong> <em>Menu:</em> Contains
                        options to copy absolute or relative paths of selected
                        items (including or excluding subfolder items) to the OS
                        clipboard, or to download them as a text file.
                        <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                          <li>
                            <strong>Copy Paths to clipboard:</strong> Copies
                            absolute or relative paths of selected items
                            (including or excluding subfolder items) to the OS
                            clipboard.
                          </li>
                          <li>
                            <strong>Copy Paths and download:</strong> Downloads
                            a text file containing absolute or relative paths of
                            selected items (including or excluding subfolder
                            items).
                          </li>
                        </ul>
                      </li>
                      <li>
                        <kbd>Terminal in active panel</kbd> |{" "}
                        <kbd>{metaKey} + T</kbd>: Opens a built-in terminal at
                        the current path of the active panel.
                      </li>
                      <li>
                        <kbd>Terminal in other panel</kbd>: Opens a built-in
                        terminal at the current path of the other panel.
                      </li>
                      <li>
                        <kbd>Refresh active panel</kbd>: Refreshes the contents
                        of the active panel.
                      </li>
                      <li>
                        <kbd>Refresh other panel</kbd>: Refreshes the contents
                        of the other panel.
                      </li>
                      <li>
                        <kbd>Refresh both panels</kbd>: Refreshes the contents
                        of both panels.
                      </li>
                      <li>
                        <kbd>Swap panels</kbd>: Swaps the contents and paths of
                        the two panels.
                      </li>
                    </ul>
                  </li>
                </ul>
              </li>
              <li>
                <strong>Organization:</strong> Rename and Delete the item.
              </li>
              <li>
                <strong>Folder Tools:</strong> For folders, you can also
                Calculate Size or set the folder's path in the opposite panel.
              </li>
            </ul>
            <img
              src={contextMenuScreenshot}
              alt="Context Menu Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="copy-paths" title="Copy Paths">
            <p>
              The application provides powerful tools to copy paths of selected
              items to the clipboard or download them as a text file. These
              options are available in the "File" menu under "Copy & Move" and
              in the context menus.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Copy Paths to clipboard:</strong> This submenu allows
                you to copy the absolute or relative paths of selected items to
                your operating system's clipboard.
                <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                  <li>
                    <strong>Include Subfolders:</strong> When selected, if a
                    folder is among the chosen items, all its subfolders and
                    files will also be included in the path list.
                  </li>
                  <li>
                    <strong>Exclude Subfolders:</strong> Only the top-level
                    selected items (files and folders) will have their paths
                    copied.
                  </li>
                  <li>
                    <strong>Absolute paths:</strong> The full path from the root
                    of the file system will be copied (e.g.,{" "}
                    <code>/home/user/documents/file.txt</code>).
                  </li>
                  <li>
                    <strong>Relative paths:</strong> The path will be relative
                    to the current panel's directory (e.g.,{" "}
                    <code>documents/file.txt</code>).
                  </li>
                </ul>
              </li>
              <li>
                <strong>Copy Paths and download:</strong> Similar to copying to
                clipboard, but the paths will be saved into a text file (
                <code>YYYYMMDD-HHMMSS_items_report.txt</code>) and downloaded to
                your system.
              </li>
            </ul>
          </HelpSection>

          <HelpSection id="calculate-folder-size" title="Calculate Folder Size">
            <p>
              You can calculate the size of a folder (including all its
              subfolders and files) by selecting it and choosing "Calculate
              Size" from the context menu, or by focusing on a folder and
              pressing <kbd>Spacebar</kbd>. This will open a progress modal
              titled "Calculating Folder Size..." that shows the current file
              being processed and the "Size so far". You can cancel the
              operation at any time.
            </p>
            <img
              src={calcFolderSizeScreenshot}
              alt="Calculate Folder Size Screenshot"
              className="w-1/2 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="progress-modals" title="Progress Modals">
            <p>
              During any long-running operation (like calculating folder size,
              copying, compressing, decompressing, testing archives, or
              gathering paths), a progress dialog will appear, often displaying
              the instantaneous speed of transfer. If you need to see the panels
              behind the dialog, you can click and hold on the animated icon
              (e.g., spinning circle or pulsing search icon) in the dialog's
              header. This will make the dialog semi-transparent (20% opacity).
              Releasing the mouse button will restore its full visibility.
            </p>
            <img
              src={copyProgressScreenshot}
              alt="Copy Progress Screenshot"
              className="w-1/2 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection
            id="path-bar-and-breadcrumbs"
            title="Path Bar & Breadcrumbs"
          >
            <p>
              At the top of each panel, the current directory path is displayed.
              For long paths that don't fit, it automatically truncates middle
              sections with an ellipsis, similar to long filenames.
            </p>
            <p>
              The path is broken into clickable "breadcrumbs". You can click on
              any part of the path to navigate directly to that directory.
              Right-clicking the path bar gives you an option to "Select a
              folder..." which opens a folder selection dialog.
            </p>
            <img
              src={pathBreadcrumbsScreenshot}
              alt="Path Breadcrumbs Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="favourites" title="Favourites">
            <p>
              The star icon next to the path bar allows you to manage your
              favourite paths. Clicking it opens a dropdown where you can add
              the current path to your favourites, or select a previously saved
              favourite path to navigate to it instantly. Favourites are
              remembered across sessions. There is also a submenu there with
              recently visited paths, these are session based.
            </p>
            <img
              src={favouritesMenuScreenshot}
              alt="Favourites Menu Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="top-menus" title="Top Menus">
            <p>
              At the very top-left of the application, you'll find two dropdown
              menus: "File" and "Select". These menus provide access to a
              comprehensive set of file management and selection tools.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>File Menu:</strong> Contains actions related to file
                operations such as <strong>New (in a submenu)</strong>,{" "}
                <strong>Copy & Move (in a submenu)</strong>,{" "}
                <strong>Copy Paths to clipboard (in a submenu)</strong>,{" "}
                <strong>Copy Paths and download (in a submenu)</strong>, Rename,
                Delete, Calculate Size, and Refresh. Many of these actions have
                corresponding function key shortcuts.
              </li>
              <li>
                <strong>Select Menu:</strong> Offers various ways to manage
                selections, including Select All, Unselect All, Invert
                Selection, Quick Select, Quick Unselect, Quick Filter, and
                several targeted commands such as Select Files only / Select
                Folders only / Select Zip Files only, and their corresponding
                Unselect variants. The menu also provides Quick Filter variants
                for files/folders/zip files and a Reset Quick Filter action.
              </li>
            </ul>
            <img
              src={fileMenuScreenshot}
              alt="File Menu Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="search" title="Search">
            <p>
              The search modal lets you find files and folders by name inside
              the active panel or the other panel. It searches recursively
              through the current directory tree of the active panel.
            </p>
            <p>
              You can open the modal from the top <kbd>Commands</kbd> menu or
              from the <strong>Additional Commands</strong>
              &nbsp; submenu of any context menu. The modal will start with the
              current active panel's path as search context, but will also let
              you switch between active and other panels' paths, and allow you
              to search in a different folder without closing and reopening the
              dialog.
            </p>
            <p>
              The dialog exposes filters to fine-tune file name searches: toggle{" "}
              <strong>Match case</strong>, enable <strong>Regex</strong>{" "}
              patterns, recurse into <strong>Subfolders</strong>, and include
              hidden files.
            </p>
            <p>
              Toggle <strong>Content search</strong> when you need to look
              inside files. Content search requires its own query and can be
              tailored with options for match case, regex, whole-word only
              matches, and an option to stop after the first matching file to
              keep scans fast. The dialog also skips non-text files by default
              but lets you include them if necessary.
            </p>
            <img
              src={searchScreenshot}
              alt="Search Modal Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection
            id="operations-via-console"
            title="Operations via Console"
          >
            <p>
              This project exposes a small, developer-friendly global named{" "}
              <code className="bg-gray-900 px-2 py-1 rounded">FM</code> in the
              page context (via{" "}
              <code className="bg-gray-900 px-2 py-1 rounded">window.FM</code>)
              to make debugging and interactive exploration easier when running
              in dev or Electron contexts.
            </p>
            <p>
              Once the app is loaded, open your browser's developer console and
              run{" "}
              <code className="bg-gray-900 px-2 py-1 rounded">FM.help()</code>{" "}
              to see a complete list of all available methods with their
              descriptions. You can also filter for specific keyword like
              <code className="bg-gray-900 px-2 py-1 rounded">
                FM.help('File')
              </code>
              , which would return only methods and properties with 'File' in
              their name or description.
            </p>
            <p>
              The <code className="bg-gray-900 px-2 py-1 rounded">FM</code>{" "}
              global provides convenient methods for programmatically navigating
              panels, inspecting application state, triggering operations, and
              automating tasks during development.
            </p>
            <p className="font-semibold text-sky-300">Examples:</p>
            <ul className="list-disc list-inside space-y-2 pl-4 font-mono text-sm">
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.getActivePanel()
                </code>{" "}
                — get active panel's side, path, and selection
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  await FM.setActivePanelPath('/path/to/folder')
                </code>{" "}
                — navigate active panel to a specific directory
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.setActivePanelSelection(['file1.txt', 'Documents',
                  '/absolute/path/file2.txt'], true, false)
                </code>{" "}
                — select files, folders, and absolute paths with
                case-insensitive matching, adding to current selection
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.setActivePanelQuickSelect('*.jpg', false, false, true)
                </code>{" "}
                — select all JPG files in active panel using wildcard pattern
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.setOtherPanelQuickSelect('^[A-Z].*\\.txt$', true, false,
                  true)
                </code>{" "}
                — select all TXT files starting with uppercase letter in other
                panel using regex
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.setActivePanelQuickFilterFiles()
                </code>{" "}
                — filter the active panel to show only files
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.toggleActivePanelSide()
                </code>{" "}
                — toggle between left and right panels
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.refreshBothPanels()
                </code>{" "}
                — reload directory contents for both panels
              </li>
              <li>
                <code className="bg-gray-900 px-2 py-1 rounded">
                  FM.swapPanels()
                </code>{" "}
                — swap the directory paths of left and right panels
              </li>
            </ul>
            <img
              src={fmScreenshot}
              alt="FM Modal Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="function-key-actions" title="Function Key Actions">
            <p>
              The bar at the bottom of the screen shows the primary actions
              mapped to the function keys (F1-F8). These provide keyboard
              shortcuts for the most common operations.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <kbd>F1</kbd>: Open this Help dialog.
              </li>
              <li>
                <kbd>F2</kbd>: Rename the currently focused item.
              </li>
              <li>
                <kbd>F3 (View)</kbd>: Previews a file if it's a supported format
                (image, video, PDF, text, archive); otherwise, it opens the file
                with the default system application. This key does nothing for
                folders.
              </li>
              <li>
                <kbd>Spacebar (Preview)</kbd>: Previews a file if it's a
                supported format. For folders, this key calculates the folder's
                total size.
              </li>
              <li>
                <kbd>F4</kbd>: Edit the focused text/code file is possible -
                this opens an editor with undo/redo, find/replace, and save
                functionality - otherwise open it with its default application.
              </li>
              <li>
                <kbd>F5</kbd>: Copy selected items from the active panel to the
                other panel.
              </li>
              <li>
                <kbd>F6</kbd>: Move selected items from the active panel to the
                other panel.
              </li>
              <li>
                <kbd>F7</kbd>: Create a new folder in the active panel.
              </li>
              <li>
                <kbd>F8</kbd>: Delete the selected items.
              </li>
              <li>
                <kbd>F9</kbd>: Open app's built-in terminal in the current
                panel's path.
              </li>
              <li>
                <kbd>F10</kbd>: Exit the application cleanly (closes all running
                jobs and terminates the app).
              </li>
            </ul>
            <img
              src={actionBarScreenshot}
              alt="Action Bar Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection
            id="copy-move-operation-and-conflict-modes"
            title="Copy/Move Operation & Conflict Modes"
          >
            <p>
              When you press <kbd>F5</kbd> to copy (or <kbd>F6</kbd> to move),
              items are copied/moved from the active panel to the directory
              shown in the inactive panel. If an item being copied/moved already
              exists in the target, a confirmation dialog appears.
            </p>
            <p>
              This dialog gives you several choices for how to handle this and
              all subsequent conflicts in the same operation. Hover over each
              button in the dialog to see a detailed explanation of what it
              does.
            </p>
            <img
              src={overwriteModalScreenshot}
              alt="Overwrite Modal Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
            <ul className="list-disc list-inside space-y-2 pl-4 mt-4">
              <li>
                <strong>For This Item Only:</strong> You can decide to overwrite
                or skip the single conflicting item. If it's a folder, you are
                asked about the folder itself first, and then about its
                contents.
              </li>
              <li>
                <strong>For All Subsequent Items:</strong> You can set a rule
                for the rest of the copy operation, such as "Yes to All" (always
                overwrite) or "Copy/Move if New" (a safe merge mode that never
                overwrites).
              </li>
            </ul>
          </HelpSection>

          <HelpSection id="terminal" title="Terminal">
            <p>
              You can open a built-in terminal directly within the application,
              either in the current panel's path or in the other panel's path.
              This allows you to execute shell commands without leaving the file
              manager.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <strong>Open Terminal to Current Panel:</strong> Opens a
                terminal session with the working directory set to the path of
                the currently active panel.
              </li>
              <li>
                <strong>Open Terminal to Other Panel:</strong> Opens a terminal
                session with the working directory set to the path of the
                inactive panel.
              </li>
              <li>
                Once the Terminal is open, one can use the modal's icons to:
                <ul className="list-disc list-inside space-y-1 pl-4">
                  <li>
                    <strong>Clear Terminal:</strong> Clears the current terminal
                    screen.
                  </li>
                  <li>
                    <strong>Clear Scrollback:</strong> Clears the terminal's
                    scrollback history.
                  </li>
                </ul>
              </li>
            </ul>
            <img
              src={builtInTerminalScreenshot}
              alt="Built-in Terminal Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
          </HelpSection>

          <HelpSection id="electron-app" title="Electron App">
            <p>
              A fully bundled desktop version is provided via Electron. It
              packages the React client, the Node.js server, and all native
              dependencies into a single application for macOS, Windows, and
              Linux.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Self-Contained:</strong> No external Node.js
                installation is required to run the app.
              </li>
              <li>
                <strong>Zero-Duplication Architecture:</strong> Electron uses
                dynamic imports from the workspace packages to avoid copying
                files between builds.
              </li>
              <li>
                <strong>Multi-Platform Builds:</strong> macOS (DMG/ZIP), Windows
                (NSIS/ZIP), and Linux (AppImage/deb/tar.gz) packages are
                available.
              </li>
            </ul>
            <img
              src={electronScreenshot}
              alt="Electron App Screenshot"
              className="w-3/4 mx-auto rounded-lg shadow-lg"
            />
            <p className="text-sm text-gray-400">
              Development builds run with <code>npm run electron:dev</code>, and
              distributable packages follow the `npm run electron:dist:*`
              commands. The resulting apps land under&nbsp;
              <code>packages/electron/dist</code>.
            </p>
          </HelpSection>
        </main>
      </div>
    </div>
  );
};

export default HelpModal;
