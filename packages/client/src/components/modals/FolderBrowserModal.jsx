import BrowserModal from "../../components/modals/BrowserModal";

const FolderBrowserModal = (props) => (
  <BrowserModal
    {...props}
    title="Select a folder..."
    confirmButtonText="Select Folder"
    filterItem={(item) => item.type === "folder" || item.type === "parent"}
  />
);

export default FolderBrowserModal;
