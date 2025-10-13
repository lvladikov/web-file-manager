import { cancelSizeCalculation } from "./lib/api";
import { isItemPreviewable, buildFullPath } from "./lib/utils";
import { useRef } from "react";

import appState from "./state";

// Components
import ActionBar from "./components/ui/ActionBar";
import AppMenu from "./components/ui/AppMenu";
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
import QuickSelectModal from "./components/modals/QuickSelectModal";
import CompressionProgressModal from "./components/modals/CompressionProgressModal";
import DecompressionProgressModal from "./components/modals/DecompressionProgressModal";
import ArchiveTestIntegrityProgressModal from "./components/modals/ArchiveTestIntegrityProgressModal";

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
    folderBrowserModal,
    copyProgress,
    editingPath,
    favourites,
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

    // Setters & Handlers
    setActivePanel,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
    setAppBrowserModal,
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
    handleContextOpen,
    handleContextOpenWith,
    handleSetOtherPanelPath,
    openFolderBrowserForPanel,
    handleFolderBrowserConfirm,
    handlePathInputSubmit,
    handleToggleFavourite,
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
    filter,
    isFiltering,
    filterPanelId,
    handleStartFilter,
    handleCloseFilter,
    handleFilterChange,
    filteredItems,

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
    archiveTestProgress,
    handleCancelArchiveTest,
    handleTestArchive,
    closeArchiveTestModal,
    handleSwapPanels,
  } = appState();
  const mainRef = useRef(null);

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
  const canOpen = singleItemSelected;
  const canOpenWith =
    singleItemSelected &&
    firstSelectedItemDetails?.type !== "folder" &&
    firstSelectedItemDetails?.type !== "parent";

  return (
    <div
      className="flex flex-col h-screen bg-gray-900 text-white"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="bg-gray-800 p-2 flex justify-start items-center relative">
        <AppMenu
          activePanel={activePanel}
          panels={panels}
          activePanelSelections={selections[activePanel]}
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
          onRename={() => {
            if (selections[activePanel].size === 1) {
              const name = [...selections[activePanel]][0];
              if (name !== "..") {
                handleStartRename(activePanel, name);
              }
            }
          }}
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
            const panelItems = panels[activePanel].items;
            const foldersToCalc = panelItems.filter(
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
                const otherPanelId = activePanel === "left" ? "right" : "left";
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
          onSelectAll={handleSelectAll}
          onUnselectAll={handleUnselectAll}
          onInvertSelection={handleInvertSelection}
          onQuickSelect={handleStartQuickSelect}
          onQuickUnselect={handleStartQuickUnselect}
          onQuickFilter={handleStartFilter}
          onCompressInActivePanel={handleCompressInActivePanel}
          onCompressToOtherPanel={handleCompressToOtherPanel}
          onDecompressInActivePanel={handleDecompressInActivePanel}
          onDecompressToOtherPanel={handleDecompressToOtherPanel}
          onTestArchive={handleTestArchive}
          onSwapPanels={handleSwapPanels}
          onPreview={() => {
            if (selections[activePanel].size === 1) {
              const itemName = [...selections[activePanel]][0];
              const item = panels[activePanel].items.find(
                (i) => i.name === itemName
              );
              if (!item) return;

              if (item.type === "archive" || isItemPreviewable(item)) {
                setPreviewModal({ isVisible: true, item });
              }
            }
          }}
          onOpen={handleContextOpen}
          onOpenWith={handleContextOpenWith}
          canPreview={canPreview}
          canOpen={canOpen}
          canOpenWith={canOpenWith}
        />
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
        isVisible={previewModal.isVisible}
        item={previewModal.item}
        activePath={activePath}
        onOpenFile={handleOpenFile}
        onStartSizeCalculation={handleStartSizeCalculation}
        onClose={() => setPreviewModal({ isVisible: false, item: null })}
        autoLoadLyrics={autoLoadLyrics}
        onToggleAutoLoadLyrics={handleToggleAutoLoadLyrics}
      />
      <ProgressModal
        {...copyProgress}
        isVisible={copyProgress.isVisible && !overwritePrompt.isVisible}
        currentFileBytesProcessed={copyProgress.currentFileBytesProcessed}
        currentFileSize={copyProgress.currentFileSize}
        startTime={copyProgress.startTime}
        lastUpdateTime={copyProgress.lastUpdateTime}
        onCancel={handleCancelCopy}
      />
      <OverwriteConfirmModal
        isVisible={overwritePrompt.isVisible}
        item={overwritePrompt.item}
        onDecision={handleOverwriteDecision}
        onCancel={
          overwritePrompt.jobType === "copy"
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
      />
      <ArchiveTestIntegrityProgressModal
        key={`archive-test-${archiveTestProgress.jobId}`}
        isVisible={archiveTestProgress.isVisible}
        currentFile={archiveTestProgress.currentFile}
        totalFiles={archiveTestProgress.totalFiles}
        testedFiles={archiveTestProgress.testedFiles}
        report={archiveTestProgress.report}
        error={archiveTestProgress.error}
        onCancel={handleCancelArchiveTest}
        onClose={closeArchiveTestModal}
      />

      <main
        ref={mainRef}
        className="flex-grow flex p-2 space-x-2 overflow-hidden"
      >
        {["left", "right"].map((panelId) => (
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
            favourites={favourites}
            columnWidths={columnWidths[panelId]}
            setColumnWidths={setColumnWidths}
            filter={filter[panelId]}
            isFiltering={isFiltering[panelId]}
            filterPanelId={filterPanelId}
            onFilterChange={handleFilterChange}
            onCloseFilter={handleCloseFilter}
            filteredItems={filteredItems[panelId]}
            onNewFolder={() => handleStartNewFolder(panelId)}
            onRefreshPanel={() => handleRefreshPanel(panelId)}
            onRefreshBothPanels={handleRefreshAllPanels}
            onSelectAll={() => handleSelectAll(panelId)}
            onUnselectAll={() => handleUnselectAll(panelId)}
            onInvertSelection={() => handleInvertSelection(panelId)}
            onQuickSelect={() => handleStartQuickSelect(panelId)}
            onQuickUnselect={() => handleStartQuickUnselect(panelId)}
            onQuickFilter={() => handleStartFilter(panelId)}
            onSwapPanels={handleSwapPanels}
            onPreview={() => {
              if (selections[panelId].size === 1) {
                const itemName = [...selections[panelId]][0];
                const item = panels[panelId].items.find(
                  (i) => i.name === itemName
                );
                if (!item) return;

                if (item.type === "archive") {
                  setPreviewModal({ isVisible: true, item });
                } else if (isItemPreviewable(item)) {
                  setPreviewModal({ isVisible: true, item });
                }
              }
            }}
            onOpen={() => handleContextOpen()}
            onOpenWith={() => handleContextOpenWith()}
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
            onRename={() => {
              if (selections[panelId].size === 1) {
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
              const foldersToCalc = panels[panelId].items.filter(
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
            onTestArchive={handleTestArchive}
            appState={appState}
            onChooseFolder={openFolderBrowserForPanel}
          />
        ))}
      </main>
      <ActionBar buttons={actionBarButtons} />
    </div>
  );
}
