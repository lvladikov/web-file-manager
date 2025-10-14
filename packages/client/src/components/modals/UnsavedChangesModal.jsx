import { ShieldAlert } from "lucide-react";

const UnsavedChangesModal = ({ isVisible, onSave, onDiscard, onCancel }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-yellow-500 rounded-lg shadow-xl p-6 w-full max-w-md text-gray-200">
        <h3 className="text-xl font-bold text-yellow-400 mb-4 flex items-center">
          <ShieldAlert className="w-6 h-6 mr-2" /> Unsaved Changes
        </h3>
        <p className="mb-6">
          You have unsaved changes. Would you like to save them before closing?
        </p>
        <div className="flex justify-end space-x-3 mt-4">
          <button
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Don't Save
          </button>
          <button
            onClick={onSave}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsavedChangesModal;
