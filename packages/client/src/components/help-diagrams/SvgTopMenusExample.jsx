import SvgUiElement from "./SvgUiElement";

const SvgTopMenusExample = () => (
  <SvgUiElement width={400} height={360}>
    {/* Menu Bar */}
    <rect x="10" y="10" width="380" height="340" fill="#4b5563" />
    <text x="20" y="30" className="svg-text svg-text-bold">File</text>
    <text x="100" y="30" className="svg-text svg-text-bold">Select</text>

    {/* File Dropdown */}
    <rect x="10" y="40" width="220" height="300" rx="4" fill="#374151" className="svg-border" />
    <text x="20" y="60" className="svg-text">Copy to other panel (F5)</text>
    <text x="20" y="80" className="svg-text svg-text-light">Copy to clipboard (Cmd+C)</text>
    <text x="20" y="100" className="svg-text svg-text-light">Copy to ...</text>
    <line x1="10" y1="110" x2="230" y2="110" className="svg-border" />
    <text x="20" y="130" className="svg-text svg-text-light">Move to other panel (F6)</text>
    <text x="20" y="150" className="svg-text svg-text-light">Move (Cut) to clipboard (Cmd+X)</text>
    <text x="20" y="170" className="svg-text svg-text-light">Move to ...</text>
    <line x1="10" y1="180" x2="230" y2="180" className="svg-border" />
    <text x="20" y="200" className="svg-text">Rename (F2)</text>
    <text x="20" y="220" className="svg-text" fill="#F87171">Delete (F8)</text>
    <line x1="10" y1="230" x2="230" y2="230" className="svg-border" />
    <text x="20" y="250" className="svg-text">Compress in active panel</text>
    <text x="20" y="270" className="svg-text">Compress to other panel</text>
    <line x1="10" y1="280" x2="230" y2="280" className="svg-border" />
    <text x="20" y="300" className="svg-text">Calculate folder size</text>
    <text x="20" y="320" className="svg-text">Refresh active panel</text>

    {/* Select Dropdown */}
    <rect x="90" y="40" width="180" height="170" rx="4" fill="#374151" className="svg-border" />
    <text x="100" y="60" className="svg-text">Select All (Cmd+A)</text>
    <text x="100" y="80" className="svg-text">Unselect All (Cmd+D)</text>
    <text x="100" y="100" className="svg-text">Invert Selection (*)</text>
    <line x1="90" y1="110" x2="270" y2="110" className="svg-border" />
    <text x="100" y="130" className="svg-text">Quick Select (+)</text>
    <text x="100" y="150" className="svg-text">Quick Unselect (-)</text>
    <line x1="90" y1="160" x2="270" y2="160" className="svg-border" />
    <text x="100" y="180" className="svg-text">Quick Filter (.)</text>
  </SvgUiElement>
);

export default SvgTopMenusExample;
