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
  });

  const [isHelpVisible, setIsHelpVisible] = useState(false);

  return {
    appBrowserModal,
    setAppBrowserModal,
    folderBrowserModal,
    setFolderBrowserModal,
    previewModal,
    setPreviewModal,
    isHelpVisible,
    setIsHelpVisible,
  };
}
