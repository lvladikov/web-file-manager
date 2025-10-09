import SvgUiElement from "./SvgUiElement";
import { Folder, ImageIcon, Film, FileText } from "lucide-react";

// SVG Example: File List
const SvgFileListExample = () => (
  <SvgUiElement width={340} height={180}>
    {/* Header */}
    <rect x="10" y="10" width="320" height="20" fill="#4b5563" />
    <text x="20" y="25" className="svg-text svg-text-bold">Name</text>
    <text x="170" y="25" className="svg-text svg-text-bold">Size</text>
    <text x="230" y="25" className="svg-text svg-text-bold">Modified</text>

    {/* Items */}
    {/* Parent Folder */}
    <rect x="10" y="30" width="320" height="30" fill="#374151" />
    <text x="20" y="50" className="svg-text svg-text-light">↑ ..</text>

    {/* Folder */}
    <rect x="10" y="60" width="320" height="30" fill="#374151" />
    <Folder x="20" y="68" size={16} className="text-sky-500" />
    <text x="40" y="80" className="svg-text">Folder Name</text>

    {/* Image */}
    <rect x="10" y="90" width="320" height="30" fill="#374151" />
    <ImageIcon x="20" y="98" size={16} className="text-purple-500" />
    <text x="40" y="110" className="svg-text">Image.jpg</text>

    {/* Video */}
    <rect x="10" y="120" width="320" height="30" fill="#374151" />
    <Film x="20" y="128" size={16} className="text-red-500" />
    <text x="40" y="140" className="svg-text">Video.mp4</text>

    {/* Text File */}
    <rect x="10" y="150" width="320" height="30" fill="#374151" />
    <FileText x="20" y="158" size={16} className="text-gray-400" />
    <text x="40" y="170" className="svg-text">Document.txt</text>
  </SvgUiElement>
);

export default SvgFileListExample;
