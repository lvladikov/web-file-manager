import React from "react";
import { XCircle } from "lucide-react";

import { isMac } from "../../lib/utils";
import Icon from "../ui/Icon";

import SvgActionBarExample from "../help-diagrams/SvgActionBarExample";
import SvgBreadcrumbsExample from "../help-diagrams/SvgBreadcrumbsExample";
import SvgContextMenuExample from "../help-diagrams/SvgContextMenuExample";
import SvgCopyModesExample from "../help-diagrams/SvgCopyModesExample";
import dualPanelsScreenshot from "../../../screenshots/dual-panels.png";
import panelInfoScreenshot from "../../../screenshots/panel-info.png";
import SvgFileListExample from "../help-diagrams/SvgFileListExample";
import SvgCalculateSizeExample from "../help-diagrams/SvgCalculateSizeExample";
import SvgFavouritesExample from "../help-diagrams/SvgFavouritesExample";
import SvgTopMenusExample from "../help-diagrams/SvgTopMenusExample";


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
    "Calculate Folder Size & Progress",
    "Path Bar & Breadcrumbs",
    "Favourites",
    "Top Menus",
    "Function Key Actions",
    "Copy Operation & Conflict Modes",
  ];

  const handleLinkClick = (e, section) => {
    e.preventDefault();
    const id = section.toLowerCase().replace(/ /g, "-").replace(/&/g, "and");
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
            <h2 className="text-xl font-bold text-sky-300 mb-3">Table of Contents</h2>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${section.toLowerCase().replace(/ /g, "-").replace(/&/g, "and")}`}
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
            <img src={dualPanelsScreenshot} alt="Dual Panel Screenshot" className="w-full rounded-lg shadow-lg" />
          </HelpSection>

          <HelpSection id="file-and-folder-listing" title="File & Folder Listing">
            <p>
              Each panel lists the files and folders in the current directory.
              To handle long names in limited space, the application dynamically
              truncates them by replacing the middle part with an ellipsis
              (...), ensuring you can still see the beginning and end of the
              name.
            </p>
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

          <HelpSection id="panel-usage-and-information" title="Panel Usage and Information">
            <p>
              At the bottom of each panel, you'll find useful information about
              the current directory and selected items:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Free/Used Space:</strong> On the right side, the total
                disk space and available free space for the current
                drive/partition are displayed. This gives you a quick overview
                of storage utilization.
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
                <strong>Swap Panels:</strong> You can quickly swap the content
                of the two panels using <kbd>{isMac ? "Cmd" : "Ctrl"} + U</kbd>.
                This is useful when you want to change which panel is the source
                and which is the destination for file operations, or simply to
                re-arrange your view.
              </li>
            </ul>
            <img src={panelInfoScreenshot} alt="Panel Info Screenshot" className="w-1/2 mx-auto rounded-lg shadow-lg" />
          </HelpSection>

          <HelpSection id="real-time-folder-monitoring" title="Real-time Folder Monitoring">
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

          <HelpSection id="navigation-and-selection" title="Navigation & Selection">
            <p>
              You can navigate the file system using either the mouse or the
              keyboard.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Mouse:</strong> Double-click a folder to enter it.
                Double-click the ".." entry to go up to the parent directory.
              </li>
              <li>
                <strong>Keyboard:</strong> Use <kbd>ArrowUp</kbd> and{" "}
                <kbd>ArrowDown</kbd> to change focus. Press <kbd>Enter</kbd> to
                open a file or enter a directory. Press <kbd>Backspace</kbd> to
                navigate to the parent directory. <kbd>Home</kbd>,{" "}
                <kbd>End</kbd>, <kbd>PageUp</kbd>, and <kbd>PageDown</kbd> work
                as expected.
              </li>
              <li>
                <strong>Selection:</strong>
                <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                  <li>Click an item to select it.</li>
                  <li>
                    Hold <kbd>{isMac ? "Cmd" : "Ctrl"}</kbd> and click to add or
                    remove individual items from the selection.
                  </li>
                  <li>
                    Hold <kbd>Shift</kbd> and click to select a range of items.
                  </li>
                  <li>
                    Press <kbd>{isMac ? "Cmd" : "Ctrl"} + A</kbd> to select all
                    items.
                  </li>
                  <li>
                    Press <kbd>{isMac ? "Cmd" : "Ctrl"} + D</kbd> to unselect
                    all items.
                  </li>
                  <li>
                    Press <kbd>*</kbd> to invert the current selection.
                  </li>
                </ul>
              </li>
            </ul>
            <SvgFileListExample />
          </HelpSection>

          <HelpSection id="quick-select-/-unselect-and-quick-filter" title="Quick Select / Unselect & Quick Filter">
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
                pattern. You can use wildcards (*) or regular expressions.
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
                large directories. File operations like Copy and Delete will
                only apply to the filtered items.
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
            <p>
              Supported types include: images (jpg, png, gif), text files (txt,
              md, js), PDFs, audio (mp3, flac), and some video formats (mp4,
              webm).
            </p>
          </HelpSection>

          <HelpSection id="context-menus" title="Context Menus">
            <p>
              Right-clicking on an item (or in an empty area) opens a context
              menu with relevant actions. The menu is divided into logical
              sections.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Viewing:</strong> Preview, Open, and Open with...
              </li>
              <li>
                <strong>File Operations:</strong> Contains all major file
                transfer actions.
                <ul className="list-disc list-inside space-y-1 pl-6 mt-1">
                  <li>
                    <kbd>Copy to other panel</kbd>: Performs the F5 Copy
                    operation on the selected item.
                  </li>
                  <li>
                    <kbd>Compress</kbd>: Compresses the selected items into a
                    zip archive in the active panel or transfers it to the other
                    panel.
                  </li>
                  <li>
                    <kbd>Decompress Archive</kbd>: Select a ZIP archive and
                    choose "Decompress" from the context menu or "File &gt;
                    Decompress". You can decompress to the active panel or the
                    other panel. A progress modal will appear, showing the
                    current file being extracted and the overall progress.
                  </li>
                  <li>
                    <kbd>Test Archive</kbd>: Verifies the integrity of a
                    selected ZIP archive.
                  </li>
                  <li>
                    <kbd>Copy / Cut (to clipboard)</kbd>: (Coming soon) Standard
                    clipboard operations.
                  </li>
                  <li>
                    <kbd>Move to other panel</kbd>: (Coming soon) Performs an F6
                    Move operation.
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
            <SvgContextMenuExample />
          </HelpSection>

          <HelpSection id="calculate-folder-size-and-progress" title="Calculate Folder Size & Progress">
            <p>
              You can calculate the size of a folder (including all its
              subfolders and files) by selecting it and choosing "Calculate
              Size" from the context menu, or by focusing on a folder and
              pressing <kbd>Spacebar</kbd>. This will open a progress modal
              titled "Calculating Folder Size..." that shows the current file
              being processed and the "Size so far". You can cancel the
              operation at any time.
            </p>
            <p>
              During any long-running operation (like calculating folder size,
              copying, or compressing files), a progress dialog will appear,
              often displaying the instantaneous speed of transfer. If you need
              to see the panels behind the dialog, you can click and hold on the
              animated icon (e.g., spinning circle or pulsing search icon) in
              the dialog's header. This will make the dialog semi-transparent
              (20% opacity). Releasing the mouse button will restore its full
              visibility.
            </p>
            <SvgCalculateSizeExample />
          </HelpSection>

          <HelpSection id="path-bar-and-breadcrumbs" title="Path Bar & Breadcrumbs">
            <p>
              At the top of each panel, the current directory path is displayed.
              For long paths that don't fit, it automatically truncates middle
              sections with an ellipsis, similar to long filenames.
            </p>
            <p>
              The path is broken into clickable "breadcrumbs". You can click on
              any part of the path to navigate directly to that directory.
              Right-clicking the path bar gives you an option to "Choose
              folder..." which opens a folder selection dialog.
            </p>
            <SvgBreadcrumbsExample />
          </HelpSection>

          <HelpSection id="favourites" title="Favourites">
            <p>
              The star icon next to the path bar allows you to manage your
              favourite paths. Clicking it opens a dropdown where you can add
              the current path to your favourites, or select a previously saved
              favourite path to navigate to it instantly. Favourites are
              remembered across sessions.
            </p>
            <SvgFavouritesExample />
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
                operations such as Copy, Move, Rename, Delete, Compress,
                Calculate Size, and Refresh. Many of these actions have
                corresponding function key shortcuts.
              </li>
              <li>
                <strong>Select Menu:</strong> Offers various ways to manage
                selections, including Select All, Unselect All, Invert
                Selection, Quick Select, Quick Unselect, and Quick Filter.
              </li>
            </ul>
            <SvgTopMenusExample />
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
                <kbd>F3</kbd>: View/Open the focused item with its default
                application.
              </li>
              <li>
                <kbd>F5</kbd>: Copy selected items from the active panel to the
                other panel.
              </li>
              <li>
                <kbd>F7</kbd>: Create a new folder in the active panel.
              </li>
              <li>
                <kbd>F8</kbd>: Delete the selected items.
              </li>
            </ul>
            <SvgActionBarExample />
          </HelpSection>

          <HelpSection id="copy-operation-and-conflict-modes" title="Copy Operation & Conflict Modes">
            <p>
              When you press <kbd>F5</kbd> to copy, items are copied from the
              active panel to the directory shown in the inactive panel. If an
              item being copied already exists in the target, a confirmation
              dialog appears.
            </p>
            <p>
              This dialog gives you several choices for how to handle this and
              all subsequent conflicts in the same operation. Hover over each
              button in the dialog to see a detailed explanation of what it
              does.
            </p>
            <SvgCopyModesExample />
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
                overwrite) or "Copy if New" (a safe merge mode that never
                overwrites).
              </li>
            </ul>
          </HelpSection>
        </main>
      </div>
    </div>
  );
};

export default HelpModal;