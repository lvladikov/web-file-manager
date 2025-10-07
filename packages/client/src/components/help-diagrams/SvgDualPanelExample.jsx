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
    <text x="25" y="55" className="svg-text">
      📄 document.pdf
    </text>
    <text x="25" y="75" className="svg-text">
      🖼️ image_file.png
    </text>
    <text x="25" y="95" className="svg-text">
      📁 subfolder
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
    <text x="320" y="55" className="svg-text">
      🎵 track01.mp3
    </text>
    <text x="320" y="75" className="svg-text">
      🎬 movie_clip.mp4
    </text>
    <text x="320" y="95" className="svg-text">
      📁 assets
    </text>
  </SvgUiElement>
);

export default SvgDualPanelExample;
