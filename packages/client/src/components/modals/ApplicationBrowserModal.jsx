import BrowserModal from "../../components/modals/BrowserModal";

const ApplicationBrowserModal = ({ fileName, ...props }) => (
  <BrowserModal
    {...props}
    title="Select Application to Open With..."
    confirmButtonText="Open"
    filterItem={(item) => item.type !== "folder" && item.type !== "parent"}
  >
    <p>File: {fileName}</p>
  </BrowserModal>
);

export default ApplicationBrowserModal;
