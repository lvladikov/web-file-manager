import SvgUiElement from "./SvgUiElement";
import { FileText, Folder, ImageIcon, Film, FileAudio } from "lucide-react";

// SVG Example: Dual Panel Layout
const SvgDualPanelExample = () => (
  <SvgUiElement width={600} height={180}>
    {/* Left Panel */}
    <rect
      x="10"
      y="10"
      width="285"
      height="160"
      rx="4"
      className="svg-bg svg-border"
    />
    <rect
      x="10"
      y="10"
      width="285"
      height="30"
      rx="4"
      className="svg-header-bg"
    />
    <text x="25" y="30" className="svg-text svg-text-bold">
      /users/project_a/
    </text>
    <FileText x="25" y="45" size={16} className="text-gray-400" />
    <text x="45" y="55" className="svg-text">
      document.pdf
    </text>
    <ImageIcon x="25" y="65" size={16} className="text-purple-500" />
    <text x="45" y="75" className="svg-text">
      image_file.png
    </text>
    <Folder x="25" y="85" size={16} className="text-sky-500" />
    <text x="45" y="95" className="svg-text">
      subfolder
    </text>

    {/* Right Panel */}
    <rect
      x="305"
      y="10"
      width="285"
      height="160"
      rx="4"
      className="svg-bg svg-border"
    />
    <rect
      x="305"
      y="10"
      width="285"
      height="30"
      rx="4"
      className="svg-header-bg"
    />
    <text x="320" y="30" className="svg-text svg-text-bold">
      /users/project_b/
    </text>
    <FileAudio x="320" y="45" size={16} className="text-teal-500" />
    <text x="340" y="55" className="svg-text">
      track01.mp3
    </text>
    <Film x="320" y="65" size={16} className="text-red-500" />
    <text x="340" y="75" className="svg-text">
      movie_clip.mp4
    </text>
    <Folder x="320" y="85" size={16} className="text-sky-500" />
    <text x="340" y="95" className="svg-text">
      assets
    </text>
  </SvgUiElement>
);

export default SvgDualPanelExample;
