import {
  FileText,
  Folder,
  ChevronsRight,
  FileArchive,
  Image as ImageIcon,
  Film,
  FileAudio,
  FileCode,
  FileJson,
  FileTerminal,
  GitCommit,
  Container,
} from "lucide-react";

const Icon = ({ type, className }) => {
  const base = `w-5 h-5 flex-shrink-0 ${className || ""}`;
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
    doc: <FileText className={`${base} text-blue-600`} />,
    html: <FileCode className={`${base} text-orange-600`} />,
    css: <FileCode className={`${base} text-blue-600`} />,
    javascript: <FileCode className={`${base} text-yellow-500`} />,
    typescript: <FileCode className={`${base} text-blue-500`} />,
    json: <FileJson className={`${base} text-green-500`} />,
    python: <FileCode className={`${base} text-blue-400`} />,
    shell: <FileTerminal className={`${base} text-green-400`} />,
    sql: <FileCode className={`${base} text-indigo-400`} />,
    markdown: <FileText className={`${base} text-indigo-400`} />,
    yaml: <FileText className={`${base} text-red-400`} />,
    xml: <FileCode className={`${base} text-orange-400`} />,
    log: <FileText className={`${base} text-gray-400`} />,
    config: <FileText className={`${base} text-gray-500`} />,
    docker: <Container className={`${base} text-blue-400`} />,
    git: <GitCommit className={`${base} text-red-500`} />,
    code: <FileCode className={`${base} text-gray-400`} />,
  };
  return icons[type] || <FileText className={`${base} text-gray-400`} />;
};

export default Icon;