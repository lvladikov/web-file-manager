import { FileText, Folder } from "lucide-react";

const UnsupportedPreview = ({
  item,
  onStartSizeCalculation,
  onOpenFile,
  onClose,
  activePath,
}) => {
  const isFolder = item.type === "folder";

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
      {isFolder ? (
        <Folder className="w-24 h-24 text-gray-500 mb-4" />
      ) : (
        <FileText className="w-24 h-24 text-gray-500 mb-4" />
      )}
      <p className="text-xl text-gray-300 mb-2">
        {isFolder ? "Cannot Preview Folder" : "Cannot Preview File"}
      </p>
      <p className="font-mono text-gray-400 mb-6 break-all">{item.name}</p>
      {isFolder ? (
        <button
          onClick={() => {
            onStartSizeCalculation(item);
            onClose();
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Calculate Size
        </button>
      ) : (
        <button
          onClick={() => {
            onOpenFile(activePath, item.name);
            onClose();
          }}
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Open with System
        </button>
      )}
    </div>
  );
};

export default UnsupportedPreview;
