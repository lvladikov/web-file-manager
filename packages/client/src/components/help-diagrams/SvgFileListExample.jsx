// SVG Example: File List with Selection and Truncation
const SvgFileListExample = () => (
  <SvgUiElement width={400} height={150}>
    <text x="15" y="25" className="svg-text svg-text-light">
      📄 a_very_long_...ame_that_truncates.txt
    </text>
    <rect
      x="10"
      y="35"
      width="380"
      height="20"
      rx="2"
      className="svg-highlight-bg"
    />
    <text x="15" y="50" className="svg-text svg-highlight-text">
      📁 another_folder
    </text>
    <text x="15" y="75" className="svg-text">
      🖼️ photo.jpg
    </text>
    <rect
      x="10"
      y="85"
      width="380"
      height="20"
      rx="2"
      className="svg-highlight-bg"
    />
    <text x="15" y="100" className="svg-text svg-highlight-text">
      🎵 music_track.flac
    </text>
    <text x="15" y="125" className="svg-text">
      📄 README.md
    </text>
  </SvgUiElement>
);

export default SvgFileListExample;
