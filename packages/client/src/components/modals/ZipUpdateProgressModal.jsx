import React from "react";
import { LoaderCircle } from "lucide-react";

const ZipUpdateProgressModal = ({ isVisible, filePathInZip, zipFilePath }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500 text-white font-mono">
        <h2 className="text-xl font-bold text-sky-400 mb-4 flex items-center">
          <LoaderCircle className="w-6 h-6 mr-2 animate-spin text-sky-400" />
          Updating Zip Archive...
        </h2>
        <p className="text-gray-400 mb-2">File: <span className="text-sky-300">{filePathInZip}</span></p>
        <p className="text-gray-400 mb-4">Archive: <span className="text-sky-300">{zipFilePath}</span></p>
        <p className="text-gray-400">Please wait while the zip file is being updated. This may take a moment for large archives.</p>
      </div>
    </div>
  );
};

export default ZipUpdateProgressModal;
