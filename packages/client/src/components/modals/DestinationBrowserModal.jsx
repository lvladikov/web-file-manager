import BrowserModal from "../../components/modals/BrowserModal";

const DestinationBrowserModal = ({ onConfirm, ...props }) => {
  const isMove = props.title && props.title.startsWith("Move");
  return (
    <BrowserModal
      {...props}
      onConfirm={(destinationPath) => {
        onConfirm(destinationPath, isMove);
      }}
      confirmButtonText={isMove ? "Move Here" : "Copy Here"}
      filterItem={(item) => item.type === "folder" || item.type === "parent"}
    />
  );
};

export default DestinationBrowserModal;
