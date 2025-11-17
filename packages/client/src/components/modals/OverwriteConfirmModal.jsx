import { ShieldAlert, XCircle } from "lucide-react";

const OverwriteConfirmModal = ({
  isVisible,
  item,
  onDecision,
  onCancel,
  sourceCount = 1,
  jobType = "copy",
}) => {
  if (!isVisible) return null;

  const isFolder = item.type === "folder";
  const isMultiSource = sourceCount > 1;
  const showSubsequentOptions = isMultiSource || isFolder;
  const operation = jobType === "move" ? "Move" : "Copy";

  const baseButtonClasses =
    "py-3 px-4 rounded-lg w-full flex items-center justify-center transition-colors duration-150 text-sm";

  const conditionalButtons = [
    {
      label: "Yes to All",
      decision: "overwrite_all",
      title:
        "Overwrite any conflicting item (file or folder) for the rest of this operation.",
      colorClass: "bg-green-700 hover:bg-green-600",
    },
    {
      label: `${operation} if New`,
      decision: "if_newer",
      title: `${operation} only new items (files and folders), including any empty folders. This mode never overwrites an existing item in the Target, regardless of its size or date. Use this for safely adding missing content.`,
      colorClass: "bg-green-700 hover:bg-green-600",
    },
    {
      label: "No to All",
      decision: "skip_all",
      title:
        "Skip any conflicting item (file or folder) for the rest of this operation.",
      colorClass: "bg-red-700 hover:bg-red-600",
    },
    {
      label: "Skip if Source is Empty",
      decision: "no_zero_length",
      title: `Skip ${
        operation === "Move" ? "moving" : "copying"
      } any zero-byte file or any empty folder from the Source.`,
      colorClass: "bg-amber-700 hover:bg-amber-600",
    },
    {
      label: "Overwrite if Size Differs",
      decision: "size_differs",
      title:
        "Overwrites a Target file if its size differs from the Source. The size comparison is ignored for folders; they are always entered to check for internal changes.",
      colorClass: "bg-sky-700 hover:bg-sky-600",
    },
    {
      label: "Replace if Smaller",
      decision: "smaller_only",
      title:
        "Replace a Target file only if it is smaller than the Source file. This rule does not apply to folders, so they are never skipped by this mode.",
      colorClass: "bg-sky-700 hover:bg-sky-600",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: 99999 }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-yellow-500">
        <div className="flex items-center mb-4">
          <ShieldAlert className="w-8 h-8 text-yellow-400 mr-3" />
          <h3 className="text-xl font-bold text-sky-400">Please Confirm</h3>
        </div>

        {isFolder ? (
          <>
            <p className="text-gray-300 mb-2">
              The folder{" "}
              <span className="font-bold font-mono text-gray-100">
                {item.name}
              </span>{" "}
              already exists in the Target.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              You can decide for the folder itself now. If you proceed, you may
              be prompted again for conflicting items found inside.
            </p>
          </>
        ) : (
          <p className="text-gray-300 mb-6">
            Target already has a file named{" "}
            <span className="font-bold font-mono text-gray-100">
              {item.name}
            </span>
            .
          </p>
        )}

        {/* --- Main Grid --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left Column: One-time actions. */}
          <div
            className={`flex flex-col space-y-2 ${
              !showSubsequentOptions ? "md:col-span-3" : ""
            }`}
          >
            {showSubsequentOptions && (
              <h4 className="font-bold text-gray-400 border-b border-gray-600 pb-1 mb-1">
                {isFolder ? "For the Folder Itself" : "For This File Only"}
              </h4>
            )}
            <button
              id="overwrite-yes-button"
              onClick={() => onDecision("overwrite")}
              className={`${baseButtonClasses} bg-green-600 hover:bg-green-700 text-white font-bold`}
              title={
                isFolder
                  ? "Proceed and check for conflicting items inside this folder."
                  : "Overwrite the file in the Target."
              }
            >
              {isFolder ? "Yes and Check Inside" : "Yes"}
            </button>
            <button
              id="overwrite-no-button"
              onClick={() => onDecision(isFolder ? "skip_all" : "skip")}
              className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white font-bold`}
              title={
                isFolder
                  ? "Skip this folder and ALL of its contents."
                  : `Skip this file and do not ${operation.toLowerCase()} it.`
              }
            >
              {isFolder ? "Skip Entire Folder" : "No"}
            </button>
          </div>

          {/* Center Column: Job-wide rules */}
          {showSubsequentOptions && (
            <div className="flex flex-col space-y-2 md:col-span-2">
              <h4 className="font-bold text-gray-400 border-b border-gray-600 pb-1 mb-1">
                For All Subsequent Items in this Operation
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {conditionalButtons.map(
                  ({ label, decision, title, colorClass }) => (
                    <button
                      id={`overwrite-${decision}-button`}
                      key={decision}
                      onClick={() => onDecision(decision)}
                      className={`${baseButtonClasses} ${
                        colorClass.includes("text-black") ? "" : "text-white"
                      } ${colorClass}`}
                      title={title}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* --- Cancel Button --- */}
        <div className="mt-6 border-t border-gray-700 pt-4 flex justify-end">
          <button
            id="overwrite-cancel-button"
            onClick={onCancel}
            className={`${baseButtonClasses} bg-gray-600 hover:bg-gray-500 text-white`}
          >
            <XCircle className="w-5 h-5 mr-2" /> Cancel Entire Operation
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverwriteConfirmModal;
