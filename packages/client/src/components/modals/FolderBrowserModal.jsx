import BrowserModal from "../../components/modals/BrowserModal";

const FolderBrowserModal = ({
  title = "Select a folder...",
  overlayClassName,
  modalClassName,
  ...rest
}) => (
  <BrowserModal
    {...rest}
    title={title}
    overlayClassName={overlayClassName}
    modalClassName={modalClassName}
    confirmButtonText="Select Folder"
    filterItem={(item) => item.type === "folder" || item.type === "parent"}
  />
);

export default FolderBrowserModal;
