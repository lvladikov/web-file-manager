import { useRef, useEffect } from "react";

import appState from "./state";

import { cancelSizeCalculation, renameItem } from "./lib/api";
import {
  isItemPreviewable,
  buildFullPath,
  isPreviewableText,
  isEditable,
  isVerboseLogging,
} from "./lib/utils";

// Components
import ActionBar from "./components/ui/ActionBar";
import AppMenu from "./components/ui/AppMenu";
import FilePanel from "./components/panels/FilePanel";
import ApplicationBrowserModal from "./components/modals/ApplicationBrowserModal";
import CalculatingSizeModal from "./components/modals/CalculatingSizeModal";
import DeleteConfirmModal from "./components/modals/DeleteConfirmModal";
import DestinationBrowserModal from "./components/modals/DestinationBrowserModal";
import ErrorModal from "./components/modals/ErrorModal";
import FolderBrowserModal from "./components/modals/FolderBrowserModal";
import HelpModal from "./components/modals/HelpModal";
import OverwriteConfirmModal from "./components/modals/OverwriteConfirmModal";
import ProgressModal from "./components/modals/ProgressModal";
import PreviewModal from "./components/modals/PreviewModal";
import QuickSelectModal from "./components/modals/QuickSelectModal";
import CompressionProgressModal from "./components/modals/CompressionProgressModal";
import DecompressionProgressModal from "./components/modals/DecompressionProgressModal";
import ArchiveTestIntegrityProgressModal from "./components/modals/ArchiveTestIntegrityProgressModal";
import CopyPathsProgressModal from "./components/modals/CopyPathsProgressModal";
import ZipUpdateProgressModal from "./components/modals/ZipUpdateProgressModal";
import SearchModal from "./components/modals/SearchModal";
import TerminalModal from "./components/modals/TerminalModal";
import MultiRenameModal from "./components/modals/MultiRenameModal";
import MultiRenameProgressModal from "./components/modals/MultiRenameProgressModal";

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
    appBrowserModal,
    destinationBrowserModal,
    folderBrowserModal,
    copyProgress,
    editingPath,
    favourites,
    recentPaths,
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
    helpModal,
    panelRefs,
    sortConfig,
    handleSort,
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
    clipboard,

    // Setters & Handlers
    setActivePanel,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
    setAppBrowserModal,
    setDestinationBrowserModal,
    setFolderBrowserModal,
    setPreviewModal,
    setColumnWidths,
    setCreatingFolder,
    setHelpModal,
    handleOpenFile,
    handleNavigate,
    handleConfirmNewFolder,
    handleCancelNewFolder,
    performCopy,
    handleCancelCopy,
    handleDeleteItem,
    confirmDeletion,
    handleCancelDelete,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleStartNewFolder,
    handleStartNewFile,
    creatingFile,
    setCreatingFile,
    handleConfirmNewFile,
    handleCancelNewFile,
    handleContextOpen,
    handleContextOpenWith,
    handleSetOtherPanelPath,
    openFolderBrowserForPanel,
    handleFolderBrowserConfirm,
    handleChangeSearchBasePath,
    openFolderBrowserForSearch,
    handlePathInputSubmit,
    handleToggleFavourite,
    handleImportFavourites,
    handleToggleAutoLoadLyrics,
    handleOverwriteDecision,
    handleStartSizeCalculation,
    calculateSizeForMultipleFolders,
    handleRefreshPanel,
    handleRefreshAllPanels,
    setEditingPath,
    setRenamingItem,
    handleSelectAll,
    handleUnselectAll,
    handleInvertSelection,
    handleStartQuickSelect,
    handleStartQuickUnselect,
    handleQuickSelectConfirm,
    handleQuickSelect,
    handleQuickUnselect,
    handleSelectFiles,
    handleSelectFolders,
    handleSelectZipFiles,
    handleUnselectFiles,
    handleUnselectFolders,
    handleUnselectZipFiles,
    filter,
    setFilter,
    isFiltering,
    filterPanelId,
    handleStartFilter,
    handleCloseFilter,
    handleFilterChange,
    handleQuickFilterFiles,
    handleQuickFilterFolders,
    handleQuickFilterZipFiles,
    handleResetQuickFilter,
    filteredItems,
    handleViewItem,
    handleCopyToClipboard,
    handleCutToClipboard,
    handlePasteFromClipboard,
    handleDuplicate,

    // Derived State
    activePath,
    actionBarButtons,
    quickSelectModal,
    setQuickSelectModal,
    compressProgress,
    handleCancelCompress,
    handleCompressInActivePanel,
    handleCompressToOtherPanel,
    decompressProgress,
    handleCancelDecompress,
    handleDecompressInActivePanel,
    handleDecompressToOtherPanel,
    handleDecompressInSubfolderInActivePanel,
    handleDecompressInSubfolderToOtherPanel,
    archiveTestProgress,
    handleCancelArchiveTest,
    handleTestArchive,
    closeArchiveTestModal,
    handleSwapPanels,
    handleCopyTo,
    handleMoveTo,
    copyAbsolutePaths,
    copyRelativePaths,
    copyPathsModal,
    zipUpdateProgressModal,
    setZipUpdateProgressModal,
    terminalModal,
    setTerminalModal,
    searchModal,
    setSearchModal,
    allowContextMenu,
    setAllowContextMenu,
    handleTerminal,
    handleTerminalOtherPanel,
    multiRenameModal,
    setMultiRenameModal,
    multiRenameProgress,
    setMultiRenameProgress,
  } = appState();
  const mainRef = useRef(null);
  const multiRenameCancelRef = useRef(false);

  // Expose app state to window for FM console methods
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__APP_STATE__ = {
        activePanel,
        panels,
        selections,
        setActivePanel,
        setSelections,
        handleSwapPanels,
        handleNavigate,
        handleRefreshPanel,
        handleRefreshAllPanels,
        setError,
        setFilter,
        handleSelectAll,
        handleUnselectAll,
        handleInvertSelection,
        handleQuickSelect,
        handleQuickUnselect,
        handleSelectFiles,
        handleSelectFolders,
        handleSelectZipFiles,
        handleUnselectFiles,
        handleUnselectFolders,
        handleUnselectZipFiles,
        handleStartFilter,
        handleFilterChange,
        handleQuickFilterFiles,
        handleQuickFilterFolders,
        handleQuickFilterZipFiles,
        handleResetQuickFilter,
        handleStartNewFile,
        handleConfirmNewFile,
        handleCancelNewFile,
        handleStartNewFolder,
        handleConfirmNewFolder,
        handleCancelNewFolder,
        handleCompressInActivePanel,
        handleCompressToOtherPanel,
        handleDecompressInActivePanel,
        handleDecompressToOtherPanel,
        handleDecompressInSubfolderInActivePanel,
        handleDecompressInSubfolderToOtherPanel,
        handleOverwriteDecision,
        performCopy,
        handleCancelCopy,
        handleTestArchive,
        startZipUpdate,
        connectZipUpdateWebSocket,
        handleTerminal,
        handleTerminalOtherPanel,
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete window.__APP_STATE__;
      }
    };
  }, [
    activePanel,
    panels,
    selections,
    setActivePanel,
    setSelections,
    handleSwapPanels,
    handleNavigate,
    handleRefreshPanel,
    handleRefreshAllPanels,
    setError,
    setFilter,
    handleSelectAll,
    handleUnselectAll,
    handleInvertSelection,
    handleQuickSelect,
    handleQuickUnselect,
    handleSelectFiles,
    handleSelectFolders,
    handleSelectZipFiles,
    handleUnselectFiles,
    handleUnselectFolders,
    handleUnselectZipFiles,
    handleStartFilter,
    handleFilterChange,
    handleQuickFilterFiles,
    handleQuickFilterFolders,
    handleQuickFilterZipFiles,
    handleResetQuickFilter,
    performCopy,
    handleCancelCopy,
  ]);

  const showPreviewModalOverlay =
    zipUpdateProgressModal &&
    zipUpdateProgressModal.isVisible &&
    zipUpdateProgressModal.triggeredFromPreview;

  const otherPanelId = activePanel === "left" ? "right" : "left";
  const destinationPath = panels[otherPanelId].path;
  const searchPanelId = searchModal.panelId || activePanel;

  const selectedNames = [...selections[activePanel]];
  const selectedItemsDetails = selectedNames
    .map((name) => panels[activePanel].items.find((i) => i.name === name))
    .filter(Boolean);

  const singleItemSelected = selectedItemsDetails.length === 1;
  const firstSelectedItemDetails = singleItemSelected
    ? selectedItemsDetails[0]
    : null;

  const canPreview =
    singleItemSelected && isItemPreviewable(firstSelectedItemDetails);
  const canView =
    singleItemSelected &&
    firstSelectedItemDetails &&
    !["folder", "parent"].includes(firstSelectedItemDetails.type);
  const canOpen = singleItemSelected;
  const canOpenWith =
    singleItemSelected && isEditable(firstSelectedItemDetails);
  const canEdit = singleItemSelected && isEditable(firstSelectedItemDetails);

  const handleEdit = () => {
    const name = focusedItem[activePanel];
    if (name) {
      const item = panels[activePanel].items.find((i) => i.name === name);
      if (item) {
        if (isPreviewableText(item.name)) {
          setPreviewModal({ isVisible: true, item: item, isEditing: true });
        } else if (!["folder", "parent"].includes(item.type)) {
          handleOpenFile(activePath, item.name);
        }
      }
    }
  };

  const openSearchInPanel = (panelId) => {
    const basePath = panels[panelId]?.path || "";
    setSearchModal((prev) => ({
      ...prev,
      isVisible: true,
      panelId,
      basePath,
    }));
  };

  const handleMenuSearchActivePanel = () => openSearchInPanel(activePanel);
  const handleMenuSearchOtherPanel = () => openSearchInPanel(otherPanelId);

  const handleSearchGoTo = async (panelId, folderPath, itemName) => {
    setSearchModal((prev) => ({ ...prev, isVisible: false }));
    await handleNavigate(panelId, folderPath, "");
    setSelections((prev) => ({
      ...prev,
      [panelId]: new Set([itemName]),
    }));
    setFocusedItem((prev) => ({ ...prev, [panelId]: itemName }));
  };

  const handleMenuRefreshOtherPanel = () => handleRefreshPanel(otherPanelId);

  const handleExportSettings = async () => {
    try {
      const { exportSettings } = await import("./lib/api");
      const config = await exportSettings();

      // Create filename with timestamp
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");

      const filename = `${year}${month}${day}-${hours}${minutes}${seconds}-settings-backup.json`;

      // Create and download the file
      const dataStr = JSON.stringify(config, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(`Failed to export settings: ${error.message}`);
    }
  };

  const handleImportSettings = async () => {
    try {
      // Create a file input element
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";

      fileInput.onchange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const importedConfig = JSON.parse(text);

          const { importSettings } = await import("./lib/api");
          await importSettings(importedConfig);

          // Reload the page to apply all imported settings
          window.location.reload();
        } catch (error) {
          setError(`Failed to import settings: ${error.message}`);
        }
      };

      fileInput.click();
    } catch (error) {
      setError(`Failed to import settings: ${error.message}`);
    }
  };

  // Create a closure for the top menu's Quick Filter using the activePanel ID.
  const handleMenuQuickFilter = () => handleStartFilter(activePanel);

  return (
    <div
      className="flex flex-col h-screen bg-gray-900 text-white"
      onContextMenu={(e) => {
        if (!allowContextMenu) {
          e.preventDefault();
        }
      }}
    >
      <header className="bg-gray-800 p-2 flex justify-start items-center relative">
        <AppMenu
          activePanel={activePanel}
          panels={panels}
          activePanelSelections={selections[activePanel]}
          filter={filter}
          filteredItems={filteredItems}
          onSearchActivePanel={handleMenuSearchActivePanel}
          onSearchOtherPanel={handleMenuSearchOtherPanel}
          onCopyToOtherPanel={() => {
            const sourcePanelId = activePanel;
            const destPanelId = sourcePanelId === "left" ? "right" : "left";
            const sourcePath = panels[sourcePanelId].path;
            const destinationPath = panels[destPanelId].path;
            const items = filter[activePanel].pattern
              ? filteredItems[activePanel]
              : panels[activePanel].items;
            const sources = items
              .filter((item) => selections[activePanel].has(item.name))
              .map((item) => buildFullPath(sourcePath, item.name));
            performCopy(sources, destinationPath);
          }}
          onMoveToOtherPanel={() => {
            const sourcePanelId = activePanel;
            const destPanelId = sourcePanelId === "left" ? "right" : "left";
            const sourcePath = panels[sourcePanelId].path;
            const destinationPath = panels[destPanelId].path;
            const items = filter[activePanel].pattern
              ? filteredItems[activePanel]
              : panels[activePanel].items;
            const sources = items
              .filter((item) => selections[activePanel].has(item.name))
              .map((item) => buildFullPath(sourcePath, item.name));
            performCopy(sources, destinationPath, true);
          }}
          onCopyTo={handleCopyTo}
          onMoveTo={handleMoveTo}
          onCopyToClipboard={handleCopyToClipboard}
          onCutToClipboard={handleCutToClipboard}
          onPasteFromClipboard={handlePasteFromClipboard}
          onRename={() => {
            // handleStartRename wrapper will handle single vs multi-rename
            let name = focusedItem[activePanel];

            // If no focused item or it's not in selection, use first selected item
            if (
              selections[activePanel].size > 0 &&
              (!name || !selections[activePanel].has(name))
            ) {
              name = [...selections[activePanel]][0];
            }

            if (name && name !== "..") {
              handleStartRename(activePanel, name);
            }
          }}
          onEdit={handleEdit}
          onDelete={() => {
            const items = filter[activePanel].pattern
              ? filteredItems[activePanel]
              : panels[activePanel].items;
            const itemsToDelete = items.filter((item) =>
              selections[activePanel].has(item.name)
            );
            handleDeleteItem(itemsToDelete);
          }}
          onCalculateSize={() => {
            const itemsToConsider = filter[activePanel].pattern
              ? filteredItems[activePanel]
              : panels[activePanel].items;
            const foldersToCalc = itemsToConsider.filter(
              (item) =>
                selections[activePanel].has(item.name) && item.type === "folder"
            );
            if (foldersToCalc.length > 0) {
              calculateSizeForMultipleFolders(foldersToCalc, activePanel);
            }
          }}
          onSetOtherPanelPath={() => {
            if (selections[activePanel].size === 1) {
              const itemName = [...selections[activePanel]][0];
              const itemToNavigate = panels[activePanel].items.find(
                (i) => i.name === itemName
              );

              if (itemToNavigate && itemToNavigate.type === "folder") {
                const newPath = buildFullPath(
                  panels[activePanel].path,
                  itemToNavigate.name
                );
                handleNavigate(otherPanelId, newPath, "");
              }
            }
          }}
          onRefreshPanel={() => handleRefreshPanel(activePanel)}
          onRefreshBothPanels={handleRefreshAllPanels}
          onRefreshOtherPanel={handleMenuRefreshOtherPanel}
          onSelectAll={handleSelectAll}
          onUnselectAll={handleUnselectAll}
          onInvertSelection={handleInvertSelection}
          onQuickSelect={handleStartQuickSelect}
          onQuickUnselect={handleStartQuickUnselect}
          onQuickFilter={handleMenuQuickFilter}
          onSelectFiles={() => handleSelectFiles(activePanel)}
          onSelectFolders={() => handleSelectFolders(activePanel)}
          onSelectZipFiles={() => handleSelectZipFiles(activePanel)}
          onUnselectFiles={() => handleUnselectFiles(activePanel)}
          onUnselectFolders={() => handleUnselectFolders(activePanel)}
          onUnselectZipFiles={() => handleUnselectZipFiles(activePanel)}
          onQuickFilterFiles={() => handleQuickFilterFiles(activePanel)}
          onQuickFilterFolders={() => handleQuickFilterFolders(activePanel)}
          onQuickFilterZipFiles={() => handleQuickFilterZipFiles(activePanel)}
          onResetQuickFilter={() => handleResetQuickFilter(activePanel)}
          onCompressInActivePanel={handleCompressInActivePanel}
          onCompressToOtherPanel={handleCompressToOtherPanel}
          onDecompressInActivePanel={handleDecompressInActivePanel}
          onDecompressToOtherPanel={handleDecompressToOtherPanel}
          onDecompressInSubfolderInActivePanel={
            handleDecompressInSubfolderInActivePanel
          }
          onDecompressInSubfolderToOtherPanel={
            handleDecompressInSubfolderToOtherPanel
          }
          onTestArchive={handleTestArchive}
          onSwapPanels={handleSwapPanels}
          onTerminal={handleTerminal}
          onTerminalOtherPanel={handleTerminalOtherPanel}
          onPreview={() => {
            if (selections[activePanel].size === 1) {
              const itemName = [...selections[activePanel]][0];
              const item = panels[activePanel].items.find(
                (i) => i.name === itemName
              );
              if (!item) return;

              if (item.type === "archive" || isItemPreviewable(item)) {
                setPreviewModal({ isVisible: true, item, isEditing: false });
              }
            }
          }}
          onOpen={handleContextOpen}
          onOpenWith={handleContextOpenWith}
          onView={handleViewItem}
          canPreview={canPreview}
          canView={canView}
          canOpen={canOpen}
          canOpenWith={canOpenWith}
          canEdit={canEdit}
          clipboard={clipboard}
          onDuplicate={handleDuplicate}
          onNewFolder={handleStartNewFolder}
          onNewFile={handleStartNewFile}
          copyAbsolutePaths={copyAbsolutePaths}
          copyRelativePaths={copyRelativePaths}
          onExportSettings={handleExportSettings}
          onImportSettings={handleImportSettings}
        />
      </header>
      <ErrorModal message={error} onClose={() => setError(null)} />
      <DestinationBrowserModal
        key={`dest-browser-${destinationPath}`}
        isVisible={destinationBrowserModal.isVisible}
        initialPath={destinationBrowserModal.initialPath}
        title={destinationBrowserModal.action}
        onConfirm={(destinationPath, isMove) => {
          setDestinationBrowserModal({ isVisible: false });
          const sourcePath = panels[activePanel].path;
          const sources = [...selections[activePanel]].map((name) =>
            buildFullPath(sourcePath, name)
          );
          performCopy(sources, destinationPath, isMove);
        }}
        onClose={() => setDestinationBrowserModal({ isVisible: false })}
      />
      <FolderBrowserModal
        isVisible={folderBrowserModal.isVisible}
        initialPath={folderBrowserModal.initialPath}
        title={folderBrowserModal.title || undefined}
        overlayClassName={folderBrowserModal.overlayClassName || undefined}
        modalClassName={folderBrowserModal.modalClassName || undefined}
        onConfirm={handleFolderBrowserConfirm}
        onClose={() =>
          setFolderBrowserModal({
            isVisible: false,
            targetPanelId: null,
            initialPath: "",
            context: null,
            title: "",
            overlayClassName: "",
            modalClassName: "",
          })
        }
        onFileDoubleClick={(item) => {
          if (item.type === "archive") {
            setPreviewModal({ isVisible: true, item });
          }
        }}
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
        onFileDoubleClick={(item) => {
          if (item.type === "archive") {
            setPreviewModal({ isVisible: true, item });
          }
        }}
      />
      <CalculatingSizeModal
        isVisible={sizeCalcModal.isVisible}
        currentFile={sizeCalcModal.currentFile}
        sizeSoFar={sizeCalcModal.sizeSoFar}
        totalBytes={sizeCalcModal.totalBytes}
        onCancel={() => {
          if (sizeCalcModal.jobId) cancelSizeCalculation(sizeCalcModal.jobId);
        }}
      />
      <PreviewModal
        key={previewModal.item?.fullPath}
        isVisible={previewModal.isVisible}
        item={previewModal.item}
        activePath={activePath}
        onOpenFile={handleOpenFile}
        onStartSizeCalculation={handleStartSizeCalculation}
        onClose={() =>
          setPreviewModal({ isVisible: false, item: null, isEditing: false })
        }
        autoLoadLyrics={autoLoadLyrics}
        onToggleAutoLoadLyrics={handleToggleAutoLoadLyrics}
        onDecompressInActivePanel={handleDecompressInActivePanel}
        onDecompressToOtherPanel={handleDecompressToOtherPanel}
        startInEditMode={previewModal.isEditing}
        setZipUpdateProgressModal={setZipUpdateProgressModal}
        startZipUpdate={startZipUpdate}
        hideZipUpdate={hideZipUpdate}
        connectZipUpdateWebSocket={connectZipUpdateWebSocket}
        onRefreshPanel={handleRefreshPanel}
        activePanel={activePanel}
        showSavingOverlay={showPreviewModalOverlay}
        setAllowContextMenu={setAllowContextMenu}
      />
      <ProgressModal
        {...copyProgress}
        isVisible={copyProgress.isVisible && !overwritePrompt.isVisible}
        currentFileBytesProcessed={copyProgress.currentFileBytesProcessed}
        currentFileSize={copyProgress.currentFileSize}
        startTime={copyProgress.startTime}
        lastUpdateTime={copyProgress.lastUpdateTime}
        onCancel={handleCancelCopy}
        isDuplicate={copyProgress.isDuplicate}
      />
      <OverwriteConfirmModal
        isVisible={overwritePrompt.isVisible}
        item={overwritePrompt.item}
        jobType={overwritePrompt.jobType}
        onDecision={handleOverwriteDecision}
        onCancel={
          overwritePrompt.jobType === "copy" ||
          overwritePrompt.jobType === "move"
            ? handleCancelCopy
            : handleCancelDecompress
        }
        sourceCount={copyProgress.sourceCount}
      />
      <QuickSelectModal
        isVisible={quickSelectModal.isVisible}
        mode={quickSelectModal.mode}
        onClose={() =>
          setQuickSelectModal({ isVisible: false, mode: "select" })
        }
        onConfirm={handleQuickSelectConfirm}
      />
      <DeleteConfirmModal
        isVisible={deleteModalVisible}
        targetItems={deleteTargets}
        summary={deleteSummary}
        onCancel={handleCancelDelete}
        onConfirm={confirmDeletion}
      />
      <HelpModal
        isVisible={helpModal.isVisible}
        onClose={() => setHelpModal({ isVisible: false })}
      />
      <CompressionProgressModal
        key={`compress-${compressProgress.jobId}`}
        isVisible={compressProgress.isVisible}
        currentFile={compressProgress.currentFile}
        totalBytes={compressProgress.totalBytes}
        processedBytes={compressProgress.processedBytes}
        currentFileTotalSize={compressProgress.currentFileTotalSize}
        currentFileBytesProcessed={compressProgress.currentFileBytesProcessed}
        instantaneousSpeed={compressProgress.instantaneousSpeed}
        onCancel={handleCancelCompress}
        error={compressProgress.error}
      />
      <DecompressionProgressModal
        key={`decompress-${decompressProgress.jobId}`}
        isVisible={decompressProgress.isVisible && !overwritePrompt.isVisible}
        currentFile={decompressProgress.currentFile}
        totalBytes={decompressProgress.totalBytes}
        processedBytes={decompressProgress.processedBytes}
        currentFileTotalSize={decompressProgress.currentFileTotalSize}
        currentFileBytesProcessed={decompressProgress.currentFileBytesProcessed}
        instantaneousSpeed={decompressProgress.instantaneousSpeed}
        onCancel={handleCancelDecompress}
        error={decompressProgress.error}
        totalArchives={decompressProgress.totalArchives}
        processedArchives={decompressProgress.processedArchives}
        currentArchiveName={decompressProgress.currentArchiveName}
      />
      <ArchiveTestIntegrityProgressModal
        key={`archive-test-${archiveTestProgress.jobId}`}
        isVisible={archiveTestProgress.isVisible}
        currentFile={archiveTestProgress.currentFile}
        totalFiles={archiveTestProgress.totalFiles}
        testedFiles={archiveTestProgress.testedFiles}
        reports={archiveTestProgress.reports}
        errors={archiveTestProgress.errors}
        totalArchives={archiveTestProgress.totalArchives}
        testedArchives={archiveTestProgress.testedArchives}
        currentArchiveName={archiveTestProgress.currentArchiveName}
        onCancel={handleCancelArchiveTest}
        onClose={closeArchiveTestModal}
      />
      <CopyPathsProgressModal
        isVisible={copyPathsModal.isVisible}
        currentPath={copyPathsModal.currentPath}
        count={copyPathsModal.count}
        mode={copyPathsModal.mode}
        onCancel={copyPathsModal.onCancel}
      />

      <ZipUpdateProgressModal {...zipUpdateProgressModal} />

      <TerminalModal
        isOpen={terminalModal.isVisible}
        jobId={terminalModal.jobId}
        initialCommand={terminalModal.initialCommand}
        triggeredFromConsole={terminalModal.triggeredFromConsole}
        commandToRun={terminalModal.commandToRun}
        commandId={terminalModal.commandId}
        onClose={() =>
          setTerminalModal({
            isVisible: false,
            jobId: null,
            initialCommand: null,
            triggeredFromConsole: false,
          })
        }
        setAllowContextMenu={setAllowContextMenu}
      />

      <MultiRenameModal
        isVisible={multiRenameModal.isVisible}
        items={multiRenameModal.items}
        onClose={() =>
          setMultiRenameModal({ isVisible: false, panelId: null, items: [] })
        }
        onApply={async (previewItems) => {
          const panelId = multiRenameModal.panelId;
          const panel = panels[panelId];

          // Build list of items that need change
          const itemsToChange = (previewItems || []).filter((i) => i.changed);
          if (!itemsToChange || itemsToChange.length === 0) {
            setMultiRenameModal({ isVisible: false, panelId: null, items: [] });
            return;
          }

          // Close the MultiRename modal and start the progress modal (modal controlled by app state)
          setMultiRenameModal({ isVisible: false, panelId: null, items: [] });
          multiRenameCancelRef.current = false;
          setMultiRenameProgress({
            isVisible: true,
            total: itemsToChange.length,
            processed: 0,
            currentOld: null,
            currentNew: null,
            successCount: 0,
            failureCount: 0,
            errors: [],
            cancelRequested: false,
            finished: false,
          });

          // Give modal a tiny moment to render and become visible before we begin updates
          await new Promise((r) => setTimeout(r, 20));

          let successCount = 0;
          let failureCount = 0;
          const errors = [];

          for (let idx = 0; idx < itemsToChange.length; idx++) {
            // Respect cancellation (set by the modal's Cancel button)
            if (multiRenameCancelRef.current) break;

            const item = itemsToChange[idx];
            setMultiRenameProgress((prev) => ({
              ...prev,
              processed: idx,
              currentOld: item.original,
              currentNew: item.newName,
            }));

            try {
              const oldPath = buildFullPath(panel.path, item.original);

              if (isVerboseLogging())
                console.log(
                  "[Multi-Rename] Renaming:",
                  oldPath,
                  "->",
                  item.newName
                );

              const response = await renameItem(oldPath, item.newName);

              // Handle zip-internal rename flows which return a jobId
              try {
                const zipMatch =
                  oldPath &&
                  typeof oldPath === "string" &&
                  oldPath.match(/^(.*\.zip)(\/.*)?$/i);
                const isInnerZipPath =
                  !!zipMatch && zipMatch[2] && zipMatch[2] !== "/";
                if (isInnerZipPath && response && response.jobId) {
                  const zipFilePath = zipMatch[1];
                  const oldFileInZip = zipMatch[2].startsWith("/")
                    ? zipMatch[2].substring(1)
                    : zipMatch[2];
                  const lastSlash = oldFileInZip.lastIndexOf("/");
                  const dir =
                    lastSlash === -1
                      ? ""
                      : oldFileInZip.substring(0, lastSlash);
                  const newFileInZip = dir
                    ? `${dir}/${item.newName}`
                    : item.newName;

                  startZipUpdate({
                    jobId: response.jobId,
                    zipFilePath,
                    filePathInZip: newFileInZip,
                    originalZipSize: 0,
                    itemType:
                      (panel.items.find((i) => i.name === item.original)
                        ?.type === "folder"
                        ? "folder"
                        : "file") || "file",
                    title: "Renaming item in zip...",
                  });

                  await new Promise((resolve) => {
                    connectZipUpdateWebSocket(response.jobId, "rename-in-zip", {
                      onComplete: () => resolve(),
                      onError: () => resolve(),
                      onCancel: () => resolve(),
                    });
                  });
                }
              } catch (err) {
                console.error(
                  "[Multi-Rename] zip-progress handling error",
                  err
                );
              }

              // Mark success
              successCount++;
              setMultiRenameProgress((prev) => ({
                ...prev,
                successCount,
                processed: idx + 1,
              }));
            } catch (e) {
              console.error(
                "[Multi-Rename] Failed to rename",
                item.original,
                "to",
                item.newName,
                "Error:",
                e
              );
              failureCount++;
              errors.push(`${item.original}: ${e.message}`);
              setMultiRenameProgress((prev) => ({
                ...prev,
                failureCount,
                errors: [
                  ...(prev.errors || []),
                  `${item.original}: ${e.message}`,
                ],
                processed: idx + 1,
              }));
            }
          }

          // Done (or cancelled) — refresh panel and close the modals
          try {
            await handleRefreshPanel(panelId);
          } catch (e) {
            console.error("[Multi-Rename] Failed to refresh panel:", e);
          }

          // Hide/finish progress modal — if there were failures, keep modal open and mark finished so user can Close
          if (failureCount > 0) {
            setMultiRenameProgress((prev) => ({
              ...prev,
              processed: prev.total,
              finished: true,
              isVisible: true,
            }));
          } else {
            setMultiRenameProgress((prev) => ({
              ...prev,
              processed: prev.total,
              finished: true,
              isVisible: false,
            }));
          }

          // Show summary on errors using the local counters (also seen in modal details)
          if (failureCount > 0) {
            // Do not open the global Application Error modal here —
            // the MultiRenameProgressModal already surface per-item errors
            // and the progress dialogs remain open with a Close button.
            if (isVerboseLogging())
              console.warn("Multi-rename completed with failures:", errors);
          }
        }}
      />
      <MultiRenameProgressModal
        isVisible={multiRenameProgress.isVisible}
        total={multiRenameProgress.total}
        processed={multiRenameProgress.processed}
        currentOld={multiRenameProgress.currentOld}
        currentNew={multiRenameProgress.currentNew}
        successCount={multiRenameProgress.successCount}
        failureCount={multiRenameProgress.failureCount}
        errors={multiRenameProgress.errors}
        onCancel={() => {
          // if modal is finished and had failures, treat this as "Close": hide the modal and reset finished flag
          if (
            multiRenameProgress.finished &&
            multiRenameProgress.failureCount > 0
          ) {
            setMultiRenameProgress((prev) => ({
              ...prev,
              isVisible: false,
              finished: false,
            }));
          } else {
            setMultiRenameProgress((prev) => ({
              ...prev,
              cancelRequested: true,
              isVisible: false,
            }));
            multiRenameCancelRef.current = true;
          }
        }}
      />

      <SearchModal
        isVisible={searchModal.isVisible}
        panelId={searchModal.panelId}
        basePath={searchModal.basePath}
        activePanelPath={panels[activePanel].path}
        otherPanelPath={panels[otherPanelId].path}
        onClose={() =>
          setSearchModal((prev) => ({ ...prev, isVisible: false }))
        }
        onGoTo={handleSearchGoTo}
        onChangeBasePath={handleChangeSearchBasePath}
        onRequestPathSelection={() => openFolderBrowserForSearch(searchPanelId)}
      />

      <main
        ref={mainRef}
        className="flex-grow flex p-2 space-x-2 overflow-hidden"
      >
        {["left", "right"].map((panelId) => {
          const otherPanelIdForPanel = panelId === "left" ? "right" : "left";
          return (
            <FilePanel
              ref={panelRefs[panelId]}
              key={panelId}
              boundaryRef={mainRef}
              panelData={panels[panelId]}
              activePanel={activePanel}
              panelId={panelId}
              renamingItem={renamingItem}
              isCreating={creatingFolder.panelId === panelId}
              newFolderValue={creatingFolder.value}
              isCreatingFile={creatingFile.panelId === panelId}
              newFileValue={creatingFile.value}
              onStartRename={handleStartRename}
              onRenameChange={(e) =>
                setRenamingItem((prev) => ({ ...prev, value: e.target.value }))
              }
              onRenameSubmit={handleConfirmRename}
              onRenameCancel={handleCancelRename}
              onNewFolderChange={(e) =>
                setCreatingFolder((prev) => ({
                  ...prev,
                  value: e.target.value,
                }))
              }
              onNewFolderSubmit={handleConfirmNewFolder}
              onNewFolderCancel={handleCancelNewFolder}
              onNewFileChange={(e) =>
                setCreatingFile((prev) => ({ ...prev, value: e.target.value }))
              }
              onNewFileSubmit={handleConfirmNewFile}
              onNewFileCancel={handleCancelNewFile}
              setActivePanel={setActivePanel}
              onNavigate={(target) =>
                handleNavigate(panelId, panels[panelId].path, target)
              }
              onNavigateToPath={(absPath) =>
                handleNavigate(panelId, absPath, "")
              }
              onOpenFile={handleOpenFile}
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
              onImportFavourites={handleImportFavourites}
              favourites={favourites}
              recentPaths={recentPaths}
              columnWidths={columnWidths[panelId]}
              setColumnWidths={setColumnWidths}
              filter={filter[panelId]}
              isFiltering={isFiltering[panelId]}
              filterPanelId={filterPanelId}
              onFilterChange={handleFilterChange}
              onCloseFilter={handleCloseFilter}
              filteredItems={filteredItems[panelId]}
              onNewFolder={handleStartNewFolder}
              onNewFile={handleStartNewFile}
              copyAbsolutePaths={copyAbsolutePaths}
              copyRelativePaths={copyRelativePaths}
              onRefreshPanel={() => handleRefreshPanel(panelId)}
              onRefreshBothPanels={handleRefreshAllPanels}
              onRefreshOtherPanel={() =>
                handleRefreshPanel(otherPanelIdForPanel)
              }
              onSelectAll={() => handleSelectAll(panelId)}
              onUnselectAll={() => handleUnselectAll(panelId)}
              onInvertSelection={() => handleInvertSelection(panelId)}
              onQuickSelect={() => handleStartQuickSelect(panelId)}
              onQuickUnselect={() => handleStartQuickUnselect(panelId)}
              onQuickFilter={() => handleStartFilter(panelId)}
              onSelectFiles={() => handleSelectFiles(panelId)}
              onSelectFolders={() => handleSelectFolders(panelId)}
              onSelectZipFiles={() => handleSelectZipFiles(panelId)}
              onUnselectFiles={() => handleUnselectFiles(panelId)}
              onUnselectFolders={() => handleUnselectFolders(panelId)}
              onUnselectZipFiles={() => handleUnselectZipFiles(panelId)}
              onQuickFilterFiles={() => handleQuickFilterFiles(panelId)}
              onQuickFilterFolders={() => handleQuickFilterFolders(panelId)}
              onQuickFilterZipFiles={() => handleQuickFilterZipFiles(panelId)}
              onResetQuickFilter={() => handleResetQuickFilter(panelId)}
              onSwapPanels={handleSwapPanels}
              onTerminal={handleTerminal}
              onTerminalOtherPanel={handleTerminalOtherPanel}
              onSearchActivePanel={handleMenuSearchActivePanel}
              onSearchOtherPanel={handleMenuSearchOtherPanel}
              onPreview={() => {
                if (selections[panelId].size === 1) {
                  const itemName = [...selections[panelId]][0];
                  const item = panels[panelId].items.find(
                    (i) => i.name === itemName
                  );
                  if (!item) return;

                  if (item.type === "archive" || isItemPreviewable(item)) {
                    setPreviewModal({
                      isVisible: true,
                      item,
                      isEditing: false,
                    });
                  }
                }
              }}
              onOpen={handleContextOpen}
              onOpenWith={handleContextOpenWith}
              onView={handleViewItem}
              onEdit={handleEdit}
              onCopyToOtherPanel={() => {
                const sourcePanelId = panelId;
                const destPanelId = sourcePanelId === "left" ? "right" : "left";
                const sourcePath = panels[sourcePanelId].path;
                const destinationPath = panels[destPanelId].path;
                const items = filter[sourcePanelId].pattern
                  ? filteredItems[sourcePanelId]
                  : panels[sourcePanelId].items;
                const sources = items
                  .filter((item) => selections[sourcePanelId].has(item.name))
                  .map((item) => buildFullPath(sourcePath, item.name));
                performCopy(sources, destinationPath);
              }}
              onMoveToOtherPanel={() => {
                const sourcePanelId = panelId;
                const destPanelId = sourcePanelId === "left" ? "right" : "left";
                const sourcePath = panels[sourcePanelId].path;
                const destinationPath = panels[destPanelId].path;
                const items = filter[sourcePanelId].pattern
                  ? filteredItems[sourcePanelId]
                  : panels[sourcePanelId].items;
                const sources = items
                  .filter((item) => selections[sourcePanelId].has(item.name))
                  .map((item) => buildFullPath(sourcePath, item.name));
                performCopy(sources, destinationPath, true);
              }}
              onCopyTo={() => handleCopyTo(panelId)}
              onMoveTo={() => handleMoveTo(panelId)}
              onCopyToClipboard={handleCopyToClipboard}
              onCutToClipboard={handleCutToClipboard}
              onPasteFromClipboard={handlePasteFromClipboard}
              onDuplicate={handleDuplicate}
              onRename={() => {
                // handleStartRename wrapper will handle single vs multi-rename
                if (selections[panelId].size > 0) {
                  const name = [...selections[panelId]][0];
                  if (name !== "..") {
                    handleStartRename(panelId, name);
                  }
                }
              }}
              onDelete={() => {
                const items = filter[panelId].pattern
                  ? filteredItems[panelId]
                  : panels[panelId].items;
                const itemsToDelete = items.filter((item) =>
                  selections[panelId].has(item.name)
                );
                handleDeleteItem(itemsToDelete);
              }}
              onSetOtherPanelPath={() => handleSetOtherPanelPath()}
              onCalculateSize={() => {
                const itemsToConsider = filter[panelId].pattern
                  ? filteredItems[panelId]
                  : panels[panelId].items;
                const foldersToCalc = itemsToConsider.filter(
                  (i) => i.type === "folder" && selections[panelId].has(i.name)
                );
                if (foldersToCalc.length > 0) {
                  calculateSizeForMultipleFolders(foldersToCalc, panelId);
                }
              }}
              onCompressInActivePanel={handleCompressInActivePanel}
              onCompressToOtherPanel={handleCompressToOtherPanel}
              onDecompressInActivePanel={handleDecompressInActivePanel}
              onDecompressToOtherPanel={handleDecompressToOtherPanel}
              onDecompressInSubfolderInActivePanel={
                handleDecompressInSubfolderInActivePanel
              }
              onDecompressInSubfolderToOtherPanel={
                handleDecompressInSubfolderToOtherPanel
              }
              onTestArchive={handleTestArchive}
              appState={appState}
              onChooseFolder={openFolderBrowserForPanel}
              sortConfig={sortConfig[panelId]}
              onSort={handleSort}
              clipboard={clipboard}
            />
          );
        })}
      </main>
      <ActionBar buttons={actionBarButtons} />
    </div>
  );
}
