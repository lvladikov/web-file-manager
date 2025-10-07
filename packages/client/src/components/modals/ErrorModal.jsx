import { ShieldAlert } from "lucide-react";

const ErrorModal = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md text-center border border-red-500">
        <div className="flex justify-center items-center mb-4">
          <ShieldAlert className="w-12 h-12 text-red-400 mr-3" />
          <h3 className="text-xl font-bold text-red-400">Application Error</h3>
        </div>
        <p className="text-gray-300 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default ErrorModal;
