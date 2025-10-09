import { Star } from "lucide-react";

import {
  buildFullPath,
  isItemPreviewable,
  calculateFolderSize,
} from "./lib/utils";
import { cancelSizeCalculation } from "./lib/api";

import appState from "./state";

// Components
import ActionBar from "./components/ui/ActionBar";
import FavouritesDropdown from "./components/ui/FavouritesDropdown";
import ContextMenu from "./components/context-menus/ContextMenu";
import EmptyAreaContextMenu from "./components/context-menus/EmptyAreaContextMenu";
import PathContextMenu from "./components/context-menus/PathContextMenu";
import FilePanel from "./components/panels/FilePanel";
import ApplicationBrowserModal from "./components/modals/ApplicationBrowserModal";
import CalculatingSizeModal from "./components/modals/CalculatingSizeModal";
import DeleteConfirmModal from "./components/modals/DeleteConfirmModal";
import ErrorModal from "./components/modals/ErrorModal";
import FolderBrowserModal from "./components/modals/FolderBrowserModal";
import HelpModal from "./components/modals/HelpModal";
import OverwriteConfirmModal from "./components/modals/OverwriteConfirmModal";
import ProgressModal from "./components/modals/ProgressModal";
import PreviewModal from "./components/modals/PreviewModal";

export default function App() {
  const {
    // State & Refs
    activePanel,
    panels,
    selections,
    focusedItem,
    selectionAnchor,
    loading,
    error,
    contextMenu,
    pathContextMenu,
    emptyAreaContextMenu,
    appBrowserModal,
    folderBrowserModal,
    copyProgress,
    editingPath,
    favourites,
    showFavourites,
    previewModal,
    sizeCalcModal,
    deleteModalVisible,
    deleteSummary,
    deleteTargets,
    renamingItem,
    creatingFolder,
    columnWidths,
    overwritePrompt,
    autoLoadLyrics,
    isHelpVisible,
    panelRefs,
    wsRef,

    // Setters & Handlers
    setActivePanel,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
    setAppBrowserModal,
    setFolderBrowserModal,
    setShowFavourites,
    setPreviewModal,
    setSizeCalcModal,
    setColumnWidths,
    setCreatingFolder,
    setIsHelpVisible,
    updateItemInPanel,
    closeContextMenus,
    handleOpenFile,
    handleNavigate,
    handleConfirmNewFolder,
    handleCancelNewFolder,
    performCopy,
    handleContextMenuOpen,
    handleCancelCopy,
    handleDeleteItem,
    confirmDeletion,
    handleCancelDelete,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleStartNewFolder,
    handleContextOpen,
    handleContextOpenWith,
    handleSetOtherPanelPath,
    handlePathContextMenu,
    handleEmptyAreaContextMenu,
    openFolderBrowserForPanel,
    handleFolderBrowserConfirm,
    handlePathInputSubmit,
    handleToggleFavourite,
    handleToggleAutoLoadLyrics,
    handleOverwriteDecision,
    handleStartSizeCalculation,
    setEditingPath,
    setRenamingItem,

    // Derived State
    activePath,
    actionBarButtons,
  } = appState();

  return (
    <div
      className="flex flex-col h-screen bg-gray-900 text-white"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="bg-gray-800 p-2 flex justify-end items-center relative">
        <button
          onClick={() => setShowFavourites((s) => !s)}
          title="Show Favourites"
          className="p-2 rounded-md hover:bg-gray-700"
        >
          <Star className="w-5 h-5 text-yellow-400" />
        </button>
        {showFavourites && (
          <FavouritesDropdown
            favourites={favourites}
            onSelect={(path) => {
              handleNavigate(activePanel, path, "");
              setShowFavourites(false);
            }}
            onRemove={handleToggleFavourite}
            onClose={() => setShowFavourites(false)}
          />
        )}
      </header>
      <ErrorModal message={error} onClose={() => setError(null)} />
      <FolderBrowserModal
        isVisible={folderBrowserModal.isVisible}
        initialPath={folderBrowserModal.initialPath}
        onConfirm={handleFolderBrowserConfirm}
        onClose={() =>
          setFolderBrowserModal({
            isVisible: false,
            targetPanelId: null,
            initialPath: "",
          })
        }
      />
      <ApplicationBrowserModal
        isVisible={appBrowserModal.isVisible}
        fileName={appBrowserModal.file?.name}
        initialPath={appBrowserModal.path}
        onClose={() => setAppBrowserModal((s) => ({ ...s, isVisible: false }))}
        onConfirm={(appPath) => {
          handleOpenFile(
            appBrowserModal.path,
            appBrowserModal.file.name,
            appPath
          );
          setAppBrowserModal((s) => ({ ...s, isVisible: false }));
        }}
      />
      <CalculatingSizeModal
        isVisible={sizeCalcModal.isVisible}
        currentFile={sizeCalcModal.currentFile}
        sizeSoFar={sizeCalcModal.sizeSoFar}
        onCancel={() => {
          if (sizeCalcModal.jobId) cancelSizeCalculation(sizeCalcModal.jobId);
        }}
      />
      <PreviewModal
        isVisible={previewModal.isVisible}
        item={previewModal.item}
        activePath={activePath}
        onOpenFile={handleOpenFile}
        onStartSizeCalculation={handleStartSizeCalculation}
        onClose={() => setPreviewModal({ isVisible: false, item: null })}
        autoLoadLyrics={autoLoadLyrics}
        onToggleAutoLoadLyrics={handleToggleAutoLoadLyrics}
      />
      <ProgressModal {...copyProgress} onCancel={handleCancelCopy} />
      <OverwriteConfirmModal
        isVisible={overwritePrompt.isVisible}
        item={overwritePrompt.item}
        onDecision={handleOverwriteDecision}
        onCancel={handleCancelCopy}
      />
      <DeleteConfirmModal
        isVisible={deleteModalVisible}
        targetItems={deleteTargets}
        summary={deleteSummary}
        onCancel={handleCancelDelete}
        onConfirm={confirmDeletion}
      />
      <HelpModal
        isVisible={isHelpVisible}
        onClose={() => setIsHelpVisible(false)}
      />

      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetItems={contextMenu.targetItems}
          isPreviewable={
            contextMenu.targetItems.length === 1 &&
            isItemPreviewable(contextMenu.targetItems[0])
          }
          onPreview={() => {
            if (contextMenu.targetItems.length === 1) {
              setPreviewModal({
                isVisible: true,
                item: contextMenu.targetItems[0],
              });
            }
            closeContextMenus();
          }}
          onOpen={handleContextOpen}
          onOpenWith={handleContextOpenWith}
          onCopyToOtherPanel={() => {
            const sourcePanelId =
              contextMenu.path === panels.left.path ? "left" : "right";
            const destPanelId = sourcePanelId === "left" ? "right" : "left";
            const sourcePath = panels[sourcePanelId].path;
            const destinationPath = panels[destPanelId].path;
            const sources = contextMenu.targetItems.map((item) =>
              buildFullPath(sourcePath, item.name)
            );
            performCopy(sources, destinationPath);
            closeContextMenus();
          }}
          onRename={() => {
            if (contextMenu.targetItems.length === 1) {
              const panelId =
                contextMenu.path === panels.left.path ? "left" : "right";
              handleStartRename(panelId, contextMenu.targetItems[0].name);
            }
            closeContextMenus();
          }}
          onDelete={() => {
            handleDeleteItem(contextMenu.targetItems);
            closeContextMenus();
          }}
          onSetOtherPanelPath={handleSetOtherPanelPath}
          onCalculateSize={async () => {
            const foldersToCalc = contextMenu.targetItems.filter(
              (i) => i.type === "folder"
            );
            closeContextMenus();

            if (foldersToCalc.length === 0) return;

            const panelId =
              contextMenu.path === panels.left.path ? "left" : "right";

            // Loop through each selected folder and calculate its size sequentially.
            for (const folder of foldersToCalc) {
              try {
                // The 'folder' object from contextMenu.targetItems already has `name` and `fullPath`.
                const finalSize = await calculateFolderSize(
                  folder,
                  wsRef,
                  setSizeCalcModal
                );
                // On success, update the specific item in the correct panel.
                updateItemInPanel(panelId, folder.name, { size: finalSize });
              } catch (err) {
                // If any calculation fails, show an error and stop processing the rest.
                setError(
                  `Folder Size Calculation for "${folder.name}" failed: ${err.message}`
                );
                break; // Exit the loop
              }
            }
          }}
        />
      )}
      {pathContextMenu.visible && (
        <PathContextMenu
          x={pathContextMenu.x}
          y={pathContextMenu.y}
          onChooseFolder={openFolderBrowserForPanel}
          onClose={closeContextMenus}
        />
      )}
      {emptyAreaContextMenu.visible && (
        <EmptyAreaContextMenu
          x={emptyAreaContextMenu.x}
          y={emptyAreaContextMenu.y}
          onNewFolder={() => {
            // Set the panel that was right-clicked as active before creating the folder
            setActivePanel(emptyAreaContextMenu.panelId);
            handleStartNewFolder(emptyAreaContextMenu.panelId);
            closeContextMenus();
          }}
          onClose={closeContextMenus}
        />
      )}
      <main className="flex-grow flex p-2 space-x-2 overflow-hidden">
        {["left", "right"].map((panelId) => (
          <FilePanel
            ref={panelRefs[panelId]}
            key={panelId}
            panelData={panels[panelId]}
            activePanel={activePanel}
            panelId={panelId}
            renamingItem={renamingItem}
            isCreating={creatingFolder.panelId === panelId}
            newFolderValue={creatingFolder.value}
            onStartRename={handleStartRename}
            onRenameChange={(e) =>
              setRenamingItem((prev) => ({ ...prev, value: e.target.value }))
            }
            onRenameSubmit={handleConfirmRename}
            onRenameCancel={handleCancelRename}
            onNewFolderChange={(e) =>
              setCreatingFolder((prev) => ({ ...prev, value: e.target.value }))
            }
            onNewFolderSubmit={handleConfirmNewFolder}
            onNewFolderCancel={handleCancelNewFolder}
            setActivePanel={setActivePanel}
            onNavigate={(target) =>
              handleNavigate(panelId, panels[panelId].path, target)
            }
            onNavigateToPath={(absPath) => handleNavigate(panelId, absPath, "")}
            onOpenFile={handleOpenFile}
            onContextMenu={(x, y, file) => {
              closeContextMenus();
              handleContextMenuOpen(x, y, file, panelId);
            }}
            onPathContextMenu={handlePathContextMenu}
            onEmptyAreaContextMenu={(e) =>
              handleEmptyAreaContextMenu(e, panelId)
            }
            loading={loading[panelId]}
            selectedItems={selections[panelId]}
            setSelectedItems={(newSel) =>
              setSelections((s) => ({ ...s, [panelId]: newSel }))
            }
            focusedItem={focusedItem[panelId]}
            setFocusedItem={(name) =>
              setFocusedItem((s) => ({ ...s, [panelId]: name }))
            }
            selectionAnchor={selectionAnchor[panelId]}
            setSelectionAnchor={(name) =>
              setSelectionAnchor((s) => ({ ...s, [panelId]: name }))
            }
            isEditingPath={editingPath.panelId === panelId}
            pathInputValue={editingPath.value}
            onPathDoubleClick={() =>
              setEditingPath({ panelId, value: panels[panelId].path })
            }
            onPathInputChange={(e) =>
              setEditingPath((s) => ({ ...s, value: e.target.value }))
            }
            onPathInputSubmit={handlePathInputSubmit}
            onPathInputCancel={() =>
              setEditingPath({ panelId: null, value: "" })
            }
            isFavourite={favourites.includes(panels[panelId].path)}
            onToggleFavourite={handleToggleFavourite}
            columnWidths={columnWidths[panelId]}
            setColumnWidths={setColumnWidths}
          />
        ))}
      </main>
      <ActionBar buttons={actionBarButtons} />
    </div>
  );
}
