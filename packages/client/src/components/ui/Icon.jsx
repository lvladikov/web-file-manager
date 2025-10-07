import {
  FileText,
  Folder,
  ChevronsRight,
  FileArchive,
  Image as ImageIcon,
  Film,
  FileAudio,
} from "lucide-react";

const Icon = ({ type }) => {
  const base = "w-5 h-5 flex-shrink-0";
  const icons = {
    folder: <Folder className={`${base} text-sky-500`} />,
    parent: (
      <ChevronsRight
        className={`${base} text-yellow-500 transform rotate-[-90deg]`}
      />
    ),
    archive: <FileArchive className={`${base} text-amber-600`} />,
    image: <ImageIcon className={`${base} text-purple-500`} />,
    video: <Film className={`${base} text-red-500`} />,
    audio: <FileAudio className={`${base} text-teal-500`} />,
    pdf: <FileText className={`${base} text-red-600`} />,
  };
  return icons[type] || <FileText className={`${base} text-gray-400`} />;
};

export default Icon;
