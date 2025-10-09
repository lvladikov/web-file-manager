import SvgUiElement from "./SvgUiElement";

// SVG Example: Context Menu
const SvgContextMenuExample = () => (
  <SvgUiElement width={280} height={460}>
    <rect
      x="10"
      y="10"
      width="260"
      height="440"
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
    <line x1="10" y1="65" x2="270" y2="65" className="svg-border" />
    <text x="25" y="85" className="svg-text">
      Copy to other panel (F5)
    </text>
    <text x="25" y="105" className="svg-text svg-text-light">
      Copy to clipboard (Cmd+C)
    </text>
    <text x="25" y="125" className="svg-text svg-text-light">
      Move (Cut) to clipboard (Cmd+X)
    </text>
    <text x="25" y="145" className="svg-text svg-text-light">
      Move to other panel (F6)
    </text>
    <text x="25" y="165" className="svg-text svg-text-light">
      Move to...
    </text>
    <line x1="10" y1="180" x2="270" y2="180" className="svg-border" />
    <text x="25" y="200" className="svg-text">
      Rename (F2)
    </text>
    <text x="25" y="220" className="svg-text" fill="#F87171">
      Delete (F8)
    </text>
    <line x1="10" y1="235" x2="270" y2="235" className="svg-border" />
    <text x="25" y="255" className="svg-text">
      Select All (Cmd+A)
    </text>
    <text x="25" y="275" className="svg-text">
      Unselect All (Cmd+D)
    </text>
    <text x="25" y="295" className="svg-text">
      Invert Selection (*)
    </text>
    <line x1="10" y1="310" x2="270" y2="310" className="svg-border" />
    <text x="25" y="330" className="svg-text">
      Quick Select (+)
    </text>
    <text x="25" y="350" className="svg-text">
      Quick Unselect (-)
    </text>
    <line x1="10" y1="365" x2="270" y2="365" className="svg-border" />
    <text x="25" y="385" className="svg-text">
      Quick Filter (.)
    </text>
    <line x1="10" y1="400" x2="270" y2="400" className="svg-border" />
    <text x="25" y="420" className="svg-text">
      Refresh active panel
    </text>
    <text x="25" y="440" className="svg-text">
      Refresh both panels
    </text>
  </SvgUiElement>
);

export default SvgContextMenuExample;
