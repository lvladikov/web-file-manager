import React from "react";
import { XCircle } from "lucide-react";

import { isMac } from "../../lib/utils";

import SvgActionBarExample from "./help-diagrams/SvgActionBarExample";
import SvgBreadcrumbsExample from "./help-diagrams/SvgBreadcrumbsExample";
import SvgContextMenuExample from "./help-diagrams/SvgContextMenuExample";
import SvgCopyModesExample from "./help-diagrams/SvgCopyModesExample";
import SvgDualPanelExample from "./help-diagrams/SvgDualPanelExample";
import SvgFileListExample from "./help-diagrams/SvgFileListExample";

const HelpSection = ({ title, children }) => (
  <section className="mb-8">
    <h2 className="text-2xl font-bold text-sky-400 border-b-2 border-sky-700 pb-2 mb-4">
      {title}
    </h2>
    <div className="space-y-4 text-gray-300 leading-relaxed">{children}</div>
  </section>
);

const HelpModal = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col"
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
          <HelpSection title="General Purpose">
            <p>
              This is a dual-panel file manager designed for efficient file
              operations. The two independent panels allow you to browse two
              different locations simultaneously, making it easy to move, copy,
              and compare files and folders between them.
            </p>
            <SvgDualPanelExample />
          </HelpSection>

          <HelpSection title="File & Folder Listing">
            <p>
              Each panel lists the files and folders in the current directory.
              To handle long names in limited space, the application dynamically
              truncates them by replacing the middle part with an ellipsis
              (...), ensuring you can still see the beginning and end of the
              name.
            </p>
            <p>
              Icons next to each name help identify the type: 📁 for folders, 📄
              for text files, 🖼️ for images, etc.
            </p>
          </HelpSection>

          <HelpSection title="Navigation & Selection">
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
                </ul>
              </li>
            </ul>
            <SvgFileListExample />
          </HelpSection>

          <HelpSection title="Previewing Files">
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

          <HelpSection title="Context Menus">
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

          <HelpSection title="Path Bar & Breadcrumbs">
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

          <HelpSection title="Function Key Actions">
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

          <HelpSection title="Copy Operation & Conflict Modes">
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
