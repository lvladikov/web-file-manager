// SVG Example: Context Menu
const SvgContextMenuExample = () => (
  <SvgUiElement width={220} height={280}>
    <rect
      x="10"
      y="10"
      width="200"
      height="260"
      rx="4"
      fill="#374151"
      className="svg-border"
    />
    <text x="25" y="30" className="svg-text">
      Preview (Space)
    </text>
    <text x="25" y="50" className="svg-text">
      Open (Enter)
    </text>
    <line x1="10" y1="65" x2="210" y2="65" className="svg-border" />
    <text x="25" y="85" className="svg-text">
      Copy to other panel (F5)
    </text>
    <text x="25" y="105" className="svg-text svg-text-light">
      Copy (to clipboard)
    </text>
    <text x="25" y="125" className="svg-text svg-text-light">
      Cut (to clipboard)
    </text>
    <text x="25" y="145" className="svg-text svg-text-light">
      Move to other panel (F6)
    </text>
    <line x1="10" y1="160" x2="210" y2="160" className="svg-border" />
    <text x="25" y="180" className="svg-text">
      Rename (F2)
    </text>
    <text x="25" y="200" className="svg-text" fill="#F87171">
      Delete (F8)
    </text>
    <line x1="10" y1="215" x2="210" y2="215" className="svg-border" />
    <text x="25" y="235" className="svg-text">
      Calculate Folder Size
    </text>
    <text x="25" y="255" className="svg-text">
      Set as other panel's path
    </text>
  </SvgUiElement>
);

export default SvgContextMenuExample;
