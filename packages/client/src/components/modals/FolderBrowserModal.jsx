import BrowserModal from "../../components/modals/BrowserModal";

const FolderBrowserModal = (props) => (
  <BrowserModal
    {...props}
    title="Select a Folder..."
    confirmButtonText="Select Folder"
    filterItem={(item) => item.type === "folder" || item.type === "parent"}
  />
);

export default FolderBrowserModal;
