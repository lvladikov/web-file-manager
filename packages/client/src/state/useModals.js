import { useState } from "react";

export default function useModals() {
  const [appBrowserModal, setAppBrowserModal] = useState({
    isVisible: false,
    file: null,
    path: null,
  });

  const [folderBrowserModal, setFolderBrowserModal] = useState({
    isVisible: false,
    targetPanelId: null,
    initialPath: "",
  });

  const [previewModal, setPreviewModal] = useState({
    isVisible: false,
    item: null,
    isEditing: false,
  });

  const [helpModal, setHelpModal] = useState({ isVisible: false });

  const [quickSelectModal, setQuickSelectModal] = useState({
    isVisible: false,
    mode: "select", // 'select' or 'unselect'
  });

  return {
    previewModal,
    setPreviewModal,
    folderBrowserModal,
    setFolderBrowserModal,
    appBrowserModal,
    setAppBrowserModal,
    quickSelectModal,
    setQuickSelectModal,
    helpModal,
    setHelpModal,
  };
}
